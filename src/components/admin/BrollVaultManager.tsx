import { useState, useEffect } from 'react';
import { Upload, Loader2, Video, CheckCircle, XCircle, Trash2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface BrollAsset {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  aspect_ratio: string;
  vibe: string;
  aesthetic: string[] | null;
  energy_level: string;
  color_palette: string[] | null;
  loop_safe: boolean;
  usage_count: number;
  is_active: boolean;
  created_at: string;
}

const VIBES = ['cinematic', 'energetic', 'dreamy', 'urban', 'nature'];
const ENERGY_LEVELS = ['low', 'medium', 'high'];
const AESTHETICS = ['moody', 'neon', 'minimal', 'bright', 'dark', 'warm', 'cool', 'retro'];

/**
 * B-roll Vault Manager - Internal Admin Tool
 *
 * This is for Ghoste team only to manage the centralized B-roll library
 * NEVER expose this to regular users
 */
export function BrollVaultManager() {
  const { user } = useAuth();

  const [assets, setAssets] = useState<BrollAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Form state for new upload
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadVibe, setUploadVibe] = useState('cinematic');
  const [uploadEnergyLevel, setUploadEnergyLevel] = useState('medium');
  const [uploadDuration, setUploadDuration] = useState(5);
  const [uploadAesthetics, setUploadAesthetics] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Load assets
  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('broll_assets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load B-roll assets:', error);
    } else {
      setAssets(data || []);
    }

    setLoading(false);
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle) {
      setUploadError('Please provide file and title');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // Upload video file to storage
      const fileName = `broll/${Date.now()}_${uploadFile.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('broll-vault')
        .upload(fileName, uploadFile);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('broll-vault')
        .getPublicUrl(fileName);

      // Insert into database
      const { error: insertError } = await supabase
        .from('broll_assets')
        .insert({
          title: uploadTitle,
          description: uploadDescription || null,
          file_url: publicUrl,
          duration_seconds: uploadDuration,
          aspect_ratio: '9:16',
          vibe: uploadVibe,
          aesthetic: uploadAesthetics.length > 0 ? uploadAesthetics : null,
          energy_level: uploadEnergyLevel,
          loop_safe: true,
          is_active: true,
        });

      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      console.log('✅ B-roll asset uploaded successfully');

      // Reset form
      setUploadFile(null);
      setUploadTitle('');
      setUploadDescription('');
      setUploadVibe('cinematic');
      setUploadEnergyLevel('medium');
      setUploadDuration(5);
      setUploadAesthetics([]);
      setShowUploadForm(false);

      // Reload assets
      await loadAssets();

    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Failed to upload B-roll');
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (assetId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('broll_assets')
      .update({ is_active: !currentStatus })
      .eq('id', assetId);

    if (error) {
      console.error('Failed to toggle status:', error);
    } else {
      await loadAssets();
    }
  };

  const deleteAsset = async (assetId: string) => {
    if (!confirm('Are you sure you want to delete this B-roll asset?')) {
      return;
    }

    const { error } = await supabase
      .from('broll_assets')
      .delete()
      .eq('id', assetId);

    if (error) {
      console.error('Failed to delete asset:', error);
    } else {
      await loadAssets();
    }
  };

  const toggleAesthetic = (aesthetic: string) => {
    if (uploadAesthetics.includes(aesthetic)) {
      setUploadAesthetics(uploadAesthetics.filter(a => a !== aesthetic));
    } else {
      setUploadAesthetics([...uploadAesthetics, aesthetic]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">B-roll Vault Manager</h1>
              <p className="text-gray-400">Internal Admin Tool - Manage Centralized B-roll Library</p>
            </div>

            <button
              onClick={() => setShowUploadForm(!showUploadForm)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Upload New B-roll
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-gray-400 text-sm mb-1">Total Assets</p>
              <p className="text-2xl font-bold text-white">{assets.length}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-gray-400 text-sm mb-1">Active</p>
              <p className="text-2xl font-bold text-green-400">
                {assets.filter(a => a.is_active).length}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-gray-400 text-sm mb-1">Inactive</p>
              <p className="text-2xl font-bold text-gray-400">
                {assets.filter(a => !a.is_active).length}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-gray-400 text-sm mb-1">Total Usage</p>
              <p className="text-2xl font-bold text-blue-400">
                {assets.reduce((sum, a) => sum + a.usage_count, 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Upload Form */}
        {showUploadForm && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Upload New B-roll</h2>

            <div className="space-y-4">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Video File *
                </label>
                <label className="block px-4 py-3 bg-gray-900 border border-gray-700 rounded cursor-pointer hover:border-blue-500 transition-colors">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">
                      {uploadFile ? uploadFile.name : 'Choose video file (MP4, MOV)'}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => e.target.files && setUploadFile(e.target.files[0])}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g., Urban Night Drive"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Brief description of the footage"
                  rows={2}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Vibe */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Vibe *
                </label>
                <select
                  value={uploadVibe}
                  onChange={(e) => setUploadVibe(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500"
                >
                  {VIBES.map((vibe) => (
                    <option key={vibe} value={vibe}>{vibe}</option>
                  ))}
                </select>
              </div>

              {/* Energy Level */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Energy Level *
                </label>
                <div className="flex gap-2">
                  {ENERGY_LEVELS.map((level) => (
                    <button
                      key={level}
                      onClick={() => setUploadEnergyLevel(level)}
                      className={`flex-1 px-4 py-2 rounded border transition-colors ${
                        uploadEnergyLevel === level
                          ? 'bg-blue-900 border-blue-600 text-white'
                          : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Duration (seconds) *
                </label>
                <input
                  type="number"
                  value={uploadDuration}
                  onChange={(e) => setUploadDuration(parseFloat(e.target.value))}
                  min="1"
                  max="30"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Aesthetics */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Aesthetics (select all that apply)
                </label>
                <div className="flex flex-wrap gap-2">
                  {AESTHETICS.map((aesthetic) => (
                    <button
                      key={aesthetic}
                      onClick={() => toggleAesthetic(aesthetic)}
                      className={`px-3 py-1 rounded border text-sm transition-colors ${
                        uploadAesthetics.includes(aesthetic)
                          ? 'bg-blue-900 border-blue-600 text-white'
                          : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      {aesthetic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {uploadError && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-200 text-sm">
                  {uploadError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !uploadFile || !uploadTitle}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Upload B-roll
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowUploadForm(false)}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assets List */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">B-roll Assets</h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12">
              <Video className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No B-roll assets yet</p>
              <p className="text-gray-500 text-sm mt-1">Upload your first B-roll clip</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className={`bg-gray-900 rounded border p-4 ${
                    asset.is_active ? 'border-gray-700' : 'border-gray-800 opacity-60'
                  }`}
                >
                  {/* Video Preview */}
                  <video
                    src={asset.file_url}
                    controls
                    className="w-full rounded border border-gray-700 mb-3"
                  />

                  {/* Title */}
                  <h3 className="text-white font-medium mb-1">{asset.title}</h3>

                  {/* Metadata */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="px-2 py-1 bg-blue-900 text-blue-200 text-xs rounded">
                      {asset.vibe}
                    </span>
                    <span className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded">
                      {asset.energy_level}
                    </span>
                    <span className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded">
                      {asset.duration_seconds}s
                    </span>
                  </div>

                  {/* Aesthetics */}
                  {asset.aesthetic && asset.aesthetic.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {asset.aesthetic.map((aes) => (
                        <span key={aes} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded">
                          {aes}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Usage Count */}
                  <p className="text-gray-500 text-sm mb-3">
                    Used {asset.usage_count} {asset.usage_count === 1 ? 'time' : 'times'}
                  </p>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleActive(asset.id, asset.is_active)}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                        asset.is_active
                          ? 'bg-green-900 text-green-200 hover:bg-green-800'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {asset.is_active ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Active
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" />
                          Inactive
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => deleteAsset(asset.id)}
                      className="px-3 py-2 bg-red-900 hover:bg-red-800 text-red-200 rounded text-sm font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
