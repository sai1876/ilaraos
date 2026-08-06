'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock3, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import VideoHero from '@/components/customer/VideoHero';
import PremiumSaladHero from '@/components/customer/PremiumSaladHero';
import SummerCampaignHero from '@/components/customer/SummerCampaignHero';
import AnnouncementPopup from '@/components/customer/AnnouncementPopup';
import { useStore } from '@/store/useStore';
import { streamUIConfig, streamSliderItems } from '@/lib/dbService';
import type { UIConfig, SliderItem } from '@/lib/types';

// Lazy-load heavy components
const OrderTracker = dynamic(() => import('@/components/customer/OrderTracker'), {
  ssr: false,
  loading: () => null,
});

// Inline SVG thumbnails — no external requests
const COMBO_IMAGES = {
  'Power Lunch': `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="12" fill="#f5f0e8"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="36">🍱</text></svg>')}`,
  'Study Break': `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="12" fill="#f0ece4"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="36">☕</text></svg>')}`,
  'Duo Deal':    `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="12" fill="#edf0e8"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="36">🌯</text></svg>')}`,
};

const COMBOS = [
  { name: 'Power Lunch', detail: 'Chicken Rice Bowl + Iced Matcha + Free Cookie.', price: '₹299', tag: 'Fast prep' },
  { name: 'Study Break', detail: 'Any classic coffee + butter croissant.', price: '₹149', tag: 'Saves ₹60' },
  { name: 'Duo Deal', detail: '2 wraps + 2 smoothies. Perfect for sharing.', price: '₹499', tag: 'Best value' },
];

