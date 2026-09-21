import React from 'react';

export const SidebarItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ icon, label, value, active, onClick }) => {
  const content = (
    <>
      <div className={`flex items-center gap-3 ${active ? 'text-cyan-400' : ''}`}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {value && <span className="text-[10px] font-mono opacity-40 font-bold uppercase">{value}</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
          active
            ? 'bg-white/10 border border-white/10 shadow-lg text-white'
            : 'text-slate-400 hover:bg-[#1C1C1E] hover:text-[#E4E4E7]'
        }`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 ${
        active
          ? 'bg-white/10 border border-white/10 shadow-lg text-white'
          : 'text-slate-400'
      }`}
    >
      {content}
    </div>
  );
};
