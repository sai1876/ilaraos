// [PUBLIC] Public storefront config endpoint — no auth required
// Returns the display settings for the customer homepage
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const revalidate = 0; // Always fresh

export async function GET() {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const snap = await adminDb.collection('config').doc('store_settings').get();

    if (!snap.exists) {
      // Return sensible defaults if not yet configured
      return NextResponse.json({
        hero_headline: 'Good food. Calm campus break.',
        hero_sub: 'A warm place to study, recharge, and pick up the food you actually want.',
        banner_active: false,
        banner_text: '',
        banner_color: 'golden',
        hero_bg_type: 'VIDEO',
        hero_bg_value: '',
        hero_overlay_opacity: 60,
        cta1_label: 'Order now',
        cta1_url: '/menu',
        cta2_label: 'See combos',
        cta2_url: '#combos',
        primary_accent_color: '#f59e0b',
        bg_color: '#342015',
        headline_color: '#ffffff',
        subtitle_color: '#f3f1e9',
        btn_bg_color: '#f59e0b',
        btn_text_color: '#613b00',
        font_family: 'Poppins',
        headline_font_size: 56,
        subtitle_font_size: 18,
        font_weight: '700',
        text_align: 'left',
        show_featured_items: true,
        show_combos: true,
        show_store_stats: true,
        popup_enabled: false,
      });
    }

    return NextResponse.json(snap.data());
  } catch (err) {
    console.error('[storefront-config] GET failed:', err);
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500 });
  }
}
