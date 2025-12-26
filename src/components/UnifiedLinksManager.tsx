import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import {
  Plus,
  Music2,
  Calendar,
  CalendarClock,
  User,
  Link2,
  Mail,
  Mic2,
  Copy,
  ExternalLink,
  Edit2,
  Trash2,
  Check
} from 'lucide-react';
import ShowLinkEditor from './ShowLinkEditor';
import BioLinkEditor from './BioLinkEditor';
import PreSaveLinkEditor from './PreSaveLinkEditor';
import SmartLinkEditor from './SmartLinkEditor';
import OneClickLinkEditor from './OneClickLinkEditor';
import { LinkCard } from './links/LinkCard';
import { toLinkUI } from '../lib/linkUiAdapter';
import { PrimaryGlowButton } from './ui/PrimaryGlowButton';
import type { UnifiedLinkType, UnifiedLinkConfig, ShowLinkConfig, BioLinkConfig, PreSaveLinkConfig } from '../types/links';

interface UnifiedLink {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  link_type: UnifiedLinkType;
  config: UnifiedLinkConfig;
  is_active: boolean;
  total_clicks: number;
  created_at: string;
}

const LINK_TYPE_LABELS: Record<UnifiedLinkType, string> = {
  smart: 'Smart Link',
  one_click: 'One-Click',
  email_capture: 'Email Capture',
  presave: 'Pre-Save',
  listening_party: 'Listening Party',
  show: 'Show Link',
  bio: 'Link in Bio'
};

const LINK_TYPE_COLORS: Record<UnifiedLinkType, string> = {
  smart: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  one_click: 'bg-green-500/10 text-green-400 border-green-500/30',
  email_capture: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  presave: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  listening_party: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  show: 'bg-red-500/10 text-red-400 border-red-500/30',
  bio: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
};

