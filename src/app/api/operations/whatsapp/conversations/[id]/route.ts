import { NextResponse } from 'next/server';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { z } from 'zod';

const patchSchema = z.object({
  assigned_to: z.string().optional(),
  tags: z.array(z.string()).max(10).optional(),
  status: z.enum(['OPEN', 'RESOLVED', 'ARCHIVED']).optional(),
  preferred_language: z.string().max(2).optional(),
  needs_attention: z.boolean().optional(),
  attention_reason: z.string().max(100).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    const doc = await adminDb!.collection('whatsapp_conversations').doc(params.id).get();
    
    if (!doc.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = doc.data()!;
    if (actor.role === 'manager' && data.outlet_id !== (actor.outletId || 'main')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Return safe DTO
    const { provider_credentials, internal_secrets, ...safeData } = data as any;
    
    return NextResponse.json({ conversation: { id: doc.id, ...safeData } });
  } catch (error: any) {
    console.error('Failed to get conversation:', error);
    if (error instanceof SessionAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    
    const rawBody = await request.json();
    const parseResult = patchSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    
    const body = parseResult.data;

    // Enforce outlet before mutation
    const convRef = adminDb!.collection('whatsapp_conversations').doc(params.id);
    const doc = await convRef.get();
    
    if (!doc.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    const data = doc.data()!;
    if (actor.role === 'manager' && data.outlet_id !== (actor.outletId || 'main')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updates: Record<string, any> = {
      updated_at: Date.now()
    };
    
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.status !== undefined) updates.status = body.status;
    if (body.preferred_language !== undefined) updates.preferred_language = body.preferred_language;
    if (body.needs_attention !== undefined) {
      updates.needs_attention = body.needs_attention;
      if (body.needs_attention && body.attention_reason) {
        updates.attention_reason = body.attention_reason;
        updates.attention_at = Date.now();
      }
    }
    
    if (Object.keys(updates).length > 1) { // More than just updated_at
      await convRef.update(updates);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to update conversation:', error);
    if (error instanceof SessionAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
