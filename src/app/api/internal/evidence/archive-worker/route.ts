import { NextResponse } from 'next/server';
import { getEligibleEvidenceForArchive, getRecoveryEvidenceForArchive, processArchiveItem } from '@/server/evidence/archiveService';
import { v4 as uuidv4 } from 'uuid';

export const maxDuration = 300; // 5 minutes (Vercel Pro/Enterprise default limit)
const EXECUTION_BUDGET_MS = 240 * 1000; // 4 minutes

export async function GET(request: Request) {
  const startTime = Date.now();
  
  // 1. Validate Cron Secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workerId = `worker-${uuidv4()}`;
  const BATCH_SIZE = 10;
  const CONCURRENCY = 2;

  // 2. Fetch Queues
  const dueItems = await getEligibleEvidenceForArchive(BATCH_SIZE);
  const recoveryItems = await getRecoveryEvidenceForArchive(BATCH_SIZE);

  // Combine and deduplicate
  const allItems = Array.from(new Set([...dueItems, ...recoveryItems]));
  
  const stats = {
    ok: true,
    claimed: 0,
    archived: 0,
    failed: 0,
    deleteFailed: 0,
    skipped: 0
  };

  // 3. Process with bounded concurrency
  // We process in chunks of `CONCURRENCY`
  for (let i = 0; i < allItems.length; i += CONCURRENCY) {
    if (Date.now() - startTime > EXECUTION_BUDGET_MS) {
      console.log(`[ARCHIVE-WORKER] Execution budget exceeded. Stopping gracefully.`);
      break;
    }

    const chunk = allItems.slice(i, i + CONCURRENCY);
    
    await Promise.all(
      chunk.map(async (id) => {
        try {
          const result = await processArchiveItem(id, workerId);
          if (result === 'SKIPPED_OR_LOCKED') {
            stats.skipped++;
          } else {
            stats.claimed++;
            if (result === 'ARCHIVED' || result === 'ARCHIVED_FROM_DELETE_FAILED') {
              stats.archived++;
            } else if (result === 'DELETE_FAILED') {
              stats.deleteFailed++;
            } else {
              stats.failed++;
            }
          }
        } catch (err: any) {
          stats.failed++;
          console.error(`[ARCHIVE-WORKER] Unhandled error for ${id}:`, err);
        }
      })
    );
  }

  return NextResponse.json(stats);
}
