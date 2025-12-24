import React, { useEffect, useState } from 'react';

interface AnalyticsKpiCardProps {
  label: string;
  value: number | string;
  meta?: string;
  muted?: boolean;
}

export const AnalyticsKpiCard: React.FC<AnalyticsKpiCardProps> = ({
  label,
  value,
  meta,
  muted,
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  // Animate the number from 0 → value whenever value changes
  useEffect(() => {
    // Only animate if value is a number
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return;
    }

    const duration = 700; // ms
    const frameRate = 1000 / 60;
    const totalFrames = Math.max(1, Math.round(duration / frameRate));
    let frame = 0;

    const start = 0;
    const end = value;

    const counter = setInterval(() => {
      frame += 1;
      const progress = Math.min(frame / totalFrames, 1);
      const current = Math.round(start + (end - start) * progress);
      setDisplayValue(current);
      if (progress === 1) clearInterval(counter);
    }, frameRate);

    return () => clearInterval(counter);
  }, [value]);

  // Format the display value
  const formatted =
    typeof value === 'number' && Number.isFinite(value)
      ? displayValue.toLocaleString()
      : value ?? '—';

  return (
    <div
      className={[
        'flex flex-col justify-between rounded-2xl border bg-white/5 px-3.5 py-3 shadow-[0_18px_35px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-all',
        'border-white/8',
        muted ? 'opacity-60' : 'hover:bg-white/8',
      ].join(' ')}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ghoste-grey">
        {label}
      </span>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className={[
            'text-xl font-semibold text-ghoste-white',
            !muted && 'drop-shadow-[0_0_14px_rgba(255,255,255,0.7)]',
          ].join(' ')}
        >
          {formatted}
        </span>
        {!muted && typeof value === 'number' && (
          <span className="h-1.5 w-1.5 rounded-full bg-ghoste-blue shadow-[0_0_14px_rgba(26,108,255,0.9)] animate-pulse" />
        )}
      </div>
      {meta && (
        <span className="mt-1 text-[11px] text-ghoste-grey/80">
          {meta}
        </span>
      )}
    </div>
  );
};
