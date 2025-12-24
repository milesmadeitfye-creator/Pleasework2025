type Props = {
  title?: string;
  description?: string;
};

export default function ComingSoonOverlay({
  title = "Coming soon",
  description = "This feature is in progress for the next beta. Everything else is live.",
}: Props) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-sm" />
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center shadow-xl">
          <div className="text-white text-lg font-semibold">{title}</div>
          <div className="mt-2 text-white/70 text-sm">{description}</div>
          <div className="mt-4 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
            COMING SOON
          </div>
        </div>
      </div>
    </div>
  );
}
