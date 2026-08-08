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

    if (!category || (amount === undefined && amount_paise === undefined) || !description) {
      return NextResponse.json({ success: false, error: "category, amount, and description are required" }, { status: 400 });
    }

    const finalAmountPaise = typeof amount_paise === 'number' ? amount_paise : Math.round(Number(amount) * 100);

    // Evidence validation for final submit/verify
    if (status !== 'draft') {
      const hasProof = Array.isArray(document_ids) && document_ids.length > 0;
      const hasException = typeof no_receipt_reason === 'string' && no_receipt_reason.trim().length >= 10;

      if (!hasProof && !hasException) {
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
    }

    const now = Date.now();
    const expenseData: Record<string, any> = {
      outlet,
      category,
      amount: finalAmountPaise / 100,
      amount_paise: finalAmountPaise,
      description,
      payment_method,
      document_ids: Array.isArray(document_ids) ? document_ids : [],
      created_by: actor.uid,
      created_by_role: actor.role,
      status,
      created_at: now,
      updated_at: now,
    };

    if (no_receipt_reason) expenseData.no_receipt_reason = no_receipt_reason;
    if (invoice_number) expenseData.invoice_number = invoice_number;
    if (invoice_date) expenseData.invoice_date = invoice_date;
    if (vendor_id) expenseData.vendor_id = vendor_id;
    if (business_date) expenseData.business_date = business_date;

    const ref = await adminDb.collection("expenses").add(expenseData);

    return NextResponse.json({ success: true, id: ref.id, expense_id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("[EXPENSES POST]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
