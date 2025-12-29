import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/lib/supabase.client';
import { User, Mail, Calendar, CreditCard, AlertTriangle, Check, X, Phone, Shield, Wrench } from 'lucide-react';
import { useToast } from './Toast';
import PhoneInput from './common/PhoneInput';
import HealthzDebug from './HealthzDebug';
import ActivityPingV2Debug from './ActivityPingV2Debug';
import { normalizeToE164 } from '../lib/phoneUtils';

export default function AccountSettings() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState({
    email: '',
    created_at: '',
  });
  const [metaPixelId, setMetaPixelId] = useState('');
  const [metaConversionsToken, setMetaConversionsToken] = useState('');
  const [tiktokPixelId, setTiktokPixelId] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('1');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [savingPixel, setSavingPixel] = useState(false);
  const [savingConversions, setSavingConversions] = useState(false);
  const [savingTikTok, setSavingTikTok] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [saving2FA, setSaving2FA] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        email: user.email || '',
        created_at: user.created_at || '',
      });
      fetchPixelData();
    }
  }, [user]);

  const fetchPixelData = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('meta_pixel_id, meta_conversions_token, tiktok_pixel_id, phone, phone_country_code, phone_e164, sms_opt_in, two_factor_enabled')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[AccountSettings] Error fetching pixel data:', error);
      return;
    }

    if (data) {
      setMetaPixelId(data.meta_pixel_id || '');
      setMetaConversionsToken(data.meta_conversions_token || '');
      setTiktokPixelId(data.tiktok_pixel_id || '');

      // Parse phone - prefer phone_e164, fall back to phone
      const fullPhone = data.phone_e164 || data.phone || '';
      if (fullPhone.startsWith('+')) {
        const match = fullPhone.match(/^\+(\d{1,3})(\d+)$/);
        if (match) {
          setPhoneCountryCode(match[1]);
          setPhone(match[2]);
        }
      }

      setSmsOptIn(data.sms_opt_in || false);
      setTwoFactorEnabled(data.two_factor_enabled || false);
    }
  };

  const saveMetaPixelId = async () => {
    if (!user?.id) return;

    const pixelValue = metaPixelId.trim();
    if (pixelValue && !/^\d+$/.test(pixelValue)) {
      showToast('Invalid Meta Pixel ID. Must be numeric.', 'error');
      return;
    }

    setSavingPixel(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/.netlify/functions/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meta_pixel_id: pixelValue }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save');
      }

      if (data.profile?.meta_pixel_id !== undefined) {
        setMetaPixelId(data.profile.meta_pixel_id || '');
      }

      showToast('Meta Pixel ID saved successfully!', 'success');
    } catch (err: any) {
      console.error('Error saving Meta Pixel ID:', err);
      showToast('Error saving Meta Pixel ID: ' + err.message, 'error');
    } finally {
      setSavingPixel(false);
    }
  };

  const saveMetaConversionsToken = async () => {
    if (!user?.id) return;

    setSavingConversions(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/.netlify/functions/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meta_conversions_token: metaConversionsToken.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save');
      }

      if (data.profile?.meta_conversions_token !== undefined) {
        setMetaConversionsToken(data.profile.meta_conversions_token || '');
      }

      showToast('Meta Conversions API token saved successfully!', 'success');
    } catch (err: any) {
      console.error('Error saving Meta Conversions token:', err);
      showToast('Error saving token: ' + err.message, 'error');
    } finally {
      setSavingConversions(false);
    }
  };

  const saveTikTokPixelId = async () => {
    if (!user?.id) return;

    const pixelValue = tiktokPixelId.trim();

    setSavingTikTok(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/.netlify/functions/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tiktok_pixel_id: pixelValue }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save');
      }

      if (data.profile?.tiktok_pixel_id !== undefined) {
        setTiktokPixelId(data.profile.tiktok_pixel_id || '');
      }

      showToast('TikTok Pixel ID saved successfully!', 'success');
    } catch (err: any) {
      console.error('Error saving TikTok Pixel ID:', err);
      showToast('Error saving TikTok Pixel ID: ' + err.message, 'error');
    } finally {
      setSavingTikTok(false);
    }
  };

  const savePhone = async () => {
    if (!user?.id) return;

    // If SMS opt-in is enabled, validate phone
    if (smsOptIn && (!phone || phone.length < 10)) {
      showToast('Phone number is required when SMS opt-in is enabled', 'error');
      return;
    }

    // If phone is provided, validate it
    let phoneE164: string | null = null;
    if (phone && phone.trim()) {
      const fullPhoneInput = `+${phoneCountryCode}${phone}`;
      const validation = normalizeToE164(fullPhoneInput, phoneCountryCode);

      if (!validation.isValid) {
        showToast(validation.error || 'Invalid phone number', 'error');
        return;
      }

      phoneE164 = validation.e164!;
    }

    // If SMS opt-in but no phone, prevent
    if (smsOptIn && !phoneE164) {
      showToast('Phone number is required for SMS opt-in', 'error');
      return;
    }

    setSavingPhone(true);

    try {
      // Update user_profiles with phone and SMS opt-in data
      const updateData: any = {
        phone: phoneE164,
        phone_e164: phoneE164,
        phone_country_code: phoneCountryCode,
        sms_opt_in: smsOptIn && !!phoneE164,
      };

      // Set opt-in timestamp and source if newly opting in
      if (smsOptIn && phoneE164) {
        updateData.sms_opt_in_at = new Date().toISOString();
        updateData.sms_opt_in_source = 'settings';
      } else if (!smsOptIn) {
        // If opting out, clear timestamp
        updateData.sms_opt_in_at = null;
        updateData.sms_opt_in_source = null;
      }

      const { error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      // Also update auth metadata
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase.auth.updateUser({
          data: {
            phone: phoneE164,
            sms_opt_in: smsOptIn && !!phoneE164,
          },
        });
      }

      showToast('Phone & SMS preferences saved!', 'success');
    } catch (err: any) {
      console.error('Error saving phone:', err);
      showToast('Error saving phone & SMS preferences: ' + err.message, 'error');
    } finally {
      setSavingPhone(false);
    }
  };

  const toggle2FA = async (enabled: boolean) => {
    if (!user?.id) return;

    // Can't enable 2FA without phone
    if (enabled && !phone) {
      showToast('Please add a phone number first to enable 2FA', 'error');
      return;
    }

    setSaving2FA(true);

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ two_factor_enabled: enabled })
        .eq('id', user.id);

      if (error) throw error;

      setTwoFactorEnabled(enabled);
      showToast(enabled ? '2FA enabled!' : '2FA disabled', 'success');
    } catch (err: any) {
      console.error('Error toggling 2FA:', err);
      showToast('Error updating 2FA: ' + err.message, 'error');
    } finally {
      setSaving2FA(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      alert('Your subscription has been cancelled. You will retain access until the end of your billing period.');
      setShowCancelModal(false);
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      alert('Failed to cancel subscription. Please try again or contact support.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <HealthzDebug />
      <ActivityPingV2Debug />

      <div>
        <h2 className="text-2xl font-bold mb-2">Account Settings</h2>
        <p className="text-gray-400">Manage your account information and subscription</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-400" />
          Account Information
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-black rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-gray-400" />
              <div>
                <div className="text-sm text-gray-400">Email Address</div>
                <div className="font-medium">{profile.email}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-black rounded-lg">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-400" />
              <div>
                <div className="text-sm text-gray-400">Member Since</div>
                <div className="font-medium">
                  {profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-black rounded-lg">
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-gray-400 mt-1" />
              <div className="flex-1">
                <label className="block text-sm text-gray-400 mb-2">Phone Number</label>
                <PhoneInput
                  value={phone}
                  countryCode={phoneCountryCode}
                  onChangePhone={setPhone}
                  onChangeCountryCode={setPhoneCountryCode}
                  className="mb-2"
                />
                <p className="text-xs text-neutral-500 mb-3">
                  Required for Ghoste AI Mobile sync and 2FA.
                </p>

                {/* SMS Opt-In Checkbox */}
                <div className="mb-4 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smsOptIn}
                      onChange={(e) => setSmsOptIn(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-neutral-700 rounded bg-neutral-900"
                    />
                    <span className="text-sm text-gray-300">
                      Text me updates and tips about Ghoste One
                    </span>
                  </label>

                  {/* SMS Compliance Disclosure */}
                  {smsOptIn && (
                    <div className="pl-6 text-xs text-gray-500 leading-relaxed">
                      By opting in, you agree to receive recurring automated marketing texts from Ghoste One.
                      Consent is not a condition of purchase. Reply STOP to unsubscribe, HELP for help.
                      Msg & data rates may apply.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={savePhone}
                  disabled={savingPhone}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingPhone ? 'Saving...' : 'Save Phone & SMS Preferences'}
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 bg-black rounded-lg">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-gray-400 mt-1" />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-1">Two-Factor Authentication (2FA)</label>
                <p className="text-xs text-neutral-500 mb-3">
                  Use a text message code in addition to your password when logging in.
                </p>
                {!phone ? (
                  <p className="text-xs text-amber-400 mb-3">Add a phone number first to enable 2FA.</p>
                ) : null}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={twoFactorEnabled}
                    onChange={(e) => toggle2FA(e.target.checked)}
                    disabled={!phone || saving2FA}
                    className="w-4 h-4 rounded border-neutral-700 bg-neutral-900/60 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-gray-300">
                    {saving2FA ? 'Updating...' : 'Enable SMS 2FA'}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl border border-blue-500/50 p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-lg">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">Your Subscription</h3>
              <p className="text-blue-100 mb-1">Pro Plan - $19/month</p>
              <p className="text-sm text-blue-200">Unlimited smart links, analytics, and campaigns</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-blue-200 mb-1">Status</div>
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white font-semibold rounded-lg">
              <Check className="w-4 h-4" />
              Active
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-sm text-blue-200 mb-1">Next Billing Date</div>
            <div className="font-semibold text-white">
              {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
          </div>

          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-sm text-blue-200 mb-1">Payment Method</div>
            <div className="font-semibold text-white">•••• •••• •••• 4242</div>
          </div>

          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-sm text-blue-200 mb-1">Amount</div>
            <div className="font-semibold text-white">$19.00</div>
          </div>
        </div>

        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors">
            Update Payment Method
          </button>
          <button className="px-4 py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors">
            View Billing History
          </button>
          <button
            onClick={() => setShowCancelModal(true)}
            className="px-4 py-2 bg-red-500/20 text-red-300 font-semibold rounded-lg hover:bg-red-500/30 transition-colors ml-auto"
          >
            Cancel Subscription
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-400" />
          Marketing & Analytics
        </h3>
        <div className="space-y-4">
          <div className="p-4 bg-black rounded-lg">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Meta Pixel ID
            </label>
            <input
              type="text"
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
              placeholder="e.g. 123456789012345"
              className="w-full rounded bg-neutral-900/60 border border-neutral-700 px-3 py-2 text-sm mb-2"
            />
            <p className="text-xs text-neutral-500 mb-3">
              Track page views and platform-specific link clicks (Spotify, Apple Music, etc.)
            </p>
            <button
              type="button"
              onClick={saveMetaPixelId}
              disabled={savingPixel}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingPixel ? 'Saving...' : 'Save Pixel ID'}
            </button>
          </div>

          <div className="p-4 bg-black rounded-lg">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Meta Conversions API Token
            </label>
            <input
              type="text"
              value={metaConversionsToken}
              onChange={(e) => setMetaConversionsToken(e.target.value)}
              placeholder="Enter your Conversions API access token"
              className="w-full rounded bg-neutral-900/60 border border-neutral-700 px-3 py-2 text-sm mb-2"
            />
            <p className="text-xs text-neutral-500 mb-3">
              Server-side tracking for improved accuracy and iOS 14+ compatibility
            </p>
            <button
              type="button"
              onClick={saveMetaConversionsToken}
              disabled={savingConversions}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingConversions ? 'Saving...' : 'Save API Token'}
            </button>
          </div>

          <div className="p-4 bg-black rounded-lg">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              TikTok Pixel ID
            </label>
            <input
              type="text"
              value={tiktokPixelId}
              onChange={(e) => setTiktokPixelId(e.target.value)}
              placeholder="e.g. C9ABCD1234567890"
              className="w-full rounded bg-neutral-900/60 border border-neutral-700 px-3 py-2 text-sm mb-2"
            />
            <p className="text-xs text-neutral-500 mb-3">
              Track TikTok ad conversions on your smart link pages
            </p>
            <button
              type="button"
              onClick={saveTikTokPixelId}
              disabled={savingTikTok}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingTikTok ? 'Saving...' : 'Save Pixel ID'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-blue-400" />
          Legal & Policies
        </h3>
        <div className="space-y-3">
          <a
            href="/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-black rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <span className="text-sm text-neutral-300">Privacy Policy</span>
            <span className="text-xs text-neutral-500">View →</span>
          </a>
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-black rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <span className="text-sm text-neutral-300">Terms of Service</span>
            <span className="text-xs text-neutral-500">View →</span>
          </a>
          <a
            href="/data-deletion"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-black rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <span className="text-sm text-neutral-300">Data Deletion Instructions</span>
            <span className="text-xs text-neutral-500">View →</span>
          </a>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-sky-400" />
          Internal Tools
        </h3>
        <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-lg">
          <div className="text-sm text-gray-300 mb-2">
            Internal tools have been moved to <a href="/studio/getting-started" className="text-sky-400 hover:text-sky-300 underline font-medium">Ghoste Studio → Getting Started</a>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-lg font-semibold mb-4 text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Danger Zone
        </h3>
        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium mb-1">Delete Account</div>
                <div className="text-sm text-gray-400">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </div>
              </div>
              <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors whitespace-nowrap ml-4">
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-xl font-bold">Cancel Subscription?</h3>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                Are you sure you want to cancel your subscription? You'll lose access to:
              </p>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <X className="w-4 h-4 text-red-400" />
                  Unlimited smart links
                </li>
                <li className="flex items-center gap-2">
                  <X className="w-4 h-4 text-red-400" />
                  Advanced analytics
                </li>
                <li className="flex items-center gap-2">
                  <X className="w-4 h-4 text-red-400" />
                  Ad campaign management
                </li>
                <li className="flex items-center gap-2">
                  <X className="w-4 h-4 text-red-400" />
                  Priority support
                </li>
              </ul>
              <p className="text-sm text-gray-400 mt-4">
                You'll retain access until {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
