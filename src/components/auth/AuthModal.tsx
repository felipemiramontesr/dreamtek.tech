'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  loginUser,
  registerUser,
  verifyMfa,
  sendMfaEmailOtp,
  verifyRegistrationOtp,
  resendRegistrationOtp,
} from '@/lib/auth/client';
import type { es } from '@/i18n/dictionaries/es';

type Dictionary = typeof es;

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  dict: Dictionary;
  initialMode?: 'login' | 'register';
  onLoginSuccess?: (user: unknown) => void;
  onRegisterSuccess?: (user: unknown) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  dict,
  initialMode = 'login',
  onLoginSuccess,
  onRegisterSuccess,
}) => {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register' | 'mfa' | 'verify_registration'>(
    initialMode,
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 2FA Challenge Fields
  const [mfaMethod, setMfaMethod] = useState<'TOTP' | 'EMAIL' | 'RECOVERY'>('TOTP');
  const [mfaCode, setMfaCode] = useState('');
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);

  // Registration OTP Challenge Fields
  const [regOtpCode, setRegOtpCode] = useState('');

  const resetForm = () => {
    setErrorMsg(null);
    setEmailSuccessMsg(null);
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setMfaCode('');
    setRegOtpCode('');
    setMfaMethod('TOTP');
    setMode(initialMode);
  };

  const handleModeSwitch = (targetMode: 'login' | 'register') => {
    if (targetMode === mode) return;
    setMode(targetMode);
    setErrorMsg(null);
    setEmailSuccessMsg(null);
  };

  const auth = dict?.auth;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setEmailSuccessMsg(null);

    if (mode === 'verify_registration') {
      if (!regOtpCode || regOtpCode.length !== 6) {
        setErrorMsg('Por favor ingresa el código de verificación de 6 dígitos.');
        return;
      }
      setLoading(true);
      try {
        const res = await verifyRegistrationOtp({ code: regOtpCode });
        setLoading(false);
        onRegisterSuccess?.(res.user);
        if (onLoginSuccess) {
          onLoginSuccess(res.user);
        } else {
          router.push('/client/dashboard/');
        }
        resetForm();
        onClose();
      } catch (err: unknown) {
        setLoading(false);
        setErrorMsg((err as Error).message || 'Error al verificar código.');
      }
      return;
    }

    if (mode === 'mfa') {
      if (!mfaCode) {
        setErrorMsg(auth?.fillAllFields || 'Por favor ingresa el código de verificación.');
        return;
      }
      setLoading(true);
      try {
        const res = await verifyMfa({ code: mfaCode, method: mfaMethod });
        setLoading(false);
        if (onLoginSuccess) {
          onLoginSuccess(res.user);
        } else {
          router.push('/client/dashboard/');
        }
        resetForm();
        onClose();
      } catch (err: unknown) {
        setLoading(false);
        setErrorMsg((err as Error).message || 'Error al verificar código 2FA.');
      }
      return;
    }

    if (mode === 'login') {
      if (!email || !password) {
        setErrorMsg(auth?.fillAllFields || 'Por favor completa todos los campos requeridos.');
        return;
      }
      setLoading(true);
      try {
        const res = await loginUser({ email, password });
        setLoading(false);
        if (res.status === '2fa_required') {
          setMode('mfa');
          setMfaMethod('TOTP');
          setMfaCode('');
          setErrorMsg(null);
        } else {
          if (onLoginSuccess) {
            onLoginSuccess(res.user);
          } else {
            router.push('/client/dashboard/');
          }
          resetForm();
          onClose();
        }
      } catch (err: unknown) {
        setLoading(false);
        setErrorMsg((err as Error).message || 'Error al iniciar sesión.');
      }
    } else {
      if (!fullName || !email || !password || !confirmPassword) {
        setErrorMsg(auth?.fillAllFields || 'Por favor completa todos los campos requeridos.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(auth?.passwordsMismatch || 'Las contraseñas no coinciden.');
        return;
      }
      setLoading(true);
      try {
        const res = await registerUser({
          email,
          password,
          full_name: fullName,
          phone,
        });
        setLoading(false);
        if (res.status === 'verification_required') {
          setMode('verify_registration');
          setRegOtpCode('');
          setEmailSuccessMsg(res.message || 'Código de verificación enviado a tu correo.');
        } else {
          onRegisterSuccess?.(res.user);
          resetForm();
          onClose();
        }
      } catch (err: unknown) {
        setLoading(false);
        setErrorMsg((err as Error).message || 'Error al crear la cuenta.');
      }
    }
  };

  const handleSendEmailOtp = async () => {
    setErrorMsg(null);
    setEmailSuccessMsg(null);
    setLoading(true);
    try {
      const res = await sendMfaEmailOtp();
      setLoading(false);
      setEmailSuccessMsg(res.message || auth?.mfaEmailSent || 'Código enviado a tu correo.');
    } catch (err: unknown) {
      setLoading(false);
      setErrorMsg((err as Error).message || 'Error al solicitar código por correo.');
    }
  };

  const handleResendRegistrationOtp = async () => {
    setErrorMsg(null);
    setEmailSuccessMsg(null);
    setLoading(true);
    try {
      const res = await resendRegistrationOtp();
      setLoading(false);
      setEmailSuccessMsg(res.message || 'Nuevo código enviado a tu correo.');
    } catch (err: unknown) {
      setLoading(false);
      setErrorMsg((err as Error).message || 'Error al reenviar el código.');
    }
  };

  const isRegisterMode = mode === 'register';
  const isMfaMode = mode === 'mfa';
  const isVerifyRegMode = mode === 'verify_registration';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      size="sm"
      title={
        isMfaMode
          ? auth?.mfaTitle || 'Verificación en Dos Pasos'
          : isVerifyRegMode
            ? 'Confirma tu Correo'
            : auth?.title || 'Área de Clientes'
      }
    >
      <div className="space-y-5">
        {/* Tab switcher only when not in MFA/Verify mode */}
        {!isMfaMode && !isVerifyRegMode ? (
          <div className="relative flex p-1 bg-white/5 border border-white/10 rounded-xl overflow-hidden backdrop-blur-md">
            <div
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-[#FF2D00] rounded-lg shadow-lg shadow-[#FF2D00]/30 transition-transform duration-[2000ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                mode === 'login' ? 'translate-x-0' : 'translate-x-full'
              }`}
            />
            <button
              type="button"
              onClick={() => handleModeSwitch('login')}
              className={`relative z-10 flex-1 py-2.5 text-xs md:text-sm font-medium transition-colors duration-[1000ms] ${
                mode === 'login' ? 'text-white font-semibold' : 'text-white/60 hover:text-white'
              }`}
            >
              {auth?.loginTab || 'Iniciar Sesión'}
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('register')}
              className={`relative z-10 flex-1 py-2.5 text-xs md:text-sm font-medium transition-colors duration-[1000ms] ${
                mode === 'register' ? 'text-white font-semibold' : 'text-white/60 hover:text-white'
              }`}
            >
              {auth?.registerTab || 'Crear Cuenta'}
            </button>
          </div>
        ) : isMfaMode ? (
          <div className="text-center space-y-1 pb-1">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-white tracking-wide">
              {auth?.mfaTitle || 'Verificación en Dos Pasos'}
            </h3>
            <p className="text-xs text-white/60">
              {auth?.mfaSubtitle || 'Introduce el código para verificar tu identidad'}
            </p>
          </div>
        ) : (
          <div className="text-center space-y-1 pb-1">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Confirma tu Correo Electrónico
            </h3>
            <p className="text-xs text-white/60">
              Ingresa el código de 6 dígitos enviado desde contacto@dreamtek.tech
            </p>
          </div>
        )}

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5 transition-all duration-[1000ms] ease-out">
            <svg
              className="w-4 h-4 flex-shrink-0 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Alert Box */}
        {emailSuccessMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 transition-all duration-[500ms] ease-out">
            <svg
              className="w-4 h-4 flex-shrink-0 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>{emailSuccessMsg}</span>
          </div>
        )}

        {/* Form Body */}
        {isMfaMode ? (
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            {/* Method Tabs */}
            <div className="flex bg-black/40 border border-white/10 rounded-lg p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMfaMethod('TOTP');
                  setMfaCode('');
                  setErrorMsg(null);
                }}
                className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                  mfaMethod === 'TOTP'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {auth?.mfaMethodTotp || 'Google Auth'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaMethod('EMAIL');
                  setMfaCode('');
                  setErrorMsg(null);
                }}
                className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                  mfaMethod === 'EMAIL'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {auth?.mfaMethodEmail || 'Correo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaMethod('RECOVERY');
                  setMfaCode('');
                  setErrorMsg(null);
                }}
                className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                  mfaMethod === 'RECOVERY'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {auth?.mfaMethodRecovery || 'Recuperación'}
              </button>
            </div>

            {mfaMethod === 'EMAIL' && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleSendEmailOtp}
                  className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium transition-colors"
                >
                  {auth?.mfaSendEmailBtn || 'Enviar código a mi correo'}
                </button>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider">
                {mfaMethod === 'RECOVERY'
                  ? auth?.mfaMethodRecovery || 'Código de Recuperación'
                  : 'Código de 6 dígitos'}
              </label>
              <input
                type="text"
                autoFocus
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder={
                  mfaMethod === 'RECOVERY'
                    ? auth?.mfaRecoveryPlaceholder || 'XXXXX-XXXXX'
                    : auth?.mfaCodePlaceholder || '000000'
                }
                className="w-full text-center tracking-widest font-mono text-base px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                maxLength={mfaMethod === 'RECOVERY' ? 20 : 6}
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? 'Verificando...' : auth?.mfaVerifySubmit || 'Verificar y Acceder'}
              </Button>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                  setEmailSuccessMsg(null);
                }}
                className="text-xs text-white/50 hover:text-white transition-colors"
              >
                {auth?.mfaBackToLogin || 'Volver a inicio de sesión'}
              </button>
            </div>
          </form>
        ) : isVerifyRegMode ? (
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider">
                Código de Verificación (6 dígitos)
              </label>
              <input
                type="text"
                autoFocus
                required
                value={regOtpCode}
                onChange={(e) => setRegOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full text-center tracking-[8px] font-mono text-xl px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                maxLength={6}
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? 'Verificando...' : 'Activar Cuenta y Acceder'}
              </Button>
            </div>

            <div className="text-center pt-2 flex flex-col space-y-2">
              <button
                type="button"
                disabled={loading}
                onClick={handleResendRegistrationOtp}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors underline"
              >
                ¿No recibiste el código? Reenviar código
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg(null);
                  setEmailSuccessMsg(null);
                }}
                className="text-xs text-white/50 hover:text-white transition-colors"
              >
                Volver a registro
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col">
            {/* Register Field: Full Name */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: isRegisterMode ? '1fr' : '0fr',
                opacity: isRegisterMode ? 1 : 0,
                marginBottom: isRegisterMode ? '14px' : '0px',
                transition:
                  'grid-template-rows 2000ms cubic-bezier(0.16, 1, 0.3, 1), opacity 2000ms cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 2000ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div className="overflow-hidden">
                <div className="space-y-1 pb-0.5">
                  <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider">
                    {dict.auth?.fullNameLabel || 'Nombre Completo'}
                  </label>
                  <input
                    type="text"
                    required={isRegisterMode}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={
                      isRegisterMode ? dict.auth?.fullNamePlaceholder || 'ej. Carlos Mendoza' : ''
                    }
                    className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-all duration-[1000ms]"
                  />
                </div>
              </div>
            </div>

            {/* Email / Username Field (Always visible) */}
            <div className="space-y-1 mb-3.5">
              <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider">
                {isRegisterMode
                  ? dict.auth?.emailLabel || 'Correo Electrónico'
                  : dict.auth?.emailOrUserLabel || 'Correo Electrónico o Usuario'}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={dict.auth?.emailPlaceholder || 'carlos@empresa.com'}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-all duration-[1000ms]"
              />
            </div>

            {/* Register Field: Phone */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: isRegisterMode ? '1fr' : '0fr',
                opacity: isRegisterMode ? 1 : 0,
                marginBottom: isRegisterMode ? '14px' : '0px',
                transition:
                  'grid-template-rows 2000ms cubic-bezier(0.16, 1, 0.3, 1), opacity 2000ms cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 2000ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div className="overflow-hidden">
                <div className="space-y-1 pb-0.5">
                  <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider">
                    {dict.auth?.phoneLabel || 'Teléfono'}
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={
                      isRegisterMode ? dict.auth?.phonePlaceholder || '+52 55 1234 5678' : ''
                    }
                    className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-all duration-[1000ms]"
                  />
                </div>
              </div>
            </div>

            {/* Password Field (Always visible) */}
            <div className="space-y-1 mb-3.5">
              <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider">
                {dict.auth?.passwordLabel || 'Contraseña'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={dict.auth?.passwordPlaceholder || '••••••••'}
                  className="w-full pl-3.5 pr-11 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-all duration-[1000ms]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/90 border border-white/10 transition-colors focus:outline-none focus:ring-1 focus:ring-[#FF2D00] cursor-pointer shadow-sm z-10"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Register Field: Confirm Password */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: isRegisterMode ? '1fr' : '0fr',
                opacity: isRegisterMode ? 1 : 0,
                marginBottom: isRegisterMode ? '14px' : '0px',
                transition:
                  'grid-template-rows 2000ms cubic-bezier(0.16, 1, 0.3, 1), opacity 2000ms cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 2000ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div className="overflow-hidden">
                <div className="space-y-1 pb-0.5">
                  <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider">
                    {dict.auth?.confirmPasswordLabel || 'Confirmar Contraseña'}
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required={isRegisterMode}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={
                        isRegisterMode ? dict.auth?.confirmPasswordPlaceholder || '••••••••' : ''
                      }
                      className="w-full pl-3.5 pr-11 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-all duration-[1000ms]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/90 border border-white/10 transition-colors focus:outline-none focus:ring-1 focus:ring-[#FF2D00] cursor-pointer shadow-sm z-10"
                      aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
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
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full transition-all duration-[1000ms] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
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
                    <span>Cargando...</span>
                  </div>
                ) : mode === 'login' ? (
                  dict.auth?.loginSubmit || 'Iniciar Sesión'
                ) : (
                  dict.auth?.registerSubmit || 'Crear Cuenta'
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Bottom Switch Link only when not in MFA mode */}
        {!isMfaMode && (
          <div className="text-center pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => handleModeSwitch(mode === 'login' ? 'register' : 'login')}
              className="text-xs text-[#00bfff] hover:text-[#00bfff]/80 transition-colors duration-[1000ms] font-medium"
            >
              {mode === 'login'
                ? dict.auth?.switchToRegister || '¿No tienes cuenta aún? Regístrate aquí'
                : dict.auth?.switchToLogin || '¿Ya tienes una cuenta? Inicia sesión aquí'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
