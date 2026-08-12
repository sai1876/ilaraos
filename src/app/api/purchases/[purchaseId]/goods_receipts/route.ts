import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActorApi } from '@/server/auth/requireSessionActor';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { purchaseId: string } }) {
  try {
    const actor = await requireSessionActorApi(['admin', 'owner', 'manager']);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

    const body = await req.json();
    const { items_received = [], notes, document_ids = [] } = body;
    const { purchaseId } = params;

    if (!Array.isArray(items_received) || items_received.length === 0) {
      return NextResponse.json({ error: 'items_received required' }, { status: 400 });
    }

    if (!document_ids || document_ids.length === 0) {
      return NextResponse.json(
        { error: 'Evidence required for goods receipt', code: 'REQUIRED_EVIDENCE_MISSING' },
        { status: 422 }
      );
    }

    const grnId = `grn_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();

    const grnData = {
      grn_id: grnId,
      purchase_id: purchaseId,
      items_received,
      notes,
      created_by: actor.uid,
      created_by_role: actor.role,
      created_at: now,
    };

    await adminDb.runTransaction(async (t) => {
      const purchaseRef = adminDb!.collection('purchases').doc(purchaseId);
      const pSnap = await t.get(purchaseRef);
      if (!pSnap.exists) throw new Error('Purchase order not found');
      if (pSnap.data()?.tenantId !== actor.tenantId) throw new Error('Purchase order not found'); // Enforce tenant isolation

      const grnRef = adminDb!.collection('goods_receipts').doc(grnId);
      
      const validDocRefs = [];
      let foundEvidence = false;

      for (const docId of document_ids) {
        const docRef = adminDb!.collection('documents').doc(docId);
        const docSnap = await t.get(docRef);
        if (!docSnap.exists) throw new Error(`INVALID_EVIDENCE_REFERENCE: ${docId} not found`);
        
        const docData = docSnap.data()!;
        if (docData.tenantId !== actor.tenantId) throw new Error(`INVALID_EVIDENCE_REFERENCE: Tenant mismatch`);
        if (docData.attachment_state !== 'pending_entity') throw new Error(`INVALID_EVIDENCE_REFERENCE: ${docId} not pending`);
        if (docData.related_entity_id !== grnId) throw new Error(`INVALID_EVIDENCE_REFERENCE: relation mismatch`);
        
        if (docData.document_type === 'delivery_challan' || docData.document_type === 'goods_received_photo') {
          foundEvidence = true;
        }

        validDocRefs.push(docRef);
      }

      if (!foundEvidence) throw new Error('REQUIRED_EVIDENCE_MISSING');

      t.set(grnRef, grnData);

      // Update purchase status if it was pending_receipt
      const pData = pSnap.data()!;
      if (pData.status === 'approved' || pData.status === 'pending_receipt') {
         t.update(purchaseRef, { status: 'partially_received', updated_at: now });
      }

      for (const docRef of validDocRefs) {
        t.update(docRef, {
          attachment_state: 'attached',
          vault_visible: true,
          pending_owner_uid: null,
          pending_expires_at: null,
        });
      }
    });

    return NextResponse.json({ success: true, grn_id: grnId }, { status: 201 });
  } catch (error: any) {
    console.error('[GRN POST]', error);
    if (error.message.startsWith('INVALID_EVIDENCE_REFERENCE') || error.message === 'REQUIRED_EVIDENCE_MISSING') {
      return NextResponse.json({ error: 'Invalid evidence reference or missing required evidence', code: error.message.split(':')[0] }, { status: 422 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
