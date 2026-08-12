// [INTERNAL]
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { WhatsAppConversation, WhatsAppMessage } from '@/server/whatsapp/inbox/inboxTypes';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 1. Conversations
    // Only fetch conversations missing outlet_id or created_at_ms
    // To do this simply, we fetch a batch of raw docs and update them.
    // However, since we can't easily query "field exists" directly without specific indices, 
    // and we need to process everything, we will query a limited batch of everything.
    
    // Instead of risking endless loops, we use a basic cursor strategy.
    // If we want a simple migration: we can just run through conversations up to limit
    // checking if they need migration.
    
    const limit = 200;
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'messages';
    
    let scanned = 0;
    let updated = 0;
    let skipped = 0;

    if (mode === 'conversations') {
      const snap = await adminDb!.collection('whatsapp_conversations').limit(limit).get();
      const batch = adminDb!.batch();

      for (const doc of snap.docs) {
        scanned++;
        const data = doc.data() as Partial<WhatsAppConversation>;
        let needsUpdate = false;
        const updates: any = {};

        if (!data.outlet_id) {
          updates.outlet_id = 'main';
          needsUpdate = true;
        }

        if (data.created_at_ms === undefined) {
          // It's possible `created_at` doesn't exist on older conversation_state.
          if (data.created_at) {
            updates.created_at_ms = typeof data.created_at === 'number' ? data.created_at : (data.created_at as any)._seconds * 1000;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          batch.update(doc.ref, updates);
          updated++;
        } else {
          skipped++;
        }
      }

      if (updated > 0) await batch.commit();
      
      return NextResponse.json({
        type: 'conversations',
        scanned,
        updated,
        skipped,
        hasMore: snap.docs.length === limit // Note: this isn't a true cursor, just an indicator of collection size if querying indiscriminately
      });
    }

    if (mode === 'messages') {
      // For messages, we can order by created_at DESC and use a cursor if provided,
      // or we can just fetch where created_at_ms is not present... Wait, we can't query "not present" easily.
      // So we'll just scan. We can order by message_id.
      let query = adminDb!.collection('whatsapp_messages').orderBy('__name__').limit(limit);
      const cursor = searchParams.get('cursor');
      if (cursor) {
        const cursorDoc = await adminDb!.collection('whatsapp_messages').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snap = await query.get();
      const batch = adminDb!.batch();

      for (const doc of snap.docs) {
        scanned++;
        const data = doc.data() as Partial<WhatsAppMessage>;
        let needsUpdate = false;
        const updates: any = {};

        if (!data.outlet_id) {
          updates.outlet_id = 'main';
          needsUpdate = true;
        }

        if (data.created_at_ms === undefined) {
          if (data.created_at) {
            updates.created_at_ms = typeof data.created_at === 'number' ? data.created_at : (data.created_at as any)._seconds * 1000;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          batch.update(doc.ref, updates);
          updated++;
        } else {
          skipped++;
        }
      }

      if (updated > 0) await batch.commit();

      const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null;

      return NextResponse.json({
        type: 'messages',
        scanned,
        updated,
        skipped,
        nextCursor: lastDoc,
        hasMore: snap.docs.length === limit
      });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  } catch (error: any) {
    console.error('Backfill error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
