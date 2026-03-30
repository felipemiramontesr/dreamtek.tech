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
  title: 'Dreamtek.',
  description:
    'Convertimos visiones complejas en infraestructura digital robusta con estándar global en desarrollo y seguridad.',
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
