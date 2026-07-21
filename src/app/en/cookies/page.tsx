import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie & Local Storage Policy',
  description:
    'Transparent and detailed information about the use of technical, analytical cookies and local storage technologies on Dreamtek.tech.',
  alternates: {
    canonical: 'https://dreamtek.tech/en/cookies',
    languages: {
      es: 'https://dreamtek.tech/cookies',
      en: 'https://dreamtek.tech/en/cookies',
    },
  },
};

export default function CookiesPage() {
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
            Cookie Policy
          </h1>

          <div className="glass-panel p-8 sm:p-12 rounded-2xl space-y-8 text-white/80 font-light leading-relaxed text-base">
            <p className="text-sm text-white/40">Last updated: July 6, 2026</p>

            <p>
              At <strong>Dreamtek.tech</strong> (&ldquo;Dreamtek&rdquo;), we use cookies and similar
              technologies to improve navigation, analyze our site&apos;s traffic, and ensure the
              proper functioning of our development and cybersecurity platform. Below, we explain in
              detail what they are, which ones we use, and how you can manage them.
            </p>

            <hr className="border-white/10" />

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">1. What are Cookies?</h3>
              <p>
                Cookies are small text files that are stored on your browser or device when you
                visit a website. They allow the platform to remember information about your visit,
                such as your language preferences, consent decisions, and other navigation settings,
                making your next visit easier and the site more useful to you.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">2. Types of Cookies We Use</h3>
              <p>We classify the technologies we use as follows:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Technical and Essential Cookies:</strong> These are strictly necessary for
                  the proper functioning of the site. For example, we use local storage (
                  <em>localStorage</em>) to remember if you have already accepted or rejected our
                  cookie notice, preventing the consent banner from showing up repeatedly.
                </li>
                <li>
                  <strong>Personalization and Performance Cookies:</strong> These allow us to
                  optimize the loading speed of the page and remember certain aesthetic parameters
                  of the website according to your viewing preferences.
                </li>
                <li>
                  <strong>Third-party Cookies (Statistics and Analysis):</strong> We may use
                  analytical services to understand how users interact with our platform. These
                  services collect aggregated and anonymous information about traffic and the most
                  visited pages.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">3. Consent and Local Storage</h3>
              <p>
                When entering our website, you will be presented with an informative banner about
                the use of cookies with <strong>Accept</strong> or <strong>Reject</strong> options:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  If you choose <strong>Accept</strong>, we will save your preference so that the
                  notice does not appear again during your next visits.
                </li>
                <li>
                  If you choose <strong>Reject</strong>, we will only use those cookies and
                  technologies strictly indispensable for the correct display of the website,
                  limiting any optional tracking functionality.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">4. How to Disable Cookies</h3>
              <p>
                You can allow, block, or delete cookies installed on your device through the
                configuration of the browser options you use:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Google Chrome:</strong> Settings &gt; Privacy and security &gt; Cookies
                  and other site data.
                </li>
                <li>
                  <strong>Mozilla Firefox:</strong> Options &gt; Privacy &gt; History &gt; Custom
                  Settings.
                </li>
                <li>
                  <strong>Safari:</strong> Preferences &gt; Privacy &gt; Block all cookies.
                </li>
                <li>
                  <strong>Microsoft Edge:</strong> Settings &gt; Privacy, search, and services &gt;
                  Cookies and site permissions.
                </li>
              </ul>
              <p className="text-sm text-white/60 mt-2">
                * Please note that if you disable all cookies, some essential functions of the site
                may stop operating correctly.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">5. Updates to this Policy</h3>
              <p>
                We may modify this Cookie Policy based on new legislative or regulatory
                requirements, or in order to adapt this policy to the instructions issued by data
                protection authorities. We recommend visiting this page periodically to stay
                informed.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
