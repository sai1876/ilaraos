'use client';

import { useEffect, useState } from 'react';
import { X, Gift, Megaphone, Copy, Check, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AnnouncementPopupProps {
  title: string;
  body: string;
  frequency: 'every_visit' | 'once_per_session' | 'once_per_day';
  startDate?: string;
  endDate?: string;
  ctaLabel?: string;
  ctaLink?: string;
  promoCode?: string;
  primaryColor?: string;
  bgColor?: string;
  headlineColor?: string;
  textColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
}

function shouldShowPopup(frequency: AnnouncementPopupProps['frequency']): boolean {
  if (frequency === 'every_visit') return true;

  if (frequency === 'once_per_session') {
    if (sessionStorage.getItem('hh_popup_shown')) return false;
    sessionStorage.setItem('hh_popup_shown', '1');
    return true;
  }

  if (frequency === 'once_per_day') {
    const today = new Date().toISOString().slice(0, 10);
    const seen = localStorage.getItem('hh_popup_date');
    if (seen === today) return false;
    localStorage.setItem('hh_popup_date', today);
    return true;
  }

  return false;
}

export default function AnnouncementPopup({
  title,
  body,
  frequency,
  startDate,
  endDate,
  ctaLabel,
  ctaLink,
  promoCode,
  primaryColor,
  bgColor,
  headlineColor,
  textColor,
  buttonBgColor,
  buttonTextColor,
}: AnnouncementPopupProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Check date range
    const now = new Date();
    if (startDate && new Date(startDate) > now) return;
    if (endDate && new Date(endDate) < now) return;

    if (shouldShowPopup(frequency)) {
      // Small delay so it doesn't flash immediately on load
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [frequency, startDate, endDate]);

  const handleCopyCode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!promoCode) return;
    try {
      await navigator.clipboard.writeText(promoCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleCTAClick = () => {
    setVisible(false);
    if (ctaLink) {
      window.location.href = ctaLink;
    } else {
      window.location.href = '/menu';
    }
  };

  // Determine dark vs light background to style secondary elements (close button, coupon box)
  const isDarkBg = (bgColor || '').toLowerCase() === '#342015' || (bgColor || '').toLowerCase().includes('dark') || (bgColor || '').toLowerCase() === '#0a0604';

  const defaultBg = '#FAF6F0'; // Warm ivory cream matching customer theme
  const defaultHeadline = '#2C1A10'; // Deep dark espresso brown
  const defaultText = '#534434'; // Sandstone dark text
  const defaultPrimary = '#f59e0b'; // Amber yellow accent

  const modalBg = bgColor || defaultBg;
  const modalHeadline = headlineColor || defaultHeadline;
  const modalText = textColor || defaultText;
  const accent = primaryColor || defaultPrimary;
  const btnBg = buttonBgColor || accent;
  const btnText = buttonTextColor || (isDarkBg ? '#ffffff' : '#3b1f00');

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="popup-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md"
            onClick={() => setVisible(false)}
          />

          {/* Modal Container for Absolute Screen Centering */}
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="popup-modal"
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-sm rounded-[32px] shadow-[0_24px_70px_rgba(44,26,16,0.18)] overflow-hidden pointer-events-auto border"
              style={{
                backgroundColor: modalBg,
                borderColor: `${accent}35`, // Subtle transparency border
              }}
            >
              {/* Theme-matching top line indicator */}
              <div 
                className="h-1.5 w-full shadow-[0_2px_8px_rgba(0,0,0,0.05)]" 
                style={{ backgroundColor: accent }}
              />

              <div className="p-7 relative">
                {/* Close button */}
                <button
                  onClick={() => setVisible(false)}
                  aria-label="Close announcement"
                  className="absolute top-5 right-5 p-1.5 rounded-full transition-all duration-200"
                  style={{ 
                    color: isDarkBg ? 'rgba(255, 255, 255, 0.4)' : 'rgba(27, 28, 23, 0.4)',
                    backgroundColor: isDarkBg ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = isDarkBg ? '#ffffff' : '#000000';
                    e.currentTarget.style.backgroundColor = isDarkBg ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = isDarkBg ? 'rgba(255, 255, 255, 0.4)' : 'rgba(27, 28, 23, 0.4)';
                    e.currentTarget.style.backgroundColor = isDarkBg ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';
                  }}
                >
                  <X size={16} />
                </button>

                {/* Glowing animated icon badge */}
                <div 
                  className="mb-5 relative flex h-14 w-14 items-center justify-center rounded-2xl border transition-shadow"
                  style={{
                    backgroundColor: `${accent}15`,
                    borderColor: `${accent}40`
                  }}
                >
                  <div 
                    className="absolute inset-0 rounded-2xl animate-ping opacity-35" 
                    style={{ backgroundColor: accent }}
                  />
                  {promoCode ? (
                    <Gift className="w-6 h-6 animate-pulse" style={{ color: accent }} />
                  ) : (
                    <Megaphone className="w-6 h-6" style={{ color: accent }} />
                  )}
                </div>

                {/* Title and Body */}
                <h3 
                  className="font-serif text-2xl font-bold mb-2.5 tracking-tight leading-tight"
                  style={{ color: modalHeadline }}
                >
                  {title}
                </h3>
                
                <p 
                  className="text-[13px] leading-relaxed font-sans font-medium"
                  style={{ color: `${modalText}dd` }}
                >
                  {body}
                </p>

                {/* Promo Code Copy Card (Useful Section) */}
                {promoCode && (
                  <div 
                    onClick={handleCopyCode}
                    className="mt-5 flex items-center justify-between p-3.5 border rounded-2xl cursor-pointer transition-all group active:scale-[0.98] duration-200"
                    style={{
                      backgroundColor: isDarkBg ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                      borderColor: `${accent}25`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = `${accent}50`;
                      e.currentTarget.style.backgroundColor = isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = `${accent}25`;
                      e.currentTarget.style.backgroundColor = isDarkBg ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
                    }}
                    title="Click to copy coupon code"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span 
                        className="text-[9px] uppercase tracking-widest font-mono font-bold"
                        style={{ color: `${accent}cc` }}
                      >
                        Use Coupon Code
                      </span>
                      <span 
                        className="text-sm font-mono font-black uppercase tracking-wider"
                        style={{ color: modalHeadline }}
                      >
                        {promoCode}
                      </span>
                    </div>
                    <button 
                      type="button"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-mono text-[10px] font-bold uppercase transition-colors"
                      style={{
                        backgroundColor: `${accent}15`,
                        color: accent
                      }}
                    >
                      {copied ? (
                        <>
                          <Check size={11} className="text-emerald-500" />
                          <span className="text-emerald-500">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* CTA Buttons */}
                <div className="mt-6 flex flex-col gap-2">
                  <button
                    onClick={handleCTAClick}
                    className="w-full rounded-2xl py-3.5 text-xs font-bold transition-all duration-200 shadow-md flex items-center justify-center gap-1.5 active:scale-[0.98] uppercase tracking-wider hover:opacity-95"
                    style={{ 
                      backgroundColor: btnBg, 
                      color: btnText,
                      boxShadow: `0 4px 14px ${btnBg}30`
                    }}
                  >
                    <span>{ctaLabel || 'Claim Offer'}</span>
                    <ArrowRight size={14} />
                  </button>

                  <button
                    onClick={() => setVisible(false)}
                    className="w-full rounded-2xl py-3 text-xs font-semibold transition-all duration-200"
                    style={{
                      backgroundColor: isDarkBg ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      color: isDarkBg ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
                      e.currentTarget.style.color = isDarkBg ? '#ffffff' : '#000000';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isDarkBg ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
                      e.currentTarget.style.color = isDarkBg ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
