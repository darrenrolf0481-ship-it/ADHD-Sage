import React from 'react';

export const SidebarItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}> = ({ icon, label, value, active, onClick, disabled, ariaLabel }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel || label}
    aria-current={active ? 'page' : undefined}
    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed ${active ? 'bg-white/10 border border-white/10 shadow-lg text-white' : 'text-slate-400 hover:bg-[#1C1C1E] hover:text-[#E4E4E7]'}`}
  >
    <div className={`flex items-center gap-3 ${active ? 'text-cyan-400' : ''}`}>
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </div>
    {value && <span className="text-[10px] font-mono opacity-40 font-bold uppercase">{value}</span>}
  </button>
);