export default function UnifiedLinksManager() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [links, setLinks] = useState<UnifiedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLink, setEditingLink] = useState<UnifiedLink | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<UnifiedLinkType | 'all'>('all');

  useEffect(() => {
    if (user) {
      fetchLinks();
    }
  }, [user, filterType]);

  const fetchLinks = async () => {
    if (!user?.id) {
      console.warn('fetchLinks called without user');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('smart_links')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (filterType !== 'all') {
        query = query.eq('link_type', filterType);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching links:', error);
        showToast('Failed to load links', 'error');
        setLinks([]);
        return;
      }

      setLinks(data || []);
    } catch (err: any) {
      console.error('Error fetching links (exception):', err);
      // Don't show toast for network errors, just log them
      setLinks([]);
    } finally {
      setLoading(false);
    }
  };

  const startCreateLink = (type: UnifiedLinkType) => {
    setEditingLink({
      id: '',
      user_id: user?.id || '',
      title: '',
      slug: '',
      link_type: type,
      config: {},
      is_active: true,
      total_clicks: 0,
      created_at: new Date().toISOString()
    });
    setShowEditor(true);
  };

  const handleEditLink = (link: UnifiedLink) => {
    setEditingLink(link);
    setShowEditor(true);
  };


  const handleDeleteLink = async (link: UnifiedLink) => {
    if (!confirm(`Delete "${link.title}"?`)) return;

    try {
      const { error } = await supabase.from('smart_links').delete().eq('id', link.id);

      if (error) throw error;

      showToast('Link deleted', 'success');
      fetchLinks();
    } catch (err: any) {
      console.error('Error deleting link:', err);
      showToast(err.message || 'Failed to delete link', 'error');
    }
  };

  const copyLink = (slug: string, id: string) => {
    const url = `https://ghoste.one/s/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    showToast('Link copied!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };


  const renderEditor = () => {
    if (!editingLink) return null;

    const handleSave = async (data: { title: string; slug: string; config: UnifiedLinkConfig }) => {
      if (!data.title.trim()) {
        showToast('Please enter a title', 'error');
        return;
      }

      if (!data.slug.trim()) {
        showToast('Please enter a slug', 'error');
        return;
      }

      setSaving(true);
      try {
        // Extract ISRC from PreSave config if present (for resolver)
        const isrc = editingLink.link_type === 'presave' && 'isrc' in data.config
          ? (data.config as PreSaveLinkConfig).isrc
          : undefined;

        const linkData: any = {
          user_id: user?.id,
          title: data.title.trim(),
          slug: data.slug.trim(),
          link_type: editingLink.link_type,
          config: data.config,
          is_active: editingLink.is_active
        };

        // Store ISRC in dedicated column for resolver access
        if (isrc) {
          linkData.isrc = isrc;
        }

        if (editingLink.id) {
          // Update existing
          const { error } = await supabase
            .from('smart_links')
            .update(linkData)
            .eq('id', editingLink.id);

          if (error) throw error;

          showToast('Link updated successfully!', 'success');
        } else {
          // Create new
          const { error } = await supabase.from('smart_links').insert([linkData]);

          if (error) throw error;

          showToast('Link created successfully!', 'success');
        }

        setShowEditor(false);
        setEditingLink(null);
        fetchLinks();
      } catch (err: any) {
        console.error('Error saving link:', err);
        showToast(err.message || 'Failed to save link', 'error');
      } finally {
        setSaving(false);
      }
    };

    const handleCancel = () => {
      setShowEditor(false);
      setEditingLink(null);
    };

    switch (editingLink.link_type) {
      case 'smart':
        return (
          <SmartLinkEditor
            link={{
              id: editingLink.id,
              title: editingLink.title,
              slug: editingLink.slug,
              cover_image_url: (editingLink as any).cover_image_url,
              spotify_url: (editingLink as any).spotify_url,
              apple_music_url: (editingLink as any).apple_music_url,
              youtube_url: (editingLink as any).youtube_url,
              tidal_url: (editingLink as any).tidal_url,
              soundcloud_url: (editingLink as any).soundcloud_url,
              source_url: (editingLink as any).source_url,
              template: (editingLink as any).template,
              color_scheme: (editingLink as any).color_scheme,
            }}
            onSave={async (data) => {
              setSaving(true);
              try {
                // Auto-generate slug if empty
                let finalSlug = data.slug?.trim() || '';
                if (!finalSlug) {
                  finalSlug = data.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .substring(0, 50) ||
                    `link-${Date.now()}`;
                }

                const linkData = {
                  user_id: user?.id,
                  title: data.title.trim(),
                  slug: finalSlug,
                  link_type: 'smart',
                  cover_image_url: data.cover_image_url || null,
                  spotify_url: data.spotify_url || null,
                  apple_music_url: data.apple_music_url || null,
                  youtube_url: data.youtube_url || null,
                  tidal_url: data.tidal_url || null,
                  soundcloud_url: data.soundcloud_url || null,
                  source_url: data.source_url || null,
                  template: data.template || 'modern',
                  color_scheme: data.color_scheme || {},
                  is_active: true,
                };

                let smartLinkId: string | null = null;

                if (editingLink.id) {
                  const { error } = await supabase
                    .from('smart_links')
                    .update(linkData)
                    .eq('id', editingLink.id);

                  if (error) throw error;
                  smartLinkId = editingLink.id;
                  showToast('Smart link updated!', 'success');
                } else {
                  const { data: insertData, error } = await supabase
                    .from('smart_links')
                    .insert([linkData])
                    .select('id')
                    .single();

                  if (error) throw error;
                  smartLinkId = insertData?.id || null;
                  showToast('Smart link created!', 'success');
                }

                // Trigger track resolution in background (non-blocking)
                if (smartLinkId) {
                  const { data: sessionData } = await supabase.auth.getSession();
                  const token = sessionData?.session?.access_token;

                  fetch('/.netlify/functions/resolve-smart-link-track', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ smart_link_id: smartLinkId })
                  }).catch(err => {
                    console.log('Track resolution failed (non-blocking):', err);
                  });
                }

                setShowEditor(false);
                setEditingLink(null);
                fetchLinks();
              } catch (err: any) {
                console.error('Error saving smart link:', err);
                showToast(err.message || 'Failed to save link', 'error');
                throw err; // Re-throw so the editor knows it failed
              } finally {
                setSaving(false);
              }
            }}
            onCancel={handleCancel}
          />
        );
      case 'show':
        return (
          <ShowLinkEditor
            link={{
              id: editingLink.id,
              title: editingLink.title,
              slug: editingLink.slug,
              config: editingLink.config as ShowLinkConfig
            }}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        );
      case 'bio':
        return (
          <BioLinkEditor
            link={{
              id: editingLink.id,
              title: editingLink.title,
              slug: editingLink.slug,
              config: editingLink.config as BioLinkConfig
            }}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        );
      case 'presave':
        return (
          <PreSaveLinkEditor
            link={{
              id: editingLink.id,
              title: editingLink.title,
              slug: editingLink.slug,
              config: editingLink.config as PreSaveLinkConfig
            }}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        );
      case 'one_click':
        return (
          <OneClickLinkEditor
            link={{
              id: editingLink.id,
              title: editingLink.title,
              slug: editingLink.slug,
              config: editingLink.config as { targetUrl?: string }
            }}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        );
      default:
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 max-w-md">
              <p className="text-center text-gray-400">
                Editor for {LINK_TYPE_LABELS[editingLink.link_type]} coming soon
              </p>
              <button
                onClick={handleCancel}
                className="mt-4 w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">All Links</h2>
          <p className="text-sm text-gray-400 mt-1">
            Manage all your Smart Links, Shows, Bio pages, and more
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryGlowButton onClick={() => startCreateLink('smart')} variant="blue">
            <Plus className="w-4 h-4" />
            Smart Link
          </PrimaryGlowButton>

          <button
            onClick={() => startCreateLink('one_click')}
            className="inline-flex items-center gap-2 h-10 rounded-2xl px-4 text-sm font-medium bg-[#0b1120] text-[#e5e7eb] border border-[#1f2937] hover:bg-[#111827] hover:border-[#2d3748] hover:text-white shadow-[0_0_12px_rgba(15,23,42,0.75)] transition-all duration-150"
          >
            <Link2 className="w-4 h-4 text-[#9ca3af]" />
            <span>One-Click</span>
          </button>

          <button
            onClick={() => startCreateLink('presave')}
            className="inline-flex items-center gap-2 h-10 rounded-2xl px-4 text-sm font-medium bg-[#0b1120] text-[#e5e7eb] border border-[#1f2937] hover:bg-[#111827] hover:border-[#2d3748] hover:text-white shadow-[0_0_12px_rgba(15,23,42,0.75)] transition-all duration-150"
          >
            <Music2 className="w-4 h-4 text-[#9ca3af]" />
            <span>Pre-Save</span>
          </button>

          <button
            onClick={() => startCreateLink('bio')}
            className="inline-flex items-center gap-2 h-10 rounded-2xl px-4 text-sm font-medium bg-[#0b1120] text-[#e5e7eb] border border-[#1f2937] hover:bg-[#111827] hover:border-[#2d3748] hover:text-white shadow-[0_0_12px_rgba(15,23,42,0.75)] transition-all duration-150"
          >
            <User className="w-4 h-4 text-[#9ca3af]" />
            <span>Bio</span>
          </button>

          <button
            onClick={() => startCreateLink('show')}
            className="inline-flex items-center gap-2 h-10 rounded-2xl px-4 text-sm font-medium bg-[#0b1120] text-[#e5e7eb] border border-[#1f2937] hover:bg-[#111827] hover:border-[#2d3748] hover:text-white shadow-[0_0_12px_rgba(15,23,42,0.75)] transition-all duration-150"
          >
            <CalendarClock className="w-4 h-4 text-[#9ca3af]" />
            <span>Show</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { value: 'all', label: 'All Links', icon: Link2 },
          { value: 'smart', label: 'Smart', icon: Music2 },
          { value: 'one_click', label: 'One-Click', icon: Link2 },
          { value: 'presave', label: 'Pre-Save', icon: Music2 },
          { value: 'bio', label: 'Bio', icon: User },
          { value: 'show', label: 'Shows', icon: Calendar },
          { value: 'email_capture', label: 'Email', icon: Mail },
          { value: 'listening_party', label: 'Parties', icon: Mic2 }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = filterType === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setFilterType(tab.value as UnifiedLinkType | 'all')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Links List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : links.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <Link2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No links yet</h3>
          <p className="text-gray-500 mb-6">
            Create your first {filterType === 'all' ? '' : LINK_TYPE_LABELS[filterType as UnifiedLinkType] || ''} link to get started
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => startCreateLink('smart')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create Smart Link
            </button>
            <button
              onClick={() => startCreateLink('show')}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create Show Link
            </button>
            <button
              onClick={() => startCreateLink('bio')}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create Link in Bio
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {links.map((link) => {
            const ui = toLinkUI(link);
            return (
              <LinkCard
                key={link.id}
                title={ui.title}
                subtitle={ui.subtitle}
                imageUrl={ui.imageUrl}
                badges={ui.badges}
                platforms={ui.platforms}
                onCopy={() => copyLink(link.slug, link.id)}
                onEdit={() => handleEditLink(link)}
                onDelete={() => handleDeleteLink(link)}
                rightSlot={
                  <div className="flex items-center gap-2">
                    {link.link_type === 'smart' && (
                      <button
                        onClick={async () => {
                          try {
                            const { data: sessionData } = await supabase.auth.getSession();
                            const token = sessionData?.session?.access_token;

                            showToast('Re-resolving track...', 'info');

                            const response = await fetch('/.netlify/functions/resolve-smart-link-track', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify({
                                smart_link_id: link.id,
                                force_refresh: true
                              })
                            });

                            const result = await response.json();

                            if (result.success) {
                              showToast('Track resolved successfully!', 'success');
                              fetchLinks();
                            } else {
                              showToast(result.error || 'Resolution failed', 'error');
                            }
                          } catch (err: any) {
                            console.error('Re-resolve error:', err);
                            showToast('Failed to re-resolve track', 'error');
                          }
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20 backdrop-blur-sm transition-all"
                        title="Re-resolve track metadata"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    )}
                    <a
                      href={`/s/${link.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20 backdrop-blur-sm transition-all"
                      title="Open link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      {showEditor && editingLink && renderEditor()}
    </div>
  );
}
