import { useState, useEffect } from 'react';
import { Upload, X, Loader, Target, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../../contexts/AuthContext';
import { readModeSettings, type GoalSettings } from '../../lib/ads/modes';
import { GOAL_REGISTRY, getAllGoalKeys, type OverallGoalKey } from '../../lib/goals';

interface GoalCreativeUploadProps {
  onUploadComplete?: (creativeId: string, publicUrl: string, goalKey: string) => void;
  preselectedGoal?: OverallGoalKey;
  showGoalSelector?: boolean;
}

export function GoalCreativeUpload({
  onUploadComplete,
  preselectedGoal,
  showGoalSelector = true,
}: GoalCreativeUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [selectedGoal, setSelectedGoal] = useState<OverallGoalKey | null>(preselectedGoal || null);
  const [activeGoals, setActiveGoals] = useState<OverallGoalKey[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(true);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadActiveGoals();
    }
  }, [user]);

  useEffect(() => {
    if (preselectedGoal) {
      setSelectedGoal(preselectedGoal);
    }
  }, [preselectedGoal]);

  const loadActiveGoals = async () => {
    if (!user) return;

    try {
      const settings = await readModeSettings(user.id);
      if (settings && settings.goal_settings) {
        const active = getAllGoalKeys().filter(
          (key) => settings.goal_settings[key]?.is_active
        );
        setActiveGoals(active);

        if (active.length > 0 && !selectedGoal) {
          setSelectedGoal(active[0]);
        }
      }
    } catch (err) {
      console.error('[GoalCreativeUpload] Failed to load goals:', err);
    } finally {
      setLoadingGoals(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!user) {
      setError('You must be logged in to upload');
      return;
    }

    if (!selectedGoal) {
      setError('Please select a goal first');
      return;
    }

    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Please upload an image or video.');
      return;
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File too large. Maximum size is 100MB.');
      return;
    }

    setError(null);
    setSuccess(false);
    setUploading(true);
    setUploadedFile(file);

    const isVideo = file.type.startsWith('video/');
    const objectUrl = URL.createObjectURL(file);
    if (!isVideo) {
      setPreviewUrl(objectUrl);
    }

    try {
      const ext = file.name.split('.').pop() || 'bin';
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const storagePath = `user/${user.id}/goals/${selectedGoal}/${filename}`;

      console.log('[GoalCreativeUpload] Uploading to:', storagePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('ad-assets')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('[GoalCreativeUpload] Upload failed:', uploadError);
        setError(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      const { data: publicData } = supabase.storage
        .from('ad-assets')
        .getPublicUrl(storagePath);

      console.log('[GoalCreativeUpload] Upload complete, inserting to ad_creatives');

      const { data: creativeData, error: insertError } = await supabase
        .from('ad_creatives')
        .insert({
          owner_user_id: user.id,
          creative_type: isVideo ? 'video' : 'image',
          storage_path: uploadData.path,
          storage_bucket: 'ad-assets',
          public_url: publicData.publicUrl,
          file_size_bytes: file.size,
          status: 'ready',
          platform: 'meta',
          goal_key: selectedGoal,
        })
        .select('id, public_url, goal_key')
        .single();

      if (insertError) {
        console.error('[GoalCreativeUpload] Failed to insert creative:', insertError);
        setError(`Failed to save creative: ${insertError.message}`);
        setUploading(false);
        return;
      }

      console.log('[GoalCreativeUpload] Creative saved:', creativeData.id);

      await supabase.from('media_assets').insert({
        owner_user_id: user.id,
        kind: isVideo ? 'video' : 'image',
        filename: file.name,
        mime: file.type,
        storage_bucket: 'ad-assets',
        storage_key: uploadData.path,
        public_url: publicData.publicUrl,
        size: file.size,
        status: 'ready',
      });

      setSuccess(true);
      setUploading(false);

      if (onUploadComplete) {
        onUploadComplete(creativeData.id, creativeData.public_url, creativeData.goal_key);
      }

      setTimeout(() => {
        setSuccess(false);
        setUploadedFile(null);
        setPreviewUrl(null);
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }, 3000);
    } catch (err: any) {
      console.error('[GoalCreativeUpload] Unexpected error:', err);
      setError(`Unexpected error: ${err.message}`);
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleRemove = () => {
    setUploadedFile(null);
    setPreviewUrl(null);
    setSuccess(false);
    setError(null);
  };

  if (loadingGoals) {
    return (
      <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-5 w-5 bg-white/10 rounded"></div>
          <div className="h-4 w-32 bg-white/10 rounded"></div>
        </div>
      </div>
    );
  }

  if (activeGoals.length === 0) {
    return (
      <div className="rounded-xl border border-yellow-900/50 bg-yellow-950/20 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-yellow-400 mb-1">
              No Active Goals
            </h3>
            <p className="text-sm text-gray-400 mb-3">
              Turn on a goal in your Profile first, then upload creatives here.
            </p>
            <a
              href="/profile"
              className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-sm font-medium transition-colors"
            >
              <Target className="w-4 h-4" />
              Go to Profile
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-ghoste-white mb-1">
          Upload Creative for Goal
        </h3>
        <p className="text-sm text-ghoste-grey">
          Upload images or videos that support your active goals
        </p>
      </div>

      {showGoalSelector && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-ghoste-white mb-2">
            Goal <span className="text-red-400">*</span>
          </label>
          <select
            value={selectedGoal || ''}
            onChange={(e) => setSelectedGoal(e.target.value as OverallGoalKey)}
            disabled={!!preselectedGoal}
            className="w-full px-4 py-2.5 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white focus:outline-none focus:ring-2 focus:ring-ghoste-blue disabled:opacity-50"
          >
            {activeGoals.map((goalKey) => (
              <option key={goalKey} value={goalKey}>
                {GOAL_REGISTRY[goalKey].title}
              </option>
            ))}
          </select>
          {selectedGoal && (
            <p className="mt-2 text-xs text-ghoste-grey">
              {GOAL_REGISTRY[selectedGoal].description}
            </p>
          )}
        </div>
      )}

      {!success && !uploadedFile && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-ghoste-blue bg-ghoste-blue/10'
              : 'border-ghoste-border hover:border-ghoste-border/70'
          } ${uploading || !selectedGoal ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input
            type="file"
            id="goal-creative-upload"
            accept="image/*,video/*"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
            disabled={uploading || !selectedGoal}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          {uploading ? (
            <div className="flex flex-col items-center justify-center space-y-3">
              <Loader className="h-10 w-10 animate-spin text-ghoste-blue" />
              <p className="text-sm text-ghoste-white font-medium">
                Uploading and saving...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-3">
              <Upload className="h-10 w-10 text-ghoste-grey" />
              <div>
                <p className="text-base text-ghoste-white font-medium mb-1">
                  Drop an image or video, or click to browse
                </p>
                <p className="text-sm text-ghoste-grey">
                  PNG, JPG, GIF, WebP, MP4, MOV, WebM (max 100MB)
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {success && (
        <div className="border border-green-500/30 rounded-lg p-4 bg-green-500/10">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-base text-green-400 font-semibold mb-1">
                Upload successful!
              </p>
              <p className="text-sm text-ghoste-grey mb-2">
                Creative saved for {selectedGoal && GOAL_REGISTRY[selectedGoal].title}
              </p>
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Uploaded creative"
                  className="mt-2 w-full max-w-xs h-32 object-cover rounded"
                />
              )}
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="p-1 text-ghoste-grey hover:text-ghoste-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
