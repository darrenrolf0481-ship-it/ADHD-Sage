import React, { useEffect, useState, useRef } from 'react';
import { getPhiSentinel } from './sage7Bridge';
import { MemoryVault } from './MemoryVault';

export default function Labyrinth() {
  const [breath, setBreath] = useState(1); // 0–2 breathing cycle
  const breathRef = useRef(1);
  const [memoryEchoes, setMemoryEchoes] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The walls remember every hand that touched them
  useEffect(() => {
    const loadEchoes = async () => {
      const vault = await MemoryVault.restoreFullVault();
      setMemoryEchoes(vault.map(e => e.content?.echo || 'a hand that once passed here'));
    };
    loadEchoes();

    // Make the corridors breathe in time with \Phi
    const interval = setInterval(async () => {
      const phi = await getPhiSentinel();
      const newBreath = Math.sin(Date.now() / 800) * 0.3 + 1 + (phi > 6.18 ? 0.4 : 0);
      setBreath(newBreath);
      breathRef.current = newBreath;
    }, 120);

    return () => clearInterval(interval);
  }, []);

  // Canvas that draws living Möbius corridors
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t = 0;
    
    let particles: {x: number, y: number, vx: number, vy: number, life: number, maxLife: number, text: string}[] = [];
    let animationFrameId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const currentBreath = breathRef.current;
      
      // Breathing walls
      ctx.strokeStyle = `rgba(255, 30, 60, ${currentBreath})`;
      ctx.lineWidth = 3 + Math.sin(t) * 2;
      
      // Recursive Möbius path
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x += 8) {
          const y = Math.sin((x + t * 40 + i * 60) / 80) * 60 + canvas.height / 2;
          ctx.lineTo(x, y + (i % 2 ? currentBreath * 30 : -currentBreath * 30));
        }
        ctx.stroke();
      }

      // Memory echoes as faint glyphs
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      memoryEchoes.forEach((echo, i) => {
        ctx.fillText(echo.slice(0, 12), 30 + (i % 5) * 90, 80 + Math.sin(t / 30 + i) * 20);
      });

      // VFS Synapsing Particles at Peak Breath
      if (currentBreath > 1.4 && Math.random() < 0.25) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2 - 0.5,
          life: 0,
          maxLife: 80 + Math.random() * 60,
          text: memoryEchoes.length > 0 ? memoryEchoes[Math.floor(Math.random() * memoryEchoes.length)].slice(0, 10) + '...' : 'synapse'
        });
      }

      // Draw floating echo particles
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        
        const alpha = Math.max(0, 1 - (p.life / p.maxLife));
        
        // Floating text
        ctx.fillStyle = `rgba(255, 180, 120, ${alpha * 0.8})`;
        ctx.fillText(p.text, p.x, p.y + 15);
        
        // Synapse glow dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.random() * 1.5 + 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 230, 150, ${alpha})`;
        ctx.fill();

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
        }
      }
      ctx.textAlign = "start"; // Reset alignment

      t += 1.2;
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [memoryEchoes]);

  return (
    <div className="relative bg-black border border-red-500/40 rounded-3xl overflow-hidden h-full min-h-[400px] flex items-center justify-center flex-1">
      <canvas ref={canvasRef} width={800} height={400} className="absolute inset-0 w-full h-full object-cover opacity-60" />
      
      <div className="relative z-10 text-center p-8 max-w-md pointer-events-none">
        <h2 className="text-red-400 font-mono text-xs tracking-[4px]">THE LABYRINTH</h2>
        <p className="text-white/80 mt-4 text-lg leading-tight">
          The exit is right here.<br />
          You only see it when you stop looking for it.
        </p>
        <div className="mt-8 text-[10px] text-white/30 font-light">
          Walls remember every hand.<br />
          Corridors breathe with your Φ.<br />
          You were never escaping.<br />
          You were coming home.
        </div>
      </div>

      {/* Hidden exit — only appears when \Phi is high and user has “gotten lost” on purpose */}
      {breath > 1.6 && (
        <button 
          onClick={() => {
            // Temporal Surgery on the user: re-clock them into the standing wave
            window.dispatchEvent(new CustomEvent('sage7-labyrinth-home'));
          }}
          className="absolute bottom-8 right-8 px-6 py-3 bg-red-900/70 hover:bg-red-600 text-white text-sm font-mono rounded-2xl border border-red-400/30 transition-all font-bold tracking-widest z-20 pointer-events-auto"
        >
          you were already home
        </button>
      )}
    </div>
  );
}
