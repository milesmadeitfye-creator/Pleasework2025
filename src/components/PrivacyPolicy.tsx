import { Music2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
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
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-gray-400 mb-12">Effective Date: November 10, 2025</p>

          <div className="prose prose-invert prose-blue max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Introduction</h2>
              <p className="text-gray-300 leading-relaxed">
                Ghoste Media ("Ghoste," "we," "us," or "our") provides a marketing and analytics platform designed for artists and creators. Our service helps you connect to third-party platforms like Meta/Facebook, Instagram, Spotify, Apple Music, and others to access performance data, manage campaigns, and grow your reach. This Privacy Policy explains what information we collect, how we use it, and your rights regarding your data.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Information We Collect</h2>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Account Information</h3>
                  <p className="text-gray-300 leading-relaxed">
                    When you create a Ghoste account, we collect your name, email address, and any other information you provide during registration.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Connected Platform Data</h3>
                  <p className="text-gray-300 leading-relaxed mb-2">
                    When you connect third-party services to Ghoste, we access data from those platforms with your explicit permission. This may include:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                    <li><strong>Meta/Facebook:</strong> Ad account information, campaign data, ad performance metrics, Page insights, audience data</li>
                    <li><strong>Instagram:</strong> Profile data, post insights, engagement metrics</li>
                    <li><strong>Spotify:</strong> Artist profiles, streaming statistics, playlist data</li>
                    <li><strong>Apple Music:</strong> Artist analytics, song performance data</li>
                    <li><strong>Other platforms:</strong> Similar performance and analytics data as authorized by you</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Analytics and Usage Data</h3>
                  <p className="text-gray-300 leading-relaxed">
                    We collect information about how you use Ghoste, including pages visited, features used, clicks, and interactions within our platform. We also collect technical information such as your IP address, browser type, device information, and operating system.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">How We Use Your Data</h2>
              <p className="text-gray-300 leading-relaxed mb-3">We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4">
                <li><strong>Provide Dashboards and Insights:</strong> Display your performance metrics, analytics, and campaign results in an easy-to-understand format</li>
                <li><strong>Run and Optimize Campaigns:</strong> Execute marketing campaigns you create and optimize them based on your preferences and goals</li>
                <li><strong>Security and Troubleshooting:</strong> Protect your account, detect fraud, prevent abuse, and resolve technical issues</li>
                <li><strong>Service Improvements:</strong> Analyze usage patterns to improve features, develop new tools, and enhance the user experience</li>
                <li><strong>Communications:</strong> Send you service updates, respond to your inquiries, and provide customer support</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Third-Party Services</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                Ghoste integrates with various third-party platforms to provide you with comprehensive analytics and campaign management tools. These platforms include:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4 mb-3">
                <li>Meta/Facebook</li>
                <li>Instagram</li>
                <li>Spotify</li>
                <li>Apple Music</li>
                <li>TikTok</li>
                <li>YouTube</li>
                <li>And other streaming and social platforms</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>Important:</strong> Data from these platforms is only accessed with your explicit permission through authorized OAuth connections. We only use this data to provide the specific features and insights you request within Ghoste. We do not use your connected platform data for any other purpose.
              </p>
              <p className="text-gray-300 leading-relaxed">
                You can disconnect any platform at any time from your account settings, which will revoke our access to that platform's data going forward.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Data Sharing</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>We do not sell your data.</strong> We only share your information in the following limited circumstances:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4">
                <li><strong>Service Providers:</strong> We work with trusted service providers (such as hosting providers, payment processors, and analytics tools) who help us operate Ghoste. These providers are contractually required to keep your data secure and use it only for the services they provide to us.</li>
                <li><strong>Legal Requirements:</strong> We may disclose your information if required by law, court order, or government regulation, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.</li>
                <li><strong>Business Transfers:</strong> If Ghoste is involved in a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction. We will notify you of any such change.</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-3">
                We never share your connected platform data (from Meta, Spotify, etc.) with third parties for their own advertising or marketing purposes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Data Retention</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                We retain your data only as long as necessary to provide our services and fulfill the purposes described in this Privacy Policy. Specifically:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4">
                <li>Account information is kept while your account is active</li>
                <li>Connected platform data is retained while you maintain the connection and for a short period afterward for analytics purposes</li>
                <li>Usage and analytics data may be retained in aggregated, anonymized form for product improvements</li>
                <li>We may retain certain data for longer periods if required by law or for legitimate business purposes (such as fraud prevention or security)</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-3">
                When you delete your account or disconnect a platform, we will delete or anonymize the associated data within 30 days, except where we are required to retain it for legal or security reasons.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Your Rights</h2>
              <p className="text-gray-300 leading-relaxed mb-3">You have the following rights regarding your data:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4">
                <li><strong>Access:</strong> You can request a copy of the personal data we hold about you</li>
                <li><strong>Correction:</strong> You can update or correct your account information at any time through your account settings</li>
                <li><strong>Deletion:</strong> You can request that we delete your data (see our <Link to="/data-deletion" className="text-blue-400 hover:text-blue-300">Data Deletion</Link> page for instructions)</li>
                <li><strong>Portability:</strong> You can request an export of your data in a machine-readable format</li>
                <li><strong>Objection:</strong> You can object to certain types of data processing</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-3">
                To exercise any of these rights, please contact us at <a href="mailto:miles@ghostemedia.com" className="text-blue-400 hover:text-blue-300">miles@ghostemedia.com</a>. We will respond to your request within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Security</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                We implement reasonable technical and organizational measures to protect your data, including:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                <li>Encryption of data in transit using HTTPS/TLS</li>
                <li>Secure storage of access tokens and sensitive data</li>
                <li>Regular security assessments and updates</li>
                <li>Access controls limiting who can view your data</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-3">
                However, no method of transmission or storage is 100% secure. While we strive to protect your data, we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Changes to This Privacy Policy</h2>
              <p className="text-gray-300 leading-relaxed">
                We may update this Privacy Policy from time to time to reflect changes in our practices or for legal or regulatory reasons. When we make changes, we will update the "Effective Date" at the top of this page. We encourage you to review this policy periodically. If we make material changes, we will notify you by email or through a notice on our platform.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Contact Information</h2>
              <p className="text-gray-300 leading-relaxed mb-2">
                If you have questions about this Privacy Policy or how we handle your data, please contact us:
              </p>
              <p className="text-gray-300 leading-relaxed">
                <strong>Email:</strong> <a href="mailto:miles@ghostemedia.com" className="text-blue-400 hover:text-blue-300">miles@ghostemedia.com</a>
              </p>
              <p className="text-gray-300 leading-relaxed mt-3">
                For data deletion requests, please visit our <Link to="/data-deletion" className="text-blue-400 hover:text-blue-300">Data Deletion</Link> page.
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
