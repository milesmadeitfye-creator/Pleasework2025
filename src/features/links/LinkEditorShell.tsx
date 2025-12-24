import React from 'react';
import type { UnifiedLinkType } from '../../types/links';

type LinkEditorShellProps = {
  linkType: UnifiedLinkType;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  preview?: React.ReactNode;
};

const LINK_TYPE_LABELS: Record<UnifiedLinkType, string> = {
  smart: 'Smart Link',
  one_click: 'One-Click Link',
  email_capture: 'Email Capture Link',
  presave: 'Pre-Save Link',
  listening_party: 'Listening Party Link',
  show: 'Show Link',
  bio: 'Link in Bio'
};

const LINK_TYPE_DESCRIPTIONS: Record<UnifiedLinkType, string> = {
  smart: 'Aggregate all your music platform links in one place',
  one_click: 'Direct deep link to a specific platform',
  email_capture: 'Collect fan emails and build your mailing list',
  presave: 'Let fans pre-save your upcoming release',
  listening_party: 'Host a live listening party with your fans',
  show: 'Promote your live shows and sell tickets',
  bio: 'Create a profile hub with all your links and social media'
};

export function LinkEditorShell({
  linkType,
  children,
  headerRight,
  footer,
  preview
}: LinkEditorShellProps) {
  const label = LINK_TYPE_LABELS[linkType] ?? 'Link';
  const description = LINK_TYPE_DESCRIPTIONS[linkType] ?? 'Customize your link';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">{label}</h2>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
        {headerRight}
      </div>

      {/* Main Editor Layout - Two columns on desktop */}
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
        {/* Left Column: Form Fields */}
        <div className="rounded-2xl bg-black/40 border border-gray-800/50 backdrop-blur-sm p-6 space-y-6">
          {children}
        </div>

        {/* Right Column: Preview */}
        {preview && (
          <div className="rounded-2xl bg-black/40 border border-gray-800/50 backdrop-blur-sm p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Preview
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                See how your link will look to fans
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-xl border border-gray-800/30 overflow-hidden">
              {preview}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {footer && (
        <div className="flex justify-end gap-3 pt-2">
          {footer}
        </div>
      )}
    </div>
  );
}
