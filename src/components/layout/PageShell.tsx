import { ReactNode } from 'react';

interface PageShellProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  fullWidth?: boolean;
}

export function PageShell({ title, subtitle, children, actions, fullWidth = false }: PageShellProps) {
  return (
    <div className="min-h-screen bg-ghoste-navy text-ghoste-white">
      <main className={`mx-auto w-full ${fullWidth ? 'max-w-full px-4 md:px-6' : 'max-w-7xl px-4 md:px-8'} pt-4 pb-6 md:pb-8`}>
        {(title || actions) && (
          <div className="mb-6 flex items-start justify-between animate-[fadeUp_0.5s_ease-out]">
            <div>
              {title && (
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-ghoste-white mb-1">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-sm text-ghoste-grey mt-1">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2">
                {actions}
              </div>
            )}
          </div>
        )}
        <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
          {children}
        </div>
      </main>
    </div>
  );
}
