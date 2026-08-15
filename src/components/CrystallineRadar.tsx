import React, { useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

export function CrystallineRadar({ data, size = 300 }: { data: number[], size?: number }) {
  // Use useMemo to avoid constant restyling
  const chartData = useMemo(() => [
    { subject: 'Axi-1', A: data[0] || 0, B: (data[0] || 0) * 0.7, C: (data[0] || 0) * 0.4 },
    { subject: 'Axi-2', A: data[1] || 0, B: (data[1] || 0) * 0.8, C: (data[1] || 0) * 0.5 },
    { subject: 'Axi-3', A: data[2] || 0, B: (data[2] || 0) * 0.6, C: (data[2] || 0) * 0.3 },
    { subject: 'Axi-4', A: data[3] || 0, B: (data[3] || 0) * 0.9, C: (data[3] || 0) * 0.4 },
    { subject: 'Axi-5', A: data[4] || 0, B: (data[4] || 0) * 0.7, C: (data[4] || 0) * 0.2 },
    { subject: 'Axi-6', A: data[5] || 0, B: (data[5] || 0) * 0.8, C: (data[5] || 0) * 0.5 },
  ], [data]);

  return (
    <div style={{ width: '100%', height: size, position: 'relative' }}>
      {/* High-Resolution Stellar Map & Sharp Crystal Star Base */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10, animation: 'phi-subtle-pulse var(--pulse-resonance) linear infinite' }}>
        <svg viewBox="0 0 200 200" style={{ width: '85%', height: '85%', filter: 'drop-shadow(0 0 15px rgba(34, 211, 238, 0.3))', animation: 'spin-slow calc(var(--pulse-resonance) * 1500) linear infinite' }}>
          
          {/* Stellar Map Graticules & Rings */}
          <circle cx="100" cy="100" r="95" fill="none" stroke="rgba(34,211,238,0.2)" strokeWidth="0.5" strokeDasharray="4 6" />
          <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(192,132,252,0.2)" strokeWidth="0.5" />
          <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeDasharray="1 18" />
          <circle cx="100" cy="100" r="50" fill="none" stroke="rgba(34,211,238,0.15)" strokeWidth="0.5" />
          <path d="M 5,100 L 195,100 M 100,5 L 100,195 M 33,33 L 167,167 M 33,167 L 167,33" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" strokeDasharray="2 3" />

          {/* Ambient Volumetric Backlight */}
          <circle cx="100" cy="100" r="30" fill="#c084fc" opacity="0.2" filter="blur(15px)"/>

          {/* Sharp High-Res Crystal Star */}
          {/* Main N/S/E/W Spikes (Needle-like) */}
          <polygon points="100,5 112,85 100,100 88,85" fill="url(#starLight1)" stroke="rgba(255,255,255,0.9)" strokeWidth="0.5" />
          <polygon points="100,195 112,115 100,100 88,115" fill="url(#starDark1)" stroke="rgba(34,211,238,0.8)" strokeWidth="0.5" />
          <polygon points="195,100 115,112 100,100 115,88" fill="url(#starLight2)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.5" />
          <polygon points="5,100 85,112 100,100 85,88" fill="url(#starDark2)" stroke="rgba(192,132,252,0.9)" strokeWidth="0.5" />
          
          {/* Inner Sharp Facets */}
          <polygon points="100,5 100,100 112,85" fill="#ffffff" opacity="0.3" />
          <polygon points="195,100 100,100 115,112" fill="#ffffff" opacity="0.2" />
          <polygon points="100,195 100,100 88,115" fill="#c084fc" opacity="0.3" />
          <polygon points="5,100 100,100 85,88" fill="#22d3ee" opacity="0.2" />

          {/* Diagonal Astrolabe Spikes */}
          <polygon points="165,35 115,80 100,100 110,75" fill="url(#starDark1)" stroke="rgba(34,211,238,0.5)" strokeWidth="0.5" opacity="0.9" />
          <polygon points="165,165 110,125 100,100 115,120" fill="url(#starLight1)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" opacity="0.8" />
          <polygon points="35,165 85,120 100,100 90,125" fill="url(#starLight2)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" opacity="0.7" />
          <polygon points="35,35 90,75 100,100 85,80" fill="url(#starDark2)" stroke="rgba(192,132,252,0.5)" strokeWidth="0.5" opacity="0.8" />

          {/* Navigational Nodes */}
          <circle cx="100" cy="5" r="1.5" fill="#fff" filter="drop-shadow(0 0 4px #fff)" />
          <circle cx="100" cy="195" r="1.5" fill="#fff" filter="drop-shadow(0 0 4px #fff)" />
          <circle cx="195" cy="100" r="1.5" fill="#fff" filter="drop-shadow(0 0 4px #fff)" />
          <circle cx="5" cy="100" r="1.5" fill="#fff" filter="drop-shadow(0 0 4px #fff)" />
          
          <circle cx="165" cy="35" r="1" fill="#22d3ee" />
          <circle cx="165" cy="165" r="1" fill="#c084fc" />
          <circle cx="35" cy="165" r="1" fill="#22d3ee" />
          <circle cx="35" cy="35" r="1" fill="#c084fc" />

          {/* Core Jewel */}
          <polygon points="100,85 115,100 100,115 85,100" fill="none" stroke="#fff" strokeWidth="1" opacity="0.9" filter="drop-shadow(0 0 5px #fff)" />
          <polygon points="100,85 100,115 85,100" fill="#c084fc" opacity="0.3" />
          <polygon points="115,100 100,115 100,100" fill="#22d3ee" opacity="0.2" />
          <circle cx="100" cy="100" r="2.5" fill="#ffffff" filter="drop-shadow(0 0 4px #fff)" />

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

      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="#22d3ee" strokeOpacity={0.3} strokeWidth={1} />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#c084fc', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' }} />
          
          {/* Inner Bright Core Polygon */}
          <Radar name="Core" dataKey="C" stroke="#fff" strokeWidth={1.5} fill="#ffffff" fillOpacity={0.7} isAnimationActive={false} />
          {/* Mid Layer Polygon */}
          <Radar name="Mid" dataKey="B" stroke="#c084fc" strokeWidth={2} fill="url(#paneGlass)" fillOpacity={0.6} isAnimationActive={false} />
          {/* Outer Envelope Polygon */}
          <Radar name="Outer" dataKey="A" stroke="#22d3ee" strokeWidth={1.5} fill="url(#paneGlass2)" fillOpacity={0.4} isAnimationActive={false} />
          
          <defs>
            {/* Glassy Linear Gradients replacing the soft radial ones */}
            <linearGradient id="paneGlass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8"/>
              <stop offset="30%" stopColor="#c084fc" stopOpacity="0.4"/>
              <stop offset="70%" stopColor="#22d3ee" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#082f49" stopOpacity="0.8"/>
            </linearGradient>
            <linearGradient id="paneGlass2" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c084fc" stopOpacity="0.5"/>
              <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#000000" stopOpacity="0.6"/>
            </linearGradient>
          </defs>
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
