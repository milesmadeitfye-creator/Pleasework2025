import { useState, useEffect } from 'react';
import { PageShell } from '../components/layout/PageShell';
import { CalendarTabs } from '../components/calendar/CalendarTabs';
import { WeekView } from '../components/calendar/WeekView';
import { Calendar, Clock, CheckCircle, Plus, X, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { fetchTasks, completeTask, Task } from '../lib/tasks';
import { fetchUpcomingEvents, GhosteCalendarEvent } from '../lib/googleCalendar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getCategoryStyle } from '../lib/calendarCategories';
import { listCalendarEvents, CalendarEvent } from '../lib/calendarApi';

type SuggestedEvent = {
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  category: string;
  icon?: string;
  color?: string;
};

type AgendaItem = {
  id: string;
  summary: string;
  start: string;
  end: string;
  kind: 'task' | 'calendar';
  source: string;
  htmlLink?: string;
  location?: string | null;
  reminderType?: 'none' | 'email' | 'sms' | 'both';
  syncToCalendar?: boolean;
  isCompleted?: boolean;
  category?: string | null;
  color?: string | null;
  icon?: string | null;
};

type FilterType = 'all' | 'tasks' | 'calendar';

export default function CalendarPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<GhosteCalendarEvent[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'agenda'>('agenda');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekDate, setWeekDate] = useState(new Date());
  const [newTask, setNewTask] = useState({
    title: '',
    due_at: '',
    reminder_channel: 'none' as 'none' | 'email' | 'sms' | 'both',
    sync_to_calendar: false,
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedEvent[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [addingEventId, setAddingEventId] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      loadData();

      // Auto-refresh calendar data every 60 seconds to show new Ghoste AI events
      const intervalId = setInterval(() => {
        loadData();
      }, 60000);

      return () => clearInterval(intervalId);
    }
  }, [user]);

  const loadData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 60);

      const promises: Promise<any>[] = [
        fetchTasks(),
        fetchUpcomingEvents('primary', 30),
      ];

      if (user?.id) {
        promises.push(listCalendarEvents(user.id, startDate.toISOString(), endDate.toISOString()));
      }

      const [tasksData, eventsData, calendarEventsData] = await Promise.all(promises);

      setTasks(tasksData.filter((t) => t.status === 'pending'));
      setEvents(eventsData);
      if (calendarEventsData) {
        setCalendarEvents(calendarEventsData);
      }
    } catch (error) {
      console.error('Error loading calendar data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadData(true);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) {
      alert('Please enter a task title');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('You must be logged in to create a task');
        return;
      }

      const response = await fetch('/.netlify/functions/tasks-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: newTask.title,
          dueAt: newTask.due_at || null,
          reminderChannel: newTask.reminder_channel,
          syncToCalendar: newTask.sync_to_calendar,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || 'Failed to create task');
        return;
      }

      setNewTask({
        title: '',
        due_at: '',
        reminder_channel: 'none',
        sync_to_calendar: false,
      });
      setShowNewTaskForm(false);
      await loadData();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task');
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await completeTask(taskId);
      await loadData();
    } catch (error) {
      console.error('Error completing task:', error);
      alert('Failed to complete task');
    }
  };

  const handleGetSuggestions = async () => {
    if (!user) return;

    try {
      setLoadingSuggestions(true);
      setShowSuggestions(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const response = await fetch('/.netlify/functions/calendar-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          startDate: now.toISOString(),
          endDate: thirtyDaysLater.toISOString(),
          goal: 'General marketing and content planning',
        }),
      });

      if (!response.ok) {
        console.error('Failed to fetch suggestions');
        alert('Failed to fetch suggestions');
        return;
      }

      const result = await response.json();
      setSuggestions(result.suggested_events || []);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      alert('Failed to fetch suggestions');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAddSuggestion = async (suggestion: SuggestedEvent, index: number) => {
    if (!user) return;

    try {
      setAddingEventId(index);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const { error } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          title: suggestion.title,
          description: suggestion.description || null,
          status: 'pending',
          due_at: suggestion.start_time,
          reminder_channel: 'email',
          reminder_minutes_before: 60,
          source: 'ghoste_ai_suggestion',
          category: suggestion.category,
          color: suggestion.color || null,
          icon: suggestion.icon || null,
        });

      if (error) {
        console.error('Error adding suggestion:', error);
        alert('Failed to add event to calendar');
        return;
      }

      // Remove from suggestions
      setSuggestions(prev => prev.filter((_, i) => i !== index));
      await loadData();
    } catch (error) {
      console.error('Error adding suggestion:', error);
      alert('Failed to add event to calendar');
    } finally {
      setAddingEventId(null);
    }
  };

  const getAgendaItems = (): AgendaItem[] => {
    const items: AgendaItem[] = [];

    tasks.forEach((task) => {
      if (task.due_at) {
        items.push({
          id: task.id,
          summary: task.title,
          start: task.due_at,
          end: task.due_at,
          kind: 'task',
          source: task.source || 'Ghoste Tasks',
          reminderType: task.reminder_channel,
          syncToCalendar: !!task.calendar_event_id,
          isCompleted: task.status === 'completed',
          category: task.category,
          color: task.color,
          icon: task.icon,
        });
      }
    });

    events.forEach((event) => {
      items.push({
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        kind: 'calendar',
        source: 'Google Calendar',
        htmlLink: event.htmlLink,
        location: event.location,
      });
    });

    calendarEvents.forEach((event) => {
      items.push({
        id: event.id || '',
        summary: event.title,
        start: event.start_at,
        end: event.end_at,
        kind: 'calendar',
        source: event.source === 'ghoste_ai' ? 'Ghoste AI' : 'Ghoste Calendar',
        location: event.location,
      });
    });

    return items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  };

  const getFilteredItems = (): AgendaItem[] => {
    const items = getAgendaItems();
    if (filter === 'all') return items;
    return items.filter((item) => item.kind === filter);
  };

  const groupByDate = (items: AgendaItem[]) => {
    const groups: { [date: string]: AgendaItem[] } = {};
    items.forEach((item) => {
      const date = new Date(item.start).toISOString().split('T')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return groups;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateOnly = dateStr.split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateOnly === todayStr) return 'Today';
    if (dateOnly === tomorrowStr) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const formatTime = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (start.length === 10) return 'All day';

    const startTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (startTime === endTime) return startTime;
    return `${startTime} – ${endTime}`;
  };

  const getCurrentMonthLabel = () => {
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const goPrevWeek = () => {
    setWeekDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const goNextWeek = () => {
    setWeekDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(startDate));
      startDate.setDate(startDate.getDate() + 1);
    }
    return days;
  };

  const getItemsForDate = (date: Date): AgendaItem[] => {
    const dateStr = date.toISOString().split('T')[0];
    const items = getAgendaItems();
    return items.filter((item) => item.start.startsWith(dateStr));
  };

  if (loading) {
    return (
      <PageShell title="Calendar">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ghoste-blue"></div>
        </div>
      </PageShell>
    );
  }

  const groupedItems = groupByDate(getFilteredItems());
  const calendarDays = generateCalendarDays();

  return (
    <PageShell title="Calendar">
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <CalendarTabs
            activeView={calendarView}
            onChange={setCalendarView}
            currentMonth={calendarView === 'month' ? getCurrentMonthLabel() : undefined}
            onPrevMonth={goToPrevMonth}
            onNextMonth={goToNextMonth}
            onToday={goToToday}
          />
        </div>
        <button
          onClick={handleGetSuggestions}
          disabled={loadingSuggestions}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] disabled:opacity-50 disabled:cursor-not-allowed ml-4"
        >
          <Sparkles className="w-4 h-4" />
          {loadingSuggestions ? 'Loading...' : 'AI Suggestions'}
        </button>
      </div>

      {calendarView === 'month' && (
        <div className="rounded-2xl border border-white/8 bg-white/5 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <div className="grid grid-cols-7 gap-px bg-white/5 rounded-lg overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="bg-ghoste-black p-2 text-center text-[11px] font-semibold text-ghoste-grey uppercase tracking-wider">
                {day}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = day.toDateString() === new Date().toDateString();
              const dayItems = getItemsForDate(day);

              return (
                <div
                  key={i}
                  className={[
                    'bg-ghoste-navy min-h-[100px] p-2',
                    isCurrentMonth ? '' : 'opacity-40',
                    isToday ? 'ring-2 ring-ghoste-blue ring-inset' : ''
                  ].join(' ')}
                >
                  <div className={[
                    'text-sm font-medium mb-1',
                    isToday ? 'text-ghoste-blue' : 'text-ghoste-white'
                  ].join(' ')}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((item) => {
                      const categoryStyle = getCategoryStyle(item.category);
                      const chipBg = item.color || categoryStyle.bg;
                      const chipIcon = item.icon || categoryStyle.icon;

                      return (
                        <div
                          key={item.id}
                          className="text-[10px] px-1.5 py-0.5 rounded truncate flex items-center gap-1"
                          style={{ backgroundColor: chipBg, color: categoryStyle.color }}
                          title={item.summary}
                        >
                          <span>{chipIcon}</span>
                          <span className="truncate">{item.summary}</span>
                        </div>
                      );
                    })}
                    {dayItems.length > 3 && (
                      <div className="text-[10px] text-ghoste-grey">+{dayItems.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {calendarView === 'week' && (
        <div className="rounded-2xl border border-white/8 bg-white/5 p-6 shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <WeekView
            currentWeekDate={weekDate}
            onPrevWeek={goPrevWeek}
            onNextWeek={goNextWeek}
            events={getAgendaItems()}
          />
        </div>
      )}

      {calendarView === 'agenda' && (
        <div className="flex justify-center">
          <div className="w-full max-w-5xl">
            <div className="rounded-2xl border border-white/8 bg-white/5 shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-ghoste-white uppercase tracking-wider">Timeline</h2>
                  <p className="text-xs text-ghoste-grey mt-0.5">Your upcoming events and tasks</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-ghoste-blue/10 hover:bg-ghoste-blue/20 text-ghoste-blue rounded-lg text-xs font-medium transition-colors disabled:opacity-50 border border-ghoste-blue/20"
                    title="Refresh to see new Ghoste AI events"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <button
                    onClick={() => setShowNewTaskForm(!showNewTaskForm)}
                    className="px-3 py-1.5 bg-ghoste-blue hover:bg-ghoste-blue/90 text-ghoste-white rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-[0_0_15px_rgba(26,108,255,0.3)]"
                  >
                    {showNewTaskForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showNewTaskForm ? 'Cancel' : 'New Task'}
                  </button>
                </div>
              </div>

              {showNewTaskForm && (
                <div className="px-6 py-4 border-b border-white/8 bg-ghoste-black/30">
                  <form onSubmit={handleCreateTask} className="space-y-3">
                    <div>
                      <label className="block text-xs text-ghoste-grey mb-1">Task Title</label>
                      <input
                        type="text"
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        placeholder="What needs to be done?"
                        className="w-full px-3 py-2 bg-ghoste-navy border border-white/10 rounded-lg text-ghoste-white placeholder-ghoste-grey/50 focus:outline-none focus:border-ghoste-blue"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-ghoste-grey mb-1">Due Date & Time</label>
                      <input
                        type="datetime-local"
                        value={newTask.due_at}
                        onChange={(e) => setNewTask({ ...newTask, due_at: e.target.value })}
                        className="w-full px-3 py-2 bg-ghoste-navy border border-white/10 rounded-lg text-ghoste-white focus:outline-none focus:border-ghoste-blue"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full px-4 py-2 bg-ghoste-blue hover:bg-ghoste-blue/90 text-ghoste-white rounded-lg transition-colors font-medium shadow-[0_0_15px_rgba(26,108,255,0.3)]"
                    >
                      Create Task
                    </button>
                  </form>
                </div>
              )}

              <div className="px-6 py-3 border-b border-white/8 bg-ghoste-black/20">
                <div className="flex gap-2">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'tasks', label: 'Tasks' },
                    { value: 'calendar', label: 'Calendar' },
                  ].map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => setFilter(tab.value as FilterType)}
                      className={[
                        'px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
                        filter === tab.value
                          ? 'bg-ghoste-blue text-ghoste-white shadow-[0_0_12px_rgba(26,108,255,0.4)]'
                          : 'text-ghoste-grey hover:text-ghoste-white hover:bg-white/5'
                      ].join(' ')}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-[600px] overflow-y-auto custom-scroll">
                {Object.keys(groupedItems).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20 text-ghoste-grey" />
                    <p className="text-sm font-medium text-ghoste-grey">No {filter === 'all' ? 'events' : filter} scheduled</p>
                    <p className="text-xs text-ghoste-grey/60 mt-1">Ask Ghoste AI to create a content plan and it will appear here</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {Object.entries(groupedItems).map(([date, items]) => (
                      <div key={date} className="px-6 py-5">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 rounded-xl bg-ghoste-black/50 border border-white/10 flex flex-col items-center justify-center">
                            <div className="text-lg font-bold text-ghoste-white">
                              {new Date(date).toLocaleDateString(undefined, { day: '2-digit' })}
                            </div>
                            <div className="text-[9px] text-ghoste-grey uppercase">
                              {new Date(date).toLocaleDateString(undefined, { month: 'short' })}
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-ghoste-white">
                              {formatDate(date)}
                            </p>
                            <p className="text-xs text-ghoste-grey">
                              {items.length} event{items.length > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 ml-15">
                          {items.map((item) => {
                            const categoryStyle = getCategoryStyle(item.category);
                            const chipBg = item.color || categoryStyle.bg;
                            const chipIcon = item.icon || categoryStyle.icon;

                            return (
                              <div
                                key={item.id}
                                className="relative pl-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:rounded-full hover:before:w-[3px] transition-all"
                                style={{ '--before-bg': chipBg } as React.CSSProperties}
                              >
                                <div className="p-4 bg-ghoste-black/40 hover:bg-ghoste-black/60 rounded-xl border border-white/10 hover:border-white/20 transition-all">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className="text-xs font-medium text-ghoste-grey">
                                          {formatTime(item.start, item.end)}
                                        </span>
                                        {item.category && (
                                          <span
                                            className="px-2 py-0.5 text-xs rounded-full flex items-center gap-1"
                                            style={{ backgroundColor: `${chipBg}30`, color: chipBg }}
                                          >
                                            <span>{chipIcon}</span>
                                            <span className="font-medium">{categoryStyle.label}</span>
                                          </span>
                                        )}
                                        {item.kind === 'task' && (
                                          <button
                                            onClick={() => handleCompleteTask(item.id)}
                                            className={`w-4 h-4 rounded border-2 transition-colors ${
                                              item.isCompleted
                                                ? 'bg-green-500 border-green-500'
                                                : 'border-ghoste-grey/50 hover:border-ghoste-blue hover:bg-ghoste-blue/20'
                                            }`}
                                          >
                                            {item.isCompleted && <CheckCircle className="w-3 h-3 text-white" />}
                                          </button>
                                        )}
                                      </div>
                                      <p className={`text-sm font-medium text-ghoste-white ${item.isCompleted ? 'line-through opacity-60' : ''}`}>
                                        {item.summary}
                                      </p>
                                      {item.location && (
                                        <p className="text-xs text-ghoste-grey/70 mt-1.5">{item.location}</p>
                                      )}
                                    </div>
                                    {item.htmlLink && (
                                      <a
                                        href={item.htmlLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-ghoste-grey hover:text-ghoste-blue transition-colors flex-shrink-0"
                                        title="Open in Google Calendar"
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSuggestions && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-ghoste-navy rounded-2xl border border-white/10 max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-[0_25px_50px_rgba(0,0,0,0.8)]">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-ghoste-white">Ghoste AI Suggestions</h2>
                  <p className="text-sm text-ghoste-grey">AI-powered calendar recommendations</p>
                </div>
              </div>
              <button
                onClick={() => setShowSuggestions(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-ghoste-grey" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              {loadingSuggestions ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ghoste-blue"></div>
                </div>
              ) : suggestions.length === 0 ? (
                <div className="text-center py-12">
                  <Sparkles className="w-12 h-12 text-ghoste-grey/40 mx-auto mb-3" />
                  <p className="text-ghoste-grey">No suggestions available</p>
                  <p className="text-sm text-ghoste-grey/60 mt-1">Try again or adjust your calendar</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((suggestion, index) => {
                    const categoryStyle = getCategoryStyle(suggestion.category);
                    const chipBg = suggestion.color || categoryStyle.bg;
                    const chipIcon = suggestion.icon || categoryStyle.icon;
                    const isAdding = addingEventId === index;

                    return (
                      <div
                        key={index}
                        className="p-4 bg-ghoste-black/50 rounded-lg border border-white/10 hover:border-white/20 transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className="px-2 py-0.5 text-xs rounded-full flex items-center gap-1"
                                style={{ backgroundColor: `${chipBg}40`, color: chipBg }}
                              >
                                <span>{chipIcon}</span>
                                <span>{categoryStyle.label}</span>
                              </span>
                              <span className="text-xs text-ghoste-grey">
                                {new Date(suggestion.start_time).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <h3 className="text-ghoste-white font-medium mb-1">{suggestion.title}</h3>
                            {suggestion.description && (
                              <p className="text-sm text-ghoste-grey/80">{suggestion.description}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleAddSuggestion(suggestion, index)}
                            disabled={isAdding}
                            className="px-4 py-2 bg-ghoste-blue hover:bg-ghoste-blue/90 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(26,108,255,0.3)]"
                          >
                            {isAdding ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Adding...
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                Add to Calendar
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
