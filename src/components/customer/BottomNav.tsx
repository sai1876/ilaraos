'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, UtensilsCrossed, CircleUser, ShoppingCart, HeartHandshake } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { motion } from 'framer-motion';

import { useState, useEffect } from 'react';

const NAV_ITEMS = [
  { href: '/menu',    icon: UtensilsCrossed, label: 'Menu'    },
  { href: '/cart',    icon: ShoppingCart,    label: 'Cart'    },
  { href: '/',        icon: LayoutGrid,      label: 'Home', isElevated: true },
  { href: '/social',  icon: HeartHandshake,  label: 'Social'  },
  { href: '/profile', icon: CircleUser,      label: 'Profile' },
];

export default function BottomNav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const cart = useStore(s => s.cart);
  const activeOrders = useStore(s => s.activeOrders);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const activeOrdersCount = activeOrders.length;

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 md:hidden px-4 pointer-events-none">
      <nav
        className="mx-auto max-w-[420px] h-16 rounded-2xl border border-[#B89C48]/35 shadow-[0_16px_36px_rgba(184,156,72,0.14)] backdrop-blur-xl pointer-events-auto overflow-visible"
        style={{
          background: 'rgba(251, 251, 249, 0.92)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center justify-around h-full px-2 relative overflow-visible">
          {NAV_ITEMS.map(({ href, icon: Icon, label, isElevated }) => {
            const isActive = pathname === href;
            const isCart = href === '/cart';

            if (isElevated) {
              return (
                <div key={href} className="relative flex-1 flex items-center justify-center select-none h-full overflow-visible">
                  <Link
                    href={href}
                    className="absolute -top-6 w-14 h-14 rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(184,156,72,0.22)] border-2 border-[#B89C48] transition-all active:scale-95 duration-300 z-30"
                    style={{
                      background: isActive ? '#B89C48' : '#FFFFFF',
                    }}
                  >
                    <Icon
                      size={24}
                      strokeWidth={1.5}
                      style={{
                        color: isActive ? '#FFFFFF' : '#B89C48',
                      }}
                    />
                  </Link>
                </div>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-center flex-1 h-full select-none"
              >
                <div className="relative flex items-center justify-center pt-0.5">
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2 : 1.5}
                    style={{
                      color: isActive ? '#B89C48' : 'rgba(26, 26, 23, 0.4)',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                  
                  {/* Cart badge */}
                  {isCart && mounted && cartCount > 0 && (
                    <motion.span
                      key={cartCount}
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-2.5 -right-2.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8.5px] font-mono font-black bg-red-500 text-white border border-[#FBFBF9] z-20 leading-none text-center"
                      style={{ padding: 0 }}
                    >
                      {cartCount > 9 ? '9+' : cartCount}
                    </motion.span>
                  )}
                  {/* Active orders badge */}
                  {href === '/profile' && mounted && activeOrdersCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#B89C48] rounded-full ring-1 ring-[#FBFBF9] animate-pulse z-20" />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
