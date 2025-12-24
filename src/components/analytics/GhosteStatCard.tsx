import React from "react";

export function GhosteStatCard({
  title,
  value,
  delta,
  sub,
  icon,
}: {
  title: string;
  value: string;
  delta?: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 backdrop-blur p-4 md:p-5 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide text-white/55">{title}</div>
          <div className="mt-1 text-2xl md:text-3xl font-semibold text-white truncate">{value}</div>
          {sub ? <div className="mt-1 text-sm text-white/55">{sub}</div> : null}
        </div>

        {icon ? (
          <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
        ) : null}
      </div>

      {delta ? (
        <div className="mt-3 text-sm">
          <span className="text-white/65">Change: </span>
          <span className="text-white">{delta}</span>
        </div>
      ) : null}
    </div>
  );
}