export default function CustomerLandingPage() {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<Partial<UIConfig> | null>(null);
  const [sliderItems, setSliderItems] = useState<SliderItem[]>([]);
  const points = useStore((state) => state.userProfile?.points ?? 0);

  useEffect(() => {
    setMounted(true);

    // Stream storefront config in real-time
    const unsubscribeConfig = streamUIConfig((data) => {
      if (data) setConfig(data);
    });

    // Stream slider items in real-time
    const unsubscribeSlider = streamSliderItems((items) => {
      setSliderItems(items);
    });

    return () => {
      unsubscribeConfig();
      unsubscribeSlider();
    };
  }, []);

  // Derived visibility flags (default true if config not yet loaded)
  const showFeatured = config ? (config.show_featured_items ?? true) : true;
  const showCombos = config ? (config.show_combos ?? true) : true;
  const showStats = config ? (config.show_store_stats ?? true) : true;

  // Popup
  const popupEnabled = config?.popup_enabled ?? false;

  // CSS variables for accent colors
  const cssVars = config ? {
    '--primary-accent': config.primary_accent_color ?? '#f59e0b',
    '--btn-bg': config.btn_bg_color ?? '#f59e0b',
    '--btn-text': config.btn_text_color ?? '#613b00',
  } as React.CSSProperties : {};

  return (
    <main className="min-h-screen bg-background pb-[140px]" style={cssVars}>

      {/* Announcement Popup */}
      {mounted && popupEnabled && config?.popup_title && (
        <AnnouncementPopup
          title={config.popup_title}
          body={config.popup_body ?? ''}
          frequency={config.popup_frequency ?? 'once_per_session'}
          startDate={config.popup_start_date}
          endDate={config.popup_end_date}
          ctaLabel={config.popup_cta_label}
          ctaLink={config.popup_cta_link}
          promoCode={config.popup_promo_code}
        />
      )}

      {mounted && config && (
        config.layout_mode === 'premium_salad' ? (
          <PremiumSaladHero 
            sliderItems={sliderItems}
            uiConfig={config as any}
          />
        ) : config.layout_mode === 'summer_sips' ? (
          <SummerCampaignHero />
        ) : (
          <VideoHero config={config ?? undefined} />
        )
      )}
      {!mounted && <VideoHero config={config ?? undefined} />}
      <OrderTracker />

      {/* How it works strip */}
      <section className="bg-white border-b border-gray-100 py-3 shadow-sm">
        <div className="mx-auto max-w-md md:max-w-3xl px-6 flex items-center justify-between text-center">
          <div className="flex flex-col items-center flex-1">
            <span className="text-base md:text-lg" role="img" aria-label="Browse Menu">🍽️</span>
            <span className="text-xs text-gray-500 mt-0.5 font-semibold">Browse Menu</span>
          </div>
          <span className="text-gray-300 text-sm font-bold" aria-hidden="true">•</span>
          <div className="flex flex-col items-center flex-1">
            <span className="text-base md:text-lg" role="img" aria-label="Add Items">🛒</span>
            <span className="text-xs text-gray-500 mt-0.5 font-semibold">Add Items</span>
          </div>
          <span className="text-gray-300 text-sm font-bold" aria-hidden="true">•</span>
          <div className="flex flex-col items-center flex-1">
            <span className="text-base md:text-lg" role="img" aria-label="Pick Up or Deliver">✅</span>
            <span className="text-xs text-gray-500 mt-0.5 font-semibold">Pick Up or Deliver</span>
          </div>
        </div>
      </section>

      <section className={`mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 md:px-10 md:py-16 ${showFeatured ? 'md:grid-cols-[1.4fr_1fr]' : 'md:grid-cols-1 max-w-md'}`}>
        {showFeatured && (
          <article className="hau-hau-card overflow-hidden">
            <div className="grid gap-5 p-6 sm:grid-cols-[150px_1fr] sm:items-center">
              <img src="/images/crispy_chicken_burger.png" alt="Study Session Burger" className="h-44 w-full rounded-2xl bg-[#f5f4ec] object-cover sm:h-32" />
              <div>
                <span className="inline-block bg-amber-100 text-amber-700 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider">Student favorite</span>
                <h2 className="mt-2 font-serif text-3xl font-bold text-foreground">The Study Session Burger</h2>
                <p className="mt-2 text-sm text-muted-foreground">Crisp, comforting, and ready before your next class.</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-semibold text-foreground">₹180 · 15 min</span>
                  <Link href="/menu" className="inline-flex items-center justify-center rounded-full bg-amber-500 hover:bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors duration-200">
                    Add to Cart
                  </Link>
                </div>
              </div>
            </div>
          </article>
        )}

        <article className="rounded-[24px] bg-[#f0eee6] p-6 shadow-[0_4px_20px_rgba(62,39,35,.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#534434]">Your rewards</p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-foreground">
                  {mounted ? points : 0} / 100 pts
                </h2>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-full bg-[#ffddb8] text-primary">
                <Sparkles size={22} />
              </div>
            </div>
            <div className="mt-4 w-full h-2 bg-amber-100/60 rounded-full overflow-hidden border border-amber-200/20">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(((mounted ? points : 0) / 100) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-semibold text-amber-800 flex items-center gap-1">
              Collect 100 pts → Free Campus Coffee ☕
            </p>
          </div>
          <div className="mt-4 pt-2">
            <p className="text-sm leading-6 text-muted-foreground">Earn a free campus coffee with every study break.</p>
            <Link href="/referrals" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary">
              View rewards <ArrowRight size={16} />
            </Link>
          </div>
        </article>
      </section>

      {/* Combos — conditional */}
      {showCombos && (
        <section id="combos" className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 md:px-10 scroll-mt-6">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Made for campus days</p>
              <h2 className="mt-1 font-serif text-3xl font-bold text-foreground">Today's combos</h2>
            </div>
            <Link href="/menu" className="text-sm font-bold text-primary">View all</Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {COMBOS.map((combo) => (
              <article key={combo.name} className="hau-hau-card group overflow-hidden flex p-4 gap-4 items-center bg-white border border-[#B89C48]/15 rounded-2xl shadow-sm">
                <img src={COMBO_IMAGES[combo.name as keyof typeof COMBO_IMAGES]} alt={combo.name} className="h-20 w-20 rounded-xl bg-[#f5f4ec] object-cover shrink-0" />
                <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-serif text-lg font-bold text-foreground truncate">{combo.name}</h3>
                      <span className="whitespace-nowrap font-bold text-primary text-sm">{combo.price}</span>
                    </div>
                    <p className="mt-1 text-xs leading-4 text-muted-foreground line-clamp-2">{combo.detail}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#006c49]">
                      <Clock3 size={12} /> {combo.tag}
                    </span>
                    <Link href="/menu" className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors" aria-label={`Add ${combo.name}`}>
                      <span className="text-sm font-bold">+</span> Add
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Social stats strip — conditional */}
      {showStats && (
        <section className="mx-4 mb-8 rounded-[24px] bg-amber-50 border border-amber-100 px-6 py-8 text-center sm:mx-6 md:mx-auto md:max-w-7xl flex flex-col items-center justify-center gap-3">
          <span className="text-4xl" role="img" aria-label="Gift">🎁</span>
          <h2 className="font-serif text-2xl font-bold text-gray-900">Share the Ilara vibe.</h2>
          <p className="text-sm font-semibold text-amber-700 leading-snug">Earn 50 pts when a friend signs up with your code.</p>
          <p className="text-xs text-gray-500 max-w-sm">Friends get a warm welcome; you get closer to your next free snack.</p>
          <Link href="/referrals" className="mt-2 inline-flex items-center justify-center rounded-full bg-amber-500 hover:bg-amber-600 px-6 py-2.5 text-sm font-bold text-white transition-colors duration-200">
            Invite friends
          </Link>
        </section>
      )}
    </main>
  );
}
