'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import {
  fetchClientWebhooks,
  createClientWebhook,
  deleteClientWebhook,
  testClientWebhook,
  type ClientWebhookSubscription,
} from '@/lib/auth/client';

export const ClientWebhooksWidget: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<ClientWebhookSubscription[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal de registro
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [targetUrl, setTargetUrl] = useState<string>('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    'SECURITY_ALERT',
    'PROJECT_UPDATE',
    'BILLING_INVOICE',
  ]);
  const [registering, setRegistering] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Secreto único revelado (C-053.3)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState<boolean>(false);

  // Estado de Test Ping
  const [testingId, setTestingId] = useState<number | null>(null);
  const [pingResults, setPingResults] = useState<
    Record<number, { success: boolean; message: string; durationMs?: number }>
  >({});

  // Estado de eliminación
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadWebhooks = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchClientWebhooks();
      setSubscriptions(res.subscriptions || []);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al cargar suscripciones de webhooks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWebhooks();
  }, [loadWebhooks]);

  const handleToggleEvent = (eventKey: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventKey) ? prev.filter((e) => e !== eventKey) : [...prev, eventKey],
    );
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!targetUrl.trim()) {
      setModalError('Ingrese una URL válida para el webhook.');
      return;
    }
    if (selectedEvents.length === 0) {
      setModalError('Debe seleccionar al menos un tipo de evento para suscribirse.');
      return;
    }

    setRegistering(true);
    try {
      const res = await createClientWebhook({
        target_url: targetUrl.trim(),
        events: selectedEvents,
      });

      setRevealedSecret(res.secret);
      setSuccessMsg('Webhook registrado exitosamente. Guarde el secreto ahora.');
      void loadWebhooks();
    } catch (err: unknown) {
      setModalError((err as Error).message || 'Error al registrar el webhook.');
    } finally {
      setRegistering(false);
    }
  };

  const handleCloseRegisterModal = () => {
    setIsRegisterOpen(false);
    setRevealedSecret(null);
    setSecretCopied(false);
    setTargetUrl('');
    setSelectedEvents(['SECURITY_ALERT', 'PROJECT_UPDATE', 'BILLING_INVOICE']);
    setModalError(null);
  };

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(revealedSecret as string);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 3000);
    } catch {
      // Fallback
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 3000);
    }
  };

  const handleTestPing = async (id: number) => {
    setTestingId(id);
    setErrorMsg(null);
    try {
      const res = await testClientWebhook(id);
      setPingResults((prev) => ({
        ...prev,
        [id]: {
          success: res.ping.success,
          message: res.ping.success
            ? `Ping exitoso (${res.ping.statusCode ?? 200}) en ${res.ping.durationMs}ms`
            : `Fallo: ${res.ping.error || 'Código ' + res.ping.statusCode}`,
          durationMs: res.ping.durationMs,
        },
      }));
    } catch (err: unknown) {
      setPingResults((prev) => ({
        ...prev,
        [id]: {
          success: false,
          message: (err as Error).message || 'Error de red en ping test.',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Confirma que desea eliminar este webhook? Esta acción no se puede deshacer.')) {
      return;
    }

    setDeletingId(id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await deleteClientWebhook(id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      setSuccessMsg('Webhook eliminado exitosamente.');
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al eliminar el webhook.');
    } finally {
      setDeletingId(null);
    }
  };

  const getEventBadge = (evt: string) => {
    switch (evt) {
      case 'SECURITY_ALERT':
        return (
          <span
            key={evt}
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-red-500/10 text-red-300 border border-red-500/20"
          >
            Seguridad
          </span>
        );
      case 'PROJECT_UPDATE':
        return (
          <span
            key={evt}
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
          >
            Proyectos
          </span>
        );
      case 'BILLING_INVOICE':
        return (
          <span
            key={evt}
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
          >
            Facturación
          </span>
        );
      default:
        return (
          <span
            key={evt}
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-800 text-slate-300"
          >
            {evt}
          </span>
        );
    }
  };

  return (
    <GlassCard className="p-6 border-white/10 bg-slate-900/60 mt-8">
      {/* Header del Widget */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h2 className="text-lg font-bold text-white">
              Webhooks de Seguridad & Eventos Operativos
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Configure endpoints HTTPS corporativos para recibir alertas de intrusión, auditoría de
            credenciales y avances en tiempo real firmados con HMAC-SHA256 (
            <code className="text-cyan-400 font-mono">X-Dreamtek-Signature</code>).
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            handleCloseRegisterModal();
            setIsRegisterOpen(true);
          }}
          className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs whitespace-nowrap shadow-lg shadow-cyan-900/20 cursor-pointer self-start sm:self-auto"
        >
          + Registrar Webhook
        </Button>
      </div>

      {/* Alertas globales */}
      {errorMsg && (
        <div className="mt-4 p-3 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-lg flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-red-400 hover:text-white text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mt-4 p-3 bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs rounded-lg flex items-center justify-between">
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400 hover:text-white text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Lista de Webhooks */}
      <div className="mt-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-mono">
              Cargando suscripciones de webhooks...
            </p>
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-white/10 rounded-xl bg-slate-950/30 px-4">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-500 mx-auto mb-3">
              ⚡
            </div>
            <h3 className="text-sm font-semibold text-slate-300">No hay webhooks registrados</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Integre su SIEM corporativo, bots de Slack/Discord o sistemas de monitoreo para
              recibir notificaciones automatizadas.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((sub) => {
              const ping = pingResults[sub.id];
              return (
                <div
                  key={sub.id}
                  className="p-4 rounded-xl border border-white/5 bg-slate-950/40 hover:border-white/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-white truncate max-w-md">
                        {sub.target_url}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        {sub.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-500 mr-1">Eventos:</span>
                      {sub.events.map((e) => getEventBadge(e))}
                    </div>

                    {ping && (
                      <div
                        className={`text-xs mt-2 px-2.5 py-1 rounded border inline-flex items-center gap-1.5 ${
                          ping.success
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                            : 'bg-red-950/40 border-red-500/30 text-red-300'
                        }`}
                      >
                        <span>{ping.success ? '✓' : '✗'}</span>
                        <span>{ping.message}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={testingId === sub.id}
                      onClick={() => handleTestPing(sub.id)}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs py-1 cursor-pointer"
                    >
                      {testingId === sub.id ? 'Probando...' : 'Test Ping'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deletingId === sub.id}
                      onClick={() => handleDelete(sub.id)}
                      className="border-red-900/40 text-red-400 hover:bg-red-950/40 hover:text-red-300 text-xs py-1 cursor-pointer"
                    >
                      {deletingId === sub.id ? 'Eliminando...' : 'Eliminar'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal para Registrar Webhook y Mostrar Secreto Único (C-053.3) */}
      {isRegisterOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-webhook-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 space-y-5">
            {!revealedSecret ? (
              <form onSubmit={handleCreateWebhook} className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <h3 id="register-webhook-title" className="text-base font-bold text-white">
                    Registrar Webhook Seguro
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseRegisterModal}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                {modalError && (
                  <div className="p-3 bg-red-950/60 border border-red-500/40 text-red-200 text-xs rounded-lg">
                    {modalError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="webhook-target-url"
                    className="text-xs font-semibold text-slate-300"
                  >
                    URL de Destino (HTTPS)
                  </label>
                  <input
                    id="webhook-target-url"
                    type="url"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://api.tuempresa.com/webhooks/dreamtek"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Protegido contra SSRF: Se bloquean IPs privadas (RFC 1918), localhost y
                    metadatos cloud (C-053.2).
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300 block">
                    Suscripción de Eventos
                  </span>
                  <div className="space-y-2 bg-slate-950/50 p-3 rounded-lg border border-white/5">
                    {[
                      {
                        key: 'SECURITY_ALERT',
                        label: 'Alertas de Seguridad',
                        desc: 'Autenticación 2FA, reseteos de credenciales y eventos anómalos.',
                      },
                      {
                        key: 'PROJECT_UPDATE',
                        label: 'Actualizaciones de Proyectos B2B',
                        desc: 'Avances de hitos, firmas de conformidad y entregables.',
                      },
                      {
                        key: 'BILLING_INVOICE',
                        label: 'Eventos de Facturación',
                        desc: 'Pagos procesados y emisión de timbrado fiscal.',
                      },
                    ].map((item) => (
                      <label
                        key={item.key}
                        className="flex items-start gap-2.5 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(item.key)}
                          onChange={() => handleToggleEvent(item.key)}
                          className="mt-0.5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                        />
                        <div>
                          <p className="font-semibold text-slate-200">{item.label}</p>
                          <p className="text-[11px] text-slate-400">{item.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCloseRegisterModal}
                    className="border-slate-700 text-slate-300"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={registering}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
                  >
                    {registering ? 'Validando & Creando...' : 'Crear Suscripción'}
                  </Button>
                </div>
              </form>
            ) : (
              /* Pantalla de Secreto Revelado Único (C-053.3) */
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Webhook Registrado Exitosamente
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseRegisterModal}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-3 bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs rounded-xl space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <span>⚠️</span> ATENCIÓN: Secreto de Firma Criptográfica
                  </p>
                  <p className="text-[11px] text-amber-300/90 leading-relaxed">
                    Copie y guarde este secreto en su gestor de credenciales ahora mismo. Por
                    normativa de seguridad (C-053.3), este secreto se almacena cifrado con AES-256
                    en la base de datos y{' '}
                    <strong>NO se volverá a mostrar en texto plano jamás</strong>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="webhook-revealed-secret"
                    className="text-xs font-semibold text-slate-300"
                  >
                    Secreto HMAC-SHA256 (32 bytes hex)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="webhook-revealed-secret"
                      type="text"
                      readOnly
                      value={revealedSecret}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 select-all"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopySecret}
                      className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/40 text-xs whitespace-nowrap py-2"
                    >
                      {secretCopied ? '¡Copiado!' : 'Copiar'}
                    </Button>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-white/5 space-y-1 text-[11px] font-mono text-slate-400">
                  <p className="text-slate-300 font-sans font-semibold">
                    Cabecera de Verificación:
                  </p>
                  <p className="text-cyan-400">
                    X-Dreamtek-Signature: t={'{timestamp}'},v1={'{hmac_hex}'}
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleCloseRegisterModal}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
                  >
                    Entendido, he guardado el secreto
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
};
