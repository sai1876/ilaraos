import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/server/auth/requireRole";
import { ServerTiming } from "@/lib/performance/serverTiming";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const timing = new ServerTiming();
  try {
    const actor = await requireRole(req, ["manager", "admin", "owner"]);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });

    const t0 = Date.now();
    const snap = await adminDb.collection("cash_register_sessions")
      .orderBy("opened_at", "desc").limit(50).get();
    timing.mark('db_read', Date.now() - t0);

    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const res = NextResponse.json({ success: true, sessions });
    return timing.applyToResponse(res);
  } catch (error) {
    console.error("[CASH SESSIONS GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const timing = new ServerTiming();
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
    const sessionData = {
      outlet,
      shift: shift || "morning",
      opening_cash: Number(opening_cash),
      closing_cash: null,
      staff_id: staff_id || actor.uid,
      opened_at: now,
      created_at: Date.now(),
    };

    const t0 = Date.now();
    const ref = await adminDb.collection("cash_register_sessions").add(sessionData);
    timing.mark('db_write', Date.now() - t0);

    const createdSession = { id: ref.id, ...sessionData };
    const res = NextResponse.json({ success: true, id: ref.id, session: createdSession }, { status: 201 });
    return timing.applyToResponse(res);
  } catch (error) {
    console.error("[CASH SESSIONS POST]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
