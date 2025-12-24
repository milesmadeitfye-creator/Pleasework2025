interface IconActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "default" | "danger";
  children: React.ReactNode;
}

export function IconActionButton({
  tone = "default",
  children,
  className,
  ...props
}: IconActionButtonProps) {
  const baseClass = "flex h-9 w-9 items-center justify-center rounded-lg border backdrop-blur-sm transition-all";
  const toneClass = tone === "danger"
    ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/50"
    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20";

  return (
    <button
      type="button"
      className={`${baseClass} ${toneClass} ${className || ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
