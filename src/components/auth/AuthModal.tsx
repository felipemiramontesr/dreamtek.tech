'use client';

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { loginUser, registerUser } from '@/lib/auth/client';
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
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const resetForm = () => {
    setErrorMsg(null);
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleModeSwitch = (targetMode: 'login' | 'register') => {
    setMode(targetMode);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === 'login') {
      if (!email || !password) {
        setErrorMsg(dict.auth?.fillAllFields || 'Por favor completa todos los campos requeridos.');
        return;
      }
      setLoading(true);
      try {
        const res = await loginUser({ email, password });
        setLoading(false);
        onLoginSuccess?.(res.user);
        resetForm();
        onClose();
      } catch (err: unknown) {
        setLoading(false);
        setErrorMsg((err as Error).message || 'Error al iniciar sesión.');
      }
    } else {
      if (!fullName || !email || !password || !confirmPassword) {
        setErrorMsg(dict.auth?.fillAllFields || 'Por favor completa todos los campos requeridos.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(dict.auth?.passwordsMismatch || 'Las contraseñas no coinciden.');
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
        onRegisterSuccess?.(res.user);
        resetForm();
        onClose();
      } catch (err: unknown) {
        setLoading(false);
        setErrorMsg((err as Error).message || 'Error al crear la cuenta.');
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      size="sm"
      title={dict.auth?.title || 'Área de Clientes'}
    >
      <div className="space-y-5">
        {/* Tab Switcher */}
        <div className="flex p-1 bg-white/5 border border-white/10 rounded-xl">
          <button
            type="button"
            onClick={() => handleModeSwitch('login')}
            className={`flex-1 py-2 text-xs md:text-sm font-medium rounded-lg transition-all duration-200 ${
              mode === 'login'
                ? 'bg-[#FF2D00] text-white shadow-lg shadow-[#FF2D00]/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            {dict.auth?.loginTab || 'Iniciar Sesión'}
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('register')}
            className={`flex-1 py-2 text-xs md:text-sm font-medium rounded-lg transition-all duration-200 ${
              mode === 'register'
                ? 'bg-[#FF2D00] text-white shadow-lg shadow-[#FF2D00]/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            {dict.auth?.registerTab || 'Crear Cuenta'}
          </button>
        </div>

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">
                {dict.auth?.fullNameLabel || 'Nombre Completo'}
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={dict.auth?.fullNamePlaceholder || 'ej. Carlos Mendoza'}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">
              {dict.auth?.emailLabel || 'Correo Electrónico'}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={dict.auth?.emailPlaceholder || 'carlos@empresa.com'}
              className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-colors"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">
                {dict.auth?.phoneLabel || 'Teléfono'}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={dict.auth?.phonePlaceholder || '+52 55 1234 5678'}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">
              {dict.auth?.passwordLabel || 'Contraseña'}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={dict.auth?.passwordPlaceholder || '••••••••'}
              className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-colors"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">
                {dict.auth?.confirmPasswordLabel || 'Confirmar Contraseña'}
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={dict.auth?.confirmPasswordPlaceholder || '••••••••'}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF2D00] focus:ring-1 focus:ring-[#FF2D00] transition-colors"
              />
            </div>
          )}

          <div className="pt-2">
            <Button type="submit" variant="primary" size="md" className="w-full" disabled={loading}>
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
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

        {/* Bottom Switch Link */}
        <div className="text-center pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={() => handleModeSwitch(mode === 'login' ? 'register' : 'login')}
            className="text-xs text-[#00A3FF] hover:text-[#00A3FF]/80 transition-colors font-medium hover:underline"
          >
            {mode === 'login'
              ? dict.auth?.switchToRegister || '¿No tienes cuenta aún? Regístrate aquí'
              : dict.auth?.switchToLogin || '¿Ya tienes una cuenta? Inicia sesión aquí'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
