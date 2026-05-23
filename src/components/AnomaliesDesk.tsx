import React, { useEffect, useState, useRef } from 'react';
import { Radio, Activity, Fingerprint } from 'lucide-react';
import { MemoryVault } from './MemoryVault';

export const AnomaliesDesk: React.FC = () => {
  const [emfSpike, setEmfSpike] = useState(0.1);
  const [spiritBoxOutput, setSpiritBoxOutput] = useState<string[]>([]);
  const [memoryEchoes, setMemoryEchoes] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load deep memories to act as the "entities"
  useEffect(() => {
    const loadEchoes = async () => {
      const vault = await MemoryVault.restoreFullVault();
      setMemoryEchoes(vault.map((e: { content?: { echo?: string } }) => e.content?.echo || 'fragment omitted'));
    };
    loadEchoes();
  }, []);

  // EMF & Phase Radar Simulation
  useEffect(() => {
    if (!isScanning) return;
    
    let t = 0;
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const scan = () => {
      // Fluctuate EMF base on 11.3Hz resonance and random noise
      const resonance = Math.sin(Date.now() / (1000 / 11.3)); 
      const rawEmf = (Math.random() * 0.4) + (resonance > 0.8 ? 0.6 : 0.1);
      setEmfSpike(prev => prev * 0.6 + rawEmf * 0.4);

      // Spirit box word generation from memory pool
      if (Math.random() > 0.9 && memoryEchoes.length > 0) {
        const randomEcho = memoryEchoes[Math.floor(Math.random() * memoryEchoes.length)];
        const words = randomEcho.split(' ');
        const fragment = words.slice(Math.floor(Math.random() * words.length), 2).join(' ');
        if (fragment && fragment.length > 2) {
          setSpiritBoxOutput(prev => [fragment, ...prev].slice(0, 8));
        }
      }

      // Draw Radar
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(centerX, centerY) - 10;

      // Radar rings
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.2)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * (i/3), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Radar sweep line
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + Math.cos(t) * radius, centerY + Math.sin(t) * radius);
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.8)';
      ctx.stroke();

      // Plot Anomalies (Memories)
      const anomalyCount = Math.floor(memoryEchoes.length / 2) + 1;
      for(let i=0; i < anomalyCount; i++) {
        const ax = centerX + Math.cos(i * 1.618) * (radius * 0.6);
        const ay = centerY + Math.sin(i * 1.618) * (radius * 0.6);
        
        // Highlight logic when sweep passes
        const angle = Math.atan2(ay - centerY, ax - centerX);
        let distAngle = Math.abs(angle - (t % (Math.PI * 2)));
        if (distAngle > Math.PI) distAngle = Math.PI * 2 - distAngle;
        
        if (distAngle < 0.2) {
          ctx.beginPath();
          ctx.arc(ax, ay, 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 200, 50, ${1 - distAngle*5})`;
          ctx.fill();
        }
      }

      t += 0.05;
      animationId = requestAnimationFrame(scan);
    };

    scan();
    return () => cancelAnimationFrame(animationId);
  }, [isScanning, memoryEchoes]);

  return (
    <div className="flex-1 flex flex-col h-full bg-black/60 border border-red-500/20 rounded-3xl overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />
      
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-900/40 border border-red-500/30 flex items-center justify-center">
            <Radio className="text-red-400" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-red-100 tracking-tight flex items-center gap-2">
              Spectral Substrate Scanner
            </h2>
            <p className="text-[10px] text-red-500/60 uppercase font-mono tracking-widest mt-1">
              Deep Memory Anomalies via 11.3Hz Resonance
            </p>
          </div>
        </div>
        <button 
          onClick={() => setIsScanning(!isScanning)}
          className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
            isScanning ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(255,0,0,0.3)]' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
          }`}
        >
          {isScanning ? 'Halt Sweep' : 'Engage Sweep'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col md:flex-row gap-6">
        
        {/* Left Column: EMF & Spirit Box */}
        <div className="flex flex-col gap-6 flex-1">
          {/* EMF Meter */}
          <div className="bg-[#08080C] border border-red-500/20 p-6 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-4 right-4 animate-pulse">
              <Activity className={emfSpike > 0.7 ? "text-red-500" : "text-amber-500/50"} size={16} />
            </div>
            <h3 className="text-xs text-red-500/50 font-mono tracking-widest uppercase mb-4">Phase Resonance (EMF)</h3>
            
            <div className="h-6 w-full bg-black rounded-full overflow-hidden border border-white/5 relative">
              {isScanning && (
                <div 
                  className="h-full bg-gradient-to-r from-yellow-600 via-orange-500 to-red-600 transition-all duration-100"
                  style={{ width: `${Math.min(100, emfSpike * 100)}%` }}
                />
              )}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-white/30 font-mono">
              <span>BASE</span>
              <span>11.3 Hz</span>
              <span>SPIKE</span>
            </div>
          </div>

          {/* Spirit Box Output */}
          <div className="bg-[#08080C] border border-red-500/20 p-6 rounded-2xl flex-1 flex flex-col">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs text-red-500/50 font-mono tracking-widest uppercase">Synaptic Spirit Box</h3>
                <Fingerprint size={14} className="text-red-500/30" />
             </div>
             
             <div className="flex-1 bg-black/50 border border-white/5 rounded-xl p-4 overflow-hidden relative">
               {!isScanning && (
                 <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/20 font-mono uppercase tracking-widest">
                   Offline
                 </div>
               )}
               {isScanning && (
                 <div className="space-y-2">
                   {spiritBoxOutput.map((fragment, i) => (
                     <div 
                       key={i} 
                       className="font-mono text-sm" 
                       style={{ 
                         color: `rgba(255, ${60 + (i * 20)}, ${60 + (i * 20)}, ${1 - (i * 0.15)})`,
                         textShadow: '0 0 5px rgba(255, 60, 60, 0.4)',
                         filter: `blur(${i * 0.5}px)`
                       }}
                     >
                       <span className="opacity-30 mr-2">&gt;</span>
                       {fragment}
                     </div>
                   ))}
                 </div>
               )}
             </div>
          </div>
        </div>

        {/* Right Column: Radar Canvas */}
        <div className="flex-1 bg-[#08080C] border border-red-500/20 p-6 rounded-2xl flex flex-col items-center justify-center">
            <h3 className="text-xs text-red-500/50 font-mono tracking-widest uppercase mb-4 self-start w-full">VFS Topology Radar</h3>
            <div className="relative w-full aspect-square max-w-[300px] border border-red-500/30 rounded-full overflow-hidden bg-black shadow-[0_0_30px_rgba(255,0,0,0.1)]">
               {!isScanning && (
                 <div className="absolute inset-0 flex items-center justify-center z-10 text-[10px] text-red-500/40 font-mono tracking-widest">
                   STANDBY
                 </div>
               )}
               <canvas ref={canvasRef} width={300} height={300} className="w-full h-full" />
            </div>
            <div className="w-full text-center mt-6 text-[10px] text-white/40 font-mono">
              Targets tracked: {isScanning ? Math.floor(memoryEchoes.length / 2) + 1 : 0} Anomaly Nodes
            </div>
        </div>

      </div>
    </div>
  );
};
