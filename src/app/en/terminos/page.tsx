import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms and Conditions of Service',
  description: 'Terms and conditions of service and software licensing at Dreamtek.tech.',
  alternates: {
    canonical: 'https://dreamtek.tech/en/terminos',
    languages: {
      es: 'https://dreamtek.tech/terminos',
      en: 'https://dreamtek.tech/en/terminos',
    },
  },
};

export default function Terms() {
  return (
    <main className="flex flex-col min-h-screen pt-20">
      <section className="relative flex-grow pt-12 pb-24 bg-gradient-to-br from-[#00213d] via-[#00172B] to-black">
        {/* Background graphic effect */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_center,rgba(255,45,0,0.15)_0%,transparent_60%)]" />

        <div className="relative z-10 max-w-[1440px] mx-auto px-6">
          <span className="text-[#FF2D00] text-xs font-bold uppercase tracking-widest block mb-4">
            Legal Document
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-10 tracking-tight">
            Terms of Service
          </h1>

          <div className="glass-panel p-8 sm:p-12 rounded-2xl space-y-8 text-white/80 font-light leading-relaxed text-base">
            <p className="text-sm text-white/40">Last updated: July 6, 2026</p>

            <p>
              Welcome to <strong>Dreamtek.tech</strong>. By accessing and browsing our website, you
              agree to comply with the terms and conditions described in this document. If you do
              not agree with any of these conditions, we recommend you refrain from using our site
              and services.
            </p>

            <hr className="border-white/10" />

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">1. Intellectual Property</h3>
              <p>
                All content available on this site, including but not limited to logos, texts,
                graphics, programming code, interface icons, typography, and visual architecture, is
                the exclusive intellectual property of <strong>Dreamtek</strong> or its respective
                licensors, and is protected by international and national intellectual property
                laws.
              </p>
              <p>
                The reproduction, copying, distribution, or modification of any part of this site
                without the express written consent of our legal team is prohibited.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">2. Acceptable Use of the Site</h3>
              <p>
                As a user, you commit to making lawful and ethical use of the platform. The
                following is strictly prohibited:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Attempting to breach security, performing unauthorized scanning, or Distributed
                  Denial of Service (DDoS) attacks against the platform servers.
                </li>
                <li>
                  Providing false, misleading, or malicious information through our contact form.
                </li>
                <li>
                  Using scraping techniques or automated data extraction without prior written
                  authorization.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">3. Provision of Consulting Services</h3>
              <p>
                The information on costs, scopes, and milestones detailed in the plans section is
                estimative and illustrative to guide the user. Each project formalized with Dreamtek
                requires the signing of a Software Services Provision or Technical Audit Contract
                where the definitive contractual clauses, service level agreements (SLA), and
                definitive scopes will be agreed upon.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">4. Limitation of Liability</h3>
              <p>
                Although we apply strict <strong>Security by Design</strong> standards and strive to
                ensure the maximum availability and correctness of the information on this website,
                Dreamtek is not responsible for temporary service interruptions due to hosting
                network failures, provider maintenance, or external force majeure attacks.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">5. Jurisdiction and Applicable Law</h3>
              <p>
                For the resolution of any conflict arising from the interpretation or execution of
                these terms of service, the parties expressly agree to submit to the jurisdiction of
                the competent courts and applicable laws of the state of{' '}
                <strong>Zacatecas, Mexico</strong>, waiving any other jurisdiction that might
                correspond to them due to their present or future domiciles.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">6. Contact</h3>
              <p>
                If you have questions about our Terms of Service, you can contact our engineering
                area directly at{' '}
                <a
                  href="mailto:contacto@dreamtek.tech"
                  className="text-[#FF2D00] hover:underline font-medium"
                >
                  contacto@dreamtek.tech
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
