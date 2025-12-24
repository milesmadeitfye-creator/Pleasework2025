import React from "react";
import { PlatformPill } from "../ui/PlatformPill";
import { IconActionButton } from "../ui/IconActionButton";

type Badge = { label: string; tone?: "blue" | "green" | "gray" };
type Platform = { label: string; variant: "spotify" | "apple" | "youtube" | "tidal" | "soundcloud" | "deezer" | "amazon" | "default" };

export function LinkCard({
  title,
  subtitle,
  imageUrl,
  badges = [],
  platforms = [],
  onCopy,
  onEdit,
  onDelete,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badges?: Badge[];
  platforms?: Platform[];
  onCopy?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-5 py-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-12 w-12 rounded-xl bg-white/10 overflow-hidden shrink-0">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-white/10 to-white/5" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h3 className="truncate text-white font-semibold max-w-[48ch]">{title}</h3>

              {badges.map((b, idx) => (
                <span
                  key={`${b.label}-${idx}`}
                  className={
                    `rounded-full border px-2 py-0.5 text-[11px] backdrop-blur-sm ${
                      b.tone === "green" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" :
                      b.tone === "blue" ? "border-blue-400/30 bg-blue-500/10 text-blue-200" :
                      "border-white/15 bg-white/10 text-white/70"
                    }`
                  }
                >
                  {b.label}
                </span>
              ))}
            </div>

            {subtitle && (
              <div className="mt-1 text-xs text-white/50 truncate max-w-[72ch]">{subtitle}</div>
            )}

            {!!platforms.length && (
              <div className="mt-2 flex flex-wrap gap-2">
                {platforms.map((p, idx) => (
                  <PlatformPill key={`${p.label}-${idx}`} label={p.label} variant={p.variant} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {rightSlot}
          {onCopy && (
            <IconActionButton onClick={onCopy} aria-label="Copy">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </IconActionButton>
          )}
          {onEdit && (
            <IconActionButton onClick={onEdit} aria-label="Edit">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </IconActionButton>
          )}
          {onDelete && (
            <IconActionButton tone="danger" onClick={onDelete} aria-label="Delete">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </IconActionButton>
          )}
        </div>
      </div>
    </div>
  );
}
