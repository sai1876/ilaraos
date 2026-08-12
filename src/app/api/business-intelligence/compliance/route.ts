// [INTERNAL] Protected via requireBIAccess
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBIAccess } from '@/server/auth/requireBIAccess';

export async function GET(req: Request) {
  const authResult = await requireBIAccess();
  if (authResult instanceof NextResponse) return authResult;

  if (!adminDb) {
    return NextResponse.json({ detail: 'Database unavailable' }, { status: 500 });
  }

  try {
    const tasksSnap = await adminDb.collection('compliance_tasks')
      .where('outlet_id', '==', 'main')
      .get();
    const tasks = tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      ok: true,
      tasks
    });
  } catch (error) {
    console.error('Error fetching compliance tasks:', error);
    return NextResponse.json({ detail: 'Failed to load compliance tasks' }, { status: 500 });
  }
}
