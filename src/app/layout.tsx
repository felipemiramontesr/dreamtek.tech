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
});

export const metadata: Metadata = {
  metadataBase: new URL('https://dreamtek.tech'),
  title: {
    default: 'Dreamtek. | Desarrollo Web & Ciberseguridad Premium',
    template: '%s | Dreamtek.',
  },

  description:
    'Convertimos visiones complejas en infraestructura digital robusta. Ingeniería, aplicaciones móviles y ciberseguridad de clase mundial con metodología Security by Design.',
  keywords: [
    'Desarrollo Web Zacatecas',
    'Ciberseguridad México',
    'Desarrollo Next.js',
    'React 19',
    'Aplicaciones Móviles Premium',
    'Security by Design',
    'Auditoría de Software',
    'Páginas Web Guadalupe Zacatecas',
    'Infraestructura Digital',
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
    title: 'Dreamtek. | Desarrollo Web & Ciberseguridad Premium',
    description:
      'Convertimos visiones complejas en infraestructura digital robusta con estándar global en desarrollo y seguridad.',
    siteName: 'Dreamtek',
    images: [
      {
        url: '/svg/24_DREAMTEK_LOGO_LOGOTIPO_Teck Red.svg',
        width: 1200,
        height: 630,
        alt: 'Dreamtek Logo',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${neueMontreal.variable} antialiased h-full scroll-smooth`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
