import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export default function Privacidad() {
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
            Aviso de Privacidad
          </h1>

          <div className="glass-panel p-8 sm:p-12 rounded-2xl space-y-8 text-white/80 font-light leading-relaxed text-base">
            <p className="text-sm text-white/40">Última actualización: 6 de julio de 2026</p>

            <p>
              En <strong>Dreamtek.tech</strong> (en adelante, &ldquo;Dreamtek&rdquo;), nos tomamos
              muy en serio la seguridad y la privacidad de tus datos. Este Aviso de Privacidad
              describe cómo recopilamos, utilizamos, almacenamos y protegemos la información
              personal que nos proporcionas a través de nuestro formulario de contacto en nuestro
              sitio web.
            </p>

            <hr className="border-white/10" />

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">
                1. Identidad y Domicilio del Responsable
              </h3>
              <p>
                Dreamtek, operando bajo las leyes vigentes y con sede de operaciones tecnológicas en{' '}
                <strong>Guadalupe, Zacatecas, México</strong>, es el responsable del tratamiento de
                tus datos personales recabados a través de esta plataforma.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">2. Datos Personales Recopilados</h3>
              <p>
                Para atender tus solicitudes de cotización, diagnóstico inicial o consultoría
                técnica, recopilamos únicamente los siguientes datos esenciales:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Nombre Completo:</strong> Para dirigirnos de manera personalizada y
                  profesional.
                </li>
                <li>
                  <strong>Correo Electrónico:</strong> Como canal primario de comunicación y envío
                  de reportes o propuestas comerciales.
                </li>
                <li>
                  <strong>Servicio de Interés:</strong> Para perfilar técnicamente tu solicitud.
                </li>
                <li>
                  <strong>Mensaje / Información del Proyecto:</strong> Detalles técnicos provistos
                  voluntariamente para la cotización.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">
                3. Finalidad del Tratamiento de Datos
              </h3>
              <p>
                Tus datos serán tratados de manera confidencial y exclusivamente para los siguientes
                fines primarios relacionados con nuestro servicio:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Procesar y responder a tu solicitud de cotización o diagnóstico técnico.</li>
                <li>
                  Establecer contacto directo para discutir el alcance de los proyectos de
                  desarrollo o ciberseguridad.
                </li>
                <li>
                  Enviar propuestas comerciales formales relativas a los servicios solicitados.
                </li>
              </ul>
              <p className="text-sm text-white/60 mt-2">
                * No realizamos campañas masivas de spam ni transferimos tus datos a terceros con
                fines publicitarios.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">4. Seguridad y Retención de Datos</h3>
              <p>
                Aplicando nuestro principio de <strong>Security by Design</strong>, implementamos
                medidas de seguridad administrativas, técnicas y físicas para salvaguardar tu
                información contra daño, pérdida, alteración, destrucción o el uso, acceso o
                tratamiento no autorizado.
              </p>
              <p>
                Tus datos de contacto se almacenarán de forma cifrada en nuestros servidores de
                correo y bases de datos seguros durante el tiempo estrictamente necesario para
                cumplir con la relación comercial o legal respectiva.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">
                5. Derechos ARCO (Acceso, Rectificación, Cancelación y Oposición)
              </h3>
              <p>
                Tienes derecho a conocer qué datos personales tenemos de ti, para qué los utilizamos
                y las condiciones del uso que les damos (Acceso). Asimismo, es tu derecho solicitar
                la corrección de tu información personal en caso de que esté desactualizada o sea
                inexacta (Rectificación); que la eliminemos de nuestros registros o bases de datos
                (Cancelación); así como oponerte al uso de tus datos para fines específicos
                (Oposición).
              </p>
              <p>
                Para ejercer cualquiera de tus derechos ARCO, puedes redactar una solicitud formal
                dirigida a nuestro correo corporativo:{' '}
                <a
                  href="mailto:contacto@dreamtek.tech"
                  className="text-[#FF2D00] hover:underline font-medium"
                >
                  contacto@dreamtek.tech
                </a>
                , detallando el derecho que deseas ejercer y adjuntando una identificación oficial
                para verificar tu titularidad.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">
                6. Modificaciones al Aviso de Privacidad
              </h3>
              <p>
                Nos reservamos el derecho de efectuar en cualquier momento modificaciones o
                actualizaciones al presente aviso, para la atención de novedades legislativas o
                jurisprudenciales, políticas internas o nuevos requerimientos en nuestros servicios.
                Cualquier cambio estará disponible directamente en esta URL.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
