import { useState, useEffect } from 'react';
import { Calendar, Clock, ArrowRight, ExternalLink } from 'lucide-react';
import { fetchTasks } from '../../lib/tasks';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';

type ScheduleItem = {
  id: string;
  title: string;
  time: string;
  source: 'task' | 'calendar';
  startTime: Date;
  htmlLink?: string;
};

type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink: string;
};

export function TodayScheduleCard() {
  const navigate = useNavigate();
  const googleCalendar = useConnectionStatus('google_calendar');
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    loadTodaySchedule();
  }, []);

  const loadTodaySchedule = async () => {
    try {
      setLoading(true);
      setCalendarError(null);

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const scheduleItems: ScheduleItem[] = [];

      // Fetch tasks
      try {
        const tasksData = await fetchTasks();
        tasksData
          .filter((task) => {
            if (task.status !== 'pending' || !task.due_at) return false;
            const dueDate = new Date(task.due_at);
            return dueDate >= startOfDay && dueDate < endOfDay;
          })
          .forEach((task) => {
            scheduleItems.push({
              id: task.id,
              title: task.title,
              time: formatTime(task.due_at!),
              source: 'task',
              startTime: new Date(task.due_at!),
            });
          });
      } catch (err) {
        console.error('Error fetching tasks:', err);
      }

      // Fetch calendar events from new endpoint
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          const response = await fetch('/.netlify/functions/google-calendar-today', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          });

          const calendarData = await response.json();

          if (calendarData.error) {
            setCalendarError(calendarData.error);
          }

          if (calendarData.connected && Array.isArray(calendarData.events)) {
            calendarData.events.forEach((event: CalendarEvent) => {
              scheduleItems.push({
                id: event.id,
                title: event.summary,
                time: formatEventTime(event.start, event.end),
                source: 'calendar',
                startTime: new Date(event.start),
                htmlLink: event.htmlLink,
              });
            });
          }
        }
      } catch (err) {
        console.error('Error fetching calendar events:', err);
        setCalendarError('Unable to load calendar');
      }

      scheduleItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      setItems(scheduleItems.slice(0, 5));
    } catch (error) {
      console.error('Error loading today schedule:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (dateStr.length === 10) return 'All day';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatEventTime = (start: string, end: string) => {
    if (!start || !end) return 'Time unavailable';

    // Check if it's an all-day event (date only, no time)
    if (start.length === 10) return 'All day';

    const startDate = new Date(start);
    const endDate = new Date(end);

    const startTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    return `${startTime} – ${endTime}`;
  };

  const handleConnectGoogleCalendar = async () => {
    try {
      setIsConnecting(true);
      setCalendarError(null);

      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setCalendarError('Session expired. Please sign in again.');
        setIsConnecting(false);
        return;
      }

      const response = await fetch('/.netlify/functions/gcal-start-connect', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok || !result.url) {
        console.error('[TodayScheduleCard] Google Calendar connect failed:', result);
        setCalendarError('Failed to start connection. Please try again.');
        setIsConnecting(false);
        return;
      }

      window.open(result.url, "googleCalendarConnect", "width=600,height=700");
      setIsConnecting(false);
    } catch (err) {
      console.error('Error connecting Google Calendar:', err);
      setCalendarError('Failed to connect. Please try again.');
      setIsConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-emerald-500/10 rounded-xl">
            <Calendar className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Today's Schedule</h3>
        </div>
        <div className="text-center py-4 text-gray-500">Loading today's schedule...</div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 rounded-xl">
            <Calendar className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Today's Schedule</h3>
        </div>
        <button
          onClick={() => navigate('/dashboard?tab=calendar')}
          className="text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-6">
          {!googleCalendar.connected ? (
            <>
              <p className="text-gray-400 mb-2 font-medium">Calendar Not Connected</p>
              <p className="text-sm text-gray-500 mb-3">
                Connect your Google Calendar to see today's schedule
              </p>
              <button
                onClick={handleConnectGoogleCalendar}
                disabled={isConnecting}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition-colors inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Calendar className="w-4 h-4" />
                {isConnecting ? 'Connecting...' : 'Connect Calendar'}
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-2">No events today</p>
              <p className="text-sm text-gray-500 mb-3">
                {calendarError
                  ? calendarError
                  : "You're connected to Google Calendar. Add events in Google to see them here."}
              </p>
              <button
                onClick={() => navigate('/dashboard?tab=calendar')}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition-colors inline-flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Open Calendar & Tasks
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
                onClick={() => {
                  if (item.source === 'calendar' && item.htmlLink) {
                    window.open(item.htmlLink, '_blank');
                  }
                }}
              >
                <div className="flex items-center gap-2 text-xs text-gray-400 min-w-[100px]">
                  <Clock className="w-3 h-3" />
                  {item.time}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{item.title}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      item.source === 'task'
                        ? 'bg-purple-500/10 text-purple-400'
                        : 'bg-blue-500/10 text-blue-400'
                    }`}
                  >
                    {item.source === 'task' ? 'Task' : 'Event'}
                  </span>
                  {item.source === 'calendar' && item.htmlLink && (
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              if (googleCalendar.connected) {
                navigate('/dashboard?tab=calendar');
              } else {
                handleConnectGoogleCalendar();
              }
            }}
            disabled={isConnecting}
            className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isConnecting ? 'Connecting...' : googleCalendar.connected ? 'Open Calendar & Tasks' : 'Connect Calendar'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
