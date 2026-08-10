import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireSessionActor(['owner', 'admin', 'manager']);
    
    const body = await request.json();
    const updates: Record<string, any> = {
      updated_at: Date.now()
    };
    
    // Server authorized mutations
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
    if (body.tags !== undefined && Array.isArray(body.tags)) updates.tags = body.tags;
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
      const convRef = adminDb!.collection('whatsapp_conversations').doc(params.id);
      await convRef.update(updates);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to update conversation:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
