import React from 'react';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  active?: boolean;
  onClick?: () => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  icon,
  label,
  value,
  active,
  onClick,
}) => {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 text-left ${
        onClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500' : ''
      } ${
        active
          ? 'bg-white/10 border border-white/10 shadow-lg text-white'
          : 'text-slate-400 hover:bg-[#1C1C1E] hover:text-[#E4E4E7]'
      }`}
    >
      <div className={`flex items-center gap-3 ${active ? 'text-cyan-400' : ''}`}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {value && <span className="text-[10px] font-mono opacity-40 font-bold uppercase">{value}</span>}
    </Component>
  );
};
