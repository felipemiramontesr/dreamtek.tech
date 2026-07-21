import type { Metadata } from 'next';
import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import { Products } from '@/components/sections/Products';
import { Differential } from '@/components/sections/Differential';
import { Contact } from '@/components/sections/Contact';
import { en } from '@/i18n/dictionaries/en';

export const metadata: Metadata = {
  title: 'Dreamtek | Web Development, Mobile Apps & Cybersecurity',
  description:
    'We transform complex visions into robust digital infrastructure. High-performance Next.js Web Development, Native Apps, ARCHON Fleet Manager ERP, and Offensive Cybersecurity under Security by Design standards.',
  alternates: {
    canonical: 'https://dreamtek.tech/en',
    languages: {
      es: 'https://dreamtek.tech',
      en: 'https://dreamtek.tech/en',
    },
  },
  openGraph: {
    locale: 'en_US',
    title: 'Dreamtek | Web Development, Mobile Apps & Cybersecurity',
    description:
      'We transform complex visions into robust digital infrastructure. High-performance Next.js Web Development, Native Apps, ARCHON Fleet Manager ERP, and Offensive Cybersecurity.',
    url: 'https://dreamtek.tech/en',
  },
};

export default function HomeEN() {
  return (
    <>
      <main className="flex flex-col min-h-screen">
        <Hero dict={en} />
        <Services dict={en} />
        <Products dict={en} />
        <Differential dict={en} />
        <Contact dict={en} />
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
                url: 'https://dreamtek.tech/en',
                logo: 'https://dreamtek.tech/svg/24_DREAMTEK_LOGO_LOGOTIPO_Teck%20Red.svg',
                description:
                  'We transform complex visions into robust digital infrastructure. Web Development, Native Apps, and Offensive Cybersecurity.',
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
                  availableLanguage: ['English', 'Spanish'],
                },
                sameAs: ['https://dreamtek.tech/en'],
              },
              {
                '@type': 'WebSite',
                '@id': 'https://dreamtek.tech/en#website',
                url: 'https://dreamtek.tech/en',
                name: 'Dreamtek.tech',
                inLanguage: 'en-US',
                publisher: { '@id': 'https://dreamtek.tech/#corporation' },
              },
              {
                '@type': 'ProfessionalService',
                '@id': 'https://dreamtek.tech/en#service',
                name: 'Dreamtek Digital Engineering & Security Services',
                url: 'https://dreamtek.tech/en',
                priceRange: '$$$',
                currenciesAccepted: 'USD, MXN',
                address: {
                  '@type': 'PostalAddress',
                  addressLocality: 'Guadalupe',
                  addressRegion: 'Zacatecas',
                  addressCountry: 'MX',
                },
                description:
                  'Professional Next.js web development, mutable software architecture, offensive cybersecurity audits, and ethical hacking.',
              },
              {
                '@type': 'SoftwareApplication',
                name: 'ARCHON — Fleet Manager',
                operatingSystem: 'Web, iOS, Android',
                applicationCategory: 'BusinessApplication',
                description:
                  'Modular and mutable ERP for comprehensive control of logistics assets and operational fleets in real-time with ALE encryption and Blind Indexing.',
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
                    name: 'What does the Dreamtek graphical model / template include?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'It includes Next.js 16 App Router architecture, optimized rendering, responsive design for desktop and mobile, 2FA form encryption, and extreme speed optimization.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What is mutable architecture in the ARCHON ERP?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'It allows live modification of database structures, logistics modules, and operational workflows without server downtime or breaking existing integrations.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How do you guarantee Security by Design standards?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'We apply data encryption at rest and in transit (ALE & Blind Indexing), strict proxy CSP sanitization, and offensive pen-testing audits.',
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
