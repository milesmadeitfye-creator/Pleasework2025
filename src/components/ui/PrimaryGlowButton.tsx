interface PrimaryGlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "blue" | "purple" | "green" | "pink";
}

const variantStyles = {
  blue: "bg-blue-600 hover:bg-blue-700 shadow-[0_0_24px_rgba(59,130,246,0.5)] hover:shadow-[0_0_32px_rgba(59,130,246,0.6)]",
  purple: "bg-purple-600 hover:bg-purple-700 shadow-[0_0_24px_rgba(147,51,234,0.5)] hover:shadow-[0_0_32px_rgba(147,51,234,0.6)]",
  green: "bg-green-600 hover:bg-green-700 shadow-[0_0_24px_rgba(34,197,94,0.5)] hover:shadow-[0_0_32px_rgba(34,197,94,0.6)]",
  pink: "bg-pink-600 hover:bg-pink-700 shadow-[0_0_24px_rgba(219,39,119,0.5)] hover:shadow-[0_0_32px_rgba(219,39,119,0.6)]"
};

export function PrimaryGlowButton({
  children,
  variant = "blue",
  className,
  disabled,
  ...props
}: PrimaryGlowButtonProps) {
  const baseClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all";
  const disabledClass = "opacity-50 cursor-not-allowed shadow-none bg-gray-600";
  const variantClass = !disabled ? variantStyles[variant] : "";

  return (
    <button
      type="button"
      disabled={disabled}
      className={`${baseClass} ${disabled ? disabledClass : variantClass} ${className || ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
