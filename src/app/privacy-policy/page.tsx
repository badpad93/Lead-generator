import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicyPage() {
  const lastUpdated = "May 27, 2025";

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 sm:p-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-400 mb-8">Last updated: {lastUpdated}</p>

          <div className="prose prose-gray prose-sm max-w-none space-y-6 text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-0">1. Introduction</h2>
              <p>
                Vending Connector (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website
                vendingconnector.com. This Privacy Policy explains what information we collect, how we
                use it, and your rights regarding that information.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">2. Information We Collect</h2>
              <p>We collect only the information necessary to provide our services:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>First and last name</strong></li>
                <li><strong>Email address</strong></li>
                <li><strong>Phone number</strong></li>
                <li><strong>Business name</strong></li>
              </ul>
              <p>
                We do not collect sensitive personal information such as Social Security numbers,
                financial account details, or government-issued identification unless explicitly
                required for a specific transaction you initiate.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">3. How We Use Your Information</h2>
              <p>Your information is used solely to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Create and manage your account</li>
                <li>Facilitate connections between vending operators and location managers</li>
                <li>Communicate with you about your account, inquiries, and our services</li>
                <li>Process transactions you initiate through our platform</li>
                <li>Improve our platform and user experience</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">4. Information Sharing</h2>
              <p>
                <strong>We do not sell, rent, trade, or otherwise distribute your personal information
                to third parties.</strong>
              </p>
              <p>Your information may only be disclosed in the following limited circumstances:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>With your consent</strong> — for example, when you choose to connect with
                  another user on our platform
                </li>
                <li>
                  <strong>Legal requirements</strong> — if required by law, subpoena, or legal process
                </li>
                <li>
                  <strong>Service providers</strong> — trusted vendors who help us operate our platform
                  (e.g., email delivery, payment processing), bound by confidentiality obligations
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">5. Data Security</h2>
              <p>
                We implement industry-standard security measures to protect your personal information,
                including encrypted data transmission (TLS/SSL), secure database storage, and access
                controls. While no method of transmission over the Internet is 100% secure, we strive
                to protect your data using commercially acceptable means.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">6. Data Retention</h2>
              <p>
                We retain your personal information only for as long as necessary to provide our
                services and fulfill the purposes described in this policy. You may request deletion
                of your account and associated data at any time by contacting us.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">7. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of your personal information</li>
                <li>Opt out of marketing communications at any time</li>
              </ul>
              <p>
                To exercise any of these rights, contact us at the email address listed below.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">8. Cookies</h2>
              <p>
                We use essential cookies to maintain your session and authentication state. We do not
                use third-party advertising or tracking cookies.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">9. Children&apos;s Privacy</h2>
              <p>
                Our services are not directed to individuals under the age of 18. We do not knowingly
                collect personal information from children.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. Any changes will be posted on
                this page with a revised &quot;Last updated&quot; date. Your continued use of our
                services after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">11. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy or your personal data, contact us at:
              </p>
              <p className="font-medium">
                Vending Connector<br />
                Email: <a href="mailto:support@vendingconnector.com" className="text-green-600 hover:text-green-700">support@vendingconnector.com</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
