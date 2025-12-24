import { Music2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TermsOfService() {
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
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Terms of Service</h1>
          <p className="text-gray-400 mb-12">Effective Date: November 10, 2025</p>

          <div className="prose prose-invert prose-blue max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Acceptance of Terms</h2>
              <p className="text-gray-300 leading-relaxed">
                By creating an account or using Ghoste (accessible at https://ghoste.one), you agree to be bound by these Terms of Service. If you do not agree to these Terms, you may not use our service. These Terms apply to all users, including artists, creators, brands, and anyone accessing or using Ghoste.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Description of Service</h2>
              <p className="text-gray-300 leading-relaxed">
                Ghoste is a marketing and analytics platform designed for artists, creators, and brands. Our service allows users to connect their accounts from various platforms (including Meta/Facebook, Instagram, Spotify, Apple Music, and others) to view performance data, manage marketing campaigns, create smart links, and access analytics tools. Ghoste provides both free and paid subscription tiers.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Eligibility and Account Requirements</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                To use Ghoste, you must:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4">
                <li>Be at least 18 years old (or the age of majority in your jurisdiction)</li>
                <li>Provide accurate, current, and complete information when creating your account</li>
                <li>Maintain the security of your account credentials and not share them with others</li>
                <li>Accept responsibility for all activities that occur under your account</li>
                <li>Only connect accounts and platforms you have legal authorization to manage</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-3">
                You may not create an account on behalf of another person or entity without proper authorization. You are responsible for keeping your contact information up to date.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Permitted Use of Ghoste</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                You agree to use Ghoste only for lawful purposes and in accordance with these Terms. Specifically, you agree NOT to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4">
                <li>Use the service to create or distribute illegal, fraudulent, or harmful content</li>
                <li>Violate any laws, regulations, or third-party rights</li>
                <li>Abuse, misuse, or attempt to manipulate Ghoste's APIs or systems</li>
                <li>Gain unauthorized access to other users' accounts or data</li>
                <li>Resell, redistribute, or sublicense access to Ghoste without our written permission</li>
                <li>Interfere with or disrupt the service or servers</li>
                <li>Use automated scripts, bots, or tools to access the service without authorization</li>
                <li>Reverse engineer, decompile, or attempt to extract source code from our platform</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Third-Party Platform Integrations</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                Ghoste integrates with third-party platforms including Meta/Facebook, Instagram, Spotify, Apple Music, TikTok, YouTube, and others. When you connect these accounts:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4 mb-3">
                <li>You authorize Ghoste to access the data and perform actions you explicitly permit</li>
                <li>You remain subject to each platform's own terms of service and policies</li>
                <li>You are responsible for complying with all platform-specific requirements and restrictions</li>
                <li>Ghoste's access is limited to what you authorize and only used to provide our services</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                You must only connect accounts you own or have proper authorization to manage. Ghoste is not responsible for your compliance with third-party platform policies. If a third-party platform changes its terms or restricts access, Ghoste's ability to provide related features may be affected.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Payments and Subscriptions</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                Ghoste offers both free and paid subscription plans. Paid subscriptions include additional features, higher usage limits, and premium tools. By subscribing to a paid plan:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4">
                <li>You agree to pay the subscription fees as displayed at the time of purchase</li>
                <li>Subscriptions automatically renew on a monthly or annual basis (depending on your selected plan) until cancelled</li>
                <li>You authorize us to charge your chosen payment method through our payment processor</li>
                <li>All fees are non-refundable except as required by applicable law or at our sole discretion</li>
                <li>We reserve the right to change subscription pricing with 30 days' notice to active subscribers</li>
                <li>You are responsible for any applicable taxes</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-3">
                You may cancel your subscription at any time through your account settings. Cancellations take effect at the end of your current billing period. You will not receive a refund for any unused portion of a billing period unless required by law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Intellectual Property Rights</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>Ghoste's Property:</strong> All rights, title, and interest in Ghoste, including our platform, software, code, features, design, branding, logos, and trademarks, belong to Ghoste Media and our licensors. You do not acquire any ownership rights by using our service.
              </p>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>Your Content:</strong> You retain all ownership rights to content you create, upload, or manage through Ghoste, including music, artwork, videos, campaign assets, and marketing materials. By using Ghoste, you grant us a limited, non-exclusive license to host, store, display, and process your content solely to provide our services to you.
              </p>
              <p className="text-gray-300 leading-relaxed">
                You represent and warrant that you own or have the necessary rights to use all content you upload or create through Ghoste, and that your content does not infringe on any third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Disclaimer and Limitation of Liability</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>Service Provided "As Is":</strong> Ghoste is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied. We strive to provide reliable service with reasonable uptime, but we do not guarantee uninterrupted, error-free, or secure operation.
              </p>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>No Guarantee of Results:</strong> We do not guarantee specific outcomes from using Ghoste, including but not limited to increases in streams, followers, engagement, sales, or revenue. Campaign performance depends on many factors beyond our control, including market conditions, audience behavior, and third-party platform algorithms.
              </p>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>Limitation of Liability:</strong> To the maximum extent permitted by law, Ghoste Media, its affiliates, officers, employees, and partners shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, revenue, data, use, goodwill, or other intangible losses arising from:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4 mb-3">
                <li>Your use or inability to use Ghoste</li>
                <li>Unauthorized access to or alteration of your data</li>
                <li>Third-party conduct or content on the service</li>
                <li>Any other matter relating to Ghoste</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                Our total liability to you for all claims arising from or relating to these Terms or Ghoste shall not exceed the amount you paid us in the 12 months preceding the claim, or $100, whichever is greater.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Account Termination</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>Your Right to Terminate:</strong> You may cancel your subscription and delete your account at any time through your account settings or by contacting us at miles@ghostemedia.com.
              </p>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>Our Right to Terminate:</strong> We reserve the right to suspend or terminate your access to Ghoste at any time, with or without notice, for:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                <li>Violation of these Terms of Service</li>
                <li>Fraudulent, abusive, or illegal activity</li>
                <li>Non-payment of subscription fees</li>
                <li>Threats to the security or integrity of our service</li>
                <li>Legal or regulatory requirements</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-3">
                Upon termination, your right to use Ghoste will immediately cease. We may, but are not obligated to, provide you with an opportunity to export your data before termination takes effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Governing Law and Dispute Resolution</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                These Terms are governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law principles.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Any disputes arising out of or relating to these Terms or Ghoste shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association, except that you may assert claims in small claims court if they qualify. You and Ghoste agree to waive any right to a jury trial.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Changes to These Terms</h2>
              <p className="text-gray-300 leading-relaxed">
                We may update these Terms of Service from time to time to reflect changes in our practices, features, or legal requirements. When we make changes, we will update the "Effective Date" at the top of this page and, for material changes, provide notice through email or a prominent notice on our platform. Your continued use of Ghoste after changes become effective constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">General Provisions</h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>Entire Agreement:</strong> These Terms constitute the entire agreement between you and Ghoste Media regarding the use of our service.
              </p>
              <p className="text-gray-300 leading-relaxed mb-3">
                <strong>Severability:</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full effect.
              </p>
              <p className="text-gray-300 leading-relaxed">
                <strong>Waiver:</strong> Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Contact Information</h2>
              <p className="text-gray-300 leading-relaxed mb-2">
                If you have questions about these Terms of Service, please contact us:
              </p>
              <p className="text-gray-300 leading-relaxed">
                <strong>Email:</strong> <a href="mailto:miles@ghostemedia.com" className="text-blue-400 hover:text-blue-300">miles@ghostemedia.com</a>
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
