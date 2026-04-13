import { Hourglass } from 'lucide-react';

export default function PlaceholderPage({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle?: string;
  phase?: string;
}) {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="card p-10 text-center">
        <Hourglass className="mx-auto h-6 w-6 text-fg-mute" />
        <h1 className="mt-3 text-lg font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-fg-soft">{subtitle}</p>}
        {phase && (
          <span className="mt-4 inline-block chip text-brand-500 border-brand-500/40">{phase}</span>
        )}
      </div>
    </div>
  );
}
