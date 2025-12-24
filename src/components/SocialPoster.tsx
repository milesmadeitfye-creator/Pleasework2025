import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Calendar, CheckCircle, AlertCircle, Clock, Trash2, Upload, X, Image as ImageIcon, Video, TestTube, Edit } from 'lucide-react';
import { uploadSocialMediaFile, getSocialMediaFileUrl } from '../lib/socialMediaStorage';
import { createSocialPost, fetchSocialPosts, publishSocialPost, type SocialPostType } from '../lib/socialPosts';
import { isDevWalletOverride } from '../lib/devWalletOverride';

interface PostableAccount {
  id: string;
  provider: 'meta';
  type: 'facebook_page' | 'instagram_business';
  externalId: string;
  name: string;
  avatarUrl?: string;
  canPublish: boolean;
}

interface SocialPost {
  id: string;
  user_id: string;
  platforms: string[];
  content: string;
  post_type: SocialPostType;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  scheduled_at: string | null;
  posted_at: string | null;
  error_message: string | null;
  meta_result?: {
    platforms_results?: {
      facebook?: { success: boolean; error?: string; step?: string };
      instagram?: { success: boolean; error?: string; step?: string };
    };
  };
  created_at: string;
  updated_at: string;
  target_accounts?: PostableAccount[];
}

interface SocialMediaAsset {
  id: string;
  post_id: string;
  bucket: string;
  path: string;
  mime_type: string;
}

const platformOptions = [
  { id: 'meta', label: 'Meta (FB/IG)', color: 'text-blue-400' },
  { id: 'facebook', label: 'Facebook', color: 'text-blue-400' },
  { id: 'instagram', label: 'Instagram', color: 'text-pink-400' },
  { id: 'twitter', label: 'Twitter / X', color: 'text-sky-400' },
  { id: 'tiktok', label: 'TikTok', color: 'text-pink-400' },
];

const postTypeOptions: { value: SocialPostType; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard Post', description: 'Regular feed post' },
  { value: 'story', label: 'Story', description: 'Temporary 24h story' },
  { value: 'short', label: 'Short / Reel', description: 'Vertical video' },
  { value: 'carousel', label: 'Carousel', description: 'Multiple images' },
];

const statusIcons = {
  draft: Clock,
  scheduled: Calendar,
  publishing: Clock,
  published: CheckCircle,
  failed: AlertCircle,
};

const statusColors = {
  draft: 'text-gray-400',
  scheduled: 'text-blue-400',
  publishing: 'text-yellow-400',
  published: 'text-green-400',
  failed: 'text-red-400',
};

// Helper function to extract platform-specific error messages
function getPlatformErrors(post: SocialPost): string {
  // Check platform_results first (new format), then fall back to meta_result (old format)
  const platformResults = post.platform_results || post.meta_result?.platforms_results;

  if (!platformResults) {
    return post.error_message || 'Publishing failed';
  }

  const { facebook, instagram } = platformResults;
  const errors: string[] = [];

  if (facebook && !facebook.success && facebook.error) {
    let fbMsg = facebook.error;

    // Enhance specific error messages for better UX
    if (facebook.step === 'facebook_permissions') {
      fbMsg = 'Reconnect Meta: pages_manage_posts required';
    } else if (facebook.step === 'instagram_permissions') {
      fbMsg = 'Reconnect Meta: instagram_content_publish required';
    } else if (fbMsg.toLowerCase().includes('group')) {
      fbMsg = 'Switch target to a Page (not Group)';
    }

    errors.push(`FB: ${fbMsg.substring(0, 50)}${fbMsg.length > 50 ? '...' : ''}`);
  }

  if (instagram && !instagram.success && instagram.error) {
    let igMsg = instagram.error;

    // Enhance specific error messages for better UX
    if (instagram.step === 'instagram_permissions') {
      igMsg = 'Reconnect Meta: instagram_content_publish required';
    }

    errors.push(`IG: ${igMsg.substring(0, 50)}${igMsg.length > 50 ? '...' : ''}`);
  }

  return errors.length > 0 ? errors.join(' | ') : (post.error_message || 'Publishing failed');
}

