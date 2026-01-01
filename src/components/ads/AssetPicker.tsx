import { useState, useEffect } from 'react';
import { Search, Link as LinkIcon, Check, ExternalLink, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../../contexts/AuthContext';

export type AssetType = 'smartlink' | 'presave' | 'oneclick' | 'profile';

interface Asset {
  id: string;
  title: string;
  url: string;
  slug?: string;
  type?: string;
  created_at: string;
}

interface AssetPickerProps {
  assetType: AssetType;
  value?: string;
  selectedAssetId?: string;
  onChange: (url: string, assetId: string) => void;
  label: string;
  description?: string;
  required?: boolean;
}

export function AssetPicker({
  assetType,
  value,
  selectedAssetId,
  onChange,
  label,
  description,
  required = false,
}: AssetPickerProps) {
  const { user } = useAuth();
  const [showPicker, setShowPicker] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [mode, setMode] = useState<'picker' | 'manual'>('picker');

  useEffect(() => {
    if (showPicker && user) {
      loadAssets();
    }
  }, [showPicker, user, assetType]);

  const loadAssets = async () => {
    if (!user) return;

    setLoading(true);
    try {
      let query = supabase
        .from('smart_links')
        .select('id, slug, title, type, created_at')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false });

      if (assetType === 'presave') {
        query = query.eq('type', 'presave');
      } else if (assetType === 'oneclick') {
        query = query.eq('type', 'one_click');
      } else if (assetType === 'smartlink') {
        query = query.or('type.is.null,type.eq.smart_link');
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      const formattedAssets: Asset[] = (data || []).map((item) => ({
        id: item.id,
        title: item.title || 'Untitled',
        url: `https://ghoste.one/l/${item.slug}`,
        slug: item.slug,
        type: item.type,
        created_at: item.created_at,
      }));

      setAssets(formattedAssets);
    } catch (err) {
      console.error('[AssetPicker] Error loading assets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAsset = (asset: Asset) => {
    onChange(asset.url, asset.id);
    setShowPicker(false);
    setMode('picker');
  };

  const handleManualSubmit = () => {
    if (manualUrl.trim()) {
      onChange(manualUrl.trim(), 'manual');
      setManualUrl('');
      setShowPicker(false);
      setMode('picker');
    }
  };

  const filteredAssets = assets.filter((asset) =>
    asset.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

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
          Choose from Ghoste or paste link
        </button>
      ) : (
        <div className="rounded-lg border border-ghoste-border bg-ghoste-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <LinkIcon className="w-4 h-4 text-ghoste-blue flex-shrink-0" />
                <span className="text-sm font-medium text-ghoste-white truncate">
                  {selectedAsset?.title || 'Custom Link'}
                </span>
              </div>
              <p className="text-xs text-ghoste-grey truncate">{value}</p>
              {selectedAsset && (
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-ghoste-blue hover:underline mt-1"
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => {
                onChange('', '');
                setShowPicker(true);
              }}
              className="text-xs text-ghoste-grey hover:text-ghoste-white transition-colors"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {/* Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-ghoste-card border border-ghoste-border rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-ghoste-border">
              <h3 className="text-lg font-bold text-ghoste-white mb-3">
                {label}
              </h3>

              {/* Mode Tabs */}
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

              {/* Search (Picker mode) */}
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {mode === 'picker' ? (
                loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ghoste-blue"></div>
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <div className="text-center py-8">
                    <LinkIcon className="w-12 h-12 text-ghoste-grey mx-auto mb-3" />
                    <p className="text-sm text-ghoste-grey">
                      {searchQuery
                        ? 'No links found matching your search'
                        : `No ${assetType} links found. Create one first or paste a link manually.`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAssets.map((asset) => (
                      <button
                        key={asset.id}
                        onClick={() => handleSelectAsset(asset)}
                        className="w-full p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-ghoste-border hover:border-ghoste-blue transition-all text-left group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-ghoste-white">
                                {asset.title}
                              </span>
                              {asset.id === selectedAssetId && (
                                <Check className="w-4 h-4 text-green-400" />
                              )}
                            </div>
                            <p className="text-xs text-ghoste-grey truncate">
                              {asset.url}
                            </p>
                            <p className="text-xs text-ghoste-grey mt-1">
                              Created {new Date(asset.created_at).toLocaleDateString()}
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

            {/* Footer */}
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
