import { useState, useEffect, useRef } from 'react';
import { Music2, Mail, Zap, Share2, Upload, Copy, Check, ExternalLink } from 'lucide-react';
import SmartLinks from './SmartLinksEnhanced';
import OneClickLinks from './OneClickLinks';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { uploadFileWithProgress } from '../lib/fileUpload';
import { ProActionButton } from './ProGate';
import { supabase } from '@/lib/supabase.client';

type LinkType = 'smart' | 'oneclick' | 'email-capture' | 'presave';

type EmailCaptureLink = {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  image_path?: string | null;
  created_at: string;
  public_url?: string;
};

type PresaveLink = {
  id: string;
  user_id: string;
  slug: string;
  song_title: string;
  artist_name: string;
  release_date: string;
  cover_art_url?: string | null;
  created_at: string;
  public_url?: string;
};

export default function LinksUnified() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [selectedType, setSelectedType] = useState<LinkType>('smart');

  const [emailLinks, setEmailLinks] = useState<EmailCaptureLink[]>([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailTitle, setEmailTitle] = useState("");
  const [emailSlug, setEmailSlug] = useState("");
  const [emailImageUrl, setEmailImageUrl] = useState("");
  const [emailImageFile, setEmailImageFile] = useState<File | null>(null);
  const [emailImageUploading, setEmailImageUploading] = useState(false);
  const [emailImageUploadProgress, setEmailImageUploadProgress] = useState<number>(0);
  const [isEmailCreating, setIsEmailCreating] = useState(false);
  const [copiedEmailLink, setCopiedEmailLink] = useState<string | null>(null);
  const emailImageInputRef = useRef<HTMLInputElement>(null);

  const [presaveLinks, setPresaveLinks] = useState<PresaveLink[]>([]);
  const [presaveLoading, setPresaveLoading] = useState(false);
  const [presaveError, setPresaveError] = useState<string | null>(null);
  const [psSlug, setPsSlug] = useState("");
  const [psSongTitle, setPsSongTitle] = useState("");
  const [psArtistName, setPsArtistName] = useState("");
  const [psReleaseDate, setPsReleaseDate] = useState("");
  const [psCoverArtUrl, setPsCoverArtUrl] = useState("");
  const [psCoverArtFile, setPsCoverArtFile] = useState<File | null>(null);
  const [psCoverArtUploading, setPsCoverArtUploading] = useState(false);
  const [isPreSaveCreating, setIsPreSaveCreating] = useState(false);
  const [copiedPresaveLink, setCopiedPresaveLink] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id && selectedType === 'email-capture') {
      fetchEmailCaptureLinks();
    }
  }, [user?.id, selectedType]);

  useEffect(() => {
    if (user?.id && selectedType === 'presave') {
      fetchPresaveLinks();
    }
  }, [user?.id, selectedType]);

  const formatGhosteUrl = (url: string) => {
    // Convert https://ghoste.one/e/slug to ghoste.one/e/slug
    return url.replace('https://', '').replace('http://', '');
  };

  const copyEmailLink = (url: string, linkId: string) => {
    const cleanUrl = formatGhosteUrl(url);
    navigator.clipboard.writeText(url);
    setCopiedEmailLink(linkId);
    showToast(`Link copied: ${cleanUrl}`, 'success');
    setTimeout(() => setCopiedEmailLink(null), 2000);
  };

  const copyPresaveLink = (url: string, linkId: string) => {
    const cleanUrl = formatGhosteUrl(url);
    navigator.clipboard.writeText(url);
    setCopiedPresaveLink(linkId);
    showToast(`Link copied: ${cleanUrl}`, 'success');
    setTimeout(() => setCopiedPresaveLink(null), 2000);
  };

  const uploadEmailImage = async (file: File, slug: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('slug', slug);

    try {
      const res = await fetch('/.netlify/functions/upload_email_capture_image', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Upload failed');
      }

      return json.path;
    } catch (error: any) {
      console.error('Image upload error:', error);
      showToast(`Image upload failed: ${error.message}`, 'error');
      return null;
    }
  };

  const uploadPresaveImage = async (file: File, slug: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('slug', slug);

    try {
      const res = await fetch('/.netlify/functions/upload_presave_image', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Upload failed');
      }

      return json.path;
    } catch (error: any) {
      console.error('Image upload error:', error);
      showToast(`Image upload failed: ${error.message}`, 'error');
      return null;
    }
  };

  const fetchEmailCaptureLinks = async () => {
    if (!user?.id) return;

    setEmailLoading(true);
    setEmailError(null);

    try {
      const res = await fetch(
        `/.netlify/functions/email_capture_links?user_id=${encodeURIComponent(user.id)}`
      );

      const text = await res.text();
      console.log('📡 email_capture_links GET raw response:', text);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text || 'Failed to load email capture links'}`);
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Backend returned non-JSON (likely HTML) for email_capture_links GET.');
      }

      console.log('✅ Loaded email capture links:', json.links);
      setEmailLinks(json.links || []);
    } catch (err: any) {
      console.error('❌ Error loading email capture links:', err);
      setEmailError(err.message || 'Failed to load email capture links');
    } finally {
      setEmailLoading(false);
    }
  };

  const fetchPresaveLinks = async () => {
    if (!user?.id) return;

    setPresaveLoading(true);
    setPresaveError(null);

    try {
      const res = await fetch(
        `/.netlify/functions/presave_links?user_id=${encodeURIComponent(user.id)}`
      );

      const text = await res.text();
      console.log('📡 presave_links GET raw response:', text);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text || 'Failed to load presave links'}`);
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Backend returned non-JSON (likely HTML) for presave_links GET.');
      }

      console.log('✅ Loaded presave links:', json.links);
      setPresaveLinks(json.links || []);
    } catch (err: any) {
      console.error('❌ Error loading presave links:', err);
      setPresaveError(err.message || 'Failed to load presave links');
    } finally {
      setPresaveLoading(false);
    }
  };

  const handleCreateEmailCapture = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      showToast("You must be logged in", "error");
      return;
    }

    if (!emailTitle.trim() || !emailSlug.trim()) {
      showToast("Title and slug are required for email capture", "warning");
      return;
    }

    setIsEmailCreating(true);
    try {
      // Construct explicit payload (no spreading of form values)
      // Only send the exact fields we need
      const requestPayload = {
        user_id: user.id,
        title: emailTitle.trim(),
        slug: emailSlug.trim(),
      };

      console.log('[LinksUnified] Creating email capture link with payload:', requestPayload);

      const res = await fetch('/.netlify/functions/email_capture_links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const text = await res.text();
      console.log('📡 email_capture_links POST raw response:', text);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} – ${text || 'Failed to create email capture link'}`);
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Backend did not return valid JSON for email_capture_links POST.');
      }

      console.log("✅ Email capture link created:", json.link);
      const cleanUrl = formatGhosteUrl(json.link.public_url);
      showToast(`Email Capture Link Created! ${cleanUrl}`, "success");

      setEmailTitle("");
      setEmailSlug("");
      fetchEmailCaptureLinks();
    } catch (err: any) {
      console.error("❌ Email capture create error:", err);
      showToast(`Email capture failed: ${err.message || String(err)}`, "error");
    } finally {
      setIsEmailCreating(false);
    }
  };

  const handleCreatePresave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      showToast("You must be logged in", "error");
      return;
    }

    if (
      !psSlug.trim() ||
      !psSongTitle.trim() ||
      !psArtistName.trim() ||
      !psReleaseDate.trim()
    ) {
      showToast(
        "ISRC/UPC, song title, artist name, and release date are all required",
        "warning"
      );
      return;
    }

    setIsPreSaveCreating(true);
    try {
      // Upload image if file is selected
      let coverArtPath = null;
      if (psCoverArtFile) {
        setPsCoverArtUploading(true);
        coverArtPath = await uploadPresaveImage(psCoverArtFile, psSlug.trim());
        setPsCoverArtUploading(false);
        if (!coverArtPath) {
          throw new Error('Cover art upload failed');
        }
      }

      const res = await fetch('/.netlify/functions/presave_links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          slug: psSlug.trim(),
          song_title: psSongTitle.trim(),
          artist_name: psArtistName.trim(),
          release_date: psReleaseDate.trim(),
          cover_art_url: psCoverArtUrl.trim() || null,
          cover_art_path: coverArtPath,
        }),
      });

      const text = await res.text();
      console.log('📡 presave_links POST raw response:', text);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} – ${text || 'Failed to create presave link'}`);
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Backend did not return valid JSON for presave_links POST.');
      }

      console.log("✅ Presave link created:", json.link);
      const cleanUrl = formatGhosteUrl(json.link.public_url);
      showToast(`Pre-Save Campaign Created! ${cleanUrl}`, "success");

      setPsSlug("");
      setPsSongTitle("");
      setPsArtistName("");
      setPsReleaseDate("");
      setPsCoverArtUrl("");
      setPsCoverArtFile(null);
      fetchPresaveLinks();
    } catch (err: any) {
      console.error("❌ Presave create error:", err);
      showToast(`Presave failed: ${err.message || String(err)}`, "error");
    } finally {
      setIsPreSaveCreating(false);
    }
  };

  const linkTypes = [
    {
      id: 'smart' as LinkType,
      title: 'Smart Links',
      description: 'Multi-platform music links',
      icon: Share2,
      color: 'from-blue-500 to-blue-700',
    },
    {
      id: 'oneclick' as LinkType,
      title: 'One-Click Links',
      description: 'Direct platform redirects',
      icon: Zap,
      color: 'from-green-500 to-green-700',
    },
    {
      id: 'email-capture' as LinkType,
      title: 'Email Capture',
      description: 'Build your fan list',
      icon: Mail,
      color: 'from-purple-500 to-purple-700',
    },
    // TEMPORARILY DISABLED - Pre-save functionality
    // {
    //   id: 'presave' as LinkType,
    //   title: 'Pre-Save Links',
    //   description: 'Pre-release campaigns',
    //   icon: Music2,
    //   color: 'from-pink-500 to-pink-700',
    // },
  ];

  return (
    <>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-lg md:text-xl font-semibold tracking-tight text-ghoste-white">
            Smart Links
          </h1>
          <p className="text-[11px] text-ghoste-grey">
            Create clean, multi-platform landing pages and track every click across your releases.
          </p>
        </header>

        <div className="grid gap-3 md:grid-cols-3">
          {linkTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedType === type.id;

            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setSelectedType(type.id)}
                className={[
                  'group flex h-full flex-col items-start justify-between rounded-2xl border p-4 text-left shadow-[0_18px_50px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-all',
                  isSelected
                    ? 'border-ghoste-blue/80 bg-gradient-to-br from-ghoste-black via-ghoste-navy to-ghoste-black'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
                ].join(' ')}
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-ghoste-black/70 text-ghoste-blue">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-semibold text-ghoste-white">
                      {type.title}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="rounded-full bg-ghoste-blue/20 px-2 py-0.5 text-[10px] font-medium text-ghoste-blue">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[11px] leading-snug text-ghoste-grey">
                  {type.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        {selectedType === 'smart' && <SmartLinks />}
        {selectedType === 'oneclick' && <OneClickLinks />}
        {selectedType === 'email-capture' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Mail className="w-6 h-6" />
            Email Capture Links
          </h3>

          <form onSubmit={handleCreateEmailCapture} data-form="email-capture" className="space-y-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Title *
              </label>
              <input
                type="text"
                placeholder="e.g., Join my mailing list"
                value={emailTitle}
                onChange={(e) => setEmailTitle(e.target.value)}
                className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Custom URL *
              </label>
              <div className="flex items-stretch gap-2">
                <span className="inline-flex items-center rounded-xl bg-[#050814] px-3 text-sm text-gray-400 border border-gray-700">
                  ghoste.one/capture/
                </span>
                <input
                  type="text"
                  value={emailSlug}
                  onChange={(e) => setEmailSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, '-'))}
                  className="flex-1 rounded-xl border border-gray-700 bg-[#050814] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="my-email-capture"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Banner Image <span className="text-xs text-gray-500">(coming soon)</span>
              </label>
              <div
                className="w-full px-4 py-6 bg-black border-2 border-dashed border-gray-700 rounded-lg opacity-50 cursor-not-allowed flex flex-col items-center gap-2"
              >
                <Upload className="w-6 h-6 text-gray-400" />
                <span className="text-gray-400 text-sm">
                  Banner image support coming soon
                </span>
              </div>
            </div>
            <ProActionButton
              onClick={() => {
                const form = document.querySelector('form[data-form="email-capture"]');
                if (form) {
                  const event = new Event('submit', { bubbles: true, cancelable: true });
                  form.dispatchEvent(event);
                }
              }}
              feature="email capture links"
              disabled={isEmailCreating || !emailTitle.trim() || !emailSlug.trim()}
              className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isEmailCreating ? "Creating…" : "Create Email Capture Link"}
            </ProActionButton>
          </form>

          <div className="border-t border-gray-800 pt-6">
            <h4 className="text-lg font-semibold mb-4">Your Email Capture Links</h4>
            {emailLoading && <p className="text-gray-400">Loading...</p>}
            {emailError && <p className="text-red-400">{emailError}</p>}
            {!emailLoading && !emailError && emailLinks.length === 0 && (
              <p className="text-gray-500">No email capture links yet.</p>
            )}
            {emailLinks.length > 0 && (
              <ul className="space-y-4">
                {emailLinks.map((link) => (
                  <li key={link.id} className="bg-black/30 p-5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                    <div className="flex items-start gap-4">
                      {link.image_path && (
                        <div className="flex-shrink-0">
                          <img
                            src={supabase.storage.from('ghoste_link_images').getPublicUrl(link.image_path).data.publicUrl}
                            alt={link.title}
                            className="w-20 h-20 object-cover rounded-lg"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-white mb-1">{link.title}</h5>
                        {link.public_url && (
                          <div className="bg-gray-900 px-3 py-2 rounded-lg border border-gray-800 mb-3">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-purple-400 flex-shrink-0" />
                              <code className="text-sm text-purple-400 font-mono truncate flex-1">
                                {formatGhosteUrl(link.public_url)}
                              </code>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyEmailLink(link.public_url!, link.id)}
                            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            {copiedEmailLink === link.id ? (
                              <>
                                <Check className="w-4 h-4" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                Copy Link
                              </>
                            )}
                          </button>
                          <a
                            href={link.public_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Open
                          </a>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {selectedType === 'presave' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Music2 className="w-6 h-6" />
            Pre-Save Campaigns
          </h3>

          <form onSubmit={handleCreatePresave} data-form="presave" className="space-y-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ISRC / UPC (link slug) * <span className="text-xs text-gray-500">(We use your ISRC or UPC as the unique ID in the URL)</span>
              </label>
              <input
                type="text"
                placeholder="e.g., USRC12345678 or my-track-slug"
                value={psSlug}
                onChange={(e) => setPsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Song Title *
              </label>
              <input
                type="text"
                placeholder="Song Title"
                value={psSongTitle}
                onChange={(e) => setPsSongTitle(e.target.value)}
                className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Artist Name *
              </label>
              <input
                type="text"
                placeholder="Artist Name"
                value={psArtistName}
                onChange={(e) => setPsArtistName(e.target.value)}
                className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Release Date *
              </label>
              <input
                type="date"
                value={psReleaseDate}
                onChange={(e) => setPsReleaseDate(e.target.value)}
                className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Cover Art URL <span className="text-xs text-gray-500">(optional)</span>
              </label>
              <input
                type="url"
                placeholder="https://example.com/cover-art.jpg"
                value={psCoverArtUrl}
                onChange={(e) => setPsCoverArtUrl(e.target.value)}
                className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              {psCoverArtUrl && (
                <div className="mt-2">
                  <img src={psCoverArtUrl} alt="Cover art preview" className="w-32 h-32 object-cover rounded-lg" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </div>
              )}
            </div>
            <ProActionButton
              onClick={() => {
                const form = document.querySelector('form[data-form="presave"]');
                if (form) {
                  const event = new Event('submit', { bubbles: true, cancelable: true });
                  form.dispatchEvent(event);
                }
              }}
              feature="pre-save campaigns"
              disabled={isPreSaveCreating || !psSlug.trim() || !psSongTitle.trim() || !psArtistName.trim() || !psReleaseDate.trim()}
              className="w-full px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isPreSaveCreating ? "Creating…" : "Create Pre-Save Campaign"}
            </ProActionButton>
          </form>

          <div className="border-t border-gray-800 pt-6">
            <h4 className="text-lg font-semibold mb-4">Your Pre-Save Campaigns</h4>
            {presaveLoading && <p className="text-gray-400">Loading...</p>}
            {presaveError && <p className="text-red-400">{presaveError}</p>}
            {!presaveLoading && !presaveError && presaveLinks.length === 0 && (
              <p className="text-gray-500">No pre-save campaigns yet.</p>
            )}
            {presaveLinks.length > 0 && (
              <ul className="space-y-4">
                {presaveLinks.map((link) => (
                  <li key={link.id} className="bg-black/30 p-5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                    <div className="flex items-start gap-4">
                      {link.cover_art_url && (
                        <div className="flex-shrink-0">
                          <img src={link.cover_art_url} alt={link.song_title} className="w-20 h-20 object-cover rounded-lg" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-white mb-1">{link.song_title}</h5>
                        <p className="text-sm text-gray-400">{link.artist_name}</p>
                        <p className="text-xs text-gray-500 mt-1">Release: {link.release_date}</p>
                        {link.public_url && (
                          <div className="bg-gray-900 px-3 py-2 rounded-lg border border-gray-800 mb-3 mt-3">
                            <div className="flex items-center gap-2">
                              <Music2 className="w-4 h-4 text-pink-400 flex-shrink-0" />
                              <code className="text-sm text-pink-400 font-mono truncate flex-1">
                                {formatGhosteUrl(link.public_url)}
                              </code>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyPresaveLink(link.public_url!, link.id)}
                            className="flex-1 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            {copiedPresaveLink === link.id ? (
                              <>
                                <Check className="w-4 h-4" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                Copy Link
                              </>
                            )}
                          </button>
                          <a
                            href={link.public_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Open
                          </a>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
