import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import dynamic from 'next/dynamic';
import { es } from '@/i18n/dictionaries/es';

const Products = dynamic(() =>
  import('@/components/sections/Products').then((mod) => mod.Products),
);
const Differential = dynamic(() =>
  import('@/components/sections/Differential').then((mod) => mod.Differential),
);
const Contact = dynamic(() => import('@/components/sections/Contact').then((mod) => mod.Contact));

export default function Home() {
  return (
    <>
      <main className="flex flex-col min-h-screen">
        <Hero dict={es} />
        <Services dict={es} />
        <Products dict={es} />
        <Differential dict={es} />
        <Contact dict={es} />
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Corporation',
                '@id': 'https://dreamtek.tech/#corporation',
                name: 'Dreamtek',
                url: 'https://dreamtek.tech/',
                logo: 'https://dreamtek.tech/svg/24_DREAMTEK_LOGO_LOGOTIPO_Teck%20Red.svg',
                description:
                  'Convertimos visiones complejas en infraestructura digital robusta. Desarrollo Web, Aplicaciones Nativas y Ciberseguridad Ofensiva.',
                address: {
                  '@type': 'PostalAddress',
                  addressLocality: 'Guadalupe',
                  addressRegion: 'Zacatecas',
                  addressCountry: 'MX',
                },
                contactPoint: {
                  '@type': 'ContactPoint',
                  contactType: 'sales & technical support',
                  email: 'contacto@dreamtek.tech',
                  availableLanguage: ['Spanish', 'English'],
                },
                sameAs: ['https://dreamtek.tech'],
              },
              {
                '@type': 'WebSite',
                '@id': 'https://dreamtek.tech/#website',
                url: 'https://dreamtek.tech/',
                name: 'Dreamtek.tech',
                inLanguage: 'es-MX',
                publisher: { '@id': 'https://dreamtek.tech/#corporation' },
              },
              {
                '@type': 'ProfessionalService',
                '@id': 'https://dreamtek.tech/#service',
                name: 'Dreamtek Digital Engineering & Security Services',
                url: 'https://dreamtek.tech/',
                priceRange: '$$$',
                currenciesAccepted: 'MXN, USD',
                address: {
                  '@type': 'PostalAddress',
                  addressLocality: 'Guadalupe',
                  addressRegion: 'Zacatecas',
                  addressCountry: 'MX',
                },
                description:
                  'Servicios profesionales de desarrollo web Next.js, arquitectura de software mutable, auditorías de ciberseguridad ofensiva y hacking ético.',
              },
              {
                '@type': 'SoftwareApplication',
                name: 'ARCHON — Fleet Manager',
                operatingSystem: 'Web, iOS, Android',
                applicationCategory: 'BusinessApplication',
                description:
                  'ERP modular y mutable para el control integral de activos logísticos y flotas operacionales en tiempo real con encriptación ALE y Blind Indexing.',
                offers: {
                  '@type': 'Offer',
                  priceCurrency: 'USD',
                  price: '149.00',
                  availability: 'https://schema.org/InStock',
                },
              },
              {
                '@type': 'FAQPage',
                mainEntity: [
                  {
                    '@type': 'Question',
                    name: '¿Qué incluye la plantilla / modelo gráfico de Dreamtek?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Incluye arquitectura Next.js 16 con App Router, renderizado optimizado, responsive design para móviles/escritorio, cifrado de 2FA en formularios y optimización de velocidad extrema.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: '¿Qué es la arquitectura mutable en el ERP ARCHON?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Permite modificar la estructura de base de datos, módulos logísticos y flujos operacionales en caliente sin detener el servidor ni romper integraciones previas.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: '¿Cómo garantizan el estándar Security by Design?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Aplicamos encriptación de datos en reposo y en tránsito (ALE & Blind Indexing), saneamiento estricto de CSP en proxy y pruebas pen-testing de ciberseguridad ofensiva.',
                    },
                  },
                ],
              },
            ],
          }),
        }}
      />
      <div aria-hidden="true" className="hidden" />
    </>
  );
}
