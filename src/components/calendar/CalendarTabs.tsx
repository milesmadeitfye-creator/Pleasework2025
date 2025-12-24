import React from 'react';

interface CalendarTabsProps {
  activeView: 'month' | 'week' | 'agenda';
  onChange: (view: 'month' | 'week' | 'agenda') => void;
  currentMonth?: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onToday?: () => void;
}

export const CalendarTabs: React.FC<CalendarTabsProps> = ({
  activeView,
  onChange,
  currentMonth,
  onPrevMonth,
  onNextMonth,
  onToday,
}) => {
  const views: Array<{ label: string; value: 'month' | 'week' | 'agenda' }> = [
    { label: 'Month', value: 'month' },
    { label: 'Week', value: 'week' },
    { label: 'Agenda', value: 'agenda' },
  ];

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex gap-2 rounded-full bg-white/5 p-1">
        {views.map((view) => {
          const active = activeView === view.value;
          return (
            <button
              key={view.value}
              type="button"
              onClick={() => onChange(view.value)}
              className={[
                'whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] font-medium tracking-wide transition-all',
                active
                  ? 'bg-ghoste-blue text-ghoste-white shadow-[0_0_18px_rgba(26,108,255,0.6)]'
                  : 'bg-transparent text-ghoste-grey hover:bg-white/10 hover:text-ghoste-white'
              ].join(' ')}
            >
              {view.label}
            </button>
          );
        })}
      </div>

      {/* Calendar navigation controls */}
      {currentMonth && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToday}
            className="px-3 py-1.5 text-[11px] font-medium text-ghoste-grey hover:text-ghoste-white transition-colors rounded-lg hover:bg-white/5"
          >
            Today
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevMonth}
              className="p-1.5 text-ghoste-grey hover:text-ghoste-white transition-colors rounded-lg hover:bg-white/5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-ghoste-white min-w-[140px] text-center">
              {currentMonth}
            </span>
            <button
              type="button"
              onClick={onNextMonth}
              className="p-1.5 text-ghoste-grey hover:text-ghoste-white transition-colors rounded-lg hover:bg-white/5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
