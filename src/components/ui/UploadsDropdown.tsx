import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Video, Image, Music, FileText, Loader } from 'lucide-react';

interface Upload {
  id: string;
  kind: 'video' | 'image' | 'audio' | 'document';
  filename: string;
  mime_type: string;
  public_url?: string;
  storage_bucket: string;
  storage_path: string;
  meta_video_id?: string;
  meta_image_hash?: string;
  created_at: string;
}

interface UploadsDropdownProps {
  onSelect: (upload: Upload, resolvedUrl: string) => void;
  filterKind?: 'video' | 'image' | 'audio' | 'document';
  placeholder?: string;
  className?: string;
}

export function UploadsDropdown({
  onSelect,
  filterKind,
  placeholder = 'Choose uploaded file',
  className = '',
}: UploadsDropdownProps) {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchUploads();
  }, [user]);

  const fetchUploads = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/uploads-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list_uploads',
          userId: user.id,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to fetch uploads');
      }

      let uploadsList = result.uploads || [];

      if (filterKind) {
        uploadsList = uploadsList.filter((u: Upload) => u.kind === filterKind);
      }

      setUploads(uploadsList);
    } catch (err: any) {
      console.error('[UploadsDropdown] Fetch error:', err);
      setError(err.message || 'Failed to load uploads');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (upload: Upload) => {
    if (!user) return;

    setResolving(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/uploads-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_upload',
          userId: user.id,
          uploadId: upload.id,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to resolve upload');
      }

      const resolvedUrl = result.url;
      if (!resolvedUrl) {
        throw new Error('No URL returned from resolver');
      }

      onSelect(upload, resolvedUrl);
    } catch (err: any) {
      console.error('[UploadsDropdown] Resolve error:', err);
      setError(err.message || 'Failed to resolve upload URL');
    } finally {
      setResolving(false);
    }
  };

  const getIcon = (kind: string) => {
    switch (kind) {
      case 'video':
        return <Video className="w-4 h-4" />;
      case 'image':
        return <Image className="w-4 h-4" />;
      case 'audio':
        return <Music className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-gray-400">
        <Loader className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading uploads...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 bg-red-900/20 border border-red-800 rounded-xl">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchUploads}
          className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className="px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-center">
        <p className="text-sm text-gray-500">
          No {filterKind ? filterKind + 's' : 'files'} uploaded yet
        </p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <select
        onChange={(e) => {
          const upload = uploads.find((u) => u.id === e.target.value);
          if (upload) handleSelect(upload);
        }}
        disabled={resolving}
        className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm appearance-none cursor-pointer hover:border-gray-700 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">{resolving ? 'Resolving...' : placeholder}</option>
        {uploads.map((upload) => (
          <option key={upload.id} value={upload.id}>
            {upload.filename} · {formatDate(upload.created_at)}
          </option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        {resolving ? (
          <Loader className="w-4 h-4 animate-spin text-gray-400" />
        ) : (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
    </div>
  );
}
