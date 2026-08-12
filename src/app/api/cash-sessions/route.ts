import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSessionActorApi, requirePermission, requireOutletAccess } from "@/server/auth/requireSessionActor";
import { ServerTiming } from "@/lib/performance/serverTiming";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const timing = new ServerTiming();
  try {
    const actor = await requireSessionActorApi(["manager", "admin", "owner"]);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });

    const t0 = Date.now();
    requirePermission(actor, 'cash_sessions.read');
    
    let query: any = adminDb.collection("cash_register_sessions");
    if (actor.role !== 'admin' && actor.role !== 'owner') {
      if (!actor.allowedOutletIds || actor.allowedOutletIds.length === 0) {
        return timing.applyToResponse(NextResponse.json({ success: true, sessions: [] }));
      }
      query = query.where("outlet_id", "in", actor.allowedOutletIds);
    }
    const snap = await query.orderBy("opened_at", "desc").limit(50).get();
    timing.mark('db_read', Date.now() - t0);

    const sessions = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
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
    const actor = await requireSessionActorApi(["manager", "admin", "owner"]);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });

    const body = await req.json();
    const { outlet, shift, opening_cash, staff_id } = body;
    if (!outlet || opening_cash === undefined) {
      return NextResponse.json({ success: false, error: "outlet and opening_cash are required" }, { status: 400 });
    }

    requirePermission(actor, 'cash_sessions.create');
    
    let canonicalOutletId = outlet;
    // Attempt to resolve if it's not an ID (e.g. if length is small or doesn't match ID pattern)
    // Actually, we must resolve canonical outlet ID.
    const outletsSnap = await adminDb.collection('outlets').get();
    const outletDoc = outletsSnap.docs.find(d => d.id === outlet || d.data().name === outlet);
    if (!outletDoc) {
      return NextResponse.json({ success: false, error: "Outlet not found" }, { status: 400 });
    }
    canonicalOutletId = outletDoc.id;

    // Enforce outlet access
    try {
      requireOutletAccess(actor, canonicalOutletId);
    } catch (e: any) {
      return NextResponse.json({ success: false, error: "Forbidden: Outlet access denied" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const sessionData = {
      outlet_id: canonicalOutletId, // Store canonical ID
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
