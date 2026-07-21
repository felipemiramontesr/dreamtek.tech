import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ClientWrapper } from '@/components/layout/ClientWrapper';

const neueMontreal = localFont({
  src: [
    {
      path: '../../public/fonts/PPNeueMontreal-Book.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/PPNeueMontreal-Italic.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../../public/fonts/PPNeueMontreal-Medium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/PPNeueMontreal-Bold.otf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-neue-montreal',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL('https://dreamtek.tech'),
  title: {
    default: 'Dreamtek | Desarrollo Web, Mobile Apps y Ciberseguridad',
    template: '%s | Dreamtek',
  },
  description:
    'Convertimos visiones complejas en infraestructura digital robusta. Desarrollo Web de alto rendimiento, Aplicaciones Nativas, ERP modular ARCHON Fleet Manager y Ciberseguridad Ofensiva bajo estándar Security by Design.',
  keywords: [
    'Dreamtek',
    'Desarrollo Web Mexico',
    'Aplicaciones Web Nativas',
    'ERP mutable ARCHON',
    'Fleet Management Software',
    'Ciberseguridad Ofensiva',
    'Hacking Etico Empresarial',
    'Auditoria de Ciberseguridad',
    'Next.js 16 App Router',
    'Security by Design',
    'Desarrollo de Software Zacatecas',
  ],
  authors: [{ name: 'Dreamtek Team', url: 'https://dreamtek.tech' }],
  creator: 'Dreamtek',
  publisher: 'Dreamtek',
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    alternateLocale: ['en_US'],
    url: 'https://dreamtek.tech',
    title: 'Dreamtek | Desarrollo Web, Mobile Apps y Ciberseguridad',
    description:
      'Convertimos visiones complejas en infraestructura digital robusta. Desarrollo Web de alto rendimiento, Aplicaciones Nativas, ERP modular ARCHON Fleet Manager y Ciberseguridad Ofensiva bajo estándar Security by Design.',
    siteName: 'Dreamtek',
    images: [
      {
        url: 'https://dreamtek.tech/svg/24_DREAMTEK_LOGO_LOGOTIPO_Teck%20Red.svg',
        width: 1200,
        height: 630,
        alt: 'Dreamtek Logotipo Oficial',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dreamtek | Desarrollo Web, Mobile Apps y Ciberseguridad',
    description:
      'Convertimos visiones complejas en infraestructura digital robusta. Creadores del ERP modular ARCHON, StarterKit Digital y Ciberseguridad Ofensiva.',
    images: ['https://dreamtek.tech/svg/24_DREAMTEK_LOGO_LOGOTIPO_Teck%20Red.svg'],
    creator: '@dreamtek_tech',
  },
  alternates: {
    canonical: 'https://dreamtek.tech',
    languages: {
      'es-MX': 'https://dreamtek.tech',
      'en-US': 'https://dreamtek.tech/en',
      'x-default': 'https://dreamtek.tech',
    },
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Dreamtek',
  },
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#00213d',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${neueMontreal.variable} antialiased h-full scroll-smooth`}>
      <head></head>
      <body className="min-h-full flex flex-col bg-deep-space text-off-white">
        <ClientWrapper>{children}</ClientWrapper>
      </body>
    </html>
  );
}
