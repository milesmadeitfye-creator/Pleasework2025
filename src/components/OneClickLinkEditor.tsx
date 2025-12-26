import { useState } from 'react';
import { X, Link2, ExternalLink } from 'lucide-react';

interface OneClickLinkConfig {
  targetUrl?: string;
}

interface OneClickLinkEditorProps {
  link: {
    id: string;
    title: string;
    slug: string;
    config: OneClickLinkConfig;
  };
  onSave: (data: { title: string; slug: string; config: OneClickLinkConfig }) => void;
  onCancel: () => void;
}

export default function OneClickLinkEditor({ link, onSave, onCancel }: OneClickLinkEditorProps) {
  const [title, setTitle] = useState(link.title || '');
  const [slug, setSlug] = useState(link.slug || '');
  const [targetUrl, setTargetUrl] = useState(link.config?.targetUrl || '');
  const [errors, setErrors] = useState<{ title?: string; slug?: string; targetUrl?: string }>({});

  const validate = () => {
    const newErrors: { title?: string; slug?: string; targetUrl?: string } = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!slug.trim()) {
      newErrors.slug = 'Slug is required';
    } else if (!/^[a-z0-9-]+$/.test(slug)) {
      newErrors.slug = 'Slug can only contain lowercase letters, numbers, and hyphens';
    }

    if (!targetUrl.trim()) {
      newErrors.targetUrl = 'Target URL is required';
    } else {
      try {
        new URL(targetUrl);
      } catch {
        newErrors.targetUrl = 'Please enter a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    onSave({
      title: title.trim(),
      slug: slug.trim(),
      config: {
        targetUrl: targetUrl.trim(),
      },
    });
  };

  const generateSlug = () => {
    const generated = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
    setSlug(generated || `link-${Date.now()}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Link2 className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {link.id ? 'Edit One-Click Link' : 'Create One-Click Link'}
              </h2>
              <p className="text-sm text-gray-400">Direct instant redirect link</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Link Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Spotify Profile, Latest Single, etc."
              className={`w-full px-4 py-2 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 ${
                errors.title
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-700 focus:ring-blue-500'
              }`}
            />
            {errors.title && <p className="text-red-400 text-sm mt-1">{errors.title}</p>}
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Slug
              <span className="text-gray-500 font-normal ml-2">(URL path)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="my-link"
                className={`flex-1 px-4 py-2 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 ${
                  errors.slug
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-700 focus:ring-blue-500'
                }`}
              />
              <button
                type="button"
                onClick={generateSlug}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
              >
                Generate
              </button>
            </div>
            {errors.slug && <p className="text-red-400 text-sm mt-1">{errors.slug}</p>}
            {slug && !errors.slug && (
              <p className="text-gray-500 text-sm mt-1">
                https://ghoste.one/s/{slug}
              </p>
            )}
          </div>

          {/* Target URL */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Target URL
              <span className="text-gray-500 font-normal ml-2">(Where to redirect)</span>
            </label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://open.spotify.com/artist/..."
              className={`w-full px-4 py-2 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 ${
                errors.targetUrl
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-700 focus:ring-blue-500'
              }`}
            />
            {errors.targetUrl && <p className="text-red-400 text-sm mt-1">{errors.targetUrl}</p>}
            <p className="text-gray-500 text-xs mt-1">
              Users will be instantly redirected to this URL when they visit your link
            </p>
          </div>

          {/* Preview */}
          {targetUrl && !errors.targetUrl && (
            <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
              <p className="text-sm text-gray-400 mb-2">Preview:</p>
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="w-4 h-4 text-green-400" />
                <span className="text-gray-300">https://ghoste.one/s/{slug || 'your-slug'}</span>
                <ExternalLink className="w-4 h-4 text-gray-500" />
                <span className="text-gray-300">{targetUrl}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
            >
              {link.id ? 'Update Link' : 'Create Link'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
