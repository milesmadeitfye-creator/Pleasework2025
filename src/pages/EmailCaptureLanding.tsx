import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Mail, Check, AlertCircle } from 'lucide-react';
import { trackLead } from '../lib/ownerMetaPixel';

interface EmailCaptureData {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  image_path?: string | null;
}

type SubmissionStatus = 'idle' | 'loading' | 'success' | 'not_found' | 'error';

export default function EmailCaptureLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<EmailCaptureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<SubmissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEmailCapture() {
      if (!slug) return;

      try {
        const { data: emailCapture, error: fetchError } = await supabase
          .from('email_capture_links')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (!emailCapture) {
          setFetchError('This email signup link is no longer active');
        } else {
          setData(emailCapture);
        }
      } catch (err: any) {
        console.error('Error fetching email capture:', err);
        setFetchError(err.message || 'Failed to load email capture page');
      } finally {
        setLoading(false);
      }
    }

    fetchEmailCapture();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setErrorMessage('Please enter your email');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    try {
      const res = await fetch('/.netlify/functions/email_capture_submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          email: email.trim(),
          name: name.trim() || null,
          phone: phone.trim() || null,
        }),
      });

      const text = await res.text();
      console.log('📡 email_capture_submit response:', text);

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Invalid response from server');
      }

      // Log full response for debugging
      console.error('📋 Full response object:', json);
      if (json?.supabase_error) {
        console.error('🔴 Supabase error details:', json.supabase_error);
      }
      if (json?.debug) {
        console.error('🐛 Debug info:', json.debug);
      }

      // Check for specific error codes
      if (!res.ok) {
        if (json?.error_code === 'EMAIL_CAPTURE_NOT_FOUND') {
          setStatus('not_found');
          setErrorMessage('This email signup link is no longer active');
        } else if (json?.error_code === 'CONTACT_SAVE_FAILED') {
          setStatus('error');
          const errorDetails = json.supabase_error
            ? ` (${json.supabase_error.code}: ${json.supabase_error.message})`
            : '';
          setErrorMessage(`Failed to save your information${errorDetails}. Please try again.`);
        } else if (json?.error_code === 'INVALID_EMAIL') {
          setStatus('error');
          setErrorMessage('Please enter a valid email address');
        } else {
          setStatus('error');
          setErrorMessage(json?.error || 'Something went wrong. Please try again.');
        }
        return;
      }

      if (json.success) {
        console.log('✅ Email captured successfully:', json.contact);

        // Track lead conversion
        trackLead('Email Capture');

        // Fire-and-forget: sync to new fan_contacts tracking
        if (data?.user_id) {
          try {
            fetch("/.netlify/functions/add-fan-contact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: data.user_id,
                email: email.trim(),
                name: name.trim() || null,
                source: "email_capture",
              }),
            });
          } catch (err) {
            console.error("[EmailCapture] Failed to sync fan contact", err);
          }
        }

        setStatus('success');
        setEmail('');
        setName('');
        setPhone('');
        return;
      }

      // Fallback if response doesn't have success flag
      setStatus('error');
      setErrorMessage(json?.error || 'Something went wrong. Please try again.');
    } catch (err: any) {
      console.error('❌ email_capture_submit error:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Network error. Please check your connection.');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  // Not found state (initial fetch failed)
  if (fetchError || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Link Not Available</h1>
          <p className="text-gray-400">
            {fetchError || 'This email signup link is no longer active or does not exist.'}
          </p>
        </div>
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Powered by <span className="text-white font-semibold">Ghoste</span>
          </p>
        </div>
      </div>
    );
  }

  // Link not found after submission (should be rare, means it was deleted during submission)
  if (status === 'not_found') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">No Longer Active</h1>
          <p className="text-gray-400">
            {errorMessage || 'This email signup link is no longer active.'}
          </p>
        </div>
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Powered by <span className="text-white font-semibold">Ghoste</span>
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">You're In!</h2>
            <p className="text-gray-400 mb-6">
              Thanks for signing up! You'll now get updates from {data.title}.
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Sign Up Another Email
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Powered by <span className="text-white font-semibold">Ghoste</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main form (idle or error state)
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
          {/* Banner Image */}
          {data.image_path && (
            <div className="relative h-64 bg-gray-900">
              <img
                src={supabase.storage.from('ghoste_link_images').getPublicUrl(data.image_path).data.publicUrl}
                alt={data.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Hide broken images gracefully
                  const imgElement = e.currentTarget;
                  const parentDiv = imgElement.parentElement;
                  if (parentDiv) {
                    parentDiv.style.display = 'none';
                  }
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent"></div>
            </div>
          )}

          {/* Content */}
          <div className="p-8 md:p-12">
            <div className="flex items-center gap-2 text-purple-400 mb-4">
              <Mail className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">Join the List</span>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {data.title}
            </h1>

            <p className="text-lg text-gray-300 mb-8">
              Stay updated with exclusive content, early access, and more. Sign up now!
            </p>

            {/* Error Message */}
            {status === 'error' && errorMessage && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{errorMessage}</p>
              </div>
            )}

            {/* Email Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Name <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  disabled={status === 'loading'}
                  className="w-full px-4 py-3 bg-black/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={status === 'loading'}
                  className="w-full px-4 py-3 bg-black/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">
                  Phone Number <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  disabled={status === 'loading'}
                  className="w-full px-4 py-3 bg-black/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={status === 'loading' || !email.trim()}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                    <span>Signing Up...</span>
                  </>
                ) : (
                  'Join Now'
                )}
              </button>
            </form>

            <p className="text-xs text-gray-500 text-center mt-6">
              We respect your privacy. Unsubscribe at any time.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Powered by <span className="text-white font-semibold">Ghoste</span>
          </p>
        </div>
      </div>
    </div>
  );
}
