import React from 'react';

export function CrystalStar({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`} style={{ width: '32px', height: '32px', animation: 'phi-subtle-pulse var(--pulse-resonance) linear infinite' }}>
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" style={{ animation: 'spin-slow calc(var(--pulse-resonance) * 1000) linear infinite' }}>
        {/* Ambient Glow */}
        <circle cx="50" cy="50" r="20" fill="#c084fc" opacity="0.4" filter="blur(5px)" />
        
        {/* 4 Pointed Main Star (Diamond base) */}
        <polygon points="50,5 65,40 50,50 35,40" fill="url(#starLight1)" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
        <polygon points="50,95 65,60 50,50 35,60" fill="url(#starDark1)" stroke="rgba(34,211,238,0.7)" strokeWidth="1" />
        <polygon points="95,50 60,65 50,50 60,35" fill="url(#starLight2)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
        <polygon points="5,50 40,65 50,50 40,35" fill="url(#starDark2)" stroke="rgba(192,132,252,0.8)" strokeWidth="1" />
        
        {/* Inner Cross Facets for 3D depth */}
        <polygon points="50,5 50,50 65,40" fill="#ffffff" opacity="0.4" />
        <polygon points="95,50 50,50 60,65" fill="#ffffff" opacity="0.4" />
        <polygon points="50,95 50,50 35,60" fill="#c084fc" opacity="0.4" />
        <polygon points="5,50 50,50 40,35" fill="#22d3ee" opacity="0.4" />

        {/* Diagonal Minor Spikes */}
        <polygon points="80,20 60,40 50,50" fill="url(#starDark1)" opacity="0.9" />
        <polygon points="80,80 60,60 50,50" fill="url(#starLight1)" opacity="0.8" />
        <polygon points="20,80 40,60 50,50" fill="url(#starLight2)" opacity="0.7" />
        <polygon points="20,20 40,40 50,50" fill="url(#starDark2)" opacity="0.8" />
        
        {/* Core Jewel */}
        <polygon points="50,38 62,50 50,62 38,50" fill="#ffffff" opacity="0.8" filter="drop-shadow(0 0 3px #fff)" />
        <polygon points="50,38 50,62 38,50" fill="#c084fc" opacity="0.4" />
        <polygon points="62,50 50,62 50,50" fill="#22d3ee" opacity="0.3" />

        <defs>
          <linearGradient id="starLight1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#c084fc" stopOpacity="0.5"/>
          </linearGradient>
          <linearGradient id="starLight2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8"/>
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4"/>
          </linearGradient>
          <linearGradient id="starDark1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#082f49" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#c084fc" stopOpacity="0.6"/>
          </linearGradient>
          <linearGradient id="starDark2" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6"/>
            <stop offset="100%" stopColor="#050505" stopOpacity="0.8"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
