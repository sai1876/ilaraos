// [INTERNAL] OWNER/admin-only WhatsApp diagnostics. Never exposes secret values.
import { NextResponse } from 'next/server';
import { requireRole } from '@/server/auth/requireRole';
import { DEFAULT_WHATSAPP_GRAPH_API_VERSION } from '@/server/whatsapp/client';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const authResult = await requireRole(req, ['owner', 'admin']);
  if (authResult instanceof NextResponse) return authResult;

  const graphApiVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || DEFAULT_WHATSAPP_GRAPH_API_VERSION;

  const response = {
    configured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
        process.env.WHATSAPP_BOT_NUMBER_ID?.trim() &&
        process.env.WHATSAPP_APP_SECRET?.trim() &&
        process.env.WHATSAPP_VERIFY_TOKEN?.trim(),
    ),
    accessTokenConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
    phoneNumberIdConfigured: Boolean(process.env.WHATSAPP_BOT_NUMBER_ID?.trim()),
    appSecretConfigured: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
    verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim()),
    appBaseUrlConfigured: Boolean(process.env.APP_BASE_URL?.trim()),
    graphApiVersion,
    webhookRoute: '/api/webhook/whatsapp',
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
