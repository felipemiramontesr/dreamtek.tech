export default function Privacy() {
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
            Privacy Policy
          </h1>

          <div className="glass-panel p-8 sm:p-12 rounded-2xl space-y-8 text-white/80 font-light leading-relaxed text-base">
            <p className="text-sm text-white/40">Last updated: July 6, 2026</p>

            <p>
              At <strong>Dreamtek.tech</strong> (hereinafter, &ldquo;Dreamtek&rdquo;), we take the
              security and privacy of your data very seriously. This Privacy Policy describes how we
              collect, use, store, and protect the personal information you provide us through our
              contact form on our website.
            </p>

            <hr className="border-white/10" />

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">
                1. Identity and Address of the Data Controller
              </h3>
              <p>
                Dreamtek, operating under current laws and with its technological operations
                headquarters in <strong>Guadalupe, Zacatecas, Mexico</strong>, is responsible for
                the processing of your personal data collected through this platform.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">2. Personal Data Collected</h3>
              <p>
                To attend to your requests for quotation, initial diagnosis, or technical
                consulting, we only collect the following essential data:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Full Name:</strong> To address you in a personalized and professional
                  manner.
                </li>
                <li>
                  <strong>Email:</strong> As the primary channel of communication and sending of
                  reports or commercial proposals.
                </li>
                <li>
                  <strong>Service of Interest:</strong> To technically profile your request.
                </li>
                <li>
                  <strong>Message / Project Information:</strong> Technical details provided
                  voluntarily for the quotation.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">3. Purpose of Data Processing</h3>
              <p>
                Your data will be treated confidentially and exclusively for the following primary
                purposes related to our service:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Process and respond to your request for quotation or technical diagnosis.</li>
                <li>
                  Establish direct contact to discuss the scope of development or cybersecurity
                  projects.
                </li>
                <li>Send formal commercial proposals related to the requested services.</li>
              </ul>
              <p className="text-sm text-white/60 mt-2">
                * We do not carry out massive spam campaigns or transfer your data to third parties
                for advertising purposes.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">4. Data Security and Retention</h3>
              <p>
                Applying our principle of <strong>Security by Design</strong>, we implement
                administrative, technical, and physical security measures to safeguard your
                information against damage, loss, alteration, destruction, or unauthorized use,
                access, or treatment.
              </p>
              <p>
                Your contact data will be stored encrypted on our secure mail servers and databases
                for the time strictly necessary to fulfill the respective commercial or legal
                relationship.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">
                5. ARCO Rights (Access, Rectification, Cancellation, and Opposition)
              </h3>
              <p>
                You have the right to know what personal data we have about you, what we use it for,
                and the conditions of use we give it (Access). Likewise, it is your right to request
                the correction of your personal information in case it is outdated or inaccurate
                (Rectification); that we delete it from our records or databases (Cancellation); as
                well as object to the use of your data for specific purposes (Opposition).
              </p>
              <p>
                To exercise any of your ARCO rights, you can write a formal request addressed to our
                corporate email:{' '}
                <a
                  href="mailto:contacto@dreamtek.tech"
                  className="text-[#FF2D00] hover:underline font-medium"
                >
                  contacto@dreamtek.tech
                </a>
                , detailing the right you wish to exercise and attaching an official identification
                to verify your ownership.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">
                6. Modifications to the Privacy Policy
              </h3>
              <p>
                We reserve the right to make modifications or updates to this notice at any time,
                for the attention of new legislation or jurisprudence, internal policies, or new
                requirements in our services. Any changes will be available directly at this URL.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
