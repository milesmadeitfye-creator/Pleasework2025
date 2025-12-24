import React from 'react';
import { getStartOfWeek, getEndOfWeek, getWeekDays } from '../../utils/calendar';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCategoryStyle } from '../../lib/calendarCategories';

type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  kind: 'task' | 'calendar';
  category?: string | null;
  color?: string | null;
  icon?: string | null;
  isCompleted?: boolean;
};

type WeekViewProps = {
  currentWeekDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  events: CalendarEvent[];
};

export function WeekView({ currentWeekDate, onPrevWeek, onNextWeek, events }: WeekViewProps) {
  const start = getStartOfWeek(currentWeekDate, 0);
  const end = getEndOfWeek(currentWeekDate, 0);

  const days = getWeekDays(currentWeekDate, 0);

  function eventsForDay(day: Date) {
    const dayStr = day.toISOString().slice(0, 10);
    return events.filter((e) => {
      const eventDateStr = new Date(e.start).toISOString().slice(0, 10);
      return eventDateStr === dayStr;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onPrevWeek}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-ghoste-grey hover:text-ghoste-white transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>
        <div className="text-sm text-ghoste-grey">
          Week of{' '}
          <span className="font-medium text-ghoste-white">
            {start.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}{' '}
            –{' '}
            {new Date(end.getTime() - 1).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
        <button
          onClick={onNextWeek}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-ghoste-grey hover:text-ghoste-white transition-all"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {days.map((d) => {
          const dayEvents = eventsForDay(d);
          const isToday = new Date().toDateString() === d.toDateString();

          return (
            <div
              key={d.toISOString()}
              className={`rounded-2xl p-3 min-h-[180px] bg-ghoste-black/40 backdrop-blur-sm border ${
                isToday ? 'border-ghoste-blue/70 shadow-[0_0_15px_rgba(26,108,255,0.3)]' : 'border-white/8'
              }`}
            >
              <div className="flex flex-col gap-1 mb-3">
                <div className={`font-semibold text-sm ${isToday ? 'text-ghoste-blue' : 'text-ghoste-white'}`}>
                  {d.toLocaleDateString(undefined, { weekday: 'short' })}
                </div>
                <div className={`text-2xl font-bold ${isToday ? 'text-ghoste-blue' : 'text-ghoste-grey'}`}>
                  {d.getDate()}
                </div>
                {dayEvents.length > 0 && (
                  <div className="text-[10px] text-ghoste-grey mt-1">
                    {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
              {dayEvents.length === 0 ? (
                <div className="text-[10px] text-ghoste-grey/50 text-center py-4">
                  No events
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scroll pr-1">
                  {dayEvents.map((e) => {
                    const categoryStyle = getCategoryStyle(e.category);
                    const chipBg = e.color || categoryStyle.bg;
                    const chipIcon = e.icon || categoryStyle.icon;
                    const startTime = new Date(e.start).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={e.id}
                        className="rounded-lg px-2 py-2 hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: `${chipBg}20`, borderLeft: `3px solid ${chipBg}` }}
                      >
                        <div className="flex items-start gap-1.5 mb-1">
                          <span className="text-sm">{chipIcon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-[11px] text-ghoste-white truncate leading-tight">
                              {e.summary}
                            </div>
                            <div className="text-[10px] text-ghoste-grey mt-0.5">
                              {startTime}
                            </div>
                          </div>
                        </div>
                        {e.isCompleted && (
                          <div className="text-[9px] text-green-400 mt-1">✓ Completed</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {events.length === 0 && (
        <div className="text-center py-12 rounded-2xl bg-ghoste-black/40 border border-white/8">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40 text-ghoste-grey" />
          <p className="text-sm text-ghoste-grey">No events scheduled this week</p>
          <p className="text-xs mt-1 text-ghoste-grey/60">Ask Ghoste AI to create calendar reminders for you</p>
        </div>
      )}
    </div>
  );
}
