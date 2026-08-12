import { NextRequest, NextResponse } from 'next/server'; // [INTERNAL]
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { EVIDENCE_COL } from '@/server/evidence/evidenceService';
import { EvidenceRecord } from '@/server/evidence/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager', 'staff']);
    const { searchParams } = new URL(request.url);

    // Build the query
    let query: FirebaseFirestore.Query = adminDb!.collection(EVIDENCE_COL);

    // Filter by outlet unless owner/admin
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      query = query.where('outlet_id', '==', actor.outletId);
    } else {
      const outletId = searchParams.get('outletId');
      if (outletId) {
        query = query.where('outlet_id', '==', outletId);
      }
    }

    // Exact search by evidence number
    const evidenceNo = searchParams.get('evidenceNo');
    if (evidenceNo) {
      query = query.where('evidence_no', '==', evidenceNo.trim());
    }

    // Related Entity search
    const relatedEntityKey = searchParams.get('relatedEntityKey');
    if (relatedEntityKey) {
      query = query.where('related_entity_keys', 'array-contains', relatedEntityKey);
    }

    // Category
    const category = searchParams.get('category');
    if (category) {
      query = query.where('category', '==', category);
    }

    // Importance
    const importance = searchParams.get('importance');
    if (importance) {
      query = query.where('importance', '==', importance);
    }

    // Storage State
    const storageState = searchParams.get('storageState');
    if (storageState) {
      query = query.where('storage_state', '==', storageState);
    }

    // Always sort by created_at DESC (unless searching exact evidenceNo which yields 0/1)
    if (!evidenceNo) {
      query = query.orderBy('created_at', 'desc');
    }

    // Pagination
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    query = query.limit(Math.min(limit, 50));

    const cursorId = searchParams.get('cursor');
    if (cursorId) {
      const cursorDoc = await adminDb!.collection(EVIDENCE_COL).doc(cursorId).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    // Map to safe DTO
    const items = snapshot.docs.map(doc => {
      const data = doc.data() as EvidenceRecord;
      // Remove overly private backend properties that aren't for the list view
      const {
        expected_drive_file_id,
        archive_lease_owner,
        archive_lease_expires_at,
        supabase_bucket,
        supabase_path,
        drive_file_id,
        drive_folder_id,
        related_entity_keys,
        ...safeDto
      } = data;
      
      return safeDto;
    });

    const nextCursor = snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null;

    return NextResponse.json({
      items,
      nextCursor,
      hasMore: !!nextCursor
    });

  } catch (error: any) {
    console.error('Evidence list error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
