// [INTERNAL] - Store settings and UI config route
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const OPERATIONAL_ROLES = new Set(['manager', 'admin', 'owner']);

const uiConfigSchema = z.object({
  active_theme: z.string().trim().min(1).max(80),
  hero_headline: z.string().trim().max(256),
  hero_sub: z.string().trim().max(500),
  banner_active: z.boolean(),
  banner_text: z.string().trim().max(500),
  banner_color: z.string().trim().max(80),
  pickup_time_mins: z.number().finite().min(1).max(240),
  delivery_time_mins: z.number().finite().min(1).max(240),
  is_open: z.boolean(),
  delivery_available: z.boolean(),
  featured_items: z.array(z.string().trim().min(1).max(128)),
  social_stats: z.array(z.object({
    value: z.string().trim().max(80),
    label: z.string().trim().max(128)
  })).optional(),
  social_stats_active: z.boolean().optional(),
  // Atmosphere 2.0 fields
  force_manual_override: z.boolean().optional(),
  primary_accent_color: z.string().trim().max(20).optional(),
  bg_color: z.string().trim().max(20).optional(),
  headline_color: z.string().trim().max(20).optional(),
  subtitle_color: z.string().trim().max(20).optional(),
  btn_bg_color: z.string().trim().max(20).optional(),
  btn_text_color: z.string().trim().max(20).optional(),
  banner_bg_color: z.string().trim().max(20).optional(),
  banner_text_color: z.string().trim().max(20).optional(),
  font_family: z.string().trim().max(60).optional(),
  headline_font_size: z.number().finite().min(12).max(120).optional(),
  subtitle_font_size: z.number().finite().min(10).max(48).optional(),
  font_weight: z.string().trim().max(10).optional(),
  text_align: z.enum(['left', 'center', 'right']).optional(),
  hero_bg_type: z.enum(['VIDEO', 'IMAGE', 'COLOR', 'GRADIENT']).optional(),
  hero_bg_value: z.string().trim().max(2048).optional(),
  hero_overlay_opacity: z.number().finite().min(0).max(100).optional(),
  cta1_label: z.string().trim().max(80).optional(),
  cta1_url: z.string().trim().max(512).optional(),
  cta2_label: z.string().trim().max(80).optional(),
  cta2_url: z.string().trim().max(512).optional(),
  show_featured_items: z.boolean().optional(),
  show_combos: z.boolean().optional(),
  show_store_stats: z.boolean().optional(),
  popup_enabled: z.boolean().optional(),
  popup_title: z.string().trim().max(200).optional(),
  popup_body: z.string().trim().max(1000).optional(),
  popup_frequency: z.enum(['every_visit', 'once_per_session', 'once_per_day']).optional(),
  popup_start_date: z.string().trim().max(40).optional(),
  popup_end_date: z.string().trim().max(40).optional(),
  popup_cta_label: z.string().trim().max(80).optional(),
  popup_cta_link: z.string().trim().max(512).optional(),
  popup_promo_code: z.string().trim().max(50).optional(),
});

const sliderItemSchema = z.object({
  id: z.string().trim().min(1).max(128),
  menuItemId: z.string().trim().min(1).max(128),
  tag: z.string().trim().max(128).optional().default(''),
  line1: z.string().trim().max(128).optional().default(''),
  line2: z.string().trim().max(128).optional().default(''),
  desc: z.string().trim().max(1000).optional().default(''),
  emoji: z.string().trim().max(20).optional(),
  price: z.number().finite().default(0),
  time: z.number().finite().default(0),
  bgColor: z.string().trim().max(256).optional().default(''),
  image_url: z.string().trim().max(2048),
  imageScale: z.number().finite().optional(),
  blendMode: z.enum(['normal', 'screen', 'multiply']).optional().default('normal'),
  ingredients: z.array(z.string().trim()).default([]),
  accentColor: z.string().trim().max(20).optional().default(''),
  sort_order: z.number().finite().default(0)
});

const configActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save_config'),
    config: uiConfigSchema.partial()
  }),
  z.object({
    action: z.literal('save_event'),
    event_id: z.string().trim().min(1).max(128),
    event_data: z.any()
  }),
  z.object({
    action: z.literal('delete_event'),
    event_id: z.string().trim().min(1).max(128)
  }),
  z.object({
    action: z.literal('save_slider'),
    slider_id: z.string().trim().min(1).max(128),
    slider_data: sliderItemSchema
  }),
  z.object({
    action: z.literal('delete_slider'),
    slider_id: z.string().trim().min(1).max(128)
  })
]);

export async function POST(req: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    const actor = await requireSessionActor(['staff']);
    if (!OPERATIONAL_ROLES.has(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = configActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid config request: ' + parsed.error.message }, { status: 400 });
    }

    const { action } = parsed.data;

    if (action === 'save_config') {
      const { config } = parsed.data;
      await adminDb.collection('config').doc('store_settings').set({
        ...config,
        updated_at: Date.now(),
        updated_by: actor.uid
      }, { merge: true });

      await logBusinessEvent({
        event_type: 'ui_config_saved',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'config',
        target_id: 'store_settings',
        severity: 'info',
        source: 'api',
        metadata: { updated_keys: Object.keys(config) }
      });
    } else if (action === 'save_event') {
      const { event_id, event_data } = parsed.data;
      await adminDb.collection('calendar_events').doc(event_id).set({
        ...event_data,
        updated_at: Date.now(),
        updated_by: actor.uid
      }, { merge: true });

      await logBusinessEvent({
        event_type: 'calendar_event_saved',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'config',
        target_id: event_id,
        severity: 'info',
        source: 'api',
        metadata: { event_id }
      });
    } else if (action === 'delete_event') {
      const { event_id } = parsed.data;
      await adminDb.collection('calendar_events').doc(event_id).delete();

      await logBusinessEvent({
        event_type: 'calendar_event_deleted',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'config',
        target_id: event_id,
        severity: 'warning',
        source: 'api',
        metadata: { event_id }
      });
    } else if (action === 'save_slider') {
      const { slider_id, slider_data } = parsed.data;
      await adminDb.collection('slider_items').doc(slider_id).set({
        ...slider_data,
        updated_at: Date.now(),
        updated_by: actor.uid
      }, { merge: true });

      await logBusinessEvent({
        event_type: 'slider_item_saved',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'config',
        target_id: slider_id,
        severity: 'info',
        source: 'api',
        metadata: { slider_id, title: slider_data.line1 }
      });
    } else if (action === 'delete_slider') {
      const { slider_id } = parsed.data;
      await adminDb.collection('slider_items').doc(slider_id).delete();

      await logBusinessEvent({
        event_type: 'slider_item_deleted',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'config',
        target_id: slider_id,
        severity: 'warning',
        source: 'api',
        metadata: { slider_id }
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
