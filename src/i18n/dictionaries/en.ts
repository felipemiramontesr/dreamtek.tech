export const en = {
  whatsapp: {
    help: 'Can we help you?',
  },
  navbar: {
    services: 'Services',
    products: 'Products',
    differential: 'Differential',
    contact: 'Contact',
    returnSite: 'Return to site',
    navigation: 'Navigation',
  },
  hero: {
    heading1: 'We transform complex visions into ',
    heading2: 'robust digital infrastructure.',
    subtitle: 'Web Development, Mobile Apps, and Cybersecurity with global standards.',
    ctaPrimary: 'Request Initial Assessment',
    ctaSecondary: 'Discover Methodology',
  },
  services: {
    heading1: 'Core ',
    heading2: 'Services',
    subtitle: 'Comprehensive high-performance solutions for complex corporate challenges.',
    cards: [
      {
        id: 'web',
        title: 'Web & Native Apps Development',
        description:
          'High-availability native mobile applications built to scale. We deliver robust platforms with seamless experiences focused on retention and conversion.',
        badges: ['iOS & Android', 'Next.js', 'TypeScript'],
        ctaText: 'Quote Native App',
      },
      {
        id: 'mobile',
        title: 'Complex Systems & AI',
        description:
          'Orchestration and integration of AI models (APIs/LLMs) into corporate architectures. Intelligent automation and advanced Drupal development backed by OSINT/MAPA-RD methodologies.',
        badges: ['AI Orchestration', 'Drupal Expert', 'Enterprise APIs'],
        ctaText: 'Integrate Artificial Intelligence',
      },
      {
        id: 'cybersecurity',
        title: 'Offensive Cybersecurity',
        description:
          'Ethical Hacking, Digital Forensics, and deep mitigation. We apply strict Security by Design methodologies and Zero Trust controls to neutralize vulnerabilities before exploitation.',
        badges: ['Ethical Hacking', 'Digital Forensics'],
        ctaText: 'Request Offensive Diagnostic',
      },
    ],
  },
  products: {
    heading1: 'Plans and ',
    heading2: 'Products',
    subtitle: 'Transparent structures adapted to the scale of your digital challenges.',
    monthly: 'Monthly',
    annual: 'Annual',
    save: 'Save 20%',
    usdPer: 'USD / ',
    month: 'month',
    billedAnnually: 'Billed annually: ',
    recommended: 'Recommended',
    plans: [
      {
        id: 'starterkit',
        title: 'Digital StarterKit',
        price: '$1,200',
        annualPrice: '$1,200',
        annualTotal: '$1,200 + $600/year support',
        period: 'setup',
        description:
          'Agile web presence for SMEs. Stack: Vite, React, TS & Tailwind CSS. Includes $50 USD/month retainer.',
        features: [
          'Infrastructure: Domain, SSL, and Hosting on Hostinger',
          'Automated deployment (CI/CD) via GitHub Actions',
          '3 hours of monthly maintenance and support',
          'Glassmorphism UI and responsive design',
          'Extreme optimization and accessibility',
        ],
        ctaText: 'Start Project',
      },
      {
        id: 'archon-fleet',
        title: 'ARCHON — Fleet Manager',
        price: 'Bespoke',
        annualPrice: 'Bespoke',
        annualTotal: 'Subject to SLA',
        period: 'Enterprise',
        description:
          'Modular and mutable ERP under atomic node architecture. Designed for high availability.',
        features: [
          'Total control of units and operational logs',
          'Advanced fuel telemetry',
          'Financial ledger: expenses, fines, and insurance',
          'ALE Security with Blind Indexing',
          'Continuous integration and transactional auditing',
        ],
        ctaText: 'Request Demonstration',
      },
      {
        id: 'cyber-audit',
        title: 'Forensic & Cyber Audit',
        price: '$1,800',
        annualPrice: '$1,800',
        annualTotal: '$1,800',
        period: 'process',
        description:
          'Enterprise offensive cybersecurity. Identifies and mitigates attack vectors with tactical rigor.',
        features: [
          'Specialized Pentesting (Black/Gray Box)',
          'SAST Analysis against OWASP Top 10',
          'OSINT Credential Leak Audit (HIBP)',
          'Server Hardening and strict CSP policies',
          'Executive report and remediation roadmap',
        ],
        ctaText: 'Schedule Audit',
      },
    ],
  },
  differential: {
    heading1: 'The Dreamtek ',
    heading2: 'Differential',
    items: [
      {
        title: 'Security by Design',
        description:
          'We do not add security at the end. Every line of code, every server architecture, and every user flow is designed considering Class A threat prevention.',
      },
      {
        title: 'Premium Agile Methodology',
        description:
          'Testable iterations, transparent boards, and assertive communication. We build resilient digital infrastructure in weeks, not months.',
      },
    ],
  },
  contact: {
    tag: 'Contact',
    heading1: 'Ready to take the ',
    heading2: 'next step?',
    description:
      'Fill out the form to request an initial assessment or quote. Our team will audit your requirement and respond in less than 24 business hours.',
    emailLabel: 'Corporate Email',
    locationLabel: 'Operational Headquarters',
    locationValue: 'Guadalupe, Zacatecas, Mexico',
    successTitle: 'Request Received!',
    successMessage:
      'Your ticket has been registered and verified. A Dreamtek engineer will contact you shortly.',
    sendAnother: 'Send another message',
    form: {
      name: 'Full Name',
      namePlaceholder: 'E.g. Felipe Miramontes',
      email: 'Email Address',
      emailPlaceholder: 'example@email.com',
      service: 'Service or Plan of Interest',
      message: 'Message / Project Description',
      messagePlaceholder: 'Tell us about your idea, challenges, and deadlines...',
      options: {
        starterkit: 'Digital StarterKit — Web Presence',
        archon: 'ARCHON — Corporate Fleet Management',
        cyber: 'Cyber Audit — OWASP / OSSTMM Auditing',
        bespoke: 'Bespoke Development & AI Orchestration',
        other: 'Other Technical Requirement',
      },
    },
    code: {
      label: 'Verification Code (6 digits)',
      desc1: 'We have sent a temporary code to ',
      desc2: '. Please enter it below to complete anti-spam validation.',
      placeholder: '000000',
      resend: "Didn't receive the code? Resend code",
      resendAlert: 'A new code has been sent to your email.',
      resendError: 'Error resending the code.',
      resendNetworkError: 'Connection error while trying to resend the code.',
    },
    errors: {
      sendCode: 'An error occurred while sending the verification code.',
      sendCodeNetwork: 'Could not connect to the server to send the code.',
      verifyCode: 'An error occurred while verifying the code.',
      verifyNetwork: 'Could not connect to the mail server.',
    },
    button: {
      loading: 'Processing...',
      verify: 'Verify Code and Submit',
      submit: 'Submit Request',
    },
  },
  footer: {
    subtitle: 'World-Class Engineering and Security',
    company: 'Company',
    legal: 'Legal',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    cookies: 'Cookie Policy',
    rights: 'All rights reserved.',
    operating: 'Operating with ',
    hq: 'HQ in Guadalupe, Zacatecas.',
  },
  cookieBanner: {
    text: 'This site uses its own and third-party cookies to offer you a better experience. You can read more in our ',
    and: ' and ',
    accept: 'Accept',
    reject: 'Reject',
  },
};
