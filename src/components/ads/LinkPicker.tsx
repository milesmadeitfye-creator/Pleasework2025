import { useState, useEffect } from 'react';
import { Search, Link as LinkIcon, Check, ExternalLink, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';

export type LinkSource = 'smart_links' | 'oneclick_links' | 'presave_links';

interface LinkMeta {
  id: string;
  slug?: string;
  short_code?: string;
  link_type?: string;
  platform?: string;
  source: LinkSource;
}

interface LinkItem {
  id: string;
  title: string;
  url: string;
  created_at: string;
  meta: LinkMeta;
}

interface LinkPickerProps {
  label: string;
  value?: string;
  selectedMeta?: LinkMeta;
  onChange: (url: string, meta: LinkMeta) => void;
  source: LinkSource;
  owner_user_id: string;
  allowPaste?: boolean;
  description?: string;
  required?: boolean;
}

export function LinkPicker({
  label,
  value,
  selectedMeta,
  onChange,
  source,
  owner_user_id,
  allowPaste = true,
  description,
  required = false,
}: LinkPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [mode, setMode] = useState<'picker' | 'manual'>('picker');

  useEffect(() => {
    if (showPicker && owner_user_id) {
      loadLinks();
    }
  }, [showPicker, owner_user_id, source]);

  const loadLinks = async () => {
    setLoading(true);
    try {
      const items = await fetchLinksFromSource(source, owner_user_id);
      setLinks(items);
    } catch (err) {
      console.error(`[LinkPicker] Error loading ${source}:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLink = (link: LinkItem) => {
    onChange(link.url, link.meta);
    setShowPicker(false);
    setMode('picker');
  };

  const handleManualSubmit = () => {
    if (manualUrl.trim()) {
      onChange(manualUrl.trim(), {
        id: 'manual',
        source,
      });
      setManualUrl('');
      setShowPicker(false);
      setMode('picker');
    }
  };

  const filteredLinks = links.filter((link) =>
    link.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedLink = links.find((l) => l.meta.id === selectedMeta?.id);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-ghoste-white">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {description && <p className="text-xs text-ghoste-grey">{description}</p>}

      {!value ? (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-ghoste-border hover:border-ghoste-blue bg-white/5 hover:bg-white/10 text-ghoste-grey hover:text-ghoste-white transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Choose from Ghoste{allowPaste ? ' or paste link' : ''}
        </button>
      ) : (
        <div className="rounded-lg border border-ghoste-border bg-ghoste-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <LinkIcon className="w-4 h-4 text-ghoste-blue flex-shrink-0" />
                <span className="text-sm font-medium text-ghoste-white truncate">
                  {selectedLink?.title || 'Custom Link'}
                </span>
              </div>
              <p className="text-xs text-ghoste-grey truncate">{value}</p>
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-ghoste-blue hover:underline mt-1"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <button
              onClick={() => {
                onChange('', { id: '', source });
                setShowPicker(true);
              }}
              className="text-xs text-ghoste-grey hover:text-ghoste-white transition-colors"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {showPicker && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-ghoste-card border border-ghoste-border rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-ghoste-border">
              <h3 className="text-lg font-bold text-ghoste-white mb-3">
                {label}
              </h3>

              {allowPaste && (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setMode('picker')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      mode === 'picker'
                        ? 'bg-ghoste-blue text-white'
                        : 'bg-white/5 text-ghoste-grey hover:text-ghoste-white'
                    }`}
                  >
                    Choose from Ghoste
                  </button>
                  <button
                    onClick={() => setMode('manual')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      mode === 'manual'
                        ? 'bg-ghoste-blue text-white'
                        : 'bg-white/5 text-ghoste-grey hover:text-ghoste-white'
                    }`}
                  >
                    Paste Link
                  </button>
                </div>
              )}

              {mode === 'picker' && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ghoste-grey" />
                  <input
                    type="text"
                    placeholder="Search links..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white placeholder:text-ghoste-grey focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {mode === 'picker' ? (
                loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ghoste-blue"></div>
                  </div>
                ) : filteredLinks.length === 0 ? (
                  <div className="text-center py-8">
                    <LinkIcon className="w-12 h-12 text-ghoste-grey mx-auto mb-3" />
                    <p className="text-sm text-ghoste-grey">
                      {searchQuery
                        ? 'No links found matching your search'
                        : `No ${getSourceLabel(source)} found. Create one first${allowPaste ? ' or paste a link manually' : ''}.`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredLinks.map((link) => (
                      <button
                        key={link.id}
                        onClick={() => handleSelectLink(link)}
                        className="w-full p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-ghoste-border hover:border-ghoste-blue transition-all text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-ghoste-white">
                                {link.title}
                              </span>
                              {link.meta.id === selectedMeta?.id && (
                                <Check className="w-4 h-4 text-green-400" />
                              )}
                            </div>
                            <p className="text-xs text-ghoste-grey truncate">
                              {link.url}
                            </p>
                            <p className="text-xs text-ghoste-grey mt-1">
                              Created {new Date(link.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ghoste-white mb-2">
                      Paste Link URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white placeholder:text-ghoste-grey focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
                    />
                  </div>
                  <button
                    onClick={handleManualSubmit}
                    disabled={!manualUrl.trim()}
                    className="w-full px-4 py-2.5 rounded-lg bg-ghoste-blue text-white font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Use This Link
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-ghoste-border flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowPicker(false);
                  setMode('picker');
                  setSearchQuery('');
                  setManualUrl('');
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-ghoste-grey hover:text-ghoste-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function fetchLinksFromSource(
  source: LinkSource,
  owner_user_id: string
): Promise<LinkItem[]> {
  if (source === 'smart_links') {
    const { data, error } = await supabase
      .from('smart_links')
      .select('id, slug, title, link_type, created_at')
      .eq('user_id', owner_user_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map((item) => ({
      id: item.id,
      title: item.title || 'Untitled Link',
      url: `https://ghoste.one/l/${item.slug}`,
      created_at: item.created_at,
      meta: {
        id: item.id,
        slug: item.slug,
        link_type: item.link_type,
        source: 'smart_links',
      },
    }));
  }

  if (source === 'oneclick_links') {
    const { data, error } = await supabase
      .from('oneclick_links')
      .select('id, short_code, slug, title, platform, redirect_url, target_url, created_at')
      .eq('user_id', owner_user_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map((item) => ({
      id: item.id,
      title: item.title || `${item.platform || 'OneClick'} Link`,
      url: `https://ghoste.one/1c/${item.short_code}`,
      created_at: item.created_at,
      meta: {
        id: item.id,
        short_code: item.short_code,
        slug: item.slug,
        platform: item.platform,
        source: 'oneclick_links',
      },
    }));
  }

  if (source === 'presave_links') {
    const { data, error } = await supabase
      .from('presave_links')
      .select('id, slug, song_title, artist_name, release_date, created_at')
      .eq('user_id', owner_user_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map((item) => ({
      id: item.id,
      title: `${item.song_title} - ${item.artist_name}`,
      url: `https://ghoste.one/presave/${item.slug}`,
      created_at: item.created_at,
      meta: {
        id: item.id,
        slug: item.slug,
        source: 'presave_links',
      },
    }));
  }

  return [];
}

function getSourceLabel(source: LinkSource): string {
  switch (source) {
    case 'smart_links':
      return 'smart links';
    case 'oneclick_links':
      return 'one-click links';
    case 'presave_links':
      return 'pre-save links';
    default:
      return 'links';
  }
}