export default function SocialPoster() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [assetsByPostId, setAssetsByPostId] = useState<Record<string, SocialMediaAsset[]>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [metaConnected, setMetaConnected] = useState(false);
  const [metaCredentials, setMetaCredentials] = useState<any>(null);
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [testingInstagram, setTestingInstagram] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [postableAccounts, setPostableAccounts] = useState<PostableAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<PostableAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [formData, setFormData] = useState({
    content: '',
    platforms: [] as string[],
    post_type: 'standard' as SocialPostType,
    scheduled_for: '',
  });

  // Check if current user is a dev/test account
  const isDevUser = user ? isDevWalletOverride(user) : false;

  useEffect(() => {
    if (user) {
      fetchPostsData();
      checkMetaConnection();
      fetchPostableAccounts();
    }
  }, [user]);

  const checkMetaConnection = async () => {
    if (!user) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMetaConnected(false);
        setMetaCredentials(null);
        return;
      }

      // Fetch meta credentials including permission flags
      const { data: credentials, error } = await supabase
        .from('meta_credentials')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('[checkMetaConnection] Error fetching credentials:', error);
      }

      if (credentials) {
        setMetaConnected(true);
        setMetaCredentials(credentials);
        console.log('[checkMetaConnection] Meta connected with permissions:', {
          page_posting_enabled: credentials.page_posting_enabled,
          instagram_posting_enabled: credentials.instagram_posting_enabled,
          missing_permissions: credentials.missing_permissions,
        });
      } else {
        setMetaConnected(false);
        setMetaCredentials(null);
      }
    } catch (err) {
      console.error('Error checking Meta connection:', err);
      setMetaConnected(false);
      setMetaCredentials(null);
    }
  };

  const fetchPostableAccounts = async () => {
    if (!user) return;

    setLoadingAccounts(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/.netlify/functions/get-postable-accounts', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPostableAccounts(data.accounts || []);
        console.log('[fetchPostableAccounts] Loaded', data.accounts?.length || 0, 'accounts');
      }
    } catch (err) {
      console.error('Error fetching postable accounts:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchPostsData = async () => {
    setLoading(true);
    try {
      const { posts: fetchedPosts, assetsByPostId: fetchedAssets } = await fetchSocialPosts();
      setPosts(fetchedPosts);
      setAssetsByPostId(fetchedAssets);
    } catch (err) {
      console.error('Error fetching posts:', err);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert('Please sign in to create posts');
      return;
    }

    if (formData.platforms.length === 0) {
      alert('Please select at least one platform');
      return;
    }

    // Check for required Meta posting permissions
    const targetingFacebook = selectedAccounts.some(acc => acc.type === 'facebook_page');
    const targetingInstagram = selectedAccounts.some(acc => acc.type === 'instagram_business');

    if (metaCredentials) {
      if (targetingFacebook && metaCredentials?.page_posting_enabled === false) {
        alert('Facebook posting permission missing. Please reconnect Meta and approve "pages_manage_posts" permission.');
        return;
      }

      if (targetingInstagram && metaCredentials?.instagram_posting_enabled === false) {
        alert('Instagram posting permission missing. Please reconnect Meta and approve "instagram_content_publish" permission.');
        return;
      }
    }

    setPosting(true);

    try {
      let uploadedAssets: { bucket: string; path: string; mime_type: string; size_bytes: number }[] = [];

      if (selectedFiles.length > 0) {
        setUploading(true);
        console.log('[handleSubmit] Uploading', selectedFiles.length, 'files');

        for (const file of selectedFiles) {
          try {
            const asset = await uploadSocialMediaFile(file, user.id);
            uploadedAssets.push(asset);
            console.log('[handleSubmit] Uploaded:', asset.path);
          } catch (err) {
            console.error('[handleSubmit] Upload failed for file:', file.name, err);
            alert(`Failed to upload ${file.name}. Please try again.`);
            setPosting(false);
            setUploading(false);
            return;
          }
        }

        setUploading(false);
      }

      const scheduledAt = formData.scheduled_for
        ? new Date(formData.scheduled_for).toISOString()
        : null;

      // Prepare target_accounts (boolean flags for facebook/instagram)
      const targetAccountsData = {
        facebook: selectedAccounts.some(acc => acc.type === 'facebook_page'),
        instagram: selectedAccounts.some(acc => acc.type === 'instagram_business'),
      };

      console.log('[handleSubmit] Creating post with', uploadedAssets.length, 'assets. Target platforms:', targetAccountsData);

      if (editingPost) {
        // Update existing post
        const { error } = await supabase
          .from('social_posts')
          .update({
            content: formData.content,
            platforms: formData.platforms,
            post_type: formData.post_type,
            scheduled_at: scheduledAt,
            target_accounts: targetAccountsData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPost.id);

        if (error) throw error;

        console.log('[handleSubmit] Post updated successfully');
        alert('Post updated successfully!');
      } else {
        // Create new post
        await createSocialPost({
          content: formData.content,
          platforms: formData.platforms,
          post_type: formData.post_type,
          scheduled_at: scheduledAt,
          assets: uploadedAssets.length > 0 ? uploadedAssets : undefined,
          target_accounts: targetAccountsData,
        });

        console.log('[handleSubmit] Post created successfully');
        alert('Post saved successfully!');
      }

      await fetchPostsData();

      setFormData({
        content: '',
        platforms: [],
        post_type: 'standard',
        scheduled_for: '',
      });
      setSelectedFiles([]);
      setSelectedAccounts([]);
      setEditingPost(null);
      setShowModal(false);
    } catch (err: any) {
      console.error('[handleSubmit] Error:', err);
      alert(`Failed to ${editingPost ? 'update' : 'create'} post: ${err.message || 'Unknown error'}`);
    } finally {
      setPosting(false);
      setUploading(false);
    }
  };

  const handleEdit = (post: SocialPost) => {
    setEditingPost(post);
    setFormData({
      content: post.content,
      platforms: post.platforms,
      post_type: post.post_type,
      scheduled_for: post.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0, 16) : '',
    });

    // Pre-fill selected accounts
    if (post.target_accounts && Array.isArray(post.target_accounts)) {
      setSelectedAccounts(post.target_accounts);
    } else {
      setSelectedAccounts([]);
    }

    setShowModal(true);
  };

  const handleCloseModal = () => {
    setFormData({
      content: '',
      platforms: [],
      post_type: 'standard',
      scheduled_for: '',
    });
    setSelectedFiles([]);
    setSelectedAccounts([]);
    setEditingPost(null);
    setShowModal(false);
  };

  const handleDelete = async (post: SocialPost) => {
    // Only allow deletion of non-published posts
    if (post.status === 'published') {
      alert('Published posts cannot be deleted. Only scheduled and failed posts can be removed.');
      return;
    }

    if (!confirm('Are you sure you want to delete this post?')) {
      return;
    }

    try {
      await supabase.from('social_posts').delete().eq('id', post.id);
      await fetchPostsData();
      alert('Post deleted successfully');
    } catch (err: any) {
      console.error('[handleDelete] Error:', err);
      alert('Failed to delete post');
    }
  };

  const toggleAccount = (account: PostableAccount) => {
    setSelectedAccounts(prev =>
      prev.some(a => a.id === account.id)
        ? prev.filter(a => a.id !== account.id)
        : [...prev, account]
    );
  };

  const handlePostNow = async (post: SocialPost) => {
    // Check Meta connection for Meta-related platforms
    if (!metaConnected && post.platforms.some((p) => p === 'meta' || p === 'facebook' || p === 'instagram')) {
      alert('Please connect your Meta account first in the Connected Accounts page');
      return;
    }

    if (!confirm('Publish this post now to all selected platforms?')) {
      return;
    }

    try {
      console.log('[handlePostNow] Publishing post:', post.id);
      setPosting(true);

      // Clear any previous error and show publishing status
      await supabase
        .from('social_posts')
        .update({ status: 'publishing', error_message: null })
        .eq('id', post.id);

      await fetchPostsData();

      // Call the Netlify function (which calls Meta API server-side)
      const result = await publishSocialPost(post.id);

      // Refresh posts to show updated status from database
      await fetchPostsData();

      if (result.success) {
        alert('Post published successfully to Meta!');
      } else {
        // Show the actual error message from the backend
        const errorMsg = result.message || 'Failed to publish post';
        console.error('[handlePostNow] Backend error:', errorMsg, result);
        alert(`Failed to publish: ${errorMsg}`);
      }
    } catch (err: any) {
      console.error('[handlePostNow] Error:', err);

      // Extract the real error message from the backend response
      let errorMessage = 'Failed to publish';

      if (err.message) {
        errorMessage = err.message;
      }

      // Mark as failed with the actual error (backend function should do this, but as fallback)
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: errorMessage,
        })
        .eq('id', post.id);

      await fetchPostsData();
      alert(`Failed to publish: ${errorMessage}`);
    } finally {
      setPosting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles((prev) => [...prev, ...files]);

    if (files.length > 1 && formData.post_type !== 'carousel') {
      setFormData((prev) => ({ ...prev, post_type: 'carousel' }));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const togglePlatform = (platformId: string) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platformId)
        ? prev.platforms.filter((p) => p !== platformId)
        : [...prev.platforms, platformId],
    }));
  };

  /**
   * Test Instagram Publishing (Dev Only)
   *
   * Publishes a test image to Instagram using the instagram_content_publish permission.
   * This demonstrates API usage to Meta's dashboard.
   */
  const handleTestInstagramPost = async () => {
    if (!metaConnected) {
      alert('Please connect your Meta account first in the Connected Accounts page');
      return;
    }

    if (!confirm('This will publish a test post to your Instagram account. Continue?')) {
      return;
    }

    setTestingInstagram(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      // Use a public test image (Unsplash placeholder)
      const testImageUrl = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1080&h=1080&fit=crop';
      const testCaption = 'Test post from Ghoste One (dev) – please ignore 🎵';

      console.log('[TestInstagramPost] Calling meta-instagram-publish');

      const response = await fetch('/.netlify/functions/meta-instagram-publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          imageUrl: testImageUrl,
          caption: testCaption,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        console.error('[TestInstagramPost] Failed:', result);
        throw new Error(result.error || 'Failed to publish to Instagram');
      }

      console.log('[TestInstagramPost] Success:', result);

      alert(`✅ Test post published to Instagram!\n\nCreation ID: ${result.creationId}\nPublish ID: ${result.publishId}\n\nCheck your Instagram profile to see the post.`);
    } catch (err: any) {
      console.error('[TestInstagramPost] Error:', err);
      alert(`Failed to publish test post: ${err.message || 'Unknown error'}`);
    } finally {
      setTestingInstagram(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-gray-400">Schedule and automate social media posts</p>
        <div className="flex gap-3">
          {/* Dev-only test button for Instagram publishing */}
          {isDevUser && metaConnected && (
            <button
              onClick={handleTestInstagramPost}
              disabled={testingInstagram}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors text-sm"
              title="Test Instagram publishing (dev only)"
            >
              <TestTube className="w-4 h-4" />
              {testingInstagram ? 'Testing...' : 'Test IG Post'}
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Post
          </button>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No posts yet</h3>
          <p className="text-gray-500 mb-4">Create your first social media post</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => {
            const StatusIcon = statusIcons[post.status];
            return (
              <div
                key={post.id}
                className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-blue-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusIcon className={`w-5 h-5 ${statusColors[post.status]}`} />
                      <span className={`text-sm font-medium ${statusColors[post.status]}`}>
                        {post.status.toUpperCase()}
                      </span>
                      {post.scheduled_at && post.status === 'scheduled' && (
                        <span className="text-sm text-gray-400">
                          • {new Date(post.scheduled_at).toLocaleString()}
                        </span>
                      )}
                      {post.status === 'failed' && (
                        <span
                          className="text-xs text-red-400 cursor-help"
                          title={JSON.stringify(post.meta_result?.platforms_results || post.error_message || 'Unknown error', null, 2)}
                        >
                          • {getPlatformErrors(post)}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 ml-2">
                        • {postTypeOptions.find(pt => pt.value === post.post_type)?.label || post.post_type}
                      </span>
                    </div>
                    <p className="text-gray-300 mb-3 whitespace-pre-wrap">{post.content}</p>
                    <div className="flex flex-wrap gap-2">
                      {post.platforms.map((platform) => {
                        const platformInfo = platformOptions.find((p) => p.id === platform);
                        return (
                          <span
                            key={platform}
                            className={`px-3 py-1 bg-gray-800 rounded-full text-xs font-medium ${platformInfo?.color}`}
                          >
                            {platformInfo?.label}
                          </span>
                        );
                      })}
                    </div>
                    {assetsByPostId[post.id] && assetsByPostId[post.id].length > 0 && (
                      <div className="mt-3 flex gap-2 flex-wrap">
                        {assetsByPostId[post.id].map((asset) => {
                          const isVideo = asset.mime_type.startsWith('video/');
                          const url = getSocialMediaFileUrl(asset.path);
                          return (
                            <div key={asset.id} className="relative w-20 h-20 bg-gray-800 rounded-lg overflow-hidden">
                              {isVideo ? (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Video className="w-8 h-8 text-gray-400" />
                                </div>
                              ) : (
                                <img
                                  src={url}
                                  alt="Post media"
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed') && (
                      <button
                        onClick={() => handleEdit(post)}
                        disabled={posting}
                        className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Edit post"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                    )}
                    {(post.status === 'draft' || post.status === 'scheduled') && (
                      <button
                        onClick={() => handlePostNow(post)}
                        disabled={posting}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {posting ? 'Publishing...' : 'Post Now'}
                      </button>
                    )}
                    {post.status === 'failed' && (
                      <button
                        onClick={() => handlePostNow(post)}
                        disabled={posting}
                        className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Retry publishing this post"
                      >
                        {posting ? 'Retrying...' : 'Retry'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(post)}
                      disabled={posting || post.status === 'published'}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={post.status === 'published' ? 'Published posts cannot be deleted' : 'Delete'}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">{editingPost ? 'Edit Social Post' : 'Create Social Post'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Content <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
                  placeholder="What's happening?"
                  required
                />
                <div className="text-xs text-gray-400 mt-1">
                  {formData.content.length} characters
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Platforms <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {platformOptions.map((platform) => {
                    const isConnected = platform.id === 'meta' ? metaConnected : false;
                    const isDisabled = platform.id === 'meta' && !metaConnected;

                    return (
                      <button
                        key={platform.id}
                        type="button"
                        onClick={() => !isDisabled && togglePlatform(platform.id)}
                        disabled={isDisabled}
                        className={`px-4 py-2 rounded-lg border transition-colors relative ${
                          formData.platforms.includes(platform.id)
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : isDisabled
                            ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
                            : 'bg-black border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                        title={isDisabled ? 'Connect this platform in Connected Accounts first' : ''}
                      >
                        {platform.label}
                        {isConnected && (
                          <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"></span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {formData.platforms.length === 0 && (
                  <div className="text-xs text-red-400 mt-1">Select at least one platform</div>
                )}
                {!metaConnected && (
                  <div className="text-xs text-gray-500 mt-2">
                    💡 Connect Meta in <a href="/dashboard/connected-accounts" className="text-blue-400 hover:underline">Connected Accounts</a> to enable posting
                  </div>
                )}
              </div>

              {/* Account Selection */}
              {metaConnected && postableAccounts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Accounts to Post To {selectedAccounts.length > 0 && `(${selectedAccounts.length} selected)`}
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-700 rounded-lg p-3 bg-black">
                    {postableAccounts.map((account) => {
                      const isSelected = selectedAccounts.some(a => a.id === account.id);
                      return (
                        <label
                          key={account.id}
                          className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-900/30 border border-blue-500/50' : 'hover:bg-gray-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAccount(account)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          {account.avatarUrl && (
                            <img
                              src={account.avatarUrl}
                              alt={account.name}
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                          <div className="flex-1">
                            <div className="text-sm font-medium text-white">{account.name}</div>
                            <div className="text-xs text-gray-400">
                              {account.type === 'facebook_page' ? 'Facebook Page' : 'Instagram Business'}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {selectedAccounts.length === 0 && (
                    <div className="text-xs text-yellow-400 mt-1">
                      No accounts selected. Post will use default platform behavior.
                    </div>
                  )}
                </div>
              )}

              {metaConnected && postableAccounts.length === 0 && !loadingAccounts && (
                <div className="text-sm text-gray-400 bg-gray-800 rounded-lg p-3">
                  No Facebook Pages or Instagram Business accounts found. Connect them in{' '}
                  <a href="/dashboard/connected-accounts" className="text-blue-400 hover:underline">
                    Connected Accounts
                  </a>
                  .
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Post Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {postTypeOptions.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, post_type: type.value })}
                      className={`px-4 py-3 rounded-lg border transition-colors text-left ${
                        formData.post_type === type.value
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-black border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="font-medium text-sm">{type.label}</div>
                      <div className="text-xs opacity-75 mt-0.5">{type.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Media (optional)
                </label>
                <div className="space-y-2">
                  <label className="flex items-center justify-center gap-2 w-full px-4 py-8 bg-black border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Upload className="w-5 h-5" />
                    <span>Click to upload images or videos</span>
                  </label>
                  {selectedFiles.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedFiles.map((file, index) => {
                        const isVideo = file.type.startsWith('video/');
                        const previewUrl = !isVideo ? URL.createObjectURL(file) : null;
                        return (
                          <div
                            key={index}
                            className="relative bg-gray-800 rounded-lg p-2 flex items-center gap-2"
                          >
                            <div className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                              {isVideo ? (
                                <Video className="w-6 h-6 text-gray-400" />
                              ) : previewUrl ? (
                                <img
                                  src={previewUrl}
                                  alt={file.name}
                                  className="w-full h-full object-cover rounded"
                                />
                              ) : (
                                <ImageIcon className="w-6 h-6 text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-300 truncate">{file.name}</p>
                              <p className="text-xs text-gray-500">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Upload images or videos. We'll auto-format them per platform.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Schedule for later (optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_for}
                  onChange={(e) => setFormData({ ...formData, scheduled_for: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={new Date().toISOString().slice(0, 16)}
                />
                <div className="text-xs text-gray-400 mt-1">
                  Leave empty to save as draft
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={formData.platforms.length === 0 || posting || uploading}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading
                    ? 'Uploading...'
                    : posting
                    ? editingPost ? 'Updating...' : 'Saving...'
                    : editingPost
                    ? 'Update Post'
                    : formData.scheduled_for
                    ? 'Schedule Post'
                    : 'Save as Draft'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
