import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { processArchiveJob } from '@/server/archive/chatArchiveService';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Find up to 5 jobs that are active
    const activeStatuses = ['DRAFT', 'SCANNING', 'EXPORTING', 'VERIFYING', 'PURGING', 'FAILED_PURGE'];
    
    // Firestore IN limits to 10
    const jobsSnap = await adminDb!.collection('archive_jobs')
      .where('status', 'in', activeStatuses)
      .limit(5)
      .get();

    let processedCount = 0;
    for (const doc of jobsSnap.docs) {
      await processArchiveJob(doc.id, 'cron-worker');
      processedCount++;
    }

    return NextResponse.json({ ok: true, processed: processedCount });
  } catch (error: any) {
    console.error('Chat Archive Cron Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
