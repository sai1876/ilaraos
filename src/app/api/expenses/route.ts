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
      .orderBy("timestamp", "desc").limit(100).get();
    const expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    const { outlet, category, amount, description, payment_method, staff_id } = body;
    if (!category || amount === undefined || !description) {
      return NextResponse.json({ success: false, error: "category, amount, and description are required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const ref = await adminDb.collection("expenses").add({
      outlet: outlet || "",
      category,
      amount: Number(amount),
      description,
      payment_method: payment_method || "cash",
      staff_id: staff_id || actor.uid,
      timestamp: now,
      created_at: Date.now(),
    });

    return NextResponse.json({ success: true, id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("[EXPENSES POST]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
