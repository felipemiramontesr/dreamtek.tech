export default function HomeEN() {
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
