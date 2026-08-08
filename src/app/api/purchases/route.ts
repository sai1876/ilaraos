import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole } from '@/server/auth/requireRole';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ['admin', 'owner', 'manager']);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

    const body = await req.json();
    const { 
      outlet = 'main',
      vendor_id, 
      items = [], 
      total_amount_paise,
      notes,
      document_ids = []
    } = body;

    if (!vendor_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'vendor_id and items are required' }, { status: 400 });
    }

    const purchaseId = `po_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();

    const purchaseData = {
      purchase_id: purchaseId,
      outlet,
      vendor_id,
      items,
      total_amount_paise,
      notes,
      status: 'pending_approval', // Route through canonical approvals
      created_by: actor.uid,
      created_by_role: actor.role,
      created_at: now,
      updated_at: now,
    };

    await adminDb.runTransaction(async (t) => {
      const purchaseRef = adminDb!.collection('purchases').doc(purchaseId);
      
      // Validate documents if any
      const validDocRefs = [];
      for (const docId of document_ids) {
        const docRef = adminDb!.collection('documents').doc(docId);
        const docSnap = await t.get(docRef);
        if (!docSnap.exists) throw new Error(`INVALID_EVIDENCE_REFERENCE: ${docId} not found`);
        
        const docData = docSnap.data()!;
        if (docData.attachment_state !== 'pending_entity') throw new Error(`INVALID_EVIDENCE_REFERENCE: ${docId} not pending`);
        if (docData.related_entity_id !== purchaseId) throw new Error(`INVALID_EVIDENCE_REFERENCE: relation mismatch`);
        
        validDocRefs.push(docRef);
      }

      t.set(purchaseRef, purchaseData);

      for (const docRef of validDocRefs) {
        t.update(docRef, {
          attachment_state: 'attached',
          vault_visible: true,
          pending_owner_uid: null,
          pending_expires_at: null,
        });
      }
    });

    return NextResponse.json({ success: true, purchase_id: purchaseId }, { status: 201 });
  } catch (error: any) {
    console.error('[PURCHASES POST]', error);
    if (error.message.startsWith('INVALID_EVIDENCE_REFERENCE')) {
      return NextResponse.json({ error: error.message, code: 'INVALID_EVIDENCE_REFERENCE' }, { status: 422 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const actor = await requireRole(req, ['admin', 'owner', 'manager']);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

    const snap = await adminDb.collection('purchases').orderBy('created_at', 'desc').limit(50).get();
    const purchases = snap.docs.map(d => d.data());
    
    return NextResponse.json({ success: true, purchases });
  } catch (error) {
    console.error('[PURCHASES GET]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
