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
    const insightsSnap = await adminDb.collection('ai_insights')
      .where('outlet_id', '==', 'main')
      .get();

    const insights = insightsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      ok: true,
      insights
    });
  } catch (error) {
    console.error('Error fetching AI insights:', error);
    return NextResponse.json({ detail: 'Failed to load AI insights' }, { status: 500 });
  }
}
