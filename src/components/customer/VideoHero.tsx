'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock3, MapPin, ShoppingBag } from 'lucide-react';
import type { UIConfig } from '@/lib/types';

const POSTER = '/media/hau-hau-food-hero.png';

interface VideoHeroProps {
  config?: Partial<UIConfig>;
}

export default function VideoHero({ config }: VideoHeroProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Resolve config values with sensible defaults
  const bgType = config?.hero_bg_type ?? 'VIDEO';
  const bgValue = config?.hero_bg_value ?? '';
  const overlayOpacity = (config?.hero_overlay_opacity ?? 60) / 100;
  const headline = config?.hero_headline ?? 'Good food. Calm campus break.';
  const subtitle = config?.hero_sub ?? 'A warm place to study, recharge, and pick up the food you actually want between classes.';
  const cta1Label = config?.cta1_label ?? 'Order now';
  const cta1Url = config?.cta1_url ?? '/menu';
  const cta2Label = config?.cta2_label ?? 'See combos';
  const cta2Url = config?.cta2_url ?? '#combos';
  const bgColor = config?.bg_color ?? '#342015';
  const headlineColor = config?.headline_color ?? '#ffffff';
  const subtitleColor = config?.subtitle_color ?? '#f3f1e9';
  const btnBg = config?.btn_bg_color ?? '#f59e0b';
  const btnText = config?.btn_text_color ?? '#613b00';
  const fontFamily = config?.font_family ?? 'inherit';
  const headlineSize = config?.headline_font_size ? `${config.headline_font_size}px` : undefined;
  const subtitleSize = config?.subtitle_font_size ? `${config.subtitle_font_size}px` : undefined;
  const fontWeight = config?.font_weight ?? '700';
  const textAlign = config?.text_align ?? 'left';

  const showVideo = bgType === 'VIDEO' && !reduceMotion;
  const showImageBg = bgType === 'IMAGE' && bgValue;

  const sectionStyle: React.CSSProperties = {
    backgroundColor: bgType === 'COLOR' ? bgValue || bgColor : bgColor,
    background: bgType === 'GRADIENT' ? bgValue : undefined,
    fontFamily: fontFamily !== 'inherit' ? `'${fontFamily}', sans-serif` : undefined,
  };

  return (
    <section
      className="relative isolate min-h-[620px] overflow-hidden text-white md:min-h-[680px]"
      style={sectionStyle}
    >
      {/* Preload poster */}
      <link rel="preload" href={POSTER} as="image" fetchPriority="high" />

      {/* Video background */}
      {showVideo && (
        <video
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={POSTER}
          aria-hidden="true"
        >
          <source src="/media/hau-hau-food-hero.webm" type="video/webm" />
          <source src="/media/hau-hau-food-hero.mp4" type="video/mp4" />
        </video>
      )}

      {/* Image background (reduced motion or IMAGE type) */}
      {(bgType === 'VIDEO' || showImageBg) && (
        <div className="absolute inset-0 -z-20 w-full h-full overflow-hidden">
          <img
            src={showImageBg ? bgValue : POSTER}
            alt="Hero Background"
            className="h-full w-full object-cover object-center"
            style={{ opacity: (bgType === 'VIDEO' && reduceMotion) ? 1 : (showImageBg ? 1 : 0) }}
          />
        </div>
      )}

      {/* Overlay gradient */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: `linear-gradient(90deg, rgba(${hexToRgb(bgColor)},${overlayOpacity}) 0%, rgba(${hexToRgb(bgColor)},${Math.max(0, overlayOpacity - 0.25)}) 42%, rgba(${hexToRgb(bgColor)},${Math.max(0, overlayOpacity - 0.55)}) 100%)`
        }}
      />

      {/* Content */}
      <div
        className="relative z-10 mx-auto flex min-h-[620px] max-w-7xl flex-col justify-center px-4 py-24 pb-28 sm:px-6 md:min-h-[680px] md:px-10 md:pb-24"
        style={{ textAlign }}
      >
        <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#30c88f] animate-pulse" />
          Main Campus is open · Closes at 1 AM
        </span>

        <h1
          className="max-w-2xl font-serif font-bold leading-[.95] tracking-tight"
          style={{
            color: headlineColor,
            fontSize: headlineSize ?? 'clamp(2.5rem, 8vw, 4.5rem)',
            fontWeight,
            textShadow: '0 2px 16px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.8)',
          }}
        >
          {headline.includes('\n')
            ? headline.split('\n').map((line, i) => (
                <span key={i}>{line}{i < headline.split('\n').length - 1 && <br />}</span>
              ))
            : headline}
        </h1>

        <p
          className="mt-6 max-w-xl leading-7"
          style={{ 
            color: subtitleColor, 
            fontSize: subtitleSize ?? '1rem',
            textShadow: '0 1px 8px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          {subtitle}
        </p>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-1.5 w-full sm:w-auto">
            <Link
              href={cta1Url}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold shadow-[0_8px_30px_rgba(62,39,35,.28)] transition hover:-translate-y-0.5"
              style={{ backgroundColor: btnBg, color: btnText }}
            >
              <ShoppingBag size={17} /> {cta1Label}
            </Link>
            <span className="text-white/70 text-xs font-medium">🕐 Ready in ~8 minutes</span>
            <span className="inline-flex items-center gap-1.5 text-white/60 text-[11px] font-medium md:hidden">
              <MapPin size={11} className="shrink-0" /> Pickup · Dine-in · Delivery available
            </span>
          </div>

          <Link
            href={cta2Url}
            className="inline-flex items-center justify-center rounded-full border border-white/50 bg-white/10 px-7 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20 h-[52px]"
          >
            {cta2Label}
          </Link>
        </div>

        <div className="mt-8 inline-flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-white/10 bg-black/40 px-5 py-3 text-xs font-medium text-[#f3f1e9] backdrop-blur-sm sm:text-sm w-fit">
          <span className="inline-flex items-center gap-2"><Clock3 size={16} /> Open till 1 AM</span>
          <span className="text-white/20 hidden sm:inline">|</span>
          <span className="inline-flex items-center gap-2"><MapPin size={16} /> Student-friendly prices</span>
          <span className="text-white/20 hidden sm:inline">|</span>
          <span className="inline-flex items-center gap-2"><ShoppingBag size={16} /> Pickup · Dine-in · Delivery</span>
        </div>
      </div>
    </section>
  );
}

/** Convert hex color to R,G,B string for rgba() */
function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `${r},${g},${b}`;
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `${r},${g},${b}`;
  }
  return '42,23,0'; // fallback
}
