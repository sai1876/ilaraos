// [INTERNAL]
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Only Owner or Admin can mutate legacy records
    await requireSessionActor(['owner', 'admin']);

    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      // ignore
    }

    const dryRun = body.dryRun ?? true; // Default to true for safety
    const limit = Math.min(Math.max(parseInt(body.limit) || 50, 1), 100);
    const startAfter = body.cursor;

    const response = {
      scanned: 0,
      wouldRepairLastMessageAt: 0,
      wouldRepairOutletId: 0,
      repaired: 0,
      skipped: 0,
      unresolvedNoMessages: 0,
      nextCursor: null as string | null,
      hasMore: false
    };

    // Bounded document scan ordered by document ID
    let query = adminDb.collection('whatsapp_conversations').orderBy('__name__').limit(limit);
    if (startAfter) {
      query = query.startAfter(startAfter);
    }

    const snap = await query.get();
    if (snap.empty) {
      return NextResponse.json(response);
    }

    response.scanned = snap.size;
    response.nextCursor = snap.docs[snap.size - 1].id;
    response.hasMore = snap.size === limit;

    const batch = adminDb.batch();
    let batchHasWrites = false;

    for (const doc of snap.docs) {
      const data = doc.data();
      const phone = doc.id;

      let needsLastMessageAtRepair = false;
      let needsOutletIdRepair = false;

      if (data.last_message_at === undefined || data.last_message_at === null) {
        needsLastMessageAtRepair = true;
      }
      
      if (!data.outlet_id) {
        needsOutletIdRepair = true;
      }

      if (!needsLastMessageAtRepair && !needsOutletIdRepair) {
        response.skipped++;
        continue;
      }

      if (needsLastMessageAtRepair) response.wouldRepairLastMessageAt++;
      if (needsOutletIdRepair) response.wouldRepairOutletId++;

      let lastMessageAt: number | null = null;

      if (needsLastMessageAtRepair) {
        // Find latest canonical message
        const messagesSnap = await adminDb.collection('whatsapp_messages')
          .where('conversation_id', '==', phone)
          .orderBy('created_at_ms', 'desc')
          .limit(1)
          .get();

        if (messagesSnap.empty) {
          response.unresolvedNoMessages++;
        } else {
          lastMessageAt = messagesSnap.docs[0].data().created_at_ms;
        }
      }

      const updateData: any = {};
      if (needsOutletIdRepair) {
        updateData.outlet_id = 'main';
      }
      if (needsLastMessageAtRepair) {
        if (lastMessageAt !== null) {
          updateData.last_message_at = lastMessageAt;
        } else {
          updateData.migration_status = 'UNRESOLVED_NO_MESSAGE_HISTORY';
        }
      }

      if (Object.keys(updateData).length > 0) {
        if (!dryRun) {
          batch.update(doc.ref, updateData);
          batchHasWrites = true;
          response.repaired++;
        }
      } else {
        response.skipped++;
      }
    }

    if (!dryRun && batchHasWrites) {
      await batch.commit();
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[WHATSAPP MIGRATION] Failed:', error);
    if (error instanceof SessionAuthorizationError) {
      return NextResponse.json({ error: 'Internal Server Error' }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
