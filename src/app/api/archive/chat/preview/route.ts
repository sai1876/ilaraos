// [INTERNAL]
import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { WhatsAppMessage } from '@/server/whatsapp/inbox/inboxTypes';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    if (actor.role !== 'owner' && actor.role !== 'admin' && actor.role !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { range_from_utc_ms, range_to_utc_ms } = body;

    if (!range_from_utc_ms || !range_to_utc_ms) {
      return NextResponse.json({ error: 'Missing time range' }, { status: 400 });
    }

    // 1. Dependency checks: Do real repo check.
    // Ilara typically has evidence, orders, wastage, etc. We don't have a formal `whatsapp_escalations` yet.
    // We will check for `retention_hold` on Evidence references.
    
    // We must query messages in range
    // To respect server limits, a preview query may be approximate or bounded to a max limit if too huge,
    // but we can execute a count easily.
    const messagesQuery = adminDb!.collection('whatsapp_messages')
      .where('created_at_ms', '>=', range_from_utc_ms)
      .where('created_at_ms', '<=', range_to_utc_ms);
      
    const countSnap = await messagesQuery.count().get();
    const messagesCount = countSnap.data().count;

    // We can fetch a sample or we can fetch all if it's small, to gather conversation count and evidence refs.
    // For a real robust preview, we'll iterate through up to 5000 messages to count exact metrics.
    let scanLimit = 5000;
    const snap = await messagesQuery.limit(scanLimit).get();
    
    const conversations = new Set<string>();
    let evidenceRefCount = 0;
    let unmappedMediaCount = 0;
    let openEscalations = false; // Mocking false since no formal escalation engine exists yet
    
    const evidenceIdsToCheck = new Set<string>();

    for (const doc of snap.docs) {
      const msg = doc.data() as WhatsAppMessage;
      conversations.add(msg.conversation_id);
      
      let hasEvidence = false;
      if (msg.metadata && msg.metadata.evidence_id) {
        evidenceRefCount++;
        hasEvidence = true;
        evidenceIdsToCheck.add(msg.metadata.evidence_id as string);
      } else if (msg.metadata && Array.isArray(msg.metadata.evidence_ids)) {
        evidenceRefCount += msg.metadata.evidence_ids.length;
        hasEvidence = true;
        msg.metadata.evidence_ids.forEach((id: string) => evidenceIdsToCheck.add(id));
      }

      if (msg.media && msg.media.media_id && !hasEvidence) {
        unmappedMediaCount++;
      }
    }

    // Check Evidence for retention holds
    let heldEvidenceCount = 0;
    if (evidenceIdsToCheck.size > 0) {
      // Bounded IN query (max 30) - we chunk it safely
      const evidenceArray = Array.from(evidenceIdsToCheck);
      for (let i = 0; i < evidenceArray.length; i += 30) {
        const chunk = evidenceArray.slice(i, i + 30);
        const evSnap = await adminDb!.collection('evidence_records')
          .where('__name__', 'in', chunk)
          .where('retention_hold', '==', true)
          .get();
        heldEvidenceCount += evSnap.size;
      }
    }

    let warning = null;
    if (heldEvidenceCount > 0) warning = `Warning: ${heldEvidenceCount} evidence attachments are under retention hold. Purge may block for affected messages.`;
    if (unmappedMediaCount > 0) warning = `Warning: ${unmappedMediaCount} messages contain media without Evidence IDs. These will be excluded from purge.`;
    if (messagesCount >= scanLimit) warning = `Warning: Showing exact counts for the first ${scanLimit} messages. Actual archive will be larger.`;

    return NextResponse.json({
      messages_expected: messagesCount,
      conversations_expected: conversations.size + (messagesCount >= scanLimit ? '+' : ''),
      evidence_reference_count: evidenceRefCount + (messagesCount >= scanLimit ? '+' : ''),
      unmapped_media_count: unmappedMediaCount,
      held_evidence_count: heldEvidenceCount,
      open_escalations: openEscalations,
      warning
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
