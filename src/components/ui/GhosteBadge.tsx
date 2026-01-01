import { ReactNode } from 'react';

export type GhosteBadgeVariant =
  | 'active'
  | 'paused'
  | 'scheduled'
  | 'draft'
  | 'failed'
  | 'publishing'
  | 'completed'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

interface GhosteBadgeProps {
  variant: GhosteBadgeVariant;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  pulse?: boolean;
}

const variantStyles: Record<GhosteBadgeVariant, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_12px_rgba(0,247,167,0.3)]',
  success: 'bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_12px_rgba(0,247,167,0.3)]',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 shadow-[0_0_12px_rgba(250,204,21,0.2)]',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 shadow-[0_0_12px_rgba(250,204,21,0.2)]',
  scheduled: 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_12px_rgba(26,108,255,0.3)]',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_12px_rgba(26,108,255,0.3)]',
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  failed: 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.3)]',
  error: 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.3)]',
  publishing: 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_12px_rgba(26,108,255,0.3)]',
  completed: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
};

export function GhosteBadge({
  variant,
  children,
  icon,
  className = '',
  pulse = false
}: GhosteBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
        variantStyles[variant],
        pulse && 'animate-pulse',
        className
      ].join(' ')}
    >
      {icon && <span className="w-3.5 h-3.5">{icon}</span>}
      {children}
    </span>
  );
}
