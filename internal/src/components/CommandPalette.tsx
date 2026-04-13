import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      { id: 'go:overview', label: 'Go to Overview', hint: 'home', run: () => onNavigate('/') },
      { id: 'go:users', label: 'Open Users', hint: 'control', run: () => onNavigate('/users') },
      { id: 'go:ai', label: 'Open AI Monitor', run: () => onNavigate('/ai') },
      { id: 'go:ads', label: 'Open Meta Ads', run: () => onNavigate('/ads') },
      { id: 'go:links', label: 'Open Links', run: () => onNavigate('/links') },
      { id: 'go:billing', label: 'Open Billing', run: () => onNavigate('/billing') },
      { id: 'go:logs', label: 'Open Errors & Logs', run: () => onNavigate('/logs') },
    ],
    [onNavigate],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[index]?.run();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-line bg-ink-1 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command or search…"
          className="w-full bg-transparent px-4 py-3 text-sm text-fg placeholder:text-fg-mute outline-none border-b border-line"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-fg-mute">No matches.</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                onClick={() => c.run()}
                onMouseEnter={() => setIndex(i)}
                className={`flex w-full items-center justify-between px-4 py-2 text-sm transition-colors ${
                  i === index ? 'bg-ink-3 text-fg' : 'text-fg-soft hover:bg-ink-2'
                }`}
              >
                <span>{c.label}</span>
                <ArrowRight className="h-3.5 w-3.5 opacity-50" />
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px] text-fg-mute">
          <div className="flex items-center gap-2">
            <span className="kbd">↑↓</span>
            <span>navigate</span>
            <span className="kbd">↵</span>
            <span>run</span>
          </div>
          <span className="kbd">esc</span>
        </div>
      </div>
    </div>
  );
}
