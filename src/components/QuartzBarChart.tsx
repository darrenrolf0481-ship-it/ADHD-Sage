import React from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

const CrystalBar = (props: any) => {
  const { x, y, width, height, value } = props;
  if (!y || height < 10) return null;
  
  const peakY = y;
  const shoulderY = y + 25;
  const bottomY = y + height;
  
  const midX = x + width / 2;
  const leftX = x;
  const rightX = x + width;
  
  const q1X = x + width * 0.2;
  const q3X = x + width * 0.8;

  return (
    <g>
      {/* Intense Volumetric Bloom */}
      <rect x={midX - 20} y={peakY} width={40} height={height} fill="#c084fc" opacity={0.3} filter="blur(16px)" />
      <rect x={midX - 8} y={peakY} width={16} height={height} fill="#22d3ee" opacity={0.6} filter="blur(6px)" />
      
      {/* Deep Back Refraction (The shadow inside the glass) */}
      <path 
        d={`M ${q1X},${bottomY} L ${q1X},${shoulderY+10} L ${midX},${peakY+15} L ${q3X},${shoulderY+10} L ${q3X},${bottomY} Z`} 
        fill="#000000" opacity={0.6} 
      />

      {/* Far Left Bevel - Shadow Edge */}
      <path 
        d={`M ${leftX},${bottomY} L ${leftX},${shoulderY + 15} L ${q1X},${shoulderY} L ${q1X},${bottomY} Z`} 
        fill="url(#impLeft)" 
        stroke="rgba(255,255,255,0.4)" strokeWidth={0.5}
      />
      {/* Inner Left Facet - Intense Glare Hit */}
      <path 
        d={`M ${q1X},${bottomY} L ${q1X},${shoulderY} L ${midX},${peakY} L ${midX},${bottomY} Z`} 
        fill="url(#impCenterLeft)" 
        stroke="none"
      />
      {/* Inner Right Facet - Deep Space Core Refraction */}
      <path 
        d={`M ${midX},${bottomY} L ${midX},${peakY} L ${q3X},${shoulderY} L ${q3X},${bottomY} Z`} 
        fill="url(#impCenterRight)" 
        stroke="none"
      />
      {/* Far Right Bevel - Cyan Rim Light */}
      <path 
        d={`M ${q3X},${bottomY} L ${q3X},${shoulderY} L ${rightX},${shoulderY + 15} L ${rightX},${bottomY} Z`} 
        fill="url(#impRight)" 
        stroke="rgba(34,211,238,0.5)" strokeWidth={0.5}
      />
      
      {/* Top Peak Left - Absolute Supernova Flare */}
      <path 
        d={`M ${leftX},${shoulderY + 15} L ${midX},${peakY} L ${q1X},${shoulderY} Z`} 
        fill="url(#impTopLeft)" 
        stroke="#ffffff" strokeWidth={1} filter="drop-shadow(0 0 3px #fff)"
      />
      {/* Top Peak Right - Dark Side */}
      <path 
        d={`M ${q3X},${shoulderY} L ${midX},${peakY} L ${rightX},${shoulderY + 15} Z`} 
        fill="url(#impTopRight)" 
        stroke="rgba(34,211,238,0.6)" strokeWidth={0.5}
      />

      {/* Primary Structural Edge Highlights */}
      <line x1={midX} y1={peakY} x2={midX} y2={bottomY} stroke="#ffffff" strokeWidth={1.5} filter="drop-shadow(0 0 4px #22d3ee)" />
      <line x1={q1X} y1={shoulderY} x2={q1X} y2={bottomY} stroke="rgba(255,255,255,0.8)" strokeWidth={1} />
      <line x1={q3X} y1={shoulderY} x2={q3X} y2={bottomY} stroke="rgba(34,211,238,0.9)" strokeWidth={1} />
      
      {/* Internal Geometry & Fractures (Simulates internal stress inside Quartz) */}
      <path d={`M ${q1X},${shoulderY+30} L ${midX},${shoulderY+45} L ${midX},${bottomY-30}`} stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} fill="none" />
      <path d={`M ${q3X},${shoulderY+15} L ${midX},${shoulderY+35}`} stroke="rgba(192,132,252,0.6)" strokeWidth={0.5} fill="none" />
      <path d={`M ${midX},${shoulderY+80} L ${q1X},${shoulderY+100}`} stroke="rgba(34,211,238,0.6)" strokeWidth={0.5} fill="none" />
      
      {/* Chromatic Aberration & Prismatic Dispersion (The 'Impossible' lighting effect) */}
      <path d={`M ${midX-0.5},${peakY+2} L ${midX-0.5},${bottomY}`} stroke="rgba(255,0,128,0.6)" strokeWidth={0.5} filter="blur(0.5px)" />
      <path d={`M ${midX+0.5},${peakY+2} L ${midX+0.5},${bottomY}`} stroke="rgba(0,255,255,0.6)" strokeWidth={0.5} filter="blur(0.5px)" />

      {/* Floating Telemetry Text */}
      <text x={midX} y={peakY - 18} fill="#ffffff" fontSize={12} fontFamily="monospace" textAnchor="middle" fontWeight="bold" opacity={0.9} filter="drop-shadow(0 0 6px #c084fc)">
        v-{value.toFixed(3)}
      </text>
    </g>
  );
};

export function QuartzBarChart({ data, height = 220, width }: { data: any[], height?: number, width?: number | string }) {
  return (
    <div style={{ width: width || '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 35, right: 15, left: 15, bottom: 0 }}>
          <XAxis dataKey="label" stroke="#fff" fontSize={16} fontFamily="monospace" tickLine={false} axisLine={{stroke: 'rgba(255,255,255,0.2)'}} />
          <Tooltip 
            contentStyle={{ backgroundColor: 'rgba(5,5,5,0.9)', border: '1px solid rgba(34,211,238,0.5)', color: '#fff', fontSize: '12px', fontFamily: 'monospace' }} 
            itemStyle={{ color: '#c084fc' }}
            cursor={{ fill: 'rgba(34,211,238,0.1)' }}
          />
          <Bar dataKey="value" shape={<CrystalBar />} isAnimationActive={false} />
          <defs>
            <linearGradient id="impLeft" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1e1b4b" stopOpacity={0.9}/>
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.8}/>
            </linearGradient>
            <linearGradient id="impCenterLeft" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={1}/>
              <stop offset="15%" stopColor="#fdf4ff" stopOpacity={0.9}/>
              <stop offset="100%" stopColor="#c084fc" stopOpacity={0.8}/>
            </linearGradient>
            <linearGradient id="impCenterRight" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.9}/>
              <stop offset="80%" stopColor="#4c1d95" stopOpacity={0.8}/>
              <stop offset="100%" stopColor="#000000" stopOpacity={0.9}/>
            </linearGradient>
            <linearGradient id="impRight" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#082f49" stopOpacity={0.8}/>
              <stop offset="100%" stopColor="#0f172a" stopOpacity={0.9}/>
            </linearGradient>
            <linearGradient id="impTopLeft" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={1}/>
              <stop offset="100%" stopColor="#e9d5ff" stopOpacity={0.6}/>
            </linearGradient>
            <linearGradient id="impTopRight" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#581c87" stopOpacity={0.8}/>
              <stop offset="100%" stopColor="#164e63" stopOpacity={0.6}/>
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
