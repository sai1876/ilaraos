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
    const { amount_paise, payment_method, reference_id, document_ids = [] } = body;
    const { purchaseId } = params;

    if (!amount_paise || !payment_method) {
      return NextResponse.json({ error: 'amount_paise and payment_method required' }, { status: 400 });
    }

    if (!document_ids || document_ids.length === 0) {
      return NextResponse.json(
        { error: 'Evidence required for supplier payment', code: 'REQUIRED_EVIDENCE_MISSING' },
        { status: 422 }
      );
    }

    const paymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();

    const paymentData = {
      payment_id: paymentId,
      purchase_id: purchaseId,
      amount_paise,
      payment_method,
      reference_id,
      created_by: actor.uid,
      created_by_role: actor.role,
      created_at: now,
    };

    await adminDb.runTransaction(async (t) => {
      const purchaseRef = adminDb!.collection('purchases').doc(purchaseId);
      const pSnap = await t.get(purchaseRef);
      if (!pSnap.exists) throw new Error('Purchase order not found');
      if (pSnap.data()?.tenantId !== actor.tenantId) throw new Error('Purchase order not found'); // Enforce tenant isolation

      const payRef = adminDb!.collection('supplier_payments').doc(paymentId);
      
      const validDocRefs = [];
      let foundEvidence = false;

      for (const docId of document_ids) {
        const docRef = adminDb!.collection('documents').doc(docId);
        const docSnap = await t.get(docRef);
        if (!docSnap.exists) throw new Error(`INVALID_EVIDENCE_REFERENCE: ${docId} not found`);
        
        const docData = docSnap.data()!;
        if (docData.tenantId !== actor.tenantId) throw new Error(`INVALID_EVIDENCE_REFERENCE: Tenant mismatch`);
        if (docData.attachment_state !== 'pending_entity') throw new Error(`INVALID_EVIDENCE_REFERENCE: ${docId} not pending`);
        if (docData.related_entity_id !== paymentId) throw new Error(`INVALID_EVIDENCE_REFERENCE: relation mismatch`);
        
        if (docData.document_type === 'payment_proof') {
          foundEvidence = true;
        }

        validDocRefs.push(docRef);
      }

      if (!foundEvidence) throw new Error('REQUIRED_EVIDENCE_MISSING');

      t.set(payRef, paymentData);

      // Update purchase status
      t.update(purchaseRef, { status: 'completed', updated_at: now });

      for (const docRef of validDocRefs) {
        t.update(docRef, {
          attachment_state: 'attached',
          vault_visible: true,
          pending_owner_uid: null,
          pending_expires_at: null,
        });
      }
    });

    return NextResponse.json({ success: true, payment_id: paymentId }, { status: 201 });
  } catch (error: any) {
    console.error('[PAYMENT POST]', error);
    if (error.message.startsWith('INVALID_EVIDENCE_REFERENCE') || error.message === 'REQUIRED_EVIDENCE_MISSING') {
      return NextResponse.json({ error: 'Invalid evidence reference or missing required evidence', code: error.message.split(':')[0] }, { status: 422 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
