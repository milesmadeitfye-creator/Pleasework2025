type PlatformVariant =
  | "spotify"
  | "apple"
  | "youtube"
  | "tidal"
  | "soundcloud"
  | "deezer"
  | "amazon"
  | "default";

interface PlatformPillProps {
  label: string;
  variant?: PlatformVariant;
}

const variantStyles: Record<PlatformVariant, string> = {
  spotify: "bg-green-500/10 text-green-400 border-green-500/30",
  apple: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  youtube: "bg-red-500/10 text-red-400 border-red-500/30",
  tidal: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  soundcloud: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  deezer: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  amazon: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  default: "bg-white/10 text-white/70 border-white/20"
};

export function PlatformPill({ label, variant = "default" }: PlatformPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm transition-colors ${variantStyles[variant]}`}
    >
      {label}
    </span>
  );
}
