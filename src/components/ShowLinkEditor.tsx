import { useState, useEffect } from 'react';
import { Calendar, X, Save } from 'lucide-react';
import { ShowLinkFields } from '../features/links/ShowLinkFields';
import type { ShowLinkConfig } from '../types/links';

interface ShowLinkEditorProps {
  link: {
    id?: string;
    title: string;
    slug: string;
    config: ShowLinkConfig;
  };
  onSave: (link: { title: string; slug: string; config: ShowLinkConfig }) => Promise<void>;
  onCancel: () => void;
}

export default function ShowLinkEditor({ link, onSave, onCancel }: ShowLinkEditorProps) {
  const [formData, setFormData] = useState({
    title: link.title,
    slug: link.slug,
    config: link.config
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-gradient-to-b from-ghoste-black/95 via-ghoste-navy/95 to-ghoste-black/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-ghoste-black/90 via-ghoste-navy/80 to-ghoste-black/90 shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div className="flex-1 overflow-y-auto custom-scroll p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ghoste-white flex items-center gap-2">
                <Calendar className="w-6 h-6 text-red-400" />
                {link.id ? 'Edit Show Link' : 'Create Show Link'}
              </h2>
              <p className="text-[11px] text-ghoste-grey mt-1">
                Promote your live shows with venue info, dates, and ticket links
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-ghoste-black/70 text-ghoste-grey hover:border-white/20 hover:text-ghoste-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic Info Section */}
            <section className="rounded-2xl border border-white/8 bg-white/5 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              <h3 className="mb-3 text-sm font-semibold text-ghoste-white">
                Basic Information
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ghoste-grey">
                    Link Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-ghoste-black/80 px-4 py-2 text-sm text-ghoste-white placeholder-ghoste-grey/50 focus:border-ghoste-blue/50 focus:outline-none focus:ring-2 focus:ring-ghoste-blue/20"
                    placeholder="My Summer Tour 2024"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ghoste-grey">
                    URL Slug *
                  </label>
                  <div className="flex items-stretch gap-2">
                    <span className="inline-flex items-center rounded-xl bg-ghoste-black/80 border border-white/10 px-3 text-xs text-ghoste-grey">
                      ghoste.one/s/
                    </span>
                    <input
                      type="text"
                      value={formData.slug}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          slug: e.target.value
                            .toLowerCase()
                            .replace(/\s+/g, '-')
                            .replace(/[^a-z0-9-]/g, '')
                        })
                      }
                      className="flex-1 rounded-xl border border-white/10 bg-ghoste-black/80 px-4 py-2 text-sm text-ghoste-white placeholder-ghoste-grey/50 focus:border-ghoste-blue/50 focus:outline-none focus:ring-2 focus:ring-ghoste-blue/20"
                      placeholder="summer-tour-nyc"
                      required
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Show Details Section */}
            <section className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 via-ghoste-black/60 to-red-500/5 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ghoste-white">
                <Calendar className="h-4 w-4 text-red-400" />
                Show Details
              </h3>
              <ShowLinkFields
                value={formData.config}
                onChange={(config) => setFormData({ ...formData, config })}
              />
            </section>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-ghoste-white transition hover:bg-white/8"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !formData.title.trim() || !formData.slug.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_rgba(220,38,38,0.5)] transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : link.id ? 'Update Show Link' : 'Create Show Link'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
