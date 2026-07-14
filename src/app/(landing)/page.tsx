export default function Home() {
  return (
    <>
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
