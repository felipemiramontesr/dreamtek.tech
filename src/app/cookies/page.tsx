import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export default function CookiesPage() {
  return (
    <main className="flex flex-col min-h-screen">
      <Navbar />

      <section className="relative flex-grow pt-32 pb-24 bg-gradient-to-br from-[#00213d] via-[#00172B] to-black">
        {/* Background graphic effect */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_center,rgba(255,45,0,0.15)_0%,transparent_60%)]" />

        <div className="relative z-10 max-w-[1800px] mx-auto px-6">
          <span className="text-[#FF2D00] text-xs font-bold uppercase tracking-widest block mb-4">
            Documento Legal
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-10 tracking-tight">
            Manejo de Cookies
          </h1>

          <div className="glass-panel p-8 sm:p-12 rounded-2xl space-y-8 text-white/80 font-light leading-relaxed text-base">
            <p className="text-sm text-white/40">Última actualización: 6 de julio de 2026</p>

            <p>
              En <strong>Dreamtek.tech</strong> (&ldquo;Dreamtek&rdquo;), utilizamos cookies y
              tecnologías similares para mejorar la navegación, analizar el tráfico de nuestro sitio
              y asegurar el correcto funcionamiento de nuestra plataforma de desarrollo y
              ciberseguridad. A continuación, te explicamos detalladamente qué son, cuáles usamos y
              cómo puedes administrarlas.
            </p>

            <hr className="border-white/10" />

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">1. ¿Qué son las Cookies?</h3>
              <p>
                Las cookies son pequeños archivos de texto que se almacenan en tu navegador o
                dispositivo cuando visitas un sitio web. Permiten que la plataforma recuerde
                información sobre tu visita, como tus preferencias de idioma, decisiones de
                consentimiento y otros ajustes de navegación, facilitando tu próxima visita y
                haciendo que el sitio sea más útil.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">2. Tipos de Cookies que Utilizamos</h3>
              <p>Clasificamos las tecnologías que empleamos de la siguiente manera:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Cookies Técnicas y Esenciales:</strong> Son estrictamente necesarias para
                  el correcto funcionamiento del sitio. Por ejemplo, utilizamos el almacenamiento
                  local (<em>localStorage</em>) para recordar si ya has aceptado o rechazado nuestro
                  aviso de cookies, evitando mostrarte el banner de consentimiento de manera
                  repetitiva.
                </li>
                <li>
                  <strong>Cookies de Personalización y Rendimiento:</strong> Nos permiten optimizar
                  la velocidad de carga de la página y recordar ciertos parámetros estéticos del
                  sitio web según tus preferencias de visualización.
                </li>
                <li>
                  <strong>Cookies de Terceros (Estadísticas y Análisis):</strong> Podemos utilizar
                  servicios analíticos para comprender cómo interactúan los usuarios con nuestra
                  plataforma. Estos servicios recopilan información agregada y anónima sobre el
                  tráfico y las páginas más visitadas.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">
                3. Consentimiento y Almacenamiento Local
              </h3>
              <p>
                Al ingresar a nuestra web, se te presentará un banner informativo sobre el uso de
                cookies con opciones de <strong>Aceptar</strong> o <strong>Rechazar</strong>:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Si eliges <strong>Aceptar</strong>, guardaremos tu preferencia para que el aviso
                  no vuelva a aparecer durante tus próximas visitas.
                </li>
                <li>
                  Si eliges <strong>Rechazar</strong>, solo utilizaremos aquellas cookies y
                  tecnologías estrictamente indispensables para la correcta visualización de la web,
                  limitando cualquier funcionalidad de rastreo opcional.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">4. Cómo Deshabilitar las Cookies</h3>
              <p>
                Puedes permitir, bloquear o eliminar las cookies instaladas en tu equipo mediante la
                configuración de las opciones del navegador que utilizas:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Google Chrome:</strong> Configuración &gt; Privacidad y seguridad &gt;
                  Cookies y otros datos de sitios.
                </li>
                <li>
                  <strong>Mozilla Firefox:</strong> Opciones &gt; Privacidad &gt; Historial &gt;
                  Configuración Personalizada.
                </li>
                <li>
                  <strong>Safari:</strong> Preferencias &gt; Privacidad &gt; Bloquear todas las
                  cookies.
                </li>
                <li>
                  <strong>Microsoft Edge:</strong> Configuración &gt; Privacidad, búsqueda y
                  servicios &gt; Cookies y permisos del sitio.
                </li>
              </ul>
              <p className="text-sm text-white/60 mt-2">
                * Ten en cuenta que si deshabilitas todas las cookies, es posible que algunas
                funciones esenciales del sitio dejen de operar correctamente.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">5. Actualizaciones de esta Política</h3>
              <p>
                Podemos modificar esta Política de Cookies en función de nuevas exigencias
                legislativas, reglamentarias, o con la finalidad de adaptar dicha política a las
                instrucciones dictadas por las autoridades de protección de datos. Te recomendamos
                visitar esta página periódicamente para mantenerte informado.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
