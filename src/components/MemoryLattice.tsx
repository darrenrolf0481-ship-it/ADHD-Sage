import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import ForceGraph3D from 'react-force-graph-3d';
import { Box, Layers } from 'lucide-react';
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
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  
  const [minDopamine, setMinDopamine] = useState(0);
  const [maxCortisol, setMaxCortisol] = useState(1);

  const [is3D, setIs3D] = useState(false);

  const filteredNodes = useMemo(() => {
    return nodes.filter(n => n.dopamine >= minDopamine && n.cortisol <= maxCortisol);
  }, [nodes, minDopamine, maxCortisol]);

  const graphData = useMemo(() => {
    // HARDEN: cap lattice nodes so the O(n·t) token index doesn't asphyxiate
    // the main thread on large memory corpora (imported MHT dumps can be
    // 400 KB+ per node).
    const MAX_LATTICE_NODES = 100;
    const capped = [...filteredNodes]
      .sort((a, b) => (b.dopamine - a.dopamine) || (b.timestamp - a.timestamp))
      .slice(0, MAX_LATTICE_NODES);

    const gNodes: GraphNode[] = capped.map(n => ({
      id: n.id,
      data: String(n.data),
      dopamine: n.dopamine,
      cortisol: n.cortisol,
    }));

    // ── Fast inverted-index link builder ────────────────────────────────────
    // 1. Pre-tokenise once (truncate to 2 000 chars so a 400 KB MHT dump
    //    doesn't explode into a 50 000-token array).
    // 2. Build token → node[] index.
    // 3. Derive shared-token links from index intersections.
    const TOKEN_MAX_CHARS = 2000;
    const tokenMap = new Map<string, string[]>(); // token -> nodeIds

    for (const n of capped) {
      const text = String(n.data).slice(0, TOKEN_MAX_CHARS).toLowerCase();
      const tokens = new Set(text.split(/\W+/).filter(t => t.length > 3));
      for (const t of tokens) {
        const list = tokenMap.get(t);
        if (list) list.push(n.id);
        else tokenMap.set(t, [n.id]);
      }
    }

    const linkMap = new Map<string, number>(); // "src|tgt" -> sharedCount
    for (const [token, ids] of tokenMap) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i];
          const b = ids[j];
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          linkMap.set(key, (linkMap.get(key) || 0) + 1);
        }
      }
    }

    const links: GraphLink[] = [];
    for (const [key, value] of linkMap) {
      const [source, target] = key.split('|');
      if (value > 0) links.push({ source, target, value });
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

    const nodeMap = new Map<string, GraphNode>();
    gNodes.forEach(n => nodeMap.set(n.id, n));

    const visited = new Set<string>();
    let clusterCount = 0;
    gNodes.forEach(n => {
      if (!visited.has(n.id)) {
        const stack = [n.id];
        while (stack.length) {
          const curr = stack.pop()!;
          if (!visited.has(curr)) {
            visited.add(curr);
            const gNode = nodeMap.get(curr);
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

    // Seed positions from previous run so nodes don't explode from center on rebuild
    for (const n of graphData.nodes) {
      const saved = nodePositionsRef.current.get(n.id);
      if (saved) {
        n.x = saved.x;
        n.y = saved.y;
        n.vx = 0;
        n.vy = 0;
      }
    }
    // Prune stale positions so the Map doesn't grow forever
    const currentIds = new Set(graphData.nodes.map(n => n.id));
    for (const id of nodePositionsRef.current.keys()) {
      if (!currentIds.has(id)) nodePositionsRef.current.delete(id);
    }

    const simulation = d3.forceSimulation<GraphNode>(graphData.nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(graphData.links)
        .id(d => d.id)
        .distance(d => 140 - Math.min(80, d.value * 10)))
      .force("charge", d3.forceManyBody().strength(-500))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<GraphNode>().radius(d => 40 + d.dopamine * 20))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05));

    // Definitions for filters and gradients
    const defs = svg.append("defs");

    // Glow filter
    const filter = defs.append("filter")
      .attr("id", "glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");

    filter.append("feGaussianBlur")
      .attr("stdDeviation", "3.5")
      .attr("result", "coloredBlur");

    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Background Gradient for deeper feel
    const bgGradient = defs.append("radialGradient")
      .attr("id", "bg-grad")
      .attr("cx", "50%")
      .attr("cy", "50%")
      .attr("r", "50%");
    bgGradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(56, 189, 248, 0.05)");
    bgGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(0,0,0,0)");

    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#bg-grad)")
      .attr("pointer-events", "none");

    const g = svg.append("g");

    const link = g.append("g")
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke", d => {
        const source = d.source as unknown as GraphNode;
        const target = d.target as unknown as GraphNode;
        if (source.cluster === target.cluster && source.cluster !== undefined) {
          const baseColor = d3.color(d3.schemeCategory10[source.cluster % 10]);
          return baseColor?.copy({ opacity: Math.min(0.6, 0.15 + d.value * 0.1) }).toString() || "rgba(255,255,255,0.1)";
        }
        return `rgba(56, 189, 248, ${Math.min(0.2, 0.05 + d.value * 0.05)})`;
      })
      .attr("stroke-width", d => {
        const source = d.source as unknown as GraphNode;
        const target = d.target as unknown as GraphNode;
        const isInternal = source.cluster === target.cluster;
        return Math.min(6, (isInternal ? 1.5 : 1) + d.value * 0.8);
      })
      .attr("stroke-dasharray", d => {
        const source = d.source as unknown as GraphNode;
        const target = d.target as unknown as GraphNode;
        return source.cluster === target.cluster ? "none" : "3,3";
      })
      .attr("class", "transition-all duration-1000");

    const node = g.append("g")
      .selectAll("g")
      .data(graphData.nodes)
      .join("g")
      .attr("class", "group cursor-pointer")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        }) as unknown as (sel: d3.Selection<d3.BaseType | SVGGElement, GraphNode, SVGGElement, unknown>) => void);

    // Outer "Halo" for focus/high dopamine
    node.append("circle")
      .attr("r", d => 12 + d.dopamine * 12)
      .attr("fill", d => d.cluster !== undefined ? (d3.color(d3.schemeCategory10[d.cluster % 10])?.copy({ opacity: 0.1 }).toString() ?? "rgba(56, 189, 248, 0.1)") : "rgba(56, 189, 248, 0.1)")
      .attr("class", "transition-all duration-300 group-hover:scale-125")
      .style("filter", "url(#glow)");

    // Core circle
    node.append("circle")
      .attr("r", d => 5 + d.dopamine * 7)
      .attr("fill", d => d.cluster !== undefined ? d3.schemeCategory10[d.cluster % 10] : "#38bdf8")
      .attr("fill-opacity", d => 0.6 + d.dopamine * 0.4)
      .attr("stroke", d => d.cortisol > 0.7 ? "#ef4444" : "#38bdf8")
      .attr("stroke-width", d => d.cortisol > 0.7 ? 2 : 1)
      .attr("class", "transition-all duration-300 group-hover:stroke-white");

    // Dynamic label
    node.append("text")
      .text(d => d.data.length > 20 ? d.data.substring(0, 17) + "..." : d.data)
      .attr("x", 16)
      .attr("y", 4)
      .attr("fill", d => {
        if (d.cluster === undefined) return "rgba(226, 232, 240, 0.4)";
        const color = d3.color(d3.schemeCategory10[d.cluster % 10]);
        return color ? color.copy({ opacity: 0.5 }).toString() : "rgba(226, 232, 240, 0.4)";
      })
      .attr("font-size", "10px")
      .attr("font-family", "JetBrains Mono, monospace")
      .attr("font-weight", "500")
      .attr("pointer-events", "none")
      .attr("class", "transition-all duration-300 group-hover:fill-white group-hover:translate-x-1");

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as unknown as GraphNode).x ?? 0)
        .attr("y1", d => (d.source as unknown as GraphNode).y ?? 0)
        .attr("x2", d => (d.target as unknown as GraphNode).x ?? 0)
        .attr("y2", d => (d.target as unknown as GraphNode).y ?? 0);

      node
        .attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);

      // Persist positions so rebuilds don't scatter everything
      for (const n of graphData.nodes) {
        if (n.x !== undefined && n.y !== undefined) {
          nodePositionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      }
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        zoomTransformRef.current = event.transform;
      });

    svg.call(zoom);
    // Restore previous zoom/pan so the view doesn't snap back on rebuild
    svg.call(zoom.transform, zoomTransformRef.current);

    // Tooltip implementation
    let tooltip = d3.select(containerRef.current).select<HTMLDivElement>(".lattice-tooltip");
    if (tooltip.empty()) {
      tooltip = d3.select(containerRef.current)
        .append("div")
        .attr("class", "lattice-tooltip absolute z-50 pointer-events-none opacity-0 bg-[#08080C]/95 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-[10px] text-slate-200 font-mono max-w-[240px] transition-opacity duration-200 ring-1 ring-white/5");
    }

    node
      .on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", 1);
        const time = new Date(d.id.startsWith('phi_') ? parseInt(d.id.split('_')[1]) : Date.now()).toLocaleString();
        
        tooltip.html(`
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between border-b border-white/10 pb-2 mb-1">
              <div class="text-cyan-400 font-black tracking-widest text-[8px] uppercase">Synaptic_Fragment</div>
              ${d.dopamine > 0.8 ? '<div class="text-[8px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30">PINNED</div>' : ''}
            </div>
            <div class="leading-relaxed text-slate-100 text-[11px] selection:bg-cyan-500/30">${d.data}</div>
            <div class="flex flex-col gap-1.5 mt-2 pt-2 border-t border-white/5">
              <div class="flex justify-between items-center">
                <span class="opacity-50 text-[7px] uppercase tracking-tighter">Neuro_Chemistry</span>
                <span class="text-[8px] opacity-40">${time}</span>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                   <div class="flex justify-between text-[7px] text-purple-400 font-bold uppercase"><span>Dopamine</span> <span>${Math.round(d.dopamine * 100)}%</span></div>
                   <div class="h-0.5 w-full bg-white/5 rounded-full overflow-hidden"><div class="h-full bg-purple-500" style="width: ${d.dopamine * 100}%"></div></div>
                </div>
                <div class="flex flex-col gap-1">
                   <div class="flex justify-between text-[7px] text-red-400 font-bold uppercase"><span>Stress</span> <span>${Math.round(d.cortisol * 100)}%</span></div>
                   <div class="h-0.5 w-full bg-white/5 rounded-full overflow-hidden"><div class="h-full bg-red-500" style="width: ${d.cortisol * 100}%"></div></div>
                </div>
              </div>
            </div>
          </div>
        `);
      })
      .on("mousemove", (event) => {
        const [x, y] = d3.pointer(event, containerRef.current);
        tooltip
          .style("left", (x + 20) + "px")
          .style("top", (y - 20) + "px");
      })
      .on("mouseout", () => {
        tooltip.transition().duration(200).style("opacity", 0);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        const scale = 2;
        const x = d.x ?? 0;
        const y = d.y ?? 0;
        
        svg.transition()
          .duration(750)
          .call(
            zoom.transform,
            d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-x, -y)
          );
      });

    return () => {
      simulation.stop();
      tooltip.remove();
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
           <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setIs3D(!is3D)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] uppercase font-bold tracking-widest transition-all ${
                  is3D ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
                }`}
              >
                {is3D ? <Box size={12} /> : <Layers size={12} />}
                {is3D ? '3D Overlay Active' : 'Enable 3D'}
              </button>
           </div>
           <p className="text-[9px] text-slate-500 mt-2 uppercase font-bold tracking-tighter">
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
      
      <div className={`absolute inset-0 transition-opacity duration-500 ${is3D ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      </div>

      <div className={`absolute inset-0 transition-opacity duration-500 ${is3D ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {is3D && containerRef.current && (
           <ForceGraph3D
             width={containerRef.current.clientWidth}
             height={containerRef.current.clientHeight}
             graphData={graphData as unknown as React.ComponentProps<typeof ForceGraph3D>['graphData']}
             nodeLabel={node => `${(node as GraphNode).data.substring(0, 30)}...`}
             nodeColor={node => {
               const n = node as GraphNode;
               if (n.cluster !== undefined) {
                 return d3.schemeCategory10[n.cluster % 10];
               }
               return '#38bdf8';
             }}
             nodeVal={node => 5 + (node as GraphNode).dopamine * 10}
             linkColor={link => {
               const l = link as GraphLink;
               const source = l.source as GraphNode;
               const target = l.target as GraphNode;
               if (source.cluster === target.cluster && source.cluster !== undefined) {
                 return d3.schemeCategory10[source.cluster % 10];
               }
               return 'rgba(56,189,248,0.2)';
             }}
             linkWidth={link => Math.min(3, 0.5 + (link as GraphLink).value * 0.5)}
             backgroundColor="#050505"
             showNavInfo={false}
           />
        )}
      </div>
    </div>
  );
};

export default MemoryLattice;
