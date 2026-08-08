import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/server/auth/requireRole";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = await requireRole(req, ["manager", "admin", "owner"]);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });

    const snap = await adminDb.collection("expenses")
      .orderBy("created_at", "desc").limit(100).get();
    const expenses = snap.docs.map(d => ({ id: d.id, expense_id: d.id, ...d.data() }));
    return NextResponse.json({ success: true, expenses });
  } catch (error) {
    console.error("[EXPENSES GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ["manager", "admin", "owner"]);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });

    const body = await req.json();
    const { 
      expense_id,
      outlet = "main", 
      category, 
      amount, 
      amount_paise, 
      description, 
      payment_method = "cash", 
      document_ids = [],
      status = "submitted",
      no_receipt_reason,
      invoice_number,
      invoice_date,
      vendor_id,
      business_date,
    } = body;

    if (!expense_id || typeof expense_id !== 'string' || expense_id.length < 10) {
      return NextResponse.json({ success: false, error: "expense_id is required and must be a valid stable ID" }, { status: 400 });
    }

    if (!category || (amount === undefined && amount_paise === undefined) || !description) {
      return NextResponse.json({ success: false, error: "category, amount, and description are required" }, { status: 400 });
    }

    const finalAmountPaise = typeof amount_paise === 'number' ? amount_paise : Math.round(Number(amount) * 100);

    const hasProof = Array.isArray(document_ids) && document_ids.length > 0;
    const hasException = typeof no_receipt_reason === 'string' && no_receipt_reason.trim().length >= 10;

    if (status !== 'draft' && !hasProof && !hasException) {
      return NextResponse.json(
        {
          success: false,
          error: "Receipt or invoice evidence is required to finalize expense.",
          code: "REQUIRED_EVIDENCE_MISSING",
          missing: ["expense_receipt", "expense_invoice"],
        },
        { status: 422 }
      );
    }

    let finalStatus = status;
    if (hasException && status === 'submitted') {
      finalStatus = 'submitted_exception';
    }

    const now = Date.now();
    const expenseData: Record<string, any> = {
      expense_id,
      outlet,
      category,
      amount: finalAmountPaise / 100,
      amount_paise: finalAmountPaise,
      description,
      payment_method,
      document_ids: Array.isArray(document_ids) ? document_ids : [],
      created_by: actor.uid,
      created_by_role: actor.role,
      status: finalStatus,
      created_at: now,
      updated_at: now,
    };

    if (no_receipt_reason) expenseData.no_receipt_reason = no_receipt_reason;
    if (invoice_number) expenseData.invoice_number = invoice_number;
    if (invoice_date) expenseData.invoice_date = invoice_date;
    if (vendor_id) expenseData.vendor_id = vendor_id;
    if (business_date) expenseData.business_date = business_date;

    const result = await adminDb.runTransaction(async (t) => {
      const expenseRef = adminDb!.collection("expenses").doc(expense_id);
      const expenseSnap = await t.get(expenseRef);

      if (expenseSnap.exists) {
        throw new Error("ENTITY_ID_ALREADY_EXISTS");
      }

      const validDocRefs = [];
      let receiptOrInvoiceFound = false;

      if (hasProof) {
        for (const docId of document_ids) {
          const docRef = adminDb!.collection("documents").doc(docId);
          const docSnap = await t.get(docRef);
          
          if (!docSnap.exists) {
            throw new Error(`INVALID_EVIDENCE_REFERENCE: Document ${docId} does not exist.`);
          }

          const docData = docSnap.data()!;
          if (docData.status !== "available" && docData.status !== "uploading") {
            throw new Error(`INVALID_EVIDENCE_REFERENCE: Document ${docId} is not available.`);
          }
          if (docData.attachment_state !== "pending_entity") {
            throw new Error(`INVALID_EVIDENCE_REFERENCE: Document ${docId} is already attached or not pending.`);
          }
          if (docData.pending_owner_uid !== actor.uid) {
            throw new Error(`INVALID_EVIDENCE_REFERENCE: Document ${docId} is not owned by the current user.`);
          }
          if (docData.related_entity_type !== "expenses" || docData.related_entity_id !== expense_id) {
            throw new Error(`INVALID_EVIDENCE_REFERENCE: Document ${docId} relation mismatch.`);
          }

          if (docData.document_type === "expense_receipt" || docData.document_type === "expense_invoice") {
            receiptOrInvoiceFound = true;
          }

          validDocRefs.push(docRef);
        }
      }

      if (status !== 'draft' && !hasException && !receiptOrInvoiceFound) {
        throw new Error("REQUIRED_EVIDENCE_MISSING");
      }

      t.set(expenseRef, expenseData);

      for (const docRef of validDocRefs) {
        t.update(docRef, {
          attachment_state: "attached",
          vault_visible: true,
          pending_owner_uid: null,
          pending_expires_at: null,
        });
      }

      return expense_id;
    });

    return NextResponse.json({ success: true, id: result, expense_id: result }, { status: 201 });
  } catch (error: any) {
    console.error("[EXPENSES POST]", error);
    if (error.message === "ENTITY_ID_ALREADY_EXISTS") {
      return NextResponse.json({ success: false, error: "Expense ID already exists", code: "ENTITY_ID_ALREADY_EXISTS" }, { status: 409 });
    }
    if (error.message.startsWith("INVALID_EVIDENCE_REFERENCE")) {
      return NextResponse.json({ success: false, error: "Invalid evidence reference", code: "INVALID_EVIDENCE_REFERENCE" }, { status: 422 });
    }
    if (error.message === "REQUIRED_EVIDENCE_MISSING") {
      return NextResponse.json({ success: false, error: "Receipt or invoice evidence is required to finalize expense.", code: "REQUIRED_EVIDENCE_MISSING", missing: ["expense_receipt", "expense_invoice"] }, { status: 422 });
    }
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
