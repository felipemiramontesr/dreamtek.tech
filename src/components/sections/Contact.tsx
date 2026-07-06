'use client';

import React, { useState } from 'react';
import { Button } from '../ui/Button';

export function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    service: 'web-starter',
    message: '',
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setFormData({ name: '', email: '', service: 'web-starter', message: '' });
      } else {
        setStatus('error');
        setErrorMessage(data.message || 'Ocurrió un error al enviar el mensaje.');
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
      setErrorMessage('No se pudo conectar con el servidor de correos.');
    }
  };

  return (
    <section id="contacto" className="py-24 relative overflow-hidden bg-black/40 scroll-mt-20">
      {/* Decorative gradient blob */}
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#FF2D00]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1440px] px-6 mx-auto w-full relative z-10">
        <div className="flex flex-col lg:flex-row gap-16 items-start">
          {/* Info Side */}
          <div className="lg:w-1/2">
            <span className="text-[#FF2D00] text-xs font-bold uppercase tracking-widest block mb-4">
              Contacto
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              ¿Listo para dar el{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
                siguiente paso?
              </span>
            </h2>
            <p className="text-white/60 font-light leading-relaxed mb-8 max-w-lg">
              Completa el formulario para solicitar un diagnóstico inicial o cotización. Nuestro
              equipo auditará tu requerimiento y responderá en menos de 24 horas hábiles.
            </p>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FF2D00]">
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <span className="text-xs text-white/40 block">Email Corporativo</span>
                  <a
                    href="mailto:contacto@dreamtek.tech"
                    className="text-white hover:text-[#FF2D00] transition-colors"
                  >
                    contacto@dreamtek.tech
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FF2D00]">
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div>
                  <span className="text-xs text-white/40 block">Sede Operativa</span>
                  <span className="text-white">Guadalupe, Zacatecas, México</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form Side */}
          <div className="lg:w-1/2 w-full">
            <div className="glass-panel p-8 sm:p-10 rounded-2xl relative">
              {status === 'success' ? (
                <div className="text-center py-12 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-500 mb-6">
                    <svg
                      className="w-8 h-8"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">¡Solicitud Recibida!</h3>
                  <p className="text-white/60 font-light max-w-sm mb-8 text-sm">
                    Tu ticket ha sido registrado. Un ingeniero de Dreamtek se pondrá en contacto
                    contigo a la brevedad.
                  </p>
                  <Button variant="outline" onClick={() => setStatus('idle')}>
                    Enviar otro mensaje
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label
                      htmlFor="name"
                      className="block text-xs uppercase tracking-widest text-white/60 mb-2 font-medium"
                    >
                      Nombre Completo
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      disabled={status === 'loading'}
                      className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-white outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-all disabled:opacity-50 text-sm"
                      placeholder="Ej. Felipe Miramontes"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="block text-xs uppercase tracking-widest text-white/60 mb-2 font-medium"
                    >
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      disabled={status === 'loading'}
                      className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-white outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-all disabled:opacity-50 text-sm"
                      placeholder="ejemplo@correo.com"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="service"
                      className="block text-xs uppercase tracking-widest text-white/60 mb-2 font-medium"
                    >
                      Servicio o Plan de Interés
                    </label>
                    <div className="relative">
                      <select
                        id="service"
                        name="service"
                        value={formData.service}
                        onChange={handleChange}
                        disabled={status === 'loading'}
                        className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-white outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-all disabled:opacity-50 appearance-none text-sm cursor-pointer"
                      >
                        <option value="web-starter" className="bg-[#00213D]">
                          Web Starter — $1,200 USD
                        </option>
                        <option value="custom-app" className="bg-[#00213D]">
                          Custom App — $3,500 USD
                        </option>
                        <option value="cyber-audit" className="bg-[#00213D]">
                          Cyber Audit — $1,800 USD
                        </option>
                        <option value="cybersecurity" className="bg-[#00213D]">
                          Ciberseguridad Consultoría
                        </option>
                        <option value="other" className="bg-[#00213D]">
                          Otro Requerimiento
                        </option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-white/60">
                        <svg className="fill-current h-4 w-4" viewBox="0 0 20 20">
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="block text-xs uppercase tracking-widest text-white/60 mb-2 font-medium"
                    >
                      Mensaje / Descripción del Proyecto
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={4}
                      value={formData.message}
                      onChange={handleChange}
                      disabled={status === 'loading'}
                      className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-white outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-all disabled:opacity-50 text-sm resize-none"
                      placeholder="Platícanos acerca de tu idea, retos y fechas límites..."
                    />
                  </div>

                  {status === 'error' && (
                    <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 p-3 rounded-sm">
                      {errorMessage}
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={status === 'loading'}
                    className="w-full justify-center"
                  >
                    {status === 'loading' ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-5 w-5 text-white"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Procesando...
                      </span>
                    ) : (
                      'Enviar Solicitud'
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
