'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingCart, UtensilsCrossed, LayoutGrid, HeartHandshake, Gift, Check, Activity, ArrowRight } from 'lucide-react';
import { useStore } from '@/store/useStore';

export default function TopNav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { cart, user, userProfile, authLoading, activeOrders } = useStore();

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const activeOrdersCount = activeOrders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length;

  useEffect(() => {
    setMounted(true);
  }, []);

  const getInitials = () => {
    if (userProfile?.student_email) {
      return userProfile.student_email.substring(0, 2).toUpperCase();
    }
    return "US";
  };

  const handleOpenTracker = () => {
    const { setIsTrackerOpen, setSelectedTrackerOrderId } = useStore.getState();
    if (activeOrdersCount === 1) {
      setSelectedTrackerOrderId(activeOrders[0].order_id);
    } else {
      setSelectedTrackerOrderId(null);
    }
    setIsTrackerOpen(true);
  };

  return (
    <nav className="hidden md:block fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-6xl z-50 rounded-full border border-white/60 bg-[#FBFBF9]/75 backdrop-blur-lg shadow-[0_10px_30px_rgba(184,156,72,0.06),_0_4px_12px_rgba(0,0,0,0.03)]">
      <div className="flex h-16 items-center justify-between px-6">
        
        {/* Branding & Logo */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <img src="/images/logo_icon.png" alt="Ilara Logo" className="h-8 w-auto object-contain" />
            <span className="font-serif text-xl font-extrabold text-[#1A1A17] tracking-tight">
              Ilara
            </span>
          </Link>
          {mounted && !authLoading && userProfile?.student_email && (
            <span className="inline-flex items-center gap-1 bg-[#fff8e6] border border-[#f59e0b]/30 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-[#855300]">
              <Check size={10} className="stroke-[3]" /> Student
            </span>
          )}
        </div>

        {/* Navigation Links */}
        <div className="flex items-center space-x-6 lg:space-x-8 text-xs font-mono uppercase tracking-widest">
          <Link
            href="/"
            className={`flex items-center gap-1.5 font-bold transition-colors ${
              pathname === '/' ? 'text-[#B89C48]' : 'text-[#1A1A17]/60 hover:text-[#1A1A17]'
            }`}
          >
            <LayoutGrid size={15} strokeWidth={1.5} />
            <span>Home</span>
          </Link>
          <Link
            href="/menu"
            className={`flex items-center gap-1.5 font-bold transition-colors ${
              pathname === '/menu' ? 'text-[#B89C48]' : 'text-[#1A1A17]/60 hover:text-[#1A1A17]'
            }`}
          >
            <UtensilsCrossed size={15} strokeWidth={1.5} />
            <span>Menu</span>
          </Link>
          <Link
            href="/referrals"
            className={`flex items-center gap-1.5 font-bold transition-colors ${
              pathname === '/referrals' ? 'text-[#B89C48]' : 'text-[#1A1A17]/60 hover:text-[#1A1A17]'
            }`}
          >
            <Gift size={15} strokeWidth={1.5} />
            <span>Rewards</span>
          </Link>
          <Link
            href="/social"
            className={`flex items-center gap-1.5 font-bold transition-colors ${
              pathname === '/social' ? 'text-[#B89C48]' : 'text-[#1A1A17]/60 hover:text-[#1A1A17]'
            }`}
          >
            <HeartHandshake size={15} strokeWidth={1.5} />
            <span>Social</span>
          </Link>
        </div>

        {/* User Utilities & CTA */}
        <div className="flex items-center gap-4">
          
          {/* Active Order tracking pill */}
          {mounted && !authLoading && user && activeOrdersCount > 0 && (
            <button
              onClick={handleOpenTracker}
              className="inline-flex items-center gap-1.5 bg-[#B89C48]/10 border border-[#B89C48]/40 hover:bg-[#B89C48]/20 text-[#8E7535] text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1.5 rounded-full transition-all animate-pulse shadow-sm"
            >
              <Activity size={12} className="text-[#B89C48]" />
              <span>Track ({activeOrdersCount})</span>
            </button>
          )}

          {/* Points Balance Coin Pill */}
          {mounted && !authLoading && user && (
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 bg-white border border-[#B89C48]/25 rounded-full px-3 py-1.5 text-[10px] font-mono font-black text-[#1A1A17] hover:border-[#B89C48]/55 transition-colors shadow-sm"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shadow-inner inline-block" />
              <span>{userProfile?.points ?? 0} PTS</span>
            </Link>
          )}

          {/* Cart Shortcut Button */}
          <Link
            href="/cart"
            className="relative inline-flex items-center gap-2 rounded-xl bg-[#B89C48] hover:bg-[#8E7535] px-4 py-2 text-xs font-mono font-black uppercase tracking-widest text-[#FFFFFF] shadow-sm transition duration-300"
          >
            <ShoppingCart size={14} strokeWidth={1.5} />
            <span>Cart</span>
            {mounted && cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-black bg-[#EF4444] text-[#FFFFFF] px-1 border border-white z-20 shadow-md">
                {cartCount}
              </span>
            )}
          </Link>

          {/* User initials bubble / Sign in */}
          {mounted && (
            authLoading ? (
              <div
                className="h-9 w-24 animate-pulse rounded-xl bg-[#E8DFD3]"
                aria-label="Loading account"
              />
            ) : user ? (
              <Link
                href="/profile"
                className="w-9 h-9 rounded-full bg-[#1A1A17] text-[#FBFBF9] border border-[#B89C48]/20 flex items-center justify-center text-xs font-mono font-bold hover:scale-105 active:scale-95 transition-all shadow-sm"
              >
                {getInitials()}
              </Link>
            ) : (
              <Link
                href="/login"
                className="relative inline-flex items-center gap-1.5 rounded-xl bg-[#241A15] hover:bg-[#3E2D25] px-4 py-2 text-xs font-mono font-black uppercase tracking-widest text-[#FFFFFF] shadow-sm transition duration-300 group/btn"
              >
                <span>Get Started</span>
                <ArrowRight size={13} className="transition-transform group-hover/btn:translate-x-0.5" />
              </Link>
            )
          )}

        </div>
      </div>
    </nav>
  );
}
