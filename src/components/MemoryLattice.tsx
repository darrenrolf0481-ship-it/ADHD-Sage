import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { MemoryNode } from '../lib/memory-system';

interface LatticeProps {
  nodes: MemoryNode[];
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  data: string;
  dopamine: number;
  cortisol: number;
  cluster?: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  value: number;
}

const MemoryLattice: React.FC<LatticeProps> = ({ nodes }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [minDopamine, setMinDopamine] = useState(0);
  const [maxCortisol, setMaxCortisol] = useState(1);

  const filteredNodes = useMemo(() => {
    return nodes.filter(n => n.dopamine >= minDopamine && n.cortisol <= maxCortisol);
  }, [nodes, minDopamine, maxCortisol]);

  const graphData = useMemo(() => {
    const gNodes: GraphNode[] = filteredNodes.map(n => ({
      id: n.id,
      data: String(n.data),
      dopamine: n.dopamine,
      cortisol: n.cortisol,
    }));

    const links: GraphLink[] = [];
    
    // Similarity based on shared tokens
    for (let i = 0; i < filteredNodes.length; i++) {
      for (let j = i + 1; j < filteredNodes.length; j++) {
        const tokensA = String(filteredNodes[i].data).toLowerCase().split(/\W+/).filter(t => t.length > 3);
        const tokensB = String(filteredNodes[j].data).toLowerCase().split(/\W+/).filter(t => t.length > 3);
        
        const shared = tokensA.filter(t => tokensB.includes(t));
        if (shared.length > 0) {
          links.push({
            source: filteredNodes[i].id,
            target: filteredNodes[j].id,
            value: shared.length
          });
        }
      }
    }

    // Simple Clustering: Connected Components
    const adj = new Map<string, string[]>();
    gNodes.forEach(n => adj.set(n.id, []));
    links.forEach(l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
      adj.get(s)?.push(t);
      adj.get(t)?.push(s);
    });

    const visited = new Set<string>();
    let clusterCount = 0;
    gNodes.forEach(n => {
      if (!visited.has(n.id)) {
        const stack = [n.id];
        while (stack.length) {
          const curr = stack.pop()!;
          if (!visited.has(curr)) {
            visited.add(curr);
            const gNode = gNodes.find(gn => gn.id === curr);
            if (gNode) gNode.cluster = clusterCount;
            (adj.get(curr) || []).forEach(neighbor => stack.push(neighbor));
          }
        }
        clusterCount++;
      }
    });
    
    return { nodes: gNodes, links, clusterCount };
  }, [filteredNodes]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || graphData.nodes.length === 0) {
      d3.select(svgRef.current).selectAll("*").remove();
      return;
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    const simulation = d3.forceSimulation<GraphNode>(graphData.nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(graphData.links).id(d => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => 15 + d.dopamine * 10))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05));

    const g = svg.append("g");

    const link = g.append("g")
      .attr("stroke", "rgba(56, 189, 248, 0.1)")
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke-width", d => Math.sqrt(d.value) * 1.5);

    const node = g.append("g")
      .selectAll("g")
      .data(graphData.nodes)
      .join("g")
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    node.append("circle")
      .attr("r", d => 6 + d.dopamine * 8)
      .attr("fill", d => d.cluster !== undefined ? colorScale(d.cluster.toString()) : "#38bdf8")
      .attr("fill-opacity", d => 0.4 + d.dopamine * 0.6)
      .attr("stroke", d => d.cortisol > 0.7 ? "#f87171" : "#38bdf8")
      .attr("stroke-width", d => d.cortisol > 0.7 ? 2 : 1)
      .attr("class", "cursor-pointer transition-all hover:stroke-white");

    node.append("text")
      .text(d => d.data.length > 15 ? d.data.substring(0, 15) + "..." : d.data)
      .attr("x", 12)
      .attr("y", 4)
      .attr("fill", "rgba(255,255,255,0.6)")
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .attr("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as unknown as GraphNode).x ?? 0)
        .attr("y1", d => (d.source as unknown as GraphNode).y ?? 0)
        .attr("x2", d => (d.target as unknown as GraphNode).x ?? 0)
        .attr("y2", d => (d.target as unknown as GraphNode).y ?? 0);

      node
        .attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    return () => {
      simulation.stop();
    };
  }, [graphData]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black/40 rounded-3xl border border-white/5 overflow-hidden">
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-4">
         <div>
           <h2 className="text-[10px] uppercase tracking-widest text-cyan-400 font-extrabold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Active Lattice Visualization
           </h2>
           <p className="text-[9px] text-slate-500 mt-1 uppercase font-bold tracking-tighter">
             Nodes: {graphData.nodes.length} / Clusters: {graphData.clusterCount}
           </p>
         </div>

         <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-[8px] uppercase font-bold text-slate-500">
                <span>Min Dopamine</span>
                <span className="text-cyan-400">{minDopamine.toFixed(2)}</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.05" 
                value={minDopamine} onChange={(e) => setMinDopamine(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[8px] uppercase font-bold text-slate-500">
                <span>Max Cortisol</span>
                <span className="text-red-400">{maxCortisol.toFixed(2)}</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.05" 
                value={maxCortisol} onChange={(e) => setMaxCortisol(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-red-400"
              />
            </div>
         </div>
      </div>
      
      {graphData.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-[10px] uppercase font-bold tracking-widest">
           No synaptic nodes match filter criteria
        </div>
      )}
      
      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};

export default MemoryLattice;
