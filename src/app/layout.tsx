import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

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
    default: 'Dreamtek.',
    template: '%s | Dreamtek.',
  },

  description:
    'Convertimos visiones complejas en infraestructura digital robusta. Creadores del ERP modular y mutable ARCHON Fleet Manager, StarterKit Digital y ciberseguridad ofensiva bajo estándar Security by Design.',
  keywords: [
    'ERP mutable',
    'Software gestion de flotas',
    'Fleet management corporativo',
    'Ciberseguridad Mexico',
    'Hacking etico empresas',
    'Auditoria forense digital',
    'Orquestacion de IA',
    'Desarrollo Next.js',
    'Security by Design',
    'Dreamtek tech',
  ],
  authors: [{ name: 'Dreamtek Team', url: 'https://dreamtek.tech' }],
  creator: 'Dreamtek',
  publisher: 'Dreamtek',
  robots: {
    index: true,
    follow: true,
    nocache: true,
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
    url: 'https://dreamtek.tech',
    title: 'Dreamtek.',
    description:
      'Convertimos visiones complejas en infraestructura digital robusta. Creadores del ERP modular y mutable ARCHON Fleet Manager, StarterKit Digital y ciberseguridad ofensiva bajo estándar Security by Design.',
    siteName: 'Dreamtek',
    images: [
      {
        url: 'https://dreamtek.tech/svg/24_DREAMTEK_LOGO_LOGOTIPO_Teck%20Red.svg',
        width: 1200,
        height: 630,
        alt: 'Dreamtek Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dreamtek.',
    description:
      'Convertimos visiones complejas en infraestructura digital robusta. Creadores del ERP modular y mutable ARCHON Fleet Manager, StarterKit Digital y ciberseguridad ofensiva bajo estándar Security by Design.',
    images: ['https://dreamtek.tech/svg/24_DREAMTEK_LOGO_LOGOTIPO_Teck%20Red.svg'],
  },
  alternates: {
    languages: {
      es: 'https://dreamtek.tech',
      en: 'https://dreamtek.tech/en',
    },
  },
};

import { ClientWrapper } from '@/components/layout/ClientWrapper';

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
