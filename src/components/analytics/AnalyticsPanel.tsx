import React from 'react';

interface AnalyticsPanelProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ title, children, action }) => {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-ghoste-white">
          {title}
        </h2>
        {action && <div>{action}</div>}
      </div>
      <div className="min-h-[140px] text-xs text-ghoste-grey">
        {children}
      </div>
    </div>
  );
};
