import { useEffect, useState, useRef } from 'react';
import { useSafeRealtime } from '../../hooks/useSafeRealtime';

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  read_at?: string | null;
  created_at: string;
};

type Props = {
  userId: string;
};

export function NotificationsBell({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/.netlify/functions/notifications-list?user_id=${encodeURIComponent(userId)}`
      );
      const json = await res.json();
      if (res.ok && json.ok) {
        setNotifications(json.notifications ?? []);
        setUnreadCount(json.unreadCount ?? 0);
      } else {
        console.error('[NotificationsBell] list error', json.error);
      }
    } catch (err) {
      console.error('[NotificationsBell] fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [userId]);

  // Realtime subscription for new notifications
  useSafeRealtime(
    `notifications-${userId}`,
    (channel) => {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);

          // Show toast notification
          notify('info', newNotif.title, newNotif.message);
        }
      );
    },
    [userId]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/.netlify/functions/notifications-mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
        );
        setUnreadCount(0);
      } else {
        console.error('[NotificationsBell] mark read error', json.error);
      }
    } catch (err) {
      console.error('[NotificationsBell] mark read fetch error', err);
    }
  };

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-ghoste-border bg-ghoste-card hover:bg-ghoste-bg transition-colors"
        aria-label="Notifications"
      >
        <svg
          className="h-5 w-5 text-ghoste-text"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3.75a4.25 4.25 0 0 0-4.25 4.25v1.086c0 .453-.135.895-.389 1.268L6.23 12.44c-.83 1.245-.02 2.935 1.52 2.935h8.5c1.54 0 2.35-1.69 1.52-2.935l-1.13-1.586a2.25 2.25 0 0 1-.389-1.268V8A4.25 4.25 0 0 0 12 3.75Z" />
          <path d="M10 18.75a2 2 0 0 0 4 0" />
        </svg>
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-ghoste-accent px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed top-16 right-6 z-[200] w-80 max-h-[70vh] rounded-xl border border-slate-800 bg-slate-950/95 shadow-xl shadow-black/40 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-100">
                Notifications
              </span>
              <span className="text-xs text-slate-400">
                {loading
                  ? 'Refreshing...'
                  : hasUnread
                  ? `${unreadCount} unread`
                  : "You're all caught up"}
              </span>
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                No notifications yet. As you start running campaigns and booking splits,
                they'll show up here.
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`px-4 py-3 hover:bg-slate-900 transition-colors ${
                      n.read_at ? '' : 'bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-100 truncate">
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">
                          {n.message}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {new Date(n.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!n.read_at && (
                        <span className="mt-1 h-2 w-2 rounded-full bg-blue-400 flex-shrink-0" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
