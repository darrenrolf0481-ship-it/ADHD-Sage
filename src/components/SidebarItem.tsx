import React from 'react';

export const SidebarItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  active?: boolean;
}> = ({ icon, label, value, active }) => (
  <div
    className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-300 ${active ? 'bg-white/10 border border-white/10 shadow-lg text-white' : 'text-slate-400 hover:bg-[#1C1C1E] hover:text-[#E4E4E7]'}`}
  >
    <div className={`flex items-center gap-3 ${active ? 'text-cyan-400' : ''}`}>
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </div>
    {value && <span className="text-[10px] font-mono opacity-40 font-bold uppercase">{value}</span>}
  </div>
);
