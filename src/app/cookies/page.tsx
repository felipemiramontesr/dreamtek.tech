export default function CookiesPage() {
  return (
    <main className="flex flex-col min-h-screen pt-20">
      <section className="relative flex-grow pt-12 pb-24 bg-gradient-to-br from-[#00213d] via-[#00172B] to-black">
        {/* Background graphic effect */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_center,rgba(255,45,0,0.15)_0%,transparent_60%)]" />

        <div className="relative z-10 max-w-[1440px] mx-auto px-6">
          <span className="text-[#FF2D00] text-xs font-bold uppercase tracking-widest block mb-4">
            Documento Legal
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-10 tracking-tight">
            Manejo de Cookies
          </h1>

          <div className="glass-panel p-8 sm:p-12 rounded-2xl space-y-8 text-white/80 font-light leading-relaxed text-base text-justify">
            <h2 className="text-2xl font-bold text-white mb-2 text-left">
              Política de Manejo de Cookies y Tecnologías de Almacenamiento
            </h2>
            <p className="text-sm text-white/40 text-left">
              Última actualización: 14 de julio de 2026
            </p>

            <p>
              En Dreamtek.tech (en adelante, &ldquo;Dreamtek&rdquo;), operado por Felipe de Jesús
              Miramontes Romero, utilizamos cookies, web beacons y tecnologías equivalentes de
              almacenamiento local (localStorage) para garantizar el correcto funcionamiento de
              nuestra infraestructura digital, optimizar la velocidad de carga y analizar de forma
              anonimizada la navegación en nuestra plataforma.
            </p>
            <p>
              A continuación, le informamos de manera transparente y detallada sobre el uso, la
              finalidad y los mecanismos de control de estas tecnologías en nuestro sitio web.
            </p>

            <hr className="border-white/10" />

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                1. ¿Qué son las Cookies y Tecnologías Similares?
              </h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Cookies:</strong> Son pequeños archivos de texto que los sitios web
                  almacenan en su navegador o dispositivo al visitarlos. Permiten registrar
                  parámetros técnicos y preferencias de navegación de forma automatizada.
                </li>
                <li>
                  <strong>Web Beacons / Píxeles:</strong> Son micro-imágenes o fragmentos de código
                  invisibles inyectados en la web que sirven para medir métricas de comportamiento y
                  flujos de tráfico.
                </li>
                <li>
                  <strong>Almacenamiento Local (localStorage):</strong> Es una tecnología nativa del
                  navegador que permite almacenar datos de configuración del lado del cliente de
                  manera persistente, sin caducidad automática, optimizando la latencia del sitio.
                </li>
              </ul>
              <p>
                Estas tecnologías no extraen información de su disco duro, no dañan su dispositivo
                ni recolectan datos personales que permitan identificarlo nominalmente a menos que
                usted los provea de forma voluntaria.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                2. Clasificación y Finalidad de las Cookies Utilizadas
              </h3>
              <p>
                En Dreamtek gestionamos estas tecnologías bajo un estricto criterio de minimización
                de datos:
              </p>
              <ul className="space-y-4">
                <li>
                  <strong>A. Cookies y Almacenamiento Técnico (Estrictamente Necesarias):</strong>{' '}
                  Son indispensables para permitirle la navegación por el sitio y el uso de sus
                  opciones de seguridad.
                  <br />
                  <span className="text-sm text-white/60">
                    Ejemplo técnico: Utilizamos localStorage (cookie-banner o estados de
                    consentimiento) de forma exclusiva para recordar si usted aceptó o rechazó las
                    políticas, evitando desplegar el banner de forma invasiva en cada sesión. Estas
                    tecnologías no pueden ser desactivadas en nuestro sistema central porque la web
                    no cargaría correctamente.
                  </span>
                </li>
                <li>
                  <strong>B. Cookies de Rendimiento y Rendimiento Extremo:</strong> Guardan
                  configuraciones de renderizado estético (como variables de Tailwind CSS o fuentes
                  optimizadas) con el único fin de acelerar la velocidad de respuesta del sitio al
                  retornar a él.
                </li>
                <li>
                  <strong>C. Cookies Analíticas y Estadísticas (De Terceros):</strong> Son
                  herramientas que, al activarse, recopilan información de tráfico de manera
                  agregada e integral (páginas más visitadas, tiempos de permanencia, procedencia
                  geográfica del tráfico). Estos datos se procesan de forma estrictamente
                  anonimizada e IP enmascarada, impidiendo la creación de perfiles de identidad
                  específicos.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                3. Gestión del Consentimiento: Banner de Configuración
              </h3>
              <p>
                En cumplimiento con los estándares de privacidad más exigentes, Dreamtek implementa
                un sistema de consentimiento activo antes de disparar cualquier tecnología de
                rastreo opcional:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Al dar clic en &quot;Aceptar&quot;:</strong> Usted autoriza el uso de la
                  totalidad de las cookies (técnicas y analíticas) detalladas en esta política.
                  Guardaremos dicho estado técnico en su navegador.
                </li>
                <li>
                  <strong>Al dar clic en &quot;Rechazar&quot;:</strong> Bloquearemos de manera
                  inmediata la ejecución de cualquier script analítico o pixel de terceros. El sitio
                  web operará únicamente con las cookies técnicas indispensables para asegurar la
                  visualización básica y los estilos de la interfaz.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                4. Control y Desactivación desde el Navegador
              </h3>
              <p>
                Además de las opciones que le proporciona nuestro banner, usted puede configurar,
                bloquear o eliminar las cookies en cualquier momento directamente desde los menús de
                privacidad de su navegador:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Google Chrome:</strong> Configuración &gt; Privacidad y seguridad &gt;
                  Cookies y otros datos de sitios.
                </li>
                <li>
                  <strong>Mozilla Firefox:</strong> Ajustes &gt; Privacidad &amp; Seguridad &gt;
                  Cookies y datos del sitio.
                </li>
                <li>
                  <strong>Safari (Mac/iOS):</strong> Preferencias / Ajustes &gt; Privacidad &gt;
                  Bloquear todas las cookies.
                </li>
                <li>
                  <strong>Microsoft Edge:</strong> Configuración &gt; Privacidad, búsqueda y
                  servicios &gt; Cookies y permisos del sitio.
                </li>
              </ul>
              <p className="text-sm text-white/60">
                Nota: Si decide bloquear la totalidad de las cookies desde su navegador (incluyendo
                las esenciales), algunas secciones de la landing page o de la interacción con el
                formulario podrían experimentar problemas de rendimiento o pérdida de
                funcionalidades.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                5. Plazos de Conservación de la Información
              </h3>
              <p>
                Las cookies técnicas del lado del cliente permanecerán en su dispositivo hasta que
                borre de forma manual el historial y la memoria caché de su navegador. Las cookies
                analíticas gestionadas por terceros tienen ventanas de expiración controladas por
                sus respectivos proveedores, los cuales operan bajo estrictos marcos de cumplimiento
                internacional.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                6. Modificaciones a la Presente Política
              </h3>
              <p>
                Dreamtek se reserva el derecho de actualizar este Manejo de Cookies para adaptarlo a
                nuevas regulaciones técnicas del consorcio W3C, lineamientos del INAI o directrices
                legislativas de ciberseguridad. Cualquier cambio relevante estará disponible
                permanentemente en esta sección.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
