import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ignorar archivos estáticos, API, imágenes y fuentes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/svg') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/fonts') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|otf|ttf|woff|woff2)$/)
  ) {
    return NextResponse.next();
  }

  // Verificar preferencia por cookie
  const cookieLang = request.cookies.get('dreamtek_lang_preference')?.value;

  // Verificar cabecera Accept-Language si no hay cookie
  let browserLang = 'es';
  if (!cookieLang) {
    const acceptLanguage = request.headers.get('accept-language');
    if (acceptLanguage && acceptLanguage.toLowerCase().startsWith('en')) {
      browserLang = 'en';
    }
  }

  const preferredLang = cookieLang || browserLang;

  // Redirigir de la raíz (/) a /en si el usuario prefiere inglés
  if (preferredLang === 'en' && pathname === '/') {
    return NextResponse.redirect(new URL('/en', request.url));
  }

  // Redirigir páginas legales en español a su versión en inglés si prefiere inglés
  const isSpanishLegalPage = ['/privacidad', '/terminos', '/cookies'].includes(pathname);
  if (preferredLang === 'en' && isSpanishLegalPage) {
    return NextResponse.redirect(new URL(`/en${pathname}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
