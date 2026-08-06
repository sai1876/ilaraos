'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, ChevronUp } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { usePathname, useRouter } from 'next/navigation';
import { calculatePricingPreview } from '@/features/checkout/clientPricingPreview';

import { useState, useEffect } from 'react';

export default function CartSheet({ showTrigger = true }: { showTrigger?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isCartPage = pathname === '/cart';

  const { cart } = useStore();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Only apply scroll-aware behavior on the Home page ('/')
    if (pathname !== '/') {
      setIsVisible(true);
      return;
    }

    // For home page, show only if already scrolled down past 20px
    setIsVisible(window.scrollY > 20);

    const handleScroll = () => {
      setIsVisible(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [pathname]);

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  
  // Use the shared helper just for the base subtotal to avoid duplicating the reduce logic
  const { subtotal: subtotalAmount } = calculatePricingPreview({
    cart,
    platformFee: 5,
    promoApplied: false,
    promoDiscountPercent: 0,
    promoScope: 'All',
    activeBalance: 0,
    pointsInput: 0,
    menuItems: []
  });

  if (!mounted || totalItems === 0) return null;

  return (
    <AnimatePresence>
      {showTrigger && cart.length > 0 && !isCartPage && isVisible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          onClick={() => router.push('/cart')}
          className="fixed bottom-[100px] md:bottom-12 left-4 right-4 z-40 bg-white rounded-2xl shadow-[0_12px_40px_rgba(184,156,72,0.15)] border border-[#B89C48]/35 p-4 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all max-w-[420px] mx-auto pointer-events-auto"
        >
          {/* Left: bag icon + details */}
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-xl bg-[#F9F6EE] border border-[#B89C48]/25 flex items-center justify-center">
                <ShoppingBag className="text-[#B89C48]" size={20} />
              </div>
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-mono font-black w-5 h-5 min-w-[20px] min-h-[20px] flex items-center justify-center rounded-full px-1 border border-white">
                {totalItems}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-[#1A1A17]/65 font-mono text-[9px] uppercase tracking-widest font-black">
                Your Order · {totalItems} {totalItems === 1 ? 'item' : 'items'}
              </p>
              <p className="text-[#1A1A17] font-bold text-base leading-none">₹{subtotalAmount}</p>
            </div>
          </div>

          {/* Right: Review & Pay CTA */}
          <div className="flex items-center gap-1.5 bg-[#B89C48] hover:bg-[#8E7535] text-white font-mono text-[10px] font-black uppercase tracking-[0.15em] px-4 py-2.5 rounded-xl border border-[#8E7535]/30 shadow-sm transition-colors duration-200">
            Review &amp; Pay
            <ChevronUp size={14} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
