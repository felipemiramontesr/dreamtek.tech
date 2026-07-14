export default function Terminos() {
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
            Términos de Servicio
          </h1>

          <div className="glass-panel p-8 sm:p-12 rounded-2xl space-y-8 text-white/80 font-light leading-relaxed text-base text-justify">
            <h2 className="text-2xl font-bold text-white mb-2 text-left">
              Términos de Servicio y Condiciones de Uso
            </h2>
            <p className="text-sm text-white/40 text-left">
              Última actualización: 14 de julio de 2026
            </p>

            <p>
              Bienvenido al portal web de Dreamtek.tech (en adelante, el &quot;Sitio Web&quot;),
              operado por Felipe de Jesús Miramontes Romero (en adelante, &ldquo;Dreamtek&rdquo;).
              Los presentes Términos de Servicio regulan el acceso, navegación y uso del Sitio Web.
            </p>

            <hr className="border-white/10" />

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                1. Aceptación de los Términos (Consentimiento Electrónico)
              </h3>
              <p>
                Al acceder, navegar o utilizar este Sitio Web, así como al enviar cualquier
                información a través de nuestros formularios de contacto o validación, usted
                manifiesta su consentimiento expreso y acepta obligarse legalmente por los presentes
                Términos de Servicio, de conformidad con lo dispuesto en el artículo 80 del Código
                de Comercio y el artículo 1803 del Código Civil Federal de los Estados Unidos
                Mexicanos relativos al consentimiento otorgado por medios electrónicos. Si usted no
                está de acuerdo con la totalidad de estas condiciones, deberá abstenerse
                inmediatamente de utilizar este Sitio Web y sus servicios.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                2. Propiedad Intelectual e Industrial y Reserva de Derechos
              </h3>
              <p>
                Todo el contenido alojado o disponible en este Sitio Web, incluyendo de manera
                enunciativa más no limitativa: logotipos, isotipos, marcas comerciales, textos,
                manuales, gráficos, arquitectura de información, layouts visuales, interfaces, hojas
                de estilo de Tailwind CSS, tipografías y el código fuente subyacente (en adelante,
                la &quot;Propiedad Intelectual&quot;) es titularidad exclusiva de Dreamtek o de sus
                respectivos licenciantes, y se encuentra estrictamente protegido por la Ley Federal
                de Protección a la Propiedad Industrial, la Ley Federal del Derecho de Autor, así
                como por los tratados internacionales en la materia.
              </p>
              <p>
                Queda estrictamente prohibida la reproducción, copia, distribución, comunicación
                pública, modificación, licenciamiento, ingeniería inversa, descompilación o
                explotación total o parcial de cualquier componente de este Sitio Web o de sus
                productos de software (ARCHON, StarterKit Digital, MAPA-RD y arquitecturas
                asociadas) sin la autorización previa, expresa y por escrito de Dreamtek.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                3. Uso Aceptable y Prohibiciones Técnicas (Delitos Informáticos)
              </h3>
              <p>
                Como usuario, usted se obliga a interactuar con el Sitio Web de forma estrictamente
                lícita, ética y de buena fe. Queda estrictamente prohibido realizar las siguientes
                conductas, las cuales podrán ser consideradas conductas delictivas bajo el Código
                Penal Federal mexicano y legislaciones internacionales:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Realizar escaneos de vulnerabilidades no autorizados, port scanning, inyecciones
                  de código o ataques de Denegación de Servicio (DoS / DDoS) contra la
                  infraestructura de Dreamtek o sus proveedores de hosting.
                </li>
                <li>
                  Utilizar técnicas automatizadas de extracción de datos como web scraping, data
                  mining o extracción de metadatos sin autorización expresa por escrito.
                </li>
                <li>
                  Proporcionar información falsa, inexacta, suplantar identidades o utilizar correos
                  electrónicos corporativos sin la debida titularidad en nuestros formularios.
                </li>
                <li>
                  Manipular de cualquier forma el backend en PHP, bases de datos SQLite locales
                  (verify.db) o desviar las peticiones SMTP del correo corporativo.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                4. Naturaleza de la Información Comercial y Cotizaciones
              </h3>
              <p>
                El usuario reconoce y acepta que la información sobre características, hitos de
                desarrollo, igualas de StarterKit y descripciones modulares del ERP ARCHON
                contenidas en este Sitio Web poseen un carácter exclusivamente informativo,
                ilustrativo y de prospección comercial.
              </p>
              <p>
                La visualización de estos contenidos no constituye una oferta vinculante ni un
                contrato de adhesión. La prestación formal de cualquier servicio de ingeniería de
                software, consultoría en Inteligencia Artificial o auditorías de ciberseguridad
                ofensiva se perfeccionará única y exclusivamente mediante la firma digital o física
                de un Contrato de Prestación de Servicios Tecnológicos, donde se estipularán de
                mutuo acuerdo las cláusulas definitivas, los Acuerdos de Nivel de Servicio (SLA) y
                las matrices de responsabilidad correspondientes.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                5. Exclusión de Garantías y Limitación de Responsabilidad
              </h3>
              <p>
                Dreamtek aplica metodologías estrictas de Security by Design y despliegues atómicos
                automatizados a través de integración continua (CI/CD) para garantizar la
                disponibilidad y el correcto funcionamiento del Sitio Web. Sin embargo, en la máxima
                medida permitida por las leyes aplicables, Dreamtek no otorga ninguna garantía
                explícita o implícita sobre la infalibilidad, continuidad absoluta del servicio o la
                total ausencia de interrupciones técnicas derivadas de fallas en los nodos de red
                del proveedor de infraestructura (Hostinger), contingencias ajenas a nuestro control
                o eventos de fuerza mayor.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                6. Jurisdicción y Legislación Aplicable
              </h3>
              <p>
                Para todo lo relativo a la interpretación, cumplimiento o resolución de cualquier
                controversia o disputa legal derivada del uso de este Sitio Web o de los presentes
                Términos de Servicio, tanto el usuario como Dreamtek se someten de manera expresa e
                irrevocable a las leyes federales de los Estados Unidos Mexicanos y a la
                jurisdicción de los Tribunales Competentes con sede en la Ciudad de Zacatecas,
                Estado de Zacatecas, México, renunciando expresamente a cualquier otro fuero o
                jurisdicción que pudiera corresponderles en razón de sus domicilios presentes o
                futuros.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">7. Información de Contacto</h3>
              <p>
                Para cualquier aclaración de carácter legal, técnico o metodológico respecto a las
                presentes condiciones, usted puede ponerse en contacto directo con nuestra área
                jurídica e ingeniería a través de la dirección de correo electrónico institucional:{' '}
                <a href="mailto:contacto@dreamtek.tech" className="text-[#FF2D00] hover:underline">
                  contacto@dreamtek.tech
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
