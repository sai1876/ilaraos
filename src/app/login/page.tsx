'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { 
  signInWithEmailAndPassword, 
  signOut
} from 'firebase/auth';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';
import AuthWorkspace from '@/components/auth/AuthWorkspace';
import CustomerAuthGuard from '@/components/auth/CustomerAuthGuard';

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="grid min-h-screen place-items-center bg-[#FAF7F2]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#9A642C]/20 border-t-[#9A642C]" /></div>
    }>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const isStaff = searchParams.get('staff') === 'true';
  const returnTo = searchParams.get('next') || undefined;
  return isStaff ? <StaffLoginContent /> : <CustomerAuthGuard><AuthWorkspace defaultTab="login" returnTo={returnTo} /></CustomerAuthGuard>;
}

type AuthState =
  | 'idle'
  | 'password_verifying'
  | 'totp_required'
  | 'totp_setup_required'
  | 'totp_verifying'
  | 'redirecting'
  | 'error';

function StaffLoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [authState, setAuthState] = useState<AuthState>('idle');
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // Ref guards for single submit & deduplication
  const verifyInFlightRef = useRef(false);
  const lastSubmittedCodeRef = useRef('');
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const totpInputRef = useRef<HTMLInputElement>(null);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (val && !/\S+@\S+\.\S+/.test(val)) {
      setEmailError('Please enter a valid email (e.g. rohan.sharma@hauhaucafe.com)');
    } else {
      setEmailError(null);
    }
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (val && val.length < 6) {
      setPasswordError('Password must be at least 6 characters');
    } else {
      setPasswordError(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthState('password_verifying');
    setAuthError(null);

    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      console.error("Firebase sign in failed:", err);
      setAuthError('Email or password is incorrect.');
      setAuthState('error');
      return;
    }

    try {
      if (userCredential.user) {
        const idToken = await userCredential.user.getIdToken();
        
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, action: 'init' })
        });
        
        const resData = await res.json();
        if (!res.ok) {
          if (resData.code === 'TOTP_RESET_REQUIRED') {
            setAuthError('Two-factor authentication must be re-enrolled. Please contact your manager.');
          } else if (resData.code === 'TOTP_CONFIGURATION_ERROR') {
            setAuthError('Two-factor authentication system configuration error. Contact admin.');
          } else {
            setAuthError(resData.error || 'Session creation failed');
          }
          setAuthState('error');
          return;
        }
        
        if (resData.setup_required) {
          setQrCodeDataUrl(resData.qrCodeDataUrl);
          setTotpSecret(resData.secret || '');
          setAuthState('totp_setup_required');
        } else if (resData.require_totp) {
          setAuthState('totp_required');
        }
      }
    } catch (err: unknown) {
      console.error("Auth check failed: ", err);
      setAuthError(getFriendlyErrorMessage(err));
      setAuthState('error');
    }
  };

  const executeVerifyTotp = async (codeToSubmit: string) => {
    if (verifyInFlightRef.current) return;
    if (lastSubmittedCodeRef.current === codeToSubmit) return;

    verifyInFlightRef.current = true;
    lastSubmittedCodeRef.current = codeToSubmit;
    setAuthState('totp_verifying');
    setAuthError(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        setAuthError('Authentication state lost. Please refresh.');
        setAuthState('error');
        verifyInFlightRef.current = false;
        lastSubmittedCodeRef.current = '';
        return;
      }
      const idToken = await user.getIdToken();

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', totpCode: codeToSubmit, idToken })
      });
      const data = await res.json();
      if (!res.ok) {
        verifyInFlightRef.current = false;
        lastSubmittedCodeRef.current = '';
        setAuthState('error');
        if (data.code === 'TOTP_RESET_REQUIRED') {
          setAuthError('Two-factor authentication must be re-enrolled. Please contact your manager.');
        } else if (data.code === 'TOTP_CONFIGURATION_ERROR') {
          setAuthError('Two-factor authentication system configuration error. Contact admin.');
        } else if (data.code === 'INVALID_TOTP') {
          setAuthError("That code wasn't accepted. Enter the current code from Authenticator.");
        } else if (data.code === 'PREAUTH_EXPIRED') {
          setAuthError('Session expired. Please enter password again.');
          setAuthState('idle');
        } else {
          setAuthError(data.error || 'Verification failed');
        }
        return;
      }
      
      setAuthState('redirecting');
      window.location.replace(data.redirectUrl || '/operations');
    } catch (err: unknown) {
      verifyInFlightRef.current = false;
      lastSubmittedCodeRef.current = '';
      setAuthState('error');
      setAuthError(getFriendlyErrorMessage(err));
    }
  };

  const handleVerifyTotpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length === 6) {
      executeVerifyTotp(totpCode);
    }
  };

  // Auto-submit 6-digit code with 120ms debounce
  useEffect(() => {
    if ((authState === 'totp_required' || authState === 'totp_setup_required') && totpCode.length === 6) {
      if (autoSubmitTimeoutRef.current) clearTimeout(autoSubmitTimeoutRef.current);
      autoSubmitTimeoutRef.current = setTimeout(() => {
        executeVerifyTotp(totpCode);
      }, 120);
    }
    return () => {
      if (autoSubmitTimeoutRef.current) clearTimeout(autoSubmitTimeoutRef.current);
    };
  }, [totpCode, authState]);

  // Focus input when entering TOTP stage
  useEffect(() => {
    if (authState === 'totp_required' || authState === 'totp_setup_required') {
      setTimeout(() => totpInputRef.current?.focus(), 50);
    }
  }, [authState]);

  const handleTotpCodeChange = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 6);
    setTotpCode(clean);
    if (authError) {
      setAuthError(null);
    }
  };

  const isTotpStage = authState === 'totp_required' || authState === 'totp_setup_required' || authState === 'totp_verifying' || authState === 'redirecting';

  return (
    <div className="w-full bg-[#FAF7F2] text-[#241A15] relative overflow-x-hidden font-sans px-6 py-12 no-scrollbar">
      {/* Soft ambient coffee-lounge light spots */}
      <div className="absolute top-[-25%] left-[-15%] w-[650px] h-[650px] bg-gradient-to-br from-[#9A642C]/10 to-transparent rounded-full filter blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-25%] right-[-15%] w-[650px] h-[650px] bg-gradient-to-tl from-[#9A642C]/8 to-transparent rounded-full filter blur-[150px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md z-10 mx-auto"
      >
        {/* Elegant Logo / Branding */}
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <img 
            src="/images/logo_full.png" 
            alt="Ilara Modern Indian Kitchen Logo" 
            className="h-44 w-auto object-contain drop-shadow-[0_4px_12px_rgba(36,26,21,0.08)]"
          />
          <span className="font-sans text-[10px] uppercase tracking-widest text-[#66554A] font-bold bg-[#F3ECE3]/80 px-4 py-1.5 rounded-full border border-[#E8DFD3] shadow-sm">Secured Staff Shield</span>
        </div>

        {!isTotpStage && (
          <form onSubmit={handleLogin} className="bg-[#FFFDFC]/98 backdrop-blur-md rounded-[32px] border border-[#E8DFD3] p-8 md:p-10 shadow-[0_30px_70px_rgba(36,26,21,0.04)] flex flex-col gap-6 relative overflow-hidden">
            {/* Top Premium Color Stripe */}
            <div className="absolute inset-x-0 top-0 h-[4px] bg-gradient-to-r from-[#C3924F] via-[#9A642C] to-[#C3924F]" />

            <div className="flex justify-center mb-1">
              <div className="w-14 h-14 rounded-2xl bg-[#9A642C]/10 border border-[#9A642C]/20 flex items-center justify-center text-[#9A642C] shadow-inner">
                <Lock size={22} className="stroke-[2]" />
              </div>
            </div>

            <div className="text-center">
              <h1 className="font-serif text-2xl font-bold text-[#241A15] tracking-tight">Staff Access</h1>
              <p className="text-xs text-[#66554A] mt-1.5 leading-relaxed">Enter credentials to unlock the management dashboard.</p>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A] flex justify-between px-0.5">
                  <span>Admin Email</span>
                  <span className="text-[9px] text-[#66554A]/70 tracking-normal font-medium capitalize">Required</span>
                </label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="name@ilaracafe.com"
                  className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl px-4 py-3.5 text-sm font-sans font-medium text-[#241A15] placeholder:text-[#66554A]/30 focus:outline-none focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10 transition-all duration-300 shadow-sm"
                />
                {emailError && (
                  <span className="text-[10px] text-red-500 font-semibold font-mono mt-1 flex items-center gap-1">
                    ⚠️ {emailError}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A] flex justify-between px-0.5">
                  <span>Secure Password</span>
                  <span className="text-[9px] text-[#66554A]/70 tracking-normal font-medium">Min 6 chars</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl px-4 py-3.5 pr-12 text-sm font-mono font-medium text-[#241A15] placeholder:text-[#66554A]/30 focus:outline-none focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10 transition-all duration-300 tracking-widest shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 text-[#66554A] hover:text-[#241A15] transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordError && (
                  <span className="text-[10px] text-red-500 font-semibold font-mono mt-1 flex items-center gap-1">
                    ⚠️ {passwordError}
                  </span>
                )}
              </div>
            </div>

            {authError && (
              <div className="bg-red-500/5 border border-red-500/10 text-red-600 p-3.5 rounded-2xl text-xs text-center font-mono leading-relaxed">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authState === 'password_verifying'}
              className="w-full bg-[#9A642C] hover:bg-[#805020] text-white py-4 rounded-2xl font-sans font-bold text-sm tracking-wide shadow-[0_4px_14px_rgba(154,100,44,0.15)] hover:shadow-[0_6px_20px_rgba(154,100,44,0.25)] hover:translate-y-[-1px] active:translate-y-[0px] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 mt-2"
            >
              {authState === 'password_verifying' ? 'Verifying Credentials...' : 'Unlock Dashboard'}
            </button>

            <div className="border-t border-[#E8DFD3] pt-5 flex flex-col gap-4 mt-2">
              <p className="px-1 text-center font-sans text-[10px] uppercase tracking-wider text-[#66554A]/60 leading-relaxed">
                Administrative privileges are controlled by role policy keys.
              </p>
              <div className="text-center">
                <a
                  href="/login"
                  className="inline-block text-[11px] font-sans uppercase tracking-widest text-[#66554A] hover:text-[#241A15] transition-colors font-bold border-b border-[#E8DFD3] pb-0.5 hover:border-[#241A15]"
                >
                  Customer Portal? Log In Here
                </a>
              </div>
            </div>
          </form>
        )}

        {isTotpStage && (
          <form onSubmit={handleVerifyTotpSubmit} className="bg-[#FFFDFC]/98 backdrop-blur-md rounded-[32px] border border-[#E8DFD3] p-8 md:p-10 shadow-[0_30px_70px_rgba(36,26,21,0.04)] flex flex-col gap-6 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[4px] bg-gradient-to-r from-[#C3924F] via-[#9A642C] to-[#C3924F]" />
            <div className="text-center">
              <h1 className="font-serif text-2xl font-bold text-[#241A15] tracking-tight">Two-Factor Auth</h1>
              <p className="text-xs text-[#66554A] mt-2 leading-relaxed px-2">
                {authState === 'totp_setup_required'
                  ? "Scan the QR code with Google Authenticator to register your workspace."
                  : "Enter the secure 6-digit code from Google Authenticator to continue."}
              </p>
            </div>

            {authState === 'totp_setup_required' && qrCodeDataUrl && (
              <div className="flex flex-col items-center gap-3 bg-[#FFFDFC] p-5 rounded-[24px] border border-[#E8DFD3] shadow-inner">
                <img src={qrCodeDataUrl} alt="2FA QR Code" className="w-44 h-44 bg-[#FFFDFC] rounded-2xl p-2.5 shadow-sm border border-[#E8DFD3]" />
                <p className="text-[10px] font-mono text-[#66554A]">
                  Manual code: <strong className="text-[#241A15] tracking-widest select-all">{totpSecret}</strong>
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 text-center mt-2">
              <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A]">Verification Code</label>
              <input
                ref={totpInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => handleTotpCodeChange(e.target.value)}
                placeholder="000000"
                className={`text-3xl text-center transition-all outline-none border rounded-2xl px-4 py-4 tracking-[0.4em] font-mono shadow-sm ${
                  totpCode
                    ? 'border-[#9A642C] bg-[#FFFDFC] text-[#241A15]'
                    : 'border-[#E8DFD3] bg-[#FFFDFC] text-[#66554A]/40'
                } focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10`}
              />
              <span className="text-[9px] text-[#66554A]/60 font-mono mt-1">Updates automatically every 30 seconds</span>
            </div>

            {authError && (
              <div className="bg-red-500/5 border border-red-500/10 text-red-600 p-3.5 rounded-2xl text-xs text-center font-mono leading-relaxed">
                {authError}
              </div>
            )}

            <div className="flex gap-4 mt-2">
              <button
                type="button"
                onClick={() => {
                  verifyInFlightRef.current = false;
                  lastSubmittedCodeRef.current = '';
                  setAuthState('idle');
                  setTotpCode('');
                  signOut(auth);
                }}
                className="flex-1 bg-[#F3ECE3] border border-[#E8DFD3] text-[#66554A] hover:bg-[#E8DFD3] rounded-2xl py-4 font-sans font-bold text-xs uppercase tracking-widest transition-all duration-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={authState === 'totp_verifying' || authState === 'redirecting' || totpCode.length !== 6}
                className="flex-1 bg-[#2F6B54] hover:bg-[#204a3a] text-white disabled:opacity-50 rounded-2xl py-4 font-sans font-bold text-xs uppercase tracking-widest transition-all duration-300 flex items-center justify-center shadow-[0_4px_14px_rgba(47,107,84,0.15)]"
              >
                {authState === 'totp_verifying'
                  ? 'Verifying securely…'
                  : authState === 'redirecting'
                  ? 'Redirecting…'
                  : 'Verify'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
