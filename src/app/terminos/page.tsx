import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export default function Terminos() {
  return (
    <main className="flex flex-col min-h-screen">
      <Navbar />

      <section className="relative flex-grow pt-32 pb-24 bg-gradient-to-br from-[#00213d] via-[#00172B] to-black">
        {/* Background graphic effect */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_center,rgba(255,45,0,0.15)_0%,transparent_60%)]" />

        <div className="relative z-10 max-w-[1440px] mx-auto px-6">
          <span className="text-[#FF2D00] text-xs font-bold uppercase tracking-widest block mb-4">
            Documento Legal
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-10 tracking-tight">
            Términos de Servicio
          </h1>

          <div className="glass-panel p-8 sm:p-12 rounded-2xl space-y-8 text-white/80 font-light leading-relaxed text-base">
            <p className="text-sm text-white/40">Última actualización: 6 de julio de 2026</p>

            <p>
              Bienvenido a <strong>Dreamtek.tech</strong>. Al acceder y navegar en nuestro sitio
              web, aceptas cumplir con los términos y condiciones descritos en este documento. Si no
              estás de acuerdo con alguna de estas condiciones, te recomendamos abstenerte de
              utilizar nuestro sitio y servicios.
            </p>

            <hr className="border-white/10" />

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">1. Propiedad Intelectual</h3>
              <p>
                Todo el contenido disponible en este sitio, incluyendo pero no limitado a logotipos,
                textos, gráficos, código de programación, iconos de interfaz, tipografía y
                arquitectura visual es propiedad intelectual exclusiva de <strong>Dreamtek</strong>{' '}
                o de sus respectivos licenciantes, y está protegido por las leyes de propiedad
                intelectual internacionales y nacionales.
              </p>
              <p>
                Se prohíbe la reproducción, copia, distribución o modificación de cualquier parte de
                este sitio sin el consentimiento expreso y por escrito de nuestro equipo legal.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">2. Uso Aceptable del Sitio</h3>
              <p>
                Como usuario, te comprometes a hacer un uso lícito y ético de la plataforma. Queda
                estrictamente prohibido:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Intentar vulnerar la seguridad, realizar escaneos no autorizados o ataques de
                  denegación de servicio (DDoS) contra los servidores de la plataforma.
                </li>
                <li>
                  Proporcionar información falsa, engañosa o malintencionada a través de nuestro
                  formulario de contacto.
                </li>
                <li>
                  Utilizar técnicas de scraping o extracción de datos automática sin autorización
                  previa por escrito.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">
                3. Prestación de Servicios de Consultoría
              </h3>
              <p>
                La información de costos, alcances e hitos detallada en la sección de planes es
                estimativa e ilustrativa para guiar al usuario. Cada proyecto formalizado con
                Dreamtek requiere la firma de un Contrato de Prestación de Servicios de Software o
                Auditoría Técnica donde se pactarán las cláusulas contractuales definitivas, los
                acuerdos de nivel de servicio (SLA) y los alcances definitivos.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">4. Limitación de Responsabilidad</h3>
              <p>
                Aunque aplicamos estrictos estándares de <strong>Security by Design</strong> y nos
                esforzamos por garantizar la máxima disponibilidad y corrección de la información de
                este sitio web, Dreamtek no se hace responsable por interrupciones temporales del
                servicio debidas a fallas de red del hosting, mantenimientos del proveedor o ataques
                externos de fuerza mayor.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">5. Jurisdicción y Ley Aplicable</h3>
              <p>
                Para la resolución de cualquier conflicto derivado de la interpretación o ejecución
                de estos términos de servicio, las partes acuerdan someterse expresamente a la
                jurisdicción de los tribunales competentes y leyes aplicables del estado de{' '}
                <strong>Zacatecas, México</strong>, renunciando a cualquier otro fuero que pudiera
                corresponderles en razón de sus domicilios presentes o futuros.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">6. Contacto</h3>
              <p>
                Si tienes preguntas sobre nuestros Términos de Servicio, puedes comunicarte
                directamente con nuestra área de ingeniería en{' '}
                <a
                  href="mailto:contacto@dreamtek.tech"
                  className="text-[#FF2D00] hover:underline font-medium"
                >
                  contacto@dreamtek.tech
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
