// [INTERNAL]
import { adminDb } from '@/lib/firebaseAdmin';
import { EVIDENCE_COL } from '@/server/evidence/evidenceService';
import { NextResponse } from 'next/server';

// Safely backfills related_entity_keys for old records.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Only fetch records missing related_entity_keys
    // Note: Firestore doesn't have a native 'field exists' query except via orderBy without inequality.
    // We'll just fetch a batch of records that lack it (or we fetch all and check).
    const snapshot = await adminDb!.collection(EVIDENCE_COL).limit(500).get();
    
    const batch = adminDb!.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      scanned++;
      const data = doc.data();
      if (!data.related_entity_keys && data.related_entities) {
        const keys = data.related_entities.map((e: any) => `${(e.type || '').toUpperCase()}:${e.id}`);
        batch.update(doc.ref, { related_entity_keys: keys });
        updated++;
        batchCount++;
      } else {
        skipped++;
      }

      if (batchCount === 450) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    console.error('Backfill error:', error);
    failed++;
  }

  return NextResponse.json({ scanned, updated, skipped, failed });
}
