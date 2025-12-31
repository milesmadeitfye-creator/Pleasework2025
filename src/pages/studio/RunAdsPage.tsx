import { useState, useEffect } from 'react';
import { Upload, Sparkles, TrendingUp, Users, Mail, ChevronRight, CheckCircle, Zap, Bug } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../../contexts/AuthContext';
import { uploadMedia } from '../../lib/uploadMedia';
import { AdsDebugPanel } from '../../components/ads/AdsDebugPanel';
import { setAdsDebugLastRun } from '../../utils/adsDebugBus';
import { sanitizeForDebug } from '../../utils/sanitizeForDebug';

interface Creative {
  id: string;
  public_url: string;
  caption?: string;
  hook_strength?: number;
  analysis_complete: boolean;
  suggested_captions?: string[];
}

type AdGoal = 'promote_song' | 'grow_followers' | 'capture_fans';
type AutomationMode = 'assist' | 'guided' | 'autonomous';
type NotificationMethod = 'sms' | 'email';

const VIBES = [
  { value: 'girls_women', label: 'Girls / Women' },
  { value: 'guys', label: 'Guys' },
  { value: 'party', label: 'Party' },
  { value: 'chill_aesthetic', label: 'Chill / Aesthetic' },
  { value: 'underground_street', label: 'Underground / Street' },
  { value: 'mainstream_pop', label: 'Mainstream / Pop' },
  { value: 'soft_emotional', label: 'Soft / Emotional' },
  { value: 'aggressive_hype', label: 'Aggressive / Hype' },
];

