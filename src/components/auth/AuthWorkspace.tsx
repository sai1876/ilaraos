'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  Lock,
  Mail,
  Users,
  ArrowRight,
  CheckCircle,
  
  
  Smartphone,
  Check,
  Send,
  Loader2,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '@/store/useStore';
import { auth } from '@/lib/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
import { getUserProfileByPhone } from '@/features/users/userService';

// Get backend URL from env (Force clean Vercel build configuration)

interface AuthWorkspaceProps {
  defaultTab?: 'signup' | 'login';
  isModal?: boolean;
  onClose?: () => void;
  returnTo?: string;
}

export default function AuthWorkspace({ defaultTab = 'signup', isModal = false, onClose, returnTo }: AuthWorkspaceProps) {
  const { setUser, setUserProfile } = useStore();
  const postAuthDestination = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/menu';

  // Tab: 'login' or 'signup'
  const [tab, setTab] = useState<'login' | 'signup'>(defaultTab);

  // Signup State Machine Steps: 'phone' | 'handshake' | 'profile' | 'lockout' | 'dashboard'
  const [signupStep, setSignupStep] = useState<'phone' | 'handshake' | 'profile' | 'lockout' | 'dashboard'>('phone');

  // Login State Machine Steps: 'credentials' | 'handshake_login' | 'handshake_login_poll'
  const [loginStep, setLoginStep] = useState<'credentials' | 'handshake_login'>('credentials');

  // Input states
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [referral, setReferral] = useState('');

  // Handshake tracking states
  const [handshakeToken, setHandshakeToken] = useState('');
  const [handshakeUrl, setHandshakeUrl] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingSecondsLeft, setPollingSecondsLeft] = useState(600); // 10 mins

  // General Status & UI Feedbacks
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [emailSentUrl, setEmailSentUrl] = useState<string | null>(null);

  // Poll status for SignUp/Login handshakes
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPolling && handshakeToken) {
      intervalId = setInterval(async () => {
        try {
          const res = await fetch(`/api/auth/poll-status/${handshakeToken}`);
          if (!res.ok) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
              const data = await res.json();
              throw new Error(data.detail || 'Polling failed');
            } else {
              throw new Error(`Polling failed with status: ${res.status}`);
            }
          }

          const data = await res.json();
          if (data.is_phone_verified) {
            setIsPolling(false);
            clearInterval(intervalId);

            if (tab === 'signup') {
              setSignupStep('profile');
            } else {
              // Option B Passwordless Login success
              setSuccessMessage("Ustaad! Instant Login Authenticated.");

              if (data.custom_token) {
                const { signInWithCustomToken } = await import('firebase/auth');
                const credential = await signInWithCustomToken(auth, data.custom_token);
                setUser({ uid: credential.user.uid, phone: data.user_profile?.phone || phone });
                if (data.user_profile) {
                  setUserProfile(data.user_profile);
                }
              } else {
                const mockUser = { uid: "user_" + phone.replace(/\D/g, ""), phone };
                setUser(mockUser);
                if (data.user_profile) {
                  setUserProfile(data.user_profile);
                }
              }

              setTimeout(() => {
                window.location.href = postAuthDestination;
              }, 1500);
            }
          }
        } catch (e: unknown) {
          console.error("Polling error:", e);
          setError(getErrorMessage(e, "Session verification failed. Please try again."));
          setIsPolling(false);
        }
      }, 1500); // Poll every 1.5 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPolling, handshakeToken, tab, phone, setUser, setUserProfile]);

  // Polling lifespan countdown (10 minutes)
  useEffect(() => {
    if (!isPolling) return;
    const timer = setInterval(() => {
      setPollingSecondsLeft(s => {
        if (s <= 1) {
          setIsPolling(false);
          setError("Verification token expired. Please retry.");
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPolling]);

  // Phase 1: Check phone availability & generate WhatsApp handshake token
  const handleCheckPhoneAndHandshake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Initial Redis Cache Boundary Check (Fast Path)
      const cacheCheckRes = await fetch(`/api/auth/check-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });

      const cacheCheckData = await cacheCheckRes.json();
      if (!cacheCheckRes.ok || cacheCheckData.available === false) {
        throw new Error(cacheCheckData.detail || "This phone number is already linked to an active account.");
      }

      // 2. Generate WhatsApp Handshake Token
      const hsRes = await fetch(`/api/auth/whatsapp-handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });

      const hsData = await hsRes.json();
      if (!hsRes.ok) {
        throw new Error(hsData.detail || "Handshake generation failed.");
      }

      setHandshakeToken(hsData.token);
      setHandshakeUrl(hsData.redirect_url);
      setSignupStep('handshake');
      setIsPolling(true);
      setPollingSecondsLeft(600); // 10 minutes TTL
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Communication error with Auth Engine."));
    } finally {
      setLoading(false);
    }
  };

  // Phase 4: Submit profile credentials & Referral code
  const handleRegisterProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Full Name is required.");
    if (!email.trim()) return setError("Email is required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    setLoading(true);
    setError(null);

    try {
      // 0. Redis Cache Boundary Check for Email
      const emailCheckRes = await fetch(`/api/auth/check-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const emailCheckData = await emailCheckRes.json();
      if (!emailCheckRes.ok || emailCheckData.available === false) {
        throw new Error(emailCheckData.detail || "This email is already linked to an active account.");
      }

      // 1. Create User in Firebase Auth directly
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;

      // 2. Send Native Firebase verification mail
      await sendEmailVerification(user);
      
      const idToken = await user.getIdToken();

      // 3. Create profile document in Firestore (secure backend)
      const createRes = await fetch(`/api/auth/create-profile`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ phone, name, email, referredBy: referral, handshakeToken })
      });

      if (!createRes.ok) {
        const createData = await createRes.json();
        throw new Error(createData.detail || "Failed to create user profile.");
      }

      // 4. Staging complete, move to lockout screen
      setSignupStep('lockout');
      setEmailSentUrl("native_firebase"); // Set to non-null value so status button displays
    } catch (err: unknown) {
      console.error("Client signup failed:", err);
      setError(getErrorMessage(err, "Failed to submit profile details."));
    } finally {
      setLoading(false);
    }
  };

  // Check Email Activation trigger (polls or manual action check)
  const handleMockEmailVerification = async () => {
    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("No authenticated session found. Please try logging in again.");
      }

      await user.reload(); // Reload user state to get latest emailVerified status
      
      if (!user.emailVerified) {
        throw new Error("Email has not been verified yet. Please check your inbox and click the verification link.");
      }

      // Success! Account is now active. Securely update backend status.
      const idToken = await user.getIdToken(true); // Force refresh to ensure latest token
      
      const activateRes = await fetch('/api/auth/activate-profile', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!activateRes.ok) {
        const errData = await activateRes.json();
        throw new Error(errData.detail || "Failed to activate profile securely.");
      }

      const finalizeRes = await fetch(`/api/auth/finalize-signup-cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!finalizeRes.ok) {
        console.warn("Profile activated, but signup rewards/cache finalization will be retried later.");
      }

      const mockUser = { uid: user.uid, phone: user.phoneNumber || phone };
      setUser(mockUser);
      // Fetch the updated profile to set it in the store
      try {
        const profile = await getUserProfileByPhone(mockUser.phone);
        if (profile) setUserProfile(profile);
      } catch (e) {
        console.warn("Failed to fetch profile during mock verification", e);
      }
      
      setSuccessMessage("Ustaad! Account activated successfully. Welcome to Ilara Cafe!");
      setSignupStep('dashboard');

      setTimeout(() => {
        window.location.href = postAuthDestination;
      }, 2000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Email verification status check failed."));
    } finally {
      setLoading(false);
    }
  };

  // Option A Login: Phone & Password Credential Fallback
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // guard against double-submit
    if (!phone || !password) {
      setError("Please fill in both Phone and Password fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const loginRes = await fetch('/api/auth/login-by-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });

      const data = await loginRes.json();

      if (!loginRes.ok) {
        // API returns { error: string, lockout?: boolean }
        if (data.lockout) {
          setSignupStep('lockout');
          throw new Error("Account inactive. Please check your email to verify your profile.");
        }
        throw new Error(data.error || data.detail || "Incorrect phone number or password.");
      }

      if (!data.custom_token) {
        throw new Error("Invalid response from server. Missing authentication token.");
      }

      // Authenticate securely via custom token
      const { signInWithCustomToken } = await import('firebase/auth');
      const credential = await signInWithCustomToken(auth, data.custom_token);

      const safeUser = { uid: credential.user.uid, phone };
      setUser(safeUser);
      if (data.user_profile) {
        setUserProfile(data.user_profile);
      }

      setSuccessMessage("Identity verified. Welcome back!");
      setTimeout(() => {
        window.location.href = postAuthDestination;
      }, 1500);

    } catch (err: unknown) {
      setError(getErrorMessage(err, "Login authentication failed."));
    } finally {
      setLoading(false);
    }
  };

  // Option B: Initiate Passwordless WhatsApp login handshake
  const handlePasswordlessLoginInit = async () => {
    if (!phone || phone.length < 10) {
      setError("Please enter your registered 10-digit phone number.");
      return;
    }

    setLoading(true);
    setError(null);

    // Open a blank tab immediately to bypass popup blockers on desktop
    const whatsappWindow = window.open('about:blank', '_blank');

    try {
      const res = await fetch('/api/auth/passwordless-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });

      const data = await res.json();
      if (res.status === 403) {
        if (whatsappWindow) whatsappWindow.close();
        setSignupStep('lockout');
        setError(data.detail || "Account inactive. Please verify email first.");
        return;
      }

      if (!res.ok) {
        if (whatsappWindow) whatsappWindow.close();
        throw new Error(data.detail || "Verification initialization failed.");
      }

      setHandshakeToken(data.token);
      setHandshakeUrl(data.redirect_url);
      setWhatsappUrl(data.whatsapp_url);
      setLoginStep('handshake_login');
      setIsPolling(true);
      setPollingSecondsLeft(300); // 5 minutes login TTL

      // Immediately attempt redirect
      if (data.whatsapp_url) {
        if (whatsappWindow) {
          whatsappWindow.location.href = data.whatsapp_url;
        } else {
          setError("Popup blocked. Tap Open WhatsApp below.");
        }
      }
    } catch (err: unknown) {
      if (whatsappWindow && whatsappWindow.location.href === 'about:blank') {
        whatsappWindow.close();
      }
      setError(getErrorMessage(err, "Login handshake failed."));
    } finally {
      setLoading(false);
    }
  };

  // Reset helper
  const handleResetFlow = () => {
    setIsPolling(false);
    setSignupStep('phone');
    setLoginStep('credentials');
    setError(null);
    setSuccessMessage(null);
    setPhone('');
    setPassword('');
    setName('');
    setEmail('');
    setReferral('');
  };

  const selectTab = (nextTab: 'signup' | 'login') => {
    setTab(nextTab);
    setError(null);
    if (!isModal) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    }
  };

  // Format mm:ss
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={isModal ? "w-full" : "min-h-[100dvh] w-full overflow-y-auto bg-[#FAF7F2] px-6 py-12 pb-24 text-[#241A15] font-sans no-scrollbar"}>
      {!isModal && (
        <>
          {/* Soft ambient coffee-lounge light spots */}
          <div className="absolute top-[-25%] left-[-15%] w-[650px] h-[650px] bg-gradient-to-br from-[#9A642C]/10 to-transparent rounded-full filter blur-[130px] pointer-events-none" />
          <div className="absolute bottom-[-25%] right-[-15%] w-[650px] h-[650px] bg-gradient-to-tl from-[#9A642C]/8 to-transparent rounded-full filter blur-[150px] pointer-events-none" />
        </>
      )}

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        layout="position"
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], layout: { duration: 0.25, ease: 'easeOut' } }}
        className="w-full max-w-md mx-auto z-10"
      >
        {/* Elegant Logo / Branding */}
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <img 
            src="/images/logo_full.png" 
            alt="Ilara Modern Indian Kitchen Logo" 
            className="h-44 w-auto object-contain drop-shadow-[0_4px_12px_rgba(36,26,21,0.08)]"
          />
          <span className="font-sans text-[10px] uppercase tracking-widest text-[#66554A] font-bold bg-[#F3ECE3]/80 px-4 py-1.5 rounded-full border border-[#E8DFD3] shadow-sm">Campus Dining &amp; Study Lounge</span>
        </div>

        {/* Premium Sliding Segment Control (Tabs) */}
        {signupStep === 'phone' && loginStep === 'credentials' && (
          <div className="flex bg-[#F3ECE3] border border-[#E8DFD3] rounded-2xl p-1.5 mb-8 shadow-[inset_0_2px_4px_rgba(154,100,44,0.03)]">
            <button
              onClick={() => selectTab('signup')}
              className={`flex-grow py-3 rounded-xl text-[11px] uppercase tracking-wider font-sans font-bold transition-all duration-300 ${tab === 'signup' ? 'bg-[#9A642C] text-white shadow-md' : 'text-[#66554A] hover:text-[#241A15]'}`}
            >
              Sign Up
            </button>
            <button
              onClick={() => selectTab('login')}
              className={`flex-grow py-3 rounded-xl text-[11px] uppercase tracking-wider font-sans font-bold transition-all duration-300 ${tab === 'login' ? 'bg-[#9A642C] text-white shadow-md' : 'text-[#66554A] hover:text-[#241A15]'}`}
            >
              Log In
            </button>
          </div>
        )}

        {/* MAIN PANEL CONTENT - Elegant Tactile Card */}
        <motion.div id="auth-panel" layout className="scroll-mt-6 bg-[#FFFDFC]/98 backdrop-blur-md rounded-[32px] border border-[#E8DFD3] p-8 md:p-10 shadow-[0_30px_70px_rgba(36,26,21,0.04)] relative overflow-hidden">
          {/* Top Premium Color Stripe */}
          <div className="absolute inset-x-0 top-0 h-[4px] bg-gradient-to-r from-[#C3924F] via-[#9A642C] to-[#C3924F]" />

          {isModal && onClose && (
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 text-[#66554A] hover:text-[#241A15] rounded-full transition-all duration-200 hover:bg-[#FAF7F2] border border-[#E8DFD3] hover:scale-105 active:scale-95"
              aria-label="Close modal"
              type="button"
            >
              <X size={14} />
            </button>
          )}

          <AnimatePresence mode="wait">

            {/* SIGNUP STEP 1: PHONE COLLECTION */}
            {tab === 'signup' && signupStep === 'phone' && (
              <motion.form
                key="signup-phone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleCheckPhoneAndHandshake}
                className="flex flex-col gap-6"
              >
                <div className="text-center">
                  <h1 className="font-serif text-2xl font-bold text-[#241A15] tracking-tight mb-1">Create Account</h1>
                  <p className="text-xs text-[#66554A] leading-relaxed">Enter your phone number to initialize verification.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A]/90 mb-0.5 px-0.5">Phone Number</label>
                  <div className="relative flex items-center">
                    <Phone className="absolute left-4 text-[#9A642C]/60" size={16} />
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl pl-12 pr-4 py-4 text-sm font-sans font-medium text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10 transition-all duration-300 shadow-sm"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/5 border border-red-500/10 text-red-600 p-3.5 rounded-2xl text-xs font-mono text-center leading-relaxed">
                     {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#9A642C] hover:bg-[#805020] text-white py-4 rounded-2xl font-sans font-bold text-sm tracking-wide shadow-[0_4px_14px_rgba(154,100,44,0.15)] hover:shadow-[0_6px_20px_rgba(154,100,44,0.25)] hover:translate-y-[-1px] active:translate-y-[0px] active:scale-[0.99] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50"
                >
                  {loading ? 'Validating...' : 'Next Step'} <ArrowRight size={14} />
                </button>
              </motion.form>
            )}

            {/* SIGNUP STEP 2: WHATSAPP HANDSHAKE REDIRECT & POLL */}
            {tab === 'signup' && signupStep === 'handshake' && (
              <motion.div
                key="signup-handshake"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-6 text-center"
              >
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-700 shadow-inner animate-pulse">
                    <Smartphone size={22} className="stroke-[2]" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 px-2">
                  <h1 className="font-serif text-2xl font-bold text-[#1b1c17] tracking-tight">WhatsApp Verification</h1>
                  <p className="text-xs text-[#867461] leading-relaxed">
                    Send the pre-filled verification message to our bot line to activate your registration form.
                  </p>
                </div>

                {/* QR Code and link buttons */}
                <div className="bg-[#fdfdfb] border border-[#e6dec9] p-6 rounded-[28px] flex flex-col items-center gap-5 shadow-sm">
                  {showQR ? (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#e6dec9]/60 flex flex-col items-center">
                      <QRCodeSVG value={handshakeUrl} size={150} />
                      <div className="text-[9px] text-[#867461] font-bold font-mono tracking-wider mt-3 bg-[#f5f4ec] px-2.5 py-1 rounded border border-[#e6dec9]">SCAN WITH PHONE</div>
                    </div>
                  ) : (
                    <a
                      href={handshakeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#25D366] hover:bg-[#1ebd53] text-white py-4 rounded-2xl text-xs uppercase tracking-widest font-sans font-bold flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_4px_14px_rgba(37,211,102,0.25)] hover:shadow-[0_6px_20px_rgba(37,211,102,0.35)]"
                    >
                      <Send size={13} /> Send WhatsApp Ref
                    </a>
                  )}

                  <button
                    onClick={() => setShowQR(!showQR)}
                    className="text-[11px] uppercase font-sans tracking-widest font-bold text-[#867461] hover:text-[#451a03] transition-all duration-200 border-b border-[#e6dec9] pb-0.5 hover:border-[#451a03]"
                  >
                    {showQR ? 'Hide QR Code' : 'Display QR Code fallback'}
                  </button>
                </div>

                {/* Polling Spinner info */}
                <div className="flex flex-col items-center gap-2 border-t border-[#E8DFD3] pt-5">
                  <div className="flex items-center gap-2 text-xs text-[#9A642C] font-sans font-bold bg-[#9A642C]/5 border border-[#9A642C]/10 px-3.5 py-2 rounded-full shadow-sm">
                    <Loader2 className="animate-spin text-[#9A642C]" size={14} />
                    <span>Awaiting bot message handshake...</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#66554A]/70 mt-1.5">Verification expires in: {formatTimer(pollingSecondsLeft)}</span>
                </div>

                {error && (
                  <div className="bg-red-500/5 border border-red-500/10 text-red-600 p-3.5 rounded-2xl text-xs font-mono">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleResetFlow}
                  className="text-[11px] font-sans uppercase tracking-widest font-bold text-[#66554A] hover:text-[#241A15] transition-colors"
                >
                  Return to credentials form
                </button>
              </motion.div>
            )}

            {/* SIGNUP STEP 3: UNIFIED PROFILE FORM */}
            {tab === 'signup' && signupStep === 'profile' && (
              <motion.form
                key="signup-profile"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleRegisterProfile}
                className="flex flex-col gap-4"
              >
                <div className="text-center mb-2">
                  <h1 className="font-serif text-2xl font-bold text-[#241A15] tracking-tight mb-1">Profile Setup</h1>
                  <p className="text-xs text-[#66554A] leading-relaxed">Provide your student profile credentials.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A] px-0.5">Phone Number (Locked)</label>
                  <div className="bg-[#F3ECE3]/40 border border-[#E8DFD3] rounded-2xl px-4 py-4 text-xs text-[#9A642C] font-mono flex items-center justify-between shadow-inner">
                    <span>{phone}</span>
                    <CheckCircle className="text-[#2F6B54]" size={15} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A] px-0.5">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl px-4 py-3.5 text-sm font-sans font-medium text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10 transition-all duration-300 shadow-sm"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A] px-0.5">Campus Email Address</label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-4 text-[#9A642C]/60" size={16} />
                    <input
                      type="email"
                      required
                      placeholder="name@univ.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl pl-12 pr-4 py-3.5 text-sm font-sans font-medium text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10 transition-all duration-300 shadow-sm"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A] px-0.5">Password</label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-4 text-[#9A642C]/60" size={16} />
                    <input
                      type={showSignupPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl pl-12 pr-12 py-3.5 text-sm font-mono font-medium text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10 transition-all duration-300 tracking-widest shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      className="absolute right-4 text-[#66554A] hover:text-[#241A15] transition-colors"
                      tabIndex={-1}
                    >
                      {showSignupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A] px-0.5">Referral Code (Optional)</label>
                  <div className="relative flex items-center">
                    <Users className="absolute left-4 text-[#9A642C]/60" size={16} />
                    <input
                      type="text"
                      placeholder="e.g. HAUHAU_F5T1"
                      value={referral}
                      onChange={(e) => setReferral(e.target.value.toUpperCase())}
                      className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl pl-12 pr-4 py-3.5 text-sm font-mono font-medium text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10 transition-all duration-300 uppercase shadow-sm"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/5 border border-red-500/10 text-red-600 p-3.5 rounded-2xl text-xs font-mono text-center animate-shake">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#9A642C] hover:bg-[#805020] text-white py-4 mt-3 rounded-2xl font-sans font-bold text-sm tracking-wide shadow-[0_4px_14px_rgba(154,100,44,0.15)] hover:shadow-[0_6px_20px_rgba(154,100,44,0.25)] hover:translate-y-[-1px] active:translate-y-[0px] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50"
                >
                  {loading ? 'Creating Staged Profile...' : 'Complete Signup'}
                </button>
              </motion.form>
            )}

            {/* SIGNUP STEP 4: MANDATORY EMAIL VERIFICATION LOCKOUT */}
            {signupStep === 'lockout' && (
              <motion.div
                key="signup-lockout"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-6 text-center"
              >
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#9A642C]/10 border border-[#9A642C]/20 flex items-center justify-center text-[#9A642C] shadow-inner animate-pulse">
                    <Mail size={24} className="stroke-[2]" />
                  </div>
                </div>

                <div className="flex flex-col gap-2 px-2">
                  <h1 className="font-serif text-2xl font-bold text-[#241A15] tracking-tight">Activation Email Sent</h1>
                  <p className="text-xs text-[#66554A] leading-relaxed">
                    Check your campus inbox to verify and activate your profile. Your account is locked until verified.
                  </p>
                </div>

                {/* Email Verification Status Check */}
                {emailSentUrl && (
                  <div className="bg-[#FFFDFC] border border-[#E8DFD3] p-5 rounded-[24px] flex flex-col gap-3 shadow-inner">
                    <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-[#66554A]">Verification Status</div>
                    <button
                      onClick={handleMockEmailVerification}
                      disabled={loading}
                      className="w-full bg-[#2F6B54] hover:bg-[#204a3a] text-white py-4 rounded-2xl font-sans text-xs font-bold uppercase tracking-widest transition-all duration-300 shadow-[0_4px_14px_rgba(47,107,84,0.15)] disabled:opacity-50"
                    >
                      {loading ? 'Verifying status...' : "I've Verified My Email 📧"}
                    </button>
                  </div>
                )}

                {error && (
                  <div className="bg-[#B42318]/5 border border-[#B42318]/10 text-[#B42318] p-3.5 rounded-2xl text-xs font-mono leading-relaxed">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleResetFlow}
                  className="text-[11px] font-sans uppercase tracking-widest font-bold text-[#66554A] hover:text-[#241A15] transition-colors"
                >
                  Return to Home
                </button>
              </motion.div>
            )}

            {/* LOGIN TAB CORE SCREEN */}
            {tab === 'login' && loginStep === 'credentials' && (
              <motion.form
                key="login-credentials"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleLoginSubmit}
                className="flex flex-col gap-6"
              >
                <div className="text-center">
                  <h1 className="font-serif text-2xl font-bold text-[#241A15] tracking-tight mb-1">Welcome Back</h1>
                  <p className="text-xs text-[#66554A] leading-relaxed">Authenticate to access dining orders.</p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A] px-0.5">Phone Number</label>
                    <div className="relative flex items-center">
                      <Phone className="absolute left-4 text-[#9A642C]/60" size={16} />
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl pl-12 pr-4 py-4 text-sm font-sans font-medium text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10 transition-all duration-300 shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[#66554A] px-0.5">Password</label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-4 text-[#9A642C]/60" size={16} />
                      <input
                        type={showLoginPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl pl-12 pr-12 py-4 text-sm font-mono font-medium text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-[#9A642C] focus:ring-4 focus:ring-[#9A642C]/10 transition-all duration-300 tracking-widest shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-4 text-[#66554A] hover:text-[#241A15] transition-colors"
                        tabIndex={-1}
                      >
                        {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/5 border border-red-500/10 text-red-600 p-3.5 rounded-2xl text-xs font-mono text-center leading-relaxed">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#9A642C] hover:bg-[#805020] text-white py-4 rounded-2xl font-sans font-bold text-sm tracking-wide shadow-[0_4px_14px_rgba(154,100,44,0.15)] hover:shadow-[0_6px_20px_rgba(154,100,44,0.25)] hover:translate-y-[-1px] active:translate-y-[0px] active:scale-[0.99] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50"
                >
                  {loading ? 'Verifying credentials...' : 'Unlock Workspace'}
                </button>

                <div className="flex flex-col gap-4 pt-5 border-t border-[#E8DFD3] mt-2">
                  <button
                    type="button"
                    onClick={handlePasswordlessLoginInit}
                    disabled={loading}
                    className="w-full bg-emerald-50/20 hover:bg-emerald-50/40 border border-emerald-500/20 text-[#2F6B54] hover:text-[#204a3a] py-3.5 px-5 rounded-2xl font-sans text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2F6B54] animate-pulse" />
                    <span>WhatsApp Quick Login</span>
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[#E8DFD3]" />
                    <span className="text-[9px] font-sans text-[#66554A]/50 uppercase tracking-widest font-extrabold">or</span>
                    <div className="flex-1 h-px bg-[#E8DFD3]" />
                  </div>

                  <a
                    href="/login?staff=true"
                    className="text-center text-[10px] font-sans uppercase tracking-widest font-extrabold text-[#66554A] hover:text-[#241A15] transition-colors py-1"
                  >
                    Operational Staff? Login Here
                  </a>
                </div>
              </motion.form>
            )}

            {/* LOGIN STEP: PASSWORDLESS WHATSAPP VERIFY & POLL */}
            {tab === 'login' && loginStep === 'handshake_login' && (
              <motion.div
                key="login-handshake"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-6 text-center"
              >
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#9A642C]/10 border border-[#9A642C]/20 flex items-center justify-center text-[#9A642C] shadow-inner animate-pulse">
                    <Key size={22} className="stroke-[2]" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 px-2">
                  <h1 className="font-serif text-2xl font-bold text-[#241A15] tracking-tight">Opening WhatsApp...</h1>
                  <p className="text-xs text-[#66554A] leading-relaxed">
                    If WhatsApp did not open automatically, tap the button below to send your login code.
                  </p>
                </div>

                <div className="bg-[#FFFDFC] border border-[#E8DFD3] p-6 rounded-[28px] flex flex-col items-center gap-5 shadow-sm">
                  {showQR ? (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E8DFD3]/60 flex flex-col items-center">
                      <QRCodeSVG value={handshakeUrl} size={150} />
                      <div className="text-[9px] text-[#66554A] font-bold font-mono tracking-wider mt-3 bg-[#F3ECE3] px-2 py-0.5 rounded border border-[#E8DFD3]">SCAN TO LOGIN</div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { if (whatsappUrl) window.open(whatsappUrl, '_blank', 'noopener,noreferrer'); }}
                      className="w-full bg-[#25D366] hover:bg-[#1ebd53] text-white py-4 rounded-2xl text-xs uppercase tracking-widest font-sans font-bold flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_4px_14px_rgba(37,211,102,0.25)] hover:shadow-[0_6px_20px_rgba(37,211,102,0.35)]"
                    >
                      <Send size={13} /> Open WhatsApp
                    </button>
                  )}

                  <button
                    onClick={() => setShowQR(!showQR)}
                    className="text-[11px] uppercase font-sans tracking-widest font-bold text-[#66554A] hover:text-[#241A15] transition-colors border-b border-[#E8DFD3] pb-0.5 hover:border-[#241A15]"
                  >
                    {showQR ? 'Hide QR Code' : 'Display Login QR Code'}
                  </button>
                </div>

                <div className="flex flex-col items-center gap-2 border-t border-[#E8DFD3] pt-5">
                  <div className="flex items-center gap-2 text-xs text-[#9A642C] font-sans font-bold bg-[#9A642C]/5 border border-[#9A642C]/10 px-3.5 py-1.5 rounded-full">
                    <Loader2 className="animate-spin text-[#9A642C]" size={14} />
                    <span>Awaiting WhatsApp confirmation...</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#66554A]/70 mt-1">Session expires in: {formatTimer(pollingSecondsLeft)}</span>
                </div>

                {error && (
                  <div className="bg-red-500/5 border border-red-500/10 text-red-600 p-3.5 rounded-2xl text-xs font-mono">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleResetFlow}
                  className="text-[11px] font-sans uppercase tracking-widest font-bold text-[#66554A] hover:text-[#241A15] transition-colors"
                >
                  Return to credentials form
                </button>
              </motion.div>
            )}

            {/* DASHBOARD TRANSITION FEEDBACK */}
            {signupStep === 'dashboard' && (
              <motion.div
                key="signup-dashboard"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 text-center py-6"
              >
                <div className="w-16 h-16 rounded-full bg-[#2F6B54]/10 border border-[#2F6B54]/20 flex items-center justify-center text-[#2F6B54] shadow-inner">
                  <ShieldCheck size={38} className="animate-bounce" />
                </div>
                <h1 className="font-serif text-2xl font-bold text-[#241A15] tracking-tight mb-1">Access Granted</h1>
                <p className="text-xs text-[#66554A] max-w-xs leading-relaxed">
                  Welcome to the active campus dining portal! Your secure session token has been verified.
                </p>
                <div className="flex items-center gap-2 text-xs text-[#9A642C] font-sans mt-3 font-bold bg-[#9A642C]/5 border border-[#9A642C]/10 px-3.5 py-1.5 rounded-full">
                  <Loader2 className="animate-spin text-[#9A642C]" size={12} />
                  <span>Configuring dining workspace...</span>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Success messages floating banner */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute left-6 right-6 bottom-6 bg-[#2F6B54]/10 border border-[#2F6B54]/20 text-[#2F6B54] p-4 rounded-2xl text-[11px] font-mono text-center flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Check size={12} className="text-[#2F6B54] stroke-[3]" /> {successMessage}
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      </motion.div>
    </div>
  );
}
