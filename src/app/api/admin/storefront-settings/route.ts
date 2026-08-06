// [INTERNAL] Storefront settings API
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';

const OPERATIONAL_ROLES = new Set(['manager', 'admin', 'owner']);

const defaultSettings = {
  active_theme: 'default',
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
  popup_cta_label: 'Claim Offer',
  popup_cta_link: '/menu',
  popup_promo_code: '',
};

export async function GET() {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const actor = await requireSessionActor(['staff']);
    if (!OPERATIONAL_ROLES.has(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const docRef = adminDb.collection('config').doc('store_settings');
    const snap = await docRef.get();

    if (!snap.exists) {
      await docRef.set(defaultSettings);
      return NextResponse.json({ id: 1, ...defaultSettings });
    }

    return NextResponse.json({ id: 1, ...snap.data() });
  } catch (err: any) {
    console.error('[storefront-settings] GET failed:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const actor = await requireSessionActor(['staff']);
    if (!OPERATIONAL_ROLES.has(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Missing body' }, { status: 400 });
    }

    // Clean payload of system metadata fields (like id, updated_at) to store pure config
    const { id, updated_at, ...cleanConfig } = body;

    const docRef = adminDb.collection('config').doc('store_settings');
    await docRef.set({
      ...cleanConfig,
      updated_at: Date.now(),
    }, { merge: true });

    return NextResponse.json({ success: true, config: cleanConfig });
  } catch (err: any) {
    console.error('[storefront-settings] POST failed:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
