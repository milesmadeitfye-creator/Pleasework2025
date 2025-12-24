import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function OnboardingEmailPreview() {
  const { user } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [userId, setUserId] = useState<string>('');
  const [useCurrentUser, setUseCurrentUser] = useState(false);

  const handlePreview = () => {
    const effectiveUserId = useCurrentUser ? (user?.id || '') : userId;
    const url = `/.netlify/functions/onboarding-email-preview?step=${step}${effectiveUserId ? `&userId=${effectiveUserId}` : ''}`;
    window.open(url, '_blank');
  };

  const handleQuickPreview = (stepNumber: number) => {
    const effectiveUserId = useCurrentUser ? (user?.id || '') : userId;
    const url = `/.netlify/functions/onboarding-email-preview?step=${stepNumber}${effectiveUserId ? `&userId=${effectiveUserId}` : ''}`;
    window.open(url, '_blank');
  };

  const emailSteps = [
    { step: 1, slug: 'welcome', title: 'Welcome to Ghoste One' },
    { step: 2, slug: 'verify-email', title: 'Confirm your email' },
    { step: 3, slug: 'connect-accounts', title: 'Connect your accounts' },
    { step: 4, slug: 'first-smart-link', title: 'Launch your first smart link' },
    { step: 5, slug: 'email-capture', title: 'Create an email capture link' },
    { step: 6, slug: 'pixel-tracking', title: 'Activate tracking & pixels' },
    { step: 7, slug: 'first-campaign', title: 'Create your first campaign' },
    { step: 8, slug: 'try-ghoste-ai', title: 'Try Ghoste AI' },
    { step: 9, slug: 'smart-link-analytics', title: 'Check your smart link stats' },
    { step: 10, slug: 'presave', title: 'Create a presave link' },
    { step: 11, slug: 'fan-crm', title: 'Organize your fan data' },
    { step: 12, slug: 'wallet-credits', title: 'Check your Ghoste wallet' },
    { step: 13, slug: 'collabs-splits', title: 'Set up your first split' },
    { step: 14, slug: 'invite-team', title: 'Add your team to Ghoste One' },
    { step: 15, slug: 'case-study', title: 'See how other artists use Ghoste' },
    { step: 16, slug: 'upgrade', title: 'See what Ghoste Pro unlocks' },
    { step: 17, slug: 'weekly-checkin', title: 'Weekly Ghoste check-in' },
    { step: 18, slug: 're-engage', title: 'Pick up where you left off' },
    { step: 19, slug: 'power-user', title: 'Become a Ghoste power user' },
    { step: 20, slug: 'feedback', title: 'Give us your honest feedback' },
  ];

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-slate-400">Please log in to access the email preview tool.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Onboarding Email Preview</h1>
          <p className="text-slate-400">
            Preview how each step in the onboarding sequence renders with the Ghoste template.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-1 bg-slate-900 rounded-lg p-6 border border-slate-800">
            <h2 className="text-xl font-semibold mb-4">Preview Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Step Number (1-20)
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={step}
                  onChange={(e) => setStep(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  <input
                    type="checkbox"
                    checked={useCurrentUser}
                    onChange={(e) => setUseCurrentUser(e.target.checked)}
                    className="rounded"
                  />
                  Preview as current user
                </label>
              </div>

              {!useCurrentUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    User ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="Leave empty for generic preview"
                    className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Enter a user ID to personalize the preview
                  </p>
                </div>
              )}

              <button
                onClick={handlePreview}
                className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity"
              >
                Open Preview
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-900 rounded-lg p-6 border border-slate-800">
            <h2 className="text-xl font-semibold mb-4">All Email Steps</h2>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {emailSteps.map((email) => (
                <div
                  key={email.step}
                  className="flex items-center justify-between bg-slate-800/50 p-4 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-sm font-semibold">
                      {email.step}
                    </div>
                    <div>
                      <div className="font-medium">{email.title}</div>
                      <div className="text-xs text-slate-500">{email.slug}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleQuickPreview(email.step)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    Preview
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <h3 className="text-lg font-semibold mb-3">How it works</h3>
          <ul className="space-y-2 text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-sky-500 mt-1">•</span>
              <span>Select a step number (1-20) to preview that specific email in the sequence.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sky-500 mt-1">•</span>
              <span>Optionally provide a user ID to see personalized content (if the template uses it).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sky-500 mt-1">•</span>
              <span>The preview opens in a new tab showing the email exactly as users will receive it.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sky-500 mt-1">•</span>
              <span>No emails are sent during preview - this is for viewing only.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
