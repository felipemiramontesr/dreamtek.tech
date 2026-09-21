'use client';

import React, { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import {
  getMfaStatus,
  setupMfa,
  enableMfa,
  disableMfa,
  type MfaStatusResponse,
  type MfaSetupResponse,
} from '@/lib/auth/client';

export const ClientMfaSettingsWidget: React.FC = () => {
  const [status, setStatus] = useState<MfaStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Setup / Enable Modal state
  const [isSetupOpen, setIsSetupOpen] = useState<boolean>(false);
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);

  // Disable Modal state
  const [isDisableOpen, setIsDisableOpen] = useState<boolean>(false);
  const [disablePassword, setDisablePassword] = useState<string>('');
  const [showDisablePassword, setShowDisablePassword] = useState<boolean>(false);
  const [disableCode, setDisableCode] = useState<string>('');
  const [reloadKey, setReloadKey] = useState<number>(0);

  const reloadStatus = () => setReloadKey((prev) => prev + 1);

  useEffect(() => {
    async function init() {
      try {
        const res = await getMfaStatus();
        setStatus(res);
      } catch (err: unknown) {
        setErrorMsg((err as Error).message || 'No se pudo cargar el estado 2FA.');
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [reloadKey]);

  const handleStartSetup = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setActionLoading(true);
    try {
      const data = await setupMfa();
      setSetupData(data);
      setIsSetupOpen(true);
      setVerifyCode('');
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al iniciar configuración 2FA.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData || !verifyCode) return;
    setErrorMsg(null);
    setActionLoading(true);
    try {
      const res = await enableMfa(verifyCode, setupData.secretBase32, setupData.recoveryCodes);
      setSuccessMsg(res.message || '2FA activado con éxito.');
      setIsSetupOpen(false);
      setSetupData(null);
      reloadStatus();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Código de verificación incorrecto.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword || !disableCode) return;
    setErrorMsg(null);
    setActionLoading(true);
    try {
      const res = await disableMfa(disablePassword, disableCode);
      setSuccessMsg(res.message || '2FA desactivado.');
      setIsDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
      reloadStatus();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al desactivar 2FA.');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <GlassCard className="p-6 border border-white/10 bg-slate-900/60 backdrop-blur-xl rounded-2xl relative overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-wide">
              Seguridad: Autenticación de Dos Factores (2FA)
            </h3>
            <p className="text-xs text-white/60">
              Protege tu cuenta corporativa contra accesos no autorizados con Google Authenticator o
              Email OTP.
            </p>
          </div>
        </div>

        {status && (
          <div>
            {status.is_2fa_enabled ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Activado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Desactivado
              </span>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <span>{successMsg}</span>
        </div>
      )}

      {/* Details Body */}
      <div className="mt-4 space-y-4">
        {loading ? (
          <div className="text-xs text-white/50 animate-pulse">Cargando estado de seguridad...</div>
        ) : status?.is_2fa_enabled ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="space-y-1">
              <div className="text-xs text-white/80">
                <span className="font-semibold text-white">Códigos de recuperación restantes:</span>{' '}
                <span className="font-mono text-cyan-400">
                  {status.remaining_recovery_codes ?? 0}
                </span>
              </div>
              {status.mfa_enrolled_at && (
                <div className="text-[11px] text-white/50">
                  Activado el {new Date(status.mfa_enrolled_at).toLocaleDateString()}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDisableOpen(true)}
              className="text-red-400 border-red-500/30 hover:bg-red-500/10 text-xs"
            >
              Desactivar 2FA
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="text-xs text-white/70">
              Añade una capa adicional de protección requiriendo un código de 6 dígitos cada vez que
              inicies sesión.
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={actionLoading}
              onClick={handleStartSetup}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs whitespace-nowrap"
            >
              {actionLoading ? 'Generando...' : 'Configurar 2FA'}
            </Button>
          </div>
        )}
      </div>

      {/* Modal: Setup & Enable 2FA */}
      {isSetupOpen && setupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h4 className="text-sm font-bold text-white">Configurar Google Authenticator</h4>
              <button
                type="button"
                onClick={() => setIsSetupOpen(false)}
                className="text-white/50 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-white/80">
              <p className="font-semibold text-white">1. Clave secreta manual:</p>
              <div className="flex items-center gap-2 bg-black/50 p-2.5 rounded-lg border border-white/10 font-mono text-cyan-300 select-all break-all">
                <span className="flex-1">{setupData.secretBase32}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(setupData.secretBase32)}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white"
                >
                  {copiedSecret ? 'Copiado!' : 'Copiar'}
                </button>
              </div>

              <p className="font-semibold text-white pt-2">
                2. Códigos de recuperación (guárdalos en lugar seguro):
              </p>
              <div className="grid grid-cols-2 gap-1.5 bg-black/40 p-2.5 rounded-lg border border-white/10 font-mono text-[11px] text-white/90">
                {setupData.recoveryCodes.map((code, idx) => (
                  <div key={idx} className="tracking-wider">
                    {code}
                  </div>
                ))}
              </div>

              <form onSubmit={handleConfirmEnable} className="space-y-3 pt-3">
                <p className="font-semibold text-white">
                  3. Introduce el código de 6 dígitos para confirmar:
                </p>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="000000"
                  className="w-full text-center tracking-widest font-mono text-base px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-cyan-400"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={actionLoading || verifyCode.length !== 6}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs"
                >
                  {actionLoading ? 'Verificando...' : 'Confirmar y Activar 2FA'}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Disable 2FA */}
      {isDisableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-sm w-full bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h4 className="text-sm font-bold text-white">Desactivar 2FA</h4>
              <button
                type="button"
                onClick={() => setIsDisableOpen(false)}
                className="text-white/50 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDisable} className="space-y-3 text-xs">
              <p className="text-white/70">
                Para confirmar la desactivación de 2FA, ingresa tu contraseña actual y un código de
                autenticación o recuperación.
              </p>
              <div className="space-y-1">
                <label htmlFor="disable-password" className="block text-white/80 font-medium">
                  Contraseña actual:
                </label>
                <div className="relative">
                  <input
                    id="disable-password"
                    type={showDisablePassword ? 'text' : 'password'}
                    required
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 bg-black/50 border border-white/10 rounded-lg text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDisablePassword(!showDisablePassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors focus:outline-none p-1 cursor-pointer"
                    aria-label={showDisablePassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    tabIndex={-1}
                  >
                    {showDisablePassword ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.8}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.8}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.8}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="disable-code" className="block text-white/80 font-medium">
                  Código 2FA o de Recuperación:
                </label>
                <input
                  id="disable-code"
                  type="text"
                  required
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="000000 o XXXXX-XXXXX"
                  className="w-full font-mono px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white"
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={actionLoading}
                className="w-full bg-red-500 hover:bg-red-400 text-white font-semibold text-xs mt-2"
              >
                {actionLoading ? 'Desactivando...' : 'Confirmar Desactivación'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </GlassCard>
  );
};
