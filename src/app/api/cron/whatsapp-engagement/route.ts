// [INTERNAL] - Vercel cron
import { NextResponse } from 'next/server';
import { processProactiveEngagement } from '@/server/whatsapp/engagement/engagementScheduler';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  // In production, Vercel cron uses a secure header. We can check it here if needed.
  const authHeader = request.headers.get('Authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processProactiveEngagement();

  if (result.success) {
    return NextResponse.json({ success: true, engagedCount: result.engagedCount });
  } else {
    return NextResponse.json({ error: result.error || result.reason }, { status: 500 });
  }
}
