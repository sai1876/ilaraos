// [INTERNAL] - Vercel cron
import { NextResponse } from 'next/server';
import { runEngagementEngine } from '@/server/whatsapp/engagement/engagementEngine';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  // In production, Vercel cron uses a secure header. We can check it here if needed.
  const authHeader = request.headers.get('Authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await runEngagementEngine();
    return NextResponse.json({ success: true, message: 'Engagement engine run completed' });
  } catch (error: any) {
    console.error('[CRON ERROR] Engagement engine failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
