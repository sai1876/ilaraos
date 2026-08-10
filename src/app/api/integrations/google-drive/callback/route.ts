import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleOAuthCallback } from '@/server/storage/providers/google-drive/oauth';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL(`/operations?error=${error}`, req.url));
    }

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state parameter' }, { status: 400 });
    }

    const result = await handleGoogleOAuthCallback(code, state);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Upsert the integration record
    const { data: existing } = await supabase
      .from('storage_integrations')
      .select('id')
      .eq('outlet_id', result.outletId)
      .eq('provider', 'google_drive')
      .single();

    if (existing) {
      await supabase
        .from('storage_integrations')
        .update({
          status: 'connected',
          account_email: result.accountEmail,
          encrypted_refresh_token: result.encryptedRefreshToken,
          scope: result.scope,
          connected_by: 'system', // Ideally we'd decode it from state if we passed uid
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('storage_integrations')
        .insert({
          outlet_id: result.outletId,
          provider: 'google_drive',
          status: 'connected',
          account_email: result.accountEmail,
          encrypted_refresh_token: result.encryptedRefreshToken,
          scope: result.scope,
          connected_by: 'system',
        });
    }

    // Trigger background provisioning of folders
    fetch(new URL('/api/integrations/google-drive/provision', req.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outletId: result.outletId })
    }).catch(e => console.error('Failed to trigger provisioning', e));

    const returnUrl = new URL(result.returnPath, req.url);
    returnUrl.searchParams.set('integration', 'success');
    
    return NextResponse.redirect(returnUrl);
  } catch (error: any) {
    console.error('Google Drive Callback Error:', error);
    return NextResponse.redirect(new URL(`/operations?error=integration_failed`, req.url));
  }
}
