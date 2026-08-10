import { NextRequest, NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { getGoogleOAuthUrl } from '@/server/storage/providers/google-drive/oauth';

export async function GET(req: NextRequest) {
  try {
    const actorResult = await requireSessionActor(req);
    if (!actorResult.ok) {
      return NextResponse.json({ error: actorResult.reason }, { status: 401 });
    }

    const { actor } = actorResult;
    // Ensure only owners or admins can setup integrations
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const returnPath = searchParams.get('returnPath') || '/operations';

    const url = getGoogleOAuthUrl(actor.outletId || 'main', returnPath);
    
    return NextResponse.redirect(url);
  } catch (error: any) {
    console.error('Google Drive Connect Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
