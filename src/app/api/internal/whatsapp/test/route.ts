// [INTERNAL] OWNER/admin-only live WhatsApp send diagnostic.
import { NextResponse } from 'next/server';
import { requireRole } from '@/server/auth/requireRole';
import { sendWhatsAppMessage } from '@/server/whatsapp/client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const authResult = await requireRole(req, ['owner', 'admin']);
  if (authResult instanceof NextResponse) return authResult;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const to =
    body && typeof body === 'object' && 'to' in body && typeof (body as { to?: unknown }).to === 'string'
      ? (body as { to: string }).to.replace(/\D/g, '')
      : '';

  if (to.length < 10 || to.length > 15) {
    return NextResponse.json(
      { ok: false, error: 'Recipient must be a valid international phone number' },
      { status: 400 },
    );
  }

  const result = await sendWhatsAppMessage(
    process.env.WHATSAPP_BOT_NUMBER_ID,
    to,
    'IlaraOS WhatsApp integration test successful.',
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: result.status,
        code: result.code,
        subcode: result.subcode,
        type: result.type,
        fbtraceId: result.fbtraceId,
        error: result.error,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
