import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import { Products } from '@/components/sections/Products';
import { Differential } from '@/components/sections/Differential';
import { Contact } from '@/components/sections/Contact';
import { en } from '@/i18n/dictionaries/en';

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
                address: {
                  '@type': 'PostalAddress',
                  addressLocality: 'Guadalupe',
                  addressRegion: 'Zacatecas',
                  addressCountry: 'MX',
                },
              },
              {
                '@type': 'SoftwareApplication',
                name: 'ARCHON — Fleet Manager',
                operatingSystem: 'All',
                applicationCategory: 'BusinessApplication',
                description:
                  'Modular and mutable ERP for comprehensive control of logistics assets and operational fleets in real-time with ALE encryption and Blind Indexing.',
              },
            ],
          }),
        }}
      />
      <div aria-hidden="true" className="hidden" />
    </>
  );
}
