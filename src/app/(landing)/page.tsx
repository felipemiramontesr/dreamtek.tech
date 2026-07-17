import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import dynamic from 'next/dynamic';

const Products = dynamic(() =>
  import('@/components/sections/Products').then((mod) => mod.Products),
);
const Differential = dynamic(() =>
  import('@/components/sections/Differential').then((mod) => mod.Differential),
);
const Contact = dynamic(() => import('@/components/sections/Contact').then((mod) => mod.Contact));
import { es } from '@/i18n/dictionaries/es';

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
                  'ERP modular y mutable para el control integral de activos logísticos y flotas operacionales en tiempo real con encriptación ALE y Blind Indexing.',
              },
            ],
          }),
        }}
      />
      <div aria-hidden="true" className="hidden" />
    </>
  );
}