export default function RunAdsPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [launching, setLaunching] = useState(false);

  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<AdGoal>('promote_song');
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [dailyBudget, setDailyBudget] = useState(20);
  const [automationMode, setAutomationMode] = useState<AutomationMode>('guided');
  const [notificationMethod, setNotificationMethod] = useState<NotificationMethod>('email');
  const [notificationPhone, setNotificationPhone] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [managerModeEnabled, setManagerModeEnabled] = useState(true);

  const [smartLinks, setSmartLinks] = useState<any[]>([]);
  const [selectedSmartLink, setSelectedSmartLink] = useState<string>('');

  const [launchResult, setLaunchResult] = useState<any>(null);

  // Debug panel state
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugPayload, setDebugPayload] = useState<any>(null);
  const [debugResponse, setDebugResponse] = useState<any>(null);
  const [debugMetaStatus, setDebugMetaStatus] = useState<any>(null);
  const [debugTiming, setDebugTiming] = useState<{ start?: number; end?: number }>({});

  const debugEnabled =
    debugOpen ||
    new URLSearchParams(window.location.search).get('debug')?.includes('ads') ||
    localStorage.getItem('ghoste_debug_ads') === '1';

  useEffect(() => {
    if (user && selectedGoal === 'promote_song') {
      loadSmartLinks();
    }
  }, [user, selectedGoal]);

  const loadSmartLinks = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('smart_links')
      .select('id, slug, title')
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    setSmartLinks(data || []);
    if (data && data.length > 0) {
      setSelectedSmartLink(data[0].id);
    }
  };

  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);

    try {
      const videoUrl = await uploadMedia(file, 'ad-creatives');

      const video = document.createElement('video');
      video.src = videoUrl;
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/.netlify/functions/run-ads-upload-creative', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          file_url: videoUrl,
          creative_type: 'video',
          duration_seconds: video.duration,
          file_size_bytes: file.size,
          mime_type: file.type,
          width: video.videoWidth,
          height: video.videoHeight,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        setCreatives([...creatives, json.creative]);
        analyzeCreative(json.creative.id);
      }
    } catch (err) {
      console.error('[RunAds] Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const analyzeCreative = async (creative_id: string) => {
    setAnalyzing(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) return;

      const res = await fetch('/.netlify/functions/run-ads-analyze-creative', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ creative_id }),
      });

      const json = await res.json();

      if (json.ok) {
        setCreatives(prev =>
          prev.map(c =>
            c.id === creative_id
              ? {
                  ...c,
                  hook_strength: json.analysis.hook_strength,
                  analysis_complete: true,
                  suggested_captions: json.analysis.suggested_captions,
                }
              : c
          )
        );
      }
    } catch (err) {
      console.error('[RunAds] Analysis error:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;

    setLaunching(true);
    const startTime = Date.now();
    setDebugTiming({ start: startTime });

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) throw new Error('Not authenticated');

      // Find the full smart link object for payload
      const smartLinkObj = smartLinks.find(link => link.id === selectedSmartLink);
      const smartLinkUrl = smartLinkObj?.destination_url || (smartLinkObj?.slug ? `https://ghoste.one/l/${smartLinkObj.slug}` : undefined);

      // Capture debug data BEFORE sending
      const payload = {
        ad_goal: selectedGoal,
        daily_budget_cents: dailyBudget * 100,
        automation_mode: automationMode,
        creative_ids: creatives.map(c => c.id),
        smart_link_id: selectedGoal === 'promote_song' ? selectedSmartLink : undefined,
        smart_link_slug: selectedGoal === 'promote_song' && smartLinkObj ? smartLinkObj.slug : undefined,
        destination_url: selectedGoal === 'promote_song' ? smartLinkUrl : undefined,
        vibe_constraints: selectedVibes,
        notification_method: notificationMethod,
        notification_phone: notificationMethod === 'sms' ? notificationPhone : undefined,
        notification_email: notificationMethod === 'email' ? notificationEmail : undefined,
        manager_mode_enabled: managerModeEnabled,
      };

      setDebugPayload(payload);
      if (smartLinkObj) {
        setDebugMetaStatus({ selectedSmartLink: smartLinkObj });
      }

      const res = await fetch('/.netlify/functions/run-ads-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      const endTime = Date.now();
      setDebugTiming({ start: startTime, end: endTime });

      // Capture debug response
      setDebugResponse({
        status: res.status,
        ok: res.ok,
        json,
      });

      // Push to debug bus (sanitized)
      setAdsDebugLastRun({
        at: new Date().toISOString(),
        label: 'publish',
        request: sanitizeForDebug(payload),
        response: sanitizeForDebug(json),
        status: res.status,
        ok: res.ok,
      });

      if (json.ok) {
        setLaunchResult(json);
        setStep(5);
      } else {
        // Handle specific error codes
        let errorMessage = json.error || 'Failed to create campaign';

        if (json.code === 'SMART_LINK_NOT_FOUND' || json.error?.includes('Smart link')) {
          errorMessage = 'Select a valid Smart Link before publishing.';
        }

        console.error('[RunAds] Submit failed:', errorMessage);
        alert(errorMessage); // Simple error display
      }
    } catch (err: any) {
      console.error('[RunAds] Submit error:', err);
      const errorMessage = err.message || 'Failed to create campaign';
      const endTime = Date.now();
      setDebugTiming({ start: startTime, end: endTime });
      const errorResponse = { error: errorMessage, message: err.message, stack: err.stack };
      setDebugResponse({
        status: 0,
        ok: false,
        json: errorResponse,
      });

      // Push error to debug bus (sanitized)
      setAdsDebugLastRun({
        at: new Date().toISOString(),
        label: 'publish',
        request: sanitizeForDebug(debugPayload || {}),
        response: sanitizeForDebug(errorResponse),
        status: 0,
        ok: false,
      });

      alert(errorMessage);
    } finally {
      setLaunching(false);
    }
  };

  const getGoalIcon = (goal: AdGoal) => {
    switch (goal) {
      case 'promote_song': return <TrendingUp className="w-6 h-6" />;
      case 'grow_followers': return <Users className="w-6 h-6" />;
      case 'capture_fans': return <Mail className="w-6 h-6" />;
    }
  };

  const getGoalLabel = (goal: AdGoal) => {
    switch (goal) {
      case 'promote_song': return 'Promote Song';
      case 'grow_followers': return 'Grow Followers';
      case 'capture_fans': return 'Capture Fans';
    }
  };

  const getModeIcon = (mode: AutomationMode) => {
    switch (mode) {
      case 'assist': return '🛠️';
      case 'guided': return '🎯';
      case 'autonomous': return '🤖';
    }
  };

  const getModeLabel = (mode: AutomationMode) => {
    switch (mode) {
      case 'assist': return 'Assist Mode';
      case 'guided': return 'Guided Mode';
      case 'autonomous': return 'Autonomous Mode';
    }
  };

  const getModeDescription = (mode: AutomationMode) => {
    switch (mode) {
      case 'assist': return 'Manual control with AI insights';
      case 'guided': return 'AI suggests actions for your approval';
      case 'autonomous': return 'AI automatically scales within budget caps';
    }
  };

  const copyDebugBlob = () => {
    const blob = {
      payload: debugPayload,
      response: debugResponse,
      metaStatus: debugMetaStatus,
      timing: debugTiming,
      smartLink: smartLinks.find(link => link.id === selectedSmartLink),
    };
    navigator.clipboard.writeText(JSON.stringify(blob, null, 2));
    alert('Debug data copied to clipboard');
  };

  return (
    <div className="min-h-screen bg-[#0A0F29] p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Run Ads</h1>
              <p className="text-gray-400">
                Upload videos, select a goal, and let Ghoste AI build and manage your campaign
              </p>
            </div>
            <button
              onClick={() => {
                const newValue = !debugOpen;
                setDebugOpen(newValue);
                localStorage.setItem('ghoste_debug_ads', newValue ? '1' : '0');
              }}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                debugEnabled
                  ? 'bg-yellow-500/20 text-yellow-400 border-2 border-yellow-500'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
              }`}
              title="Toggle debug panel"
            >
              <Bug className="w-5 h-5" />
              Debug
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step >= s
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                    : 'bg-gray-800 text-gray-500'
                }`}
              >
                {s}
              </div>
              {s < 4 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    step > s ? 'bg-gradient-to-r from-blue-500 to-purple-500' : 'bg-gray-800'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-4">Upload Creatives</h2>
            <p className="text-gray-400 mb-6">
              Upload videos for your ad campaign. AI will analyze hook strength and pacing.
            </p>

            <div className="space-y-4 mb-6">
              {creatives.map((creative) => (
                <div
                  key={creative.id}
                  className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-lg"
                >
                  <video
                    src={creative.public_url}
                    className="w-24 h-24 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-gray-400 mb-1">Video uploaded</p>
                    {creative.analysis_complete ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-green-400">
                          Hook Strength: {creative.hook_strength}/100
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
                        <span className="text-sm text-blue-400">Analyzing...</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <label className="block">
              <div className="border-2 border-dashed border-gray-700 hover:border-gray-600 rounded-xl p-8 text-center cursor-pointer transition-colors">
                <Upload className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                <p className="text-white font-semibold mb-1">
                  {uploading ? 'Uploading...' : 'Upload Video'}
                </p>
                <p className="text-sm text-gray-400">
                  MP4, MOV, or WebM up to 100MB
                </p>
              </div>
              <input
                type="file"
                accept="video/*"
                onChange={handleUploadVideo}
                disabled={uploading || analyzing}
                className="hidden"
              />
            </label>

            <button
              onClick={() => setStep(2)}
              disabled={creatives.length === 0 || analyzing}
              className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Next: Select Goal
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-4">Select Campaign Goal</h2>
            <p className="text-gray-400 mb-6">
              Choose what you want to achieve with this campaign
            </p>

            <div className="grid grid-cols-1 gap-4 mb-6">
              {(['promote_song', 'grow_followers', 'capture_fans'] as AdGoal[]).map((goal) => (
                <button
                  key={goal}
                  onClick={() => setSelectedGoal(goal)}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    selectedGoal === goal
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-3 rounded-lg ${
                        selectedGoal === goal ? 'bg-blue-500/20' : 'bg-gray-800'
                      }`}
                    >
                      {getGoalIcon(goal)}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1">
                        {getGoalLabel(goal)}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {goal === 'promote_song' && 'Drive streams and engagement'}
                        {goal === 'grow_followers' && 'Build your audience on social'}
                        {goal === 'capture_fans' && 'Collect emails and phone numbers'}
                      </p>
                    </div>
                    {selectedGoal === goal && (
                      <CheckCircle className="w-6 h-6 text-blue-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {selectedGoal === 'promote_song' && smartLinks.length > 0 && (
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Select Smart Link
                </label>
                <select
                  value={selectedSmartLink}
                  onChange={(e) => setSelectedSmartLink(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                  {smartLinks.map((link) => (
                    <option key={link.id} value={link.id}>
                      {link.title || link.slug}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Next: Select Vibe
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-4">Select Vibe (Optional)</h2>
            <p className="text-gray-400 mb-6">
              Choose vibes that match your music. This helps AI select the right audience and creative style.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {VIBES.map((vibe) => (
                <button
                  key={vibe.value}
                  onClick={() => {
                    if (selectedVibes.includes(vibe.value)) {
                      setSelectedVibes(selectedVibes.filter(v => v !== vibe.value));
                    } else {
                      setSelectedVibes([...selectedVibes, vibe.value]);
                    }
                  }}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    selectedVibes.includes(vibe.value)
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{vibe.label}</span>
                    {selectedVibes.includes(vibe.value) && (
                      <CheckCircle className="w-5 h-5 text-purple-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-6">
              <p className="text-sm text-gray-300">
                💡 <strong className="text-blue-400">AI will use vibes to:</strong> Select creative angles,
                caption tone, and platform delivery strategy. This does NOT limit your audience - it guides creative style.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Next: Budget & Notifications
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-4">Budget & Notifications</h2>
            <p className="text-gray-400 mb-6">
              Set your daily budget and choose how much control AI has
            </p>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Daily Budget: ${dailyBudget}
              </label>
              <input
                type="range"
                min="5"
                max="200"
                step="5"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>$5</span>
                <span>$200</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={managerModeEnabled}
                  onChange={(e) => setManagerModeEnabled(e.target.checked)}
                  className="w-5 h-5"
                />
                <span className="text-sm font-semibold text-gray-300">
                  Enable AI Manager Mode (Recommended)
                </span>
              </label>
              <p className="text-xs text-gray-400 ml-7">
                AI handles everything silently. You only get notified when action is needed:
                spend more, spend less, or make more creatives.
              </p>
            </div>

            {managerModeEnabled && (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-300 mb-3">
                    How should I notify you?
                  </label>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <button
                      onClick={() => setNotificationMethod('sms')}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        notificationMethod === 'sms'
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">SMS (Text)</span>
                        {notificationMethod === 'sms' && (
                          <CheckCircle className="w-5 h-5 text-purple-400" />
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => setNotificationMethod('email')}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        notificationMethod === 'email'
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">Email</span>
                        {notificationMethod === 'email' && (
                          <CheckCircle className="w-5 h-5 text-purple-400" />
                        )}
                      </div>
                    </button>
                  </div>

                  {notificationMethod === 'sms' && (
                    <input
                      type="tel"
                      placeholder="Enter phone number (e.g., +1234567890)"
                      value={notificationPhone}
                      onChange={(e) => setNotificationPhone(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    />
                  )}

                  {notificationMethod === 'email' && (
                    <input
                      type="email"
                      placeholder="Enter email address"
                      value={notificationEmail}
                      onChange={(e) => setNotificationEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    />
                  )}
                </div>
              </>
            )}

            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-6">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-400 mb-1">
                    AI Will Automatically:
                  </p>
                  <ul className="text-xs text-gray-300 space-y-1">
                    <li>• Build Meta campaign with Sales objective</li>
                    <li>• Select best platform based on creative analysis</li>
                    <li>• Wire up event tracking (Ghoste pixel only)</li>
                    <li>• Monitor performance with Teacher Score</li>
                    <li>• {automationMode === 'autonomous' ? 'Auto-scale within budget caps' : 'Suggest optimizations'}</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={launching}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {launching ? (
                  <>
                    <Sparkles className="w-5 h-5 animate-pulse" />
                    Launching Campaign...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    Launch Campaign
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 5 && launchResult && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500/20 border-2 border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Campaign Launched!</h2>
              <p className="text-gray-400">
                Your ads are now being built and will go live shortly
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-gray-800/50 rounded-lg">
                <p className="text-sm text-gray-400 mb-1">Campaign Type</p>
                <p className="text-lg font-semibold text-white capitalize">
                  {launchResult.campaign_type?.replace('_', ' ')}
                </p>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-lg">
                <p className="text-sm text-gray-400 mb-1">AI Reasoning</p>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {launchResult.reasoning}
                </p>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-lg">
                <p className="text-sm text-gray-400 mb-2">Guardrails Applied</p>
                <ul className="space-y-1.5">
                  {launchResult.guardrails_applied.map((g: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                      <span className="text-yellow-400 mt-0.5">⚠️</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <button
              onClick={() => window.location.href = '/studio/campaigns'}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg transition-colors"
            >
              View Campaign Dashboard
            </button>
          </div>
        )}
      </div>

      {debugEnabled && (
        <AdsDebugPanel
          metaStatus={debugMetaStatus}
          smartLink={smartLinks.find(link => link.id === selectedSmartLink)}
          payload={debugPayload}
          response={debugResponse}
          timing={debugTiming}
          onCopy={copyDebugBlob}
        />
      )}
    </div>
  );
}
