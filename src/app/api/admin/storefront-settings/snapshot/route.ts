// [INTERNAL] Storefront settings snapshots API
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';

const OPERATIONAL_ROLES = new Set(['manager', 'admin', 'owner']);

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
    if (!body || !body.label || !body.config) {
      return NextResponse.json({ error: 'Missing label or config' }, { status: 400 });
    }

    // Save to storefront_snapshots collection
    const docRef = adminDb.collection('storefront_snapshots').doc();
    const snapshot = {
      id: docRef.id,
      label: body.label.trim(),
      config: body.config,
      timestamp: Date.now(),
      created_by: actor.uid,
    };

    await docRef.set(snapshot);

    return NextResponse.json({ success: true, snapshot });
  } catch (err: any) {
    console.error('[storefront-settings/snapshot] POST failed:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
