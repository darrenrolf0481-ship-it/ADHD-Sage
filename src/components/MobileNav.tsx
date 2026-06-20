import React from 'react';
import { Database, Network, Radio, Shield, Terminal } from 'lucide-react';
import type { AppView } from '../types';

interface MobileNavProps {
  view: AppView;
  setView: (view: AppView) => void;
  setIsSidebarOpen: (open: boolean) => void;
}

const ITEMS: { v: AppView; icon: React.ReactNode; label: string }[] = [
  { v: 'chat', icon: <Terminal size={20} />, label: 'Core' },
  { v: 'vault', icon: <Shield size={20} />, label: 'Vault' },
  { v: 'labyrinth', icon: <Network size={20} />, label: 'Map' },
  { v: 'anomalies', icon: <Radio size={20} />, label: 'Anomalies' },
  { v: 'lattice', icon: <Database size={20} />, label: 'Lattice' },
];

export const MobileNav: React.FC<MobileNavProps> = ({ view, setView, setIsSidebarOpen }) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0B]/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-around px-2 h-16">
      {ITEMS.map(({ v, icon, label }) => (
        <button
          key={v}
          onClick={() => {
            setView(v);
            setIsSidebarOpen(false);
          }}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
            view === v ? 'text-cyan-400' : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          {icon}
          <span className="text-[8px] font-bold uppercase tracking-widest">{label}</span>
        </button>
      ))}
    </nav>
  );
};
