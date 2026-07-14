export const es = {
  whatsapp: {
    help: '¿Podemos ayudarte?',
  },
  navbar: {
    services: 'Servicios',
    products: 'Productos',
    differential: 'Diferencial',
    contact: 'Contacto',
    returnSite: 'Regresar al sitio',
    navigation: 'Navegación',
  },
  hero: {
    heading1: 'Convertimos visiones complejas en ',
    heading2: 'infraestructura digital robusta.',
    subtitle: 'Desarrollo Web, Mobile Apps y Ciberseguridad con estándar global.',
    ctaPrimary: 'Solicitar Diagnóstico Inicial',
    ctaSecondary: 'Conocer Metodología',
  },
  services: {
    heading1: 'Servicios ',
    heading2: 'Core',
    subtitle: 'Soluciones integrales de alto rendimiento para retos corporativos complejos.',
    cards: [
      {
        id: 'web',
        title: 'Desarrollo Web & Apps Nativas',
        description:
          'Aplicaciones móviles nativas de alta disponibilidad diseñadas para escalar. Entregamos plataformas robustas con experiencias fluidas enfocadas en retención y conversión.',
        badges: ['iOS & Android', 'Next.js', 'TypeScript'],
        ctaText: 'Cotizar Aplicación Nativa',
      },
      {
        id: 'mobile',
        title: 'Sistemas Complejos e IA',
        description:
          'Orquestación e integración de modelos de IA (APIs/LLMs) en arquitecturas corporativas. Automatización inteligente y desarrollo avanzado en Drupal con respaldo metodológico OSINT/MAPA-RD.',
        badges: ['Orquestación IA', 'Drupal Expert', 'APIs Enterprise'],
        ctaText: 'Integrar Inteligencia Artificial',
      },
      {
        id: 'cybersecurity',
        title: 'Ciberseguridad Ofensiva',
        description:
          'Hacking Ético, Análisis Forense Digital y mitigación profunda. Aplicamos metodologías estrictas de Security by Design y controles Zero Trust para neutralizar vulnerabilidades antes de la explotación.',
        badges: ['Ethical Hacking', 'Forense Digital'],
        ctaText: 'Solicitar Diagnóstico Ofensivo',
      },
    ],
  },
  products: {
    heading1: 'Planes y ',
    heading2: 'Productos',
    subtitle: 'Estructuras transparentes adaptadas a la escala de tus retos digitales.',
    monthly: 'Mensual',
    annual: 'Anual',
    save: 'Ahorra 20%',
    usdPer: 'USD / ',
    month: 'mes',
    billedAnnually: 'Facturado al año: ',
    recommended: 'Recomendado',
    plans: [
      {
        id: 'starterkit',
        title: 'StarterKit Digital',
        price: '$1,200',
        annualPrice: '$1,200',
        annualTotal: '$1,200 + $600/año soporte',
        period: 'setup',
        description:
          'Presencia web ágil para PyMES. Stack: Vite, React, TS & Tailwind CSS. Incluye iguala de $50 USD/mes.',
        features: [
          'Infraestructura: Dominio, SSL y Hosting en Hostinger',
          'Despliegue automatizado (CI/CD) vía GitHub Actions',
          '3 horas de mantenimiento y soporte mensual',
          'UI Glassmorphism y diseño responsivo',
          'Optimización extrema y accesibilidad',
        ],
        ctaText: 'Iniciar Proyecto',
      },
      {
        id: 'archon-fleet',
        title: 'ARCHON — Fleet Manager',
        price: 'Bespoke',
        annualPrice: 'Bespoke',
        annualTotal: 'Sujeto a SLA',
        period: 'Enterprise',
        description:
          'ERP modular y mutable bajo arquitectura de nodos atómicos. Diseñado para alta disponibilidad.',
        features: [
          'Control total de unidades y bitácoras operativas',
          'Telemetría avanzada de combustible',
          'Ledger financiero: gastos, multas y seguros',
          'Seguridad ALE con Blind Indexing',
          'Integración continua y auditoría transaccional',
        ],
        ctaText: 'Solicitar Demostración',
      },
      {
        id: 'cyber-audit',
        title: 'Forensic & Cyber Audit',
        price: '$1,800',
        annualPrice: '$1,800',
        annualTotal: '$1,800',
        period: 'proceso',
        description:
          'Ciberseguridad ofensiva empresarial. Identifica y mitiga vectores de ataque con rigor táctico.',
        features: [
          'Pentesting especializado (Caja Negra/Gris)',
          'Análisis SAST contra OWASP Top 10',
          'Auditoría OSINT de fuga de credenciales (HIBP)',
          'Hardening de servidores y políticas CSP estrictas',
          'Reporte ejecutivo y hoja de ruta de remediación',
        ],
        ctaText: 'Agendar Auditoría',
      },
    ],
  },
  differential: {
    heading1: 'El Diferencial ',
    heading2: 'Dreamtek',
    items: [
      {
        title: 'Security by Design',
        description:
          'No añadimos la seguridad al final. Cada línea de código, cada arquitectura de servidor y cada flujo de usuario se diseña contemplando prevenciones de amenaza clase A.',
      },
      {
        title: 'Metodología Ágil Premium',
        description:
          'Iteraciones comprobables, tableros transparentes y comunicación asertiva. Construimos infraestructura digital resiliente en semanas, no meses.',
      },
    ],
  },
  contact: {
    tag: 'Contacto',
    heading1: '¿Listo para dar el ',
    heading2: 'siguiente paso?',
    description:
      'Completa el formulario para solicitar un diagnóstico inicial o cotización. Nuestro equipo auditará tu requerimiento y responderá en menos de 24 horas hábiles.',
    emailLabel: 'Email Corporativo',
    locationLabel: 'Sede Operativa',
    locationValue: 'Guadalupe, Zacatecas, México',
    successTitle: '¡Solicitud Recibida!',
    successMessage:
      'Tu ticket ha sido registrado y verificado. Un ingeniero de Dreamtek se pondrá en contacto contigo a la brevedad.',
    sendAnother: 'Enviar otro mensaje',
    form: {
      name: 'Nombre Completo',
      namePlaceholder: 'Ej. Felipe Miramontes',
      email: 'Correo Electrónico',
      emailPlaceholder: 'ejemplo@correo.com',
      service: 'Servicio o Plan de Interés',
      message: 'Mensaje / Descripción del Proyecto',
      messagePlaceholder: 'Platícanos acerca de tu idea, retos y fechas límites...',
      options: {
        starterkit: 'StarterKit Digital — Presencia Web',
        archon: 'ARCHON — Gestión de Flotas Corporativas',
        cyber: 'Cyber Audit — Auditoría OWASP / OSSTMM',
        bespoke: 'Desarrollo a la Medida & Orquestación de IA',
        other: 'Otro Requerimiento Técnico',
      },
    },
    code: {
      label: 'Código de Verificación (6 dígitos)',
      desc1: 'Hemos enviado un código temporal a ',
      desc2: '. Por favor ingrésalo abajo para completar la validación anti-spam.',
      placeholder: '000000',
      resend: '¿No recibiste el código? Reenviar código',
      resendAlert: 'Se ha reenviado un nuevo código a tu correo.',
      resendError: 'Error al reenviar el código.',
      resendNetworkError: 'Error de conexión al intentar reenviar el código.',
    },
    errors: {
      sendCode: 'Ocurrió un error al enviar el código de verificación.',
      sendCodeNetwork: 'No se pudo conectar con el servidor para enviar el código.',
      verifyCode: 'Ocurrió un error al verificar el código.',
      verifyNetwork: 'No se pudo conectar con el servidor de correos.',
    },
    button: {
      loading: 'Procesando...',
      verify: 'Verificar Código y Enviar',
      submit: 'Enviar Solicitud',
    },
  },
  footer: {
    subtitle: 'Ingeniería y Seguridad de Clase Mundial',
    company: 'Compañía',
    legal: 'Legal',
    privacy: 'Aviso de Privacidad',
    terms: 'Términos de Servicio',
    cookies: 'Política de Cookies',
    rights: 'Todos los derechos reservados.',
    operating: 'Operando con ',
    hq: 'HQ en Guadalupe, Zacatecas.',
  },
  cookieBanner: {
    text: 'Este sitio utiliza cookies propias y de terceros para ofrecerte una mejor experiencia. Puedes leer más en ',
    and: ' y ',
    accept: 'Aceptar',
    reject: 'Rechazar',
  },
};
