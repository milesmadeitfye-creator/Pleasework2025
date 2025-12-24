import { useState, useEffect } from 'react';
import { Calendar, Plus, Check, Loader2, Bell, Trash2 } from 'lucide-react';
import { fetchTasks, upsertTask, completeTask, deleteTask, Task } from '../lib/tasks';
import { listCalendars, createProgressEvent } from '../lib/googleCalendar';
import { useAuth } from '../contexts/AuthContext';

interface CalendarItem {
  id: string;
  summary: string;
}

export default function Progress() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDueAt, setNewDueAt] = useState('');
  const [reminderChannel, setReminderChannel] = useState<'none' | 'email' | 'sms' | 'both'>('none');
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [syncToCalendar, setSyncToCalendar] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const [tasksData, calendarsData] = await Promise.allSettled([
        fetchTasks(),
        listCalendars().catch(() => [] as CalendarItem[]),
      ]);

      if (tasksData.status === 'fulfilled') {
        setTasks(tasksData.value);
      }

      if (calendarsData.status === 'fulfilled' && calendarsData.value.length > 0) {
        setCalendars(calendarsData.value);
        setSelectedCalendarId(calendarsData.value[0].id);
      }
    } catch (err: any) {
      console.error('[Progress] Error loading data:', err);
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTitle.trim()) {
      setError('Task title is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let calendarEventId: string | null = null;
      let calendarId: string | null = null;

      if (syncToCalendar && selectedCalendarId && newDueAt) {
        try {
          const startTime = new Date(newDueAt);
          const endTime = new Date(startTime.getTime() + 30 * 60000);

          const event = await createProgressEvent({
            calendarId: selectedCalendarId,
            summary: newTitle,
            description: newDescription || undefined,
            start: startTime.toISOString(),
            end: endTime.toISOString(),
          });

          calendarEventId = event.id;
          calendarId = selectedCalendarId;
          console.log('[Progress] Created calendar event:', event.id);
        } catch (calErr) {
          console.error('[Progress] Failed to create calendar event:', calErr);
        }
      }

      const newTask = await upsertTask({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        due_at: newDueAt || null,
        reminder_channel: reminderChannel,
        reminder_minutes_before: reminderMinutes,
        calendar_id: calendarId,
        calendar_event_id: calendarEventId,
        status: 'pending',
      });

      setTasks([...tasks, newTask]);

      setNewTitle('');
      setNewDescription('');
      setNewDueAt('');
      setReminderChannel('none');
      setReminderMinutes(15);
      setSyncToCalendar(false);
    } catch (err: any) {
      console.error('[Progress] Error creating task:', err);
      setError(err.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteTask = async (id: string) => {
    try {
      const updated = await completeTask(id);
      setTasks(tasks.map((t) => (t.id === id ? updated : t)));
    } catch (err: any) {
      console.error('[Progress] Error completing task:', err);
      setError(err.message || 'Failed to complete task');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Delete this task?')) return;

    try {
      await deleteTask(id);
      setTasks(tasks.filter((t) => t.id !== id));
    } catch (err: any) {
      console.error('[Progress] Error deleting task:', err);
      setError(err.message || 'Failed to delete task');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No due date';

    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
    } catch {
      return 'Invalid date';
    }
  };

  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <div className="px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-50 mb-2">Progress & To-Do</h1>
        <p className="text-slate-400">
          Turn your release plan into calendar-backed tasks with reminders.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-slate-50 mb-4">Add New Task</h2>

            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Task Title *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Finish mixing track 3"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Add notes or details..."
                  rows={2}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Due Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={newDueAt}
                    onChange={(e) => setNewDueAt(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Reminder
                  </label>
                  <select
                    value={reminderChannel}
                    onChange={(e) => setReminderChannel(e.target.value as any)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="none">None</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="both">Email & SMS</option>
                  </select>
                </div>
              </div>

              {reminderChannel !== 'none' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Remind me (minutes before)
                  </label>
                  <input
                    type="number"
                    value={reminderMinutes}
                    onChange={(e) => setReminderMinutes(parseInt(e.target.value) || 15)}
                    min="1"
                    max="1440"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="syncToCalendar"
                  checked={syncToCalendar}
                  onChange={(e) => setSyncToCalendar(e.target.checked)}
                  className="w-4 h-4 bg-slate-900 border-slate-700 rounded focus:ring-sky-500"
                />
                <label htmlFor="syncToCalendar" className="text-sm text-slate-300">
                  Sync with Google Calendar
                </label>
              </div>

              {syncToCalendar && calendars.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Select Calendar
                  </label>
                  <select
                    value={selectedCalendarId}
                    onChange={(e) => setSelectedCalendarId(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {calendars.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.summary}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !newTitle.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    Add Task
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-slate-50 mb-4">Upcoming Tasks</h2>

            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-400">Loading tasks...</p>
              </div>
            ) : pendingTasks.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 mb-2">No tasks yet</p>
                <p className="text-sm text-slate-500">Create your first task above to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="text-slate-100 font-medium mb-1">{task.title}</h3>
                        {task.description && (
                          <p className="text-sm text-slate-400 mb-2">{task.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(task.due_at)}
                          </span>
                          {task.reminder_channel !== 'none' && (
                            <span className="flex items-center gap-1">
                              <Bell className="w-3 h-3" />
                              {task.reminder_minutes_before}min before
                            </span>
                          )}
                          {task.calendar_event_id && (
                            <span className="text-sky-400">Synced to calendar</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCompleteTask(task.id)}
                          className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
                          title="Mark as done"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {completedTasks.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-700">
                <h3 className="text-sm font-semibold text-slate-400 mb-3">
                  Completed ({completedTasks.length})
                </h3>
                <div className="space-y-2">
                  {completedTasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 text-sm text-slate-500"
                    >
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span className="line-through">{task.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-slate-50 mb-2">Calendar & Streak</h2>
            <p className="text-sm text-slate-400 mb-6">
              Visual view coming next: streaks, weekly schedule, and release countdowns.
            </p>

            <div className="space-y-4">
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Tasks Pending</span>
                  <span className="text-2xl font-bold text-sky-400">{pendingTasks.length}</span>
                </div>
              </div>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Tasks Completed</span>
                  <span className="text-2xl font-bold text-emerald-400">
                    {completedTasks.length}
                  </span>
                </div>
              </div>

              {calendars.length > 0 && (
                <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">Calendars Connected</span>
                    <span className="text-2xl font-bold text-slate-50">{calendars.length}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
