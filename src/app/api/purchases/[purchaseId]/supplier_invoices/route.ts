import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole } from '@/server/auth/requireRole';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { purchaseId: string } }) {
  try {
    const actor = await requireRole(req, ['admin', 'owner', 'manager']);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

    const body = await req.json();
    const { invoice_number, invoice_date, amount_paise, document_ids = [] } = body;
    const { purchaseId } = params;

    if (!invoice_number || !amount_paise) {
      return NextResponse.json({ error: 'invoice_number and amount_paise required' }, { status: 400 });
    }

    if (!document_ids || document_ids.length === 0) {
      return NextResponse.json(
        { error: 'Evidence required for supplier invoice', code: 'REQUIRED_EVIDENCE_MISSING' },
        { status: 422 }
      );
    }

    const invoiceId = `inv_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();

    const invoiceData = {
      invoice_id: invoiceId,
      purchase_id: purchaseId,
      invoice_number,
      invoice_date,
      amount_paise,
      created_by: actor.uid,
      created_by_role: actor.role,
      created_at: now,
    };

    await adminDb.runTransaction(async (t) => {
      const purchaseRef = adminDb!.collection('purchases').doc(purchaseId);
      const pSnap = await t.get(purchaseRef);
      if (!pSnap.exists) throw new Error('Purchase order not found');

      const invRef = adminDb!.collection('supplier_invoices').doc(invoiceId);
      
      const validDocRefs = [];
      let foundEvidence = false;

      for (const docId of document_ids) {
        const docRef = adminDb!.collection('documents').doc(docId);
        const docSnap = await t.get(docRef);
        if (!docSnap.exists) throw new Error(`INVALID_EVIDENCE_REFERENCE: ${docId} not found`);
        
        const docData = docSnap.data()!;
        if (docData.attachment_state !== 'pending_entity') throw new Error(`INVALID_EVIDENCE_REFERENCE: ${docId} not pending`);
        if (docData.related_entity_id !== invoiceId) throw new Error(`INVALID_EVIDENCE_REFERENCE: relation mismatch`);
        
        if (docData.document_type === 'supplier_invoice') {
          foundEvidence = true;
        }

        validDocRefs.push(docRef);
      }

      if (!foundEvidence) throw new Error('REQUIRED_EVIDENCE_MISSING');

      t.set(invRef, invoiceData);

      // Update purchase status
      const pData = pSnap.data()!;
      if (pData.status !== 'completed') {
         t.update(purchaseRef, { status: 'invoiced', updated_at: now });
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

    return NextResponse.json({ success: true, invoice_id: invoiceId }, { status: 201 });
  } catch (error: any) {
    console.error('[INVOICE POST]', error);
    if (error.message.startsWith('INVALID_EVIDENCE_REFERENCE') || error.message === 'REQUIRED_EVIDENCE_MISSING') {
      return NextResponse.json({ error: error.message, code: error.message.split(':')[0] }, { status: 422 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
