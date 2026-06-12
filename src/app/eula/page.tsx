import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "End-User License Agreement",
};

export default function EulaPage() {
  const lastUpdated = "June 12, 2026";

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 sm:p-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">End-User License Agreement</h1>
          <p className="text-sm text-gray-400 mb-8">Last updated: {lastUpdated}</p>

          <div className="prose prose-gray prose-sm max-w-none space-y-6 text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-0">1. Agreement to Terms</h2>
              <p>
                This End-User License Agreement (&quot;EULA&quot;) is a legal agreement between you
                (&quot;User,&quot; &quot;you,&quot; or &quot;your&quot;) and Vending Connector, operated
                by Apex AI Vending LLC (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or
                &quot;our&quot;). By accessing or using our platform at vendingconnector.com, you agree
                to be bound by this EULA. If you do not agree, do not use our services.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">2. License Grant</h2>
              <p>
                We grant you a limited, non-exclusive, non-transferable, revocable license to access
                and use our platform solely for your internal business purposes in connection with
                vending machine operations, location sourcing, and related services provided through
                our platform.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">3. Account Registration</h2>
              <p>
                To use certain features, you must create an account. You agree to provide accurate,
                current, and complete information, maintain the security of your credentials, and
                accept responsibility for all activities under your account. You must notify us
                immediately of any unauthorized access.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">4. Permitted Use</h2>
              <p>You may use the platform to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Browse and purchase vending location leads</li>
                <li>List and sell vending equipment</li>
                <li>Access the coffee supply marketplace</li>
                <li>Manage your vending business operations through our CRM tools</li>
                <li>Sign and manage placement agreements</li>
                <li>List locations, routes, or leads on the marketplace</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">5. Restrictions</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Copy, modify, or distribute any part of the platform without authorization</li>
                <li>Reverse engineer, decompile, or disassemble any software components</li>
                <li>Use the platform for any unlawful purpose or in violation of any regulations</li>
                <li>Circumvent or manipulate pricing, fees, or billing systems</li>
                <li>Scrape, harvest, or collect data from the platform using automated means</li>
                <li>Impersonate another user or misrepresent your identity or affiliation</li>
                <li>Share, resell, or sublicense your account access to third parties</li>
                <li>Interfere with or disrupt the platform or servers</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">6. Fees and Payments</h2>
              <p>
                Certain services require payment. All fees are stated at the time of purchase. Payments
                are processed through our authorized payment providers. All sales are final unless
                otherwise specified in the applicable service agreement. Broker fees and processing
                fees may apply to transactions as disclosed during checkout.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">7. Intellectual Property</h2>
              <p>
                All content, features, and functionality of the platform — including text, graphics,
                logos, software, and design — are owned by or licensed to Vending Connector and are
                protected by copyright, trademark, and other intellectual property laws. Your use of
                the platform does not grant you ownership of any content or materials.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">8. User Content</h2>
              <p>
                You retain ownership of content you submit (listings, business information, etc.). By
                submitting content, you grant us a non-exclusive, royalty-free license to use, display,
                and distribute that content in connection with operating the platform. You represent
                that you have the right to submit any content you provide.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">9. Non-Circumvention</h2>
              <p>
                You agree not to circumvent the platform to conduct direct transactions with parties
                introduced through our services without proper compensation to Vending Connector. This
                includes contacting location owners, operators, or other users introduced through the
                platform to conduct business outside of our platform without authorization.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">10. Disclaimer of Warranties</h2>
              <p>
                The platform is provided &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; without
                warranties of any kind, either express or implied. We do not guarantee that location
                leads will result in successful placements, that equipment listed will meet your
                specifications, or that the platform will be uninterrupted or error-free.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">11. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Vending Connector and its affiliates shall not
                be liable for any indirect, incidental, special, consequential, or punitive damages,
                including loss of profits, data, or business opportunities, arising from your use of
                or inability to use the platform.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">12. Indemnification</h2>
              <p>
                You agree to indemnify, defend, and hold harmless Vending Connector, its officers,
                directors, employees, and agents from any claims, damages, losses, or expenses arising
                from your use of the platform, violation of this EULA, or infringement of any
                third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">13. Termination</h2>
              <p>
                We may suspend or terminate your access at any time, with or without cause, with or
                without notice. Upon termination, your license to use the platform ceases immediately.
                Sections relating to intellectual property, limitation of liability, indemnification,
                and governing law survive termination.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">14. Governing Law</h2>
              <p>
                This EULA is governed by the laws of the State of Texas, without regard to conflict of
                law principles. Any disputes shall be resolved in the courts located in Texas. You
                consent to the exclusive jurisdiction of those courts.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">15. Changes to This Agreement</h2>
              <p>
                We reserve the right to modify this EULA at any time. Changes will be posted on this
                page with an updated &quot;Last updated&quot; date. Continued use of the platform after
                changes constitutes acceptance of the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">16. Contact</h2>
              <p>
                For questions about this EULA, contact us at:
              </p>
              <ul className="list-none pl-0 space-y-1">
                <li><strong>Email:</strong> james@apexaivending.com</li>
                <li><strong>Phone:</strong> (888) 851-1462</li>
                <li><strong>Website:</strong> vendingconnector.com</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
