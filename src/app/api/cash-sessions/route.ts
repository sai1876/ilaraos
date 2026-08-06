import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/server/auth/requireRole";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = await requireRole(req, ["manager", "admin", "owner"]);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });

    const snap = await adminDb.collection("cash_register_sessions")
      .orderBy("opened_at", "desc").limit(50).get();
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    console.error("[CASH SESSIONS GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ["manager", "admin", "owner"]);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });

    const body = await req.json();
    const { outlet, shift, opening_cash, staff_id } = body;
    if (!outlet || opening_cash === undefined) {
      return NextResponse.json({ success: false, error: "outlet and opening_cash are required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const ref = await adminDb.collection("cash_register_sessions").add({
      outlet,
      shift: shift || "morning",
      opening_cash: Number(opening_cash),
      closing_cash: null,
      staff_id: staff_id || actor.uid,
      opened_at: now,
      created_at: Date.now(),
    });

    return NextResponse.json({ success: true, id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("[CASH SESSIONS POST]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
