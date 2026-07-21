import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad Corporativo',
  description:
    'Aviso de privacidad y protección de datos personales de Dreamtek.tech bajo lineamientos del INAI y normatividad vigente.',
  alternates: {
    canonical: 'https://dreamtek.tech/privacidad',
    languages: {
      es: 'https://dreamtek.tech/privacidad',
      en: 'https://dreamtek.tech/en/privacidad',
    },
  },
};

export default function Privacidad() {
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
            Aviso de Privacidad
          </h1>

          <div className="glass-panel p-8 sm:p-12 rounded-2xl space-y-8 text-white/80 font-light leading-relaxed text-base text-justify">
            <h2 className="text-2xl font-bold text-white mb-2 text-left">
              Aviso de Privacidad Integral
            </h2>
            <p className="text-sm text-white/40 text-left">
              Última actualización: 14 de julio de 2026
            </p>

            <p>
              Felipe de Jesús Miramontes Romero (en adelante comercialmente conocido como
              &ldquo;Dreamtek&rdquo;), con domicilio para oír y recibir notificaciones en Guadalupe,
              Zacatecas, México, y portal web{' '}
              <a href="https://dreamtek.tech" className="text-[#FF2D00] hover:underline">
                https://dreamtek.tech
              </a>
              , es el responsable del uso y protección de sus datos personales. Al respecto, le
              informamos lo siguiente:
            </p>

            <hr className="border-white/10" />

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                1. Datos Personales que Recopilamos
              </h3>
              <p>
                Para llevar a cabo las finalidades descritas en el presente aviso de privacidad,
                utilizaremos los siguientes datos personales, recabados a través de nuestro
                formulario de contacto:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Nombre completo.</li>
                <li>Dirección de correo electrónico corporativo o personal.</li>
                <li>Servicio o plan de interés seleccionado.</li>
                <li>
                  Detalles técnicos e información del proyecto provistos voluntariamente en el
                  mensaje.
                </li>
              </ul>
              <p>
                Le informamos que Dreamtek no solicita ni trata datos personales sensibles (tales
                como origen racial, estado de salud, información genética, creencias religiosas,
                filosóficas y morales, afiliación sindical, opiniones políticas o preferencia
                sexual).
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                2. Finalidades del Tratamiento de los Datos
              </h3>
              <p>
                Los datos personales que recabamos de usted los utilizaremos para las siguientes
                finalidades primarias, las cuales son necesarias para el servicio o diagnóstico
                técnico que solicita:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Identificarlo, autenticarlo y perfilar técnicamente su solicitud comercial.</li>
                <li>
                  Atender, procesar y responder a sus requerimientos de cotización, diagnóstico
                  inicial o consultoría de ingeniería y ciberseguridad.
                </li>
                <li>
                  Establecer un canal de comunicación directo y seguro para discutir el alcance de
                  los proyectos.
                </li>
                <li>
                  Elaborar y enviar propuestas económicas formales basadas en las necesidades
                  planteadas.
                </li>
              </ul>
              <p className="font-semibold text-white">Finalidades secundarias:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Informarle sobre actualizaciones críticas de software, parches de seguridad o
                  evoluciones de nuestros productos core (ARCHON y StarterKit), siempre y cuando no
                  haya manifestado su oposición al respecto.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                3. Mecanismo para Negarse al Tratamiento de Finalidades Secundarias
              </h3>
              <p>
                En caso de que no desee que sus datos personales sean tratados para las finalidades
                secundarias mencionadas, usted puede manifestar su negativa desde este momento
                enviando un correo electrónico a{' '}
                <a href="mailto:contacto@dreamtek.tech" className="text-[#FF2D00] hover:underline">
                  contacto@dreamtek.tech
                </a>
                . La negativa para el uso de sus datos personales para estas finalidades no podrá
                ser un motivo para que le neguemos los servicios y productos que solicita con
                nosotros.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                4. Transferencia de Datos Personales
              </h3>
              <p>
                Dreamtek se compromete a no transferir, vender ni compartir su información personal
                con terceros ajenos a la organización sin su consentimiento explícito, salvo por las
                excepciones previstas en el artículo 37 de la LFPDPPP, así como a realizar dichas
                transferencias en los términos que fija dicha ley, o ante requerimientos
                obligatorios de autoridades judiciales o regulatorias competentes.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                5. Medidas de Seguridad Tecnológica (Security by Design)
              </h3>
              <p>
                En concordancia con nuestra metodología interna Security by Design y protocolos
                avanzados de criptografía aplicada, implementamos estrictas medidas de seguridad
                técnicas, administrativas y físicas para proteger sus datos contra daño, pérdida,
                alteración, destrucción o el uso, acceso o tratamiento no autorizado.
              </p>
              <p>
                Los datos enviados a través del sitio web se transmiten de manera encriptada y se
                resguardan utilizando infraestructura segura, con políticas estrictas de cifrado en
                bases de datos y control de accesos restringido.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                6. Derechos ARCO y Revocación del Consentimiento
              </h3>
              <p>
                Usted tiene derecho a conocer qué datos personales tenemos de usted, para qué los
                utilizamos y las condiciones del uso que les damos (Acceso). Asimismo, es su derecho
                solicitar la corrección de su información personal en caso de que esté
                desactualizada, sea inexacta o esté incompleta (Rectificación); que la eliminemos de
                nuestros registros o bases de datos cuando considere que la misma no está siendo
                utilizada adecuadamente (Cancelación); así como oponerse al uso de sus datos
                personales para fines específicos (Oposición). Estos derechos se conocen como
                derechos ARCO.
              </p>
              <p>
                Para el ejercicio de cualquiera de los derechos ARCO, así como para revocar el
                consentimiento otorgado para el tratamiento de sus datos, usted deberá presentar la
                solicitud respectiva vía correo electrónico a la dirección:{' '}
                <a href="mailto:contacto@dreamtek.tech" className="text-[#FF2D00] hover:underline">
                  contacto@dreamtek.tech
                </a>
              </p>
              <p>La solicitud deberá contener y acompañar lo siguiente:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Su nombre y dirección de correo electrónico para comunicarle la respuesta.</li>
                <li>
                  Los documentos que acrediten su identidad (copia de identificación oficial
                  vigente).
                </li>
                <li>
                  La descripción clara y precisa de los datos personales respecto de los que busca
                  ejercer alguno de los derechos ARCO.
                </li>
                <li>
                  Cualquier otro elemento que facilite la localización de los datos personales.
                </li>
              </ul>
              <p>
                El plazo para atender y resolver su solicitud será de un máximo de 20 días hábiles,
                contados a partir de la fecha de su recepción conforme a la legislación aplicable.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                7. Uso de Tecnologías de Rastreo (Cookies y Web Beacons)
              </h3>
              <p>
                Le informamos que en nuestra página de internet utilizamos cookies y otras
                tecnologías a través de las cuales es posible monitorear su comportamiento como
                usuario de internet, con el único fin de brindarle una mejor experiencia y
                rendimiento de navegación (optimización extrema de velocidad).
              </p>
              <p>
                Los datos que se obtienen de estas tecnologías de rastreo son de carácter técnico
                (direcciones IP anonimizadas, tipos de navegador, preferencias de idioma) y no
                permiten la identificación nominal del usuario. Usted puede deshabilitar o
                configurar el uso de cookies directamente en las opciones de configuración de su
                navegador web.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white text-left">
                8. Cambios al Aviso de Privacidad
              </h3>
              <p>
                El presente aviso de privacidad puede sufrir modificaciones, cambios o
                actualizaciones derivadas de nuevos requerimientos legales, de nuestras propias
                necesidades por los productos o servicios que ofrecemos, de nuestras prácticas de
                privacidad, o por cambios en nuestros modelos de infraestructura.
              </p>
              <p>
                Nos comprometemos a mantenerlo informado sobre los cambios que pueda sufrir el
                presente aviso de privacidad a través de su publicación directa en nuestro portal
                web.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
