import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://dreamtek.tech';
  const currentDate = new Date();

  return [
    {
      url: `${baseUrl}/`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
      alternates: {
        languages: {
          es: `${baseUrl}/`,
          en: `${baseUrl}/en`,
        },
      },
    },
    {
      url: `${baseUrl}/en`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
      alternates: {
        languages: {
          es: `${baseUrl}/`,
          en: `${baseUrl}/en`,
        },
      },
    },
    {
      url: `${baseUrl}/cookies`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.3,
      alternates: {
        languages: {
          es: `${baseUrl}/cookies`,
          en: `${baseUrl}/en/cookies`,
        },
      },
    },
    {
      url: `${baseUrl}/en/cookies`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.3,
      alternates: {
        languages: {
          es: `${baseUrl}/cookies`,
          en: `${baseUrl}/en/cookies`,
        },
      },
    },
    {
      url: `${baseUrl}/privacidad`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.3,
      alternates: {
        languages: {
          es: `${baseUrl}/privacidad`,
          en: `${baseUrl}/en/privacidad`,
        },
      },
    },
    {
      url: `${baseUrl}/en/privacidad`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.3,
      alternates: {
        languages: {
          es: `${baseUrl}/privacidad`,
          en: `${baseUrl}/en/privacidad`,
        },
      },
    },
    {
      url: `${baseUrl}/terminos`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.3,
      alternates: {
        languages: {
          es: `${baseUrl}/terminos`,
          en: `${baseUrl}/en/terminos`,
        },
      },
    },
    {
      url: `${baseUrl}/en/terminos`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.3,
      alternates: {
        languages: {
          es: `${baseUrl}/terminos`,
          en: `${baseUrl}/en/terminos`,
        },
      },
    },
  ];
}
