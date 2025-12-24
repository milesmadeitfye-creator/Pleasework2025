import { Music2, ArrowLeft, Mail, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-gray-800 bg-black/50 backdrop-blur-lg fixed w-full z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Music2 className="w-8 h-8 text-blue-500" />
              <span className="text-xl font-bold">Ghoste</span>
            </Link>
            <Link
              to="/"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Trash2 className="w-10 h-10 text-red-400" />
            <h1 className="text-4xl sm:text-5xl font-bold">Facebook & Connected Accounts Data Deletion</h1>
          </div>
          <p className="text-gray-400 mb-12">How to request deletion of your Ghoste data and connected platform information</p>

          <div className="space-y-8">
            <section className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-8">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-blue-400" />
                About Data Deletion
              </h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                If you connected your Facebook/Meta account (or other platforms like Instagram, Spotify, Apple Music) to Ghoste and want your data deleted, you can request it at any time. We will honor your request and delete all associated data we have collected from your connected accounts.
              </p>
              <p className="text-gray-300 leading-relaxed">
                This page explains what data is covered, how to request deletion, and what happens after you make a request.
              </p>
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-8">
              <h2 className="text-2xl font-bold text-white mb-4">What Data Is Covered?</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                Data deletion requests cover all information obtained through:
              </p>
              <ul className="space-y-2 text-gray-300 ml-4">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Facebook Login:</strong> Profile information, email address, and authentication tokens</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Meta Marketing API:</strong> Ad account data, campaign information, performance metrics, audience data</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Instagram Graph API:</strong> Profile data, post insights, engagement metrics</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Spotify, Apple Music, TikTok, YouTube:</strong> Artist profiles, streaming stats, analytics data</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Other connected platforms:</strong> Any data obtained through third-party integrations you authorized</span>
                </li>
              </ul>
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-8">
              <h2 className="text-2xl font-bold text-white mb-4">How to Request Data Deletion</h2>
              <p className="text-gray-300 leading-relaxed mb-6">
                To delete your data from Ghoste, send an email to:
              </p>

              <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-lg p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <Mail className="w-6 h-6 text-blue-400" />
                  <a
                    href="mailto:miles@ghostemedia.com?subject=Data%20Deletion%20Request"
                    className="text-xl font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    miles@ghostemedia.com
                  </a>
                </div>
                <p className="text-sm text-gray-400">Subject: Data Deletion Request</p>
              </div>

              <h3 className="text-lg font-semibold text-white mb-3">What to Include in Your Email:</h3>
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-sm font-bold text-blue-400">1</div>
                  <div>
                    <p className="text-white font-medium">Email Associated with Ghoste Account</p>
                    <p className="text-gray-400 text-sm">The email address you used to sign up for Ghoste</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-sm font-bold text-blue-400">2</div>
                  <div>
                    <p className="text-white font-medium">Platforms You Connected</p>
                    <p className="text-gray-400 text-sm">List which platforms you connected (e.g., Facebook, Instagram, Spotify, Apple Music)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-sm font-bold text-blue-400">3</div>
                  <div>
                    <p className="text-white font-medium">Confirmation of Request</p>
                    <p className="text-gray-400 text-sm">State that you want all your data deleted from Ghoste</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-2"><strong className="text-white">Example Email:</strong></p>
                <p className="text-sm text-gray-300 font-mono">
                  To: miles@ghostemedia.com<br />
                  Subject: Data Deletion Request<br />
                  <br />
                  Hello,<br />
                  <br />
                  I would like to request deletion of all my data from Ghoste.<br />
                  <br />
                  My Ghoste account email: your-email@example.com<br />
                  Connected platforms: Facebook, Instagram, Spotify<br />
                  <br />
                  Please confirm once my data has been deleted.<br />
                  <br />
                  Thank you
                </p>
              </div>
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-8">
              <h2 className="text-2xl font-bold text-white mb-4">What Happens After You Request Deletion?</h2>
              <p className="text-gray-300 leading-relaxed mb-6">
                Once we receive your data deletion request, we will:
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-sm font-bold text-green-400">1</span>
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">Acknowledge Your Request</p>
                    <p className="text-gray-400 text-sm">We will confirm receipt of your request within 7 business days</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-sm font-bold text-yellow-400">2</span>
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">Process the Deletion</p>
                    <p className="text-gray-400 text-sm mb-2">Within 30 days of your request, we will:</p>
                    <ul className="text-gray-400 text-sm space-y-1 ml-4">
                      <li>• Delete your account and profile information</li>
                      <li>• Revoke all access tokens for connected platforms (Facebook, Instagram, Spotify, etc.)</li>
                      <li>• Delete stored insights, analytics, and performance data from connected accounts</li>
                      <li>• Remove campaign configurations and ad account linkages</li>
                      <li>• Anonymize or delete any personal information associated with your account</li>
                    </ul>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-400">3</span>
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">Confirm Completion</p>
                    <p className="text-gray-400 text-sm">We will email you once the deletion is complete</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-8">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-yellow-400" />
                Important Notes
              </h2>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-2 h-2 bg-yellow-400 rounded-full mt-2"></div>
                  <span className="leading-relaxed">
                    <strong>Disconnecting vs. Deleting:</strong> If you disconnect Ghoste from Meta (or other platforms) through your platform settings, we will stop collecting new data immediately. However, to delete historical data we've already collected, you must email us with a deletion request.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-2 h-2 bg-yellow-400 rounded-full mt-2"></div>
                  <span className="leading-relaxed">
                    <strong>Legal Retention:</strong> In some cases, we may be required to retain certain data for legal, security, or fraud prevention purposes for up to 90 days after deletion. This data will be securely stored and not used for any other purpose.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-2 h-2 bg-yellow-400 rounded-full mt-2"></div>
                  <span className="leading-relaxed">
                    <strong>Backups:</strong> Data in backup systems may persist for up to 90 days after deletion, but these backups are not accessible for operational use and will be automatically purged according to our retention schedule.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-2 h-2 bg-yellow-400 rounded-full mt-2"></div>
                  <span className="leading-relaxed">
                    <strong>Third-Party Platforms:</strong> Deleting data from Ghoste does not delete data stored directly on third-party platforms (Facebook, Spotify, etc.). To delete data from those platforms, you must contact them directly or use their data deletion tools.
                  </span>
                </li>
              </ul>
            </section>

            <section className="bg-gray-900 border border-gray-800 rounded-xl p-8">
              <h2 className="text-2xl font-bold text-white mb-4">Questions or Need Help?</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                If you have questions about data deletion, our data practices, or need assistance with your request, please contact us:
              </p>
              <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <Mail className="w-5 h-5 text-blue-400" />
                <div>
                  <a
                    href="mailto:miles@ghostemedia.com"
                    className="text-blue-400 hover:text-blue-300 transition-colors font-medium block"
                  >
                    miles@ghostemedia.com
                  </a>
                  <p className="text-sm text-gray-500">We typically respond within 1-2 business days</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm mt-4">
                For more information about how we collect and use your data, please see our{' '}
                <Link to="/privacy-policy" className="text-blue-400 hover:text-blue-300">Privacy Policy</Link>.
              </p>
            </section>
          </div>
        </div>
      </div>

      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Music2 className="w-6 h-6 text-blue-500" />
              <span className="text-lg font-bold">Ghoste</span>
            </div>
            <div className="text-gray-400 text-sm">
              © 2025 Ghoste Media. All rights reserved.
            </div>
            <div className="flex gap-6 text-sm text-gray-400">
              <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
              <Link to="/data-deletion" className="hover:text-white transition-colors">Data Deletion</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
