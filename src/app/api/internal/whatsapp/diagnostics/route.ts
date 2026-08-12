// [INTERNAL]
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Only Owner or Admin can access diagnostics
    await requireSessionActor(['owner', 'admin']);

    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const envProjectId = process.env.FIREBASE_PROJECT_ID;
    const adminProjectId = admin.app().options.projectId;

    const response: any = {
      firebase: {
        configured: !!adminProjectId,
        projectMatch: envProjectId === adminProjectId,
        adminProjectIdMasked: adminProjectId ? `${adminProjectId.substring(0, 3)}***` : 'unknown'
      },
      counts: {},
      conversationHealth: {
        sampled: 0,
        missingLastMessageAt: 0,
        missingOutletId: 0,
        missingConversationId: 0
      },
      messageHealth: {
        sampled: 0,
        missingCreatedAtMs: 0,
        missingOutletId: 0
      },
      listQueryIndicators: {}
    };

    // 1. Raw counts
    const conversationsSnap = await adminDb.collection('whatsapp_conversations').limit(50).get();
    const messagesSnap = await adminDb.collection('whatsapp_messages').limit(50).get();
    const processedSnap = await adminDb.collection('processed_whatsapp_messages').limit(50).get();

    response.counts.conversationsSample = conversationsSnap.size;
    response.counts.messagesSample = messagesSnap.size;
    response.counts.processedMarkersSample = processedSnap.size;

    // 2. Conversation Health
    response.conversationHealth.sampled = conversationsSnap.size;
    conversationsSnap.forEach(doc => {
      const data = doc.data();
      if (data.last_message_at === undefined || data.last_message_at === null) {
        response.conversationHealth.missingLastMessageAt++;
      }
      if (!data.outlet_id) {
        response.conversationHealth.missingOutletId++;
      }
      if (!data.conversation_id) {
        response.conversationHealth.missingConversationId++;
      }
    });

    // 3. Message Health
    response.messageHealth.sampled = messagesSnap.size;
    messagesSnap.forEach(doc => {
      const data = doc.data();
      if (data.created_at_ms === undefined || data.created_at_ms === null) {
        response.messageHealth.missingCreatedAtMs++;
      }
      if (!data.outlet_id) {
        response.messageHealth.missingOutletId++;
      }
    });

    // 4. Diagnostic List Query Check
    // Mimic the Inbox API query
    const listQuerySnap = await adminDb.collection('whatsapp_conversations')
      .orderBy('last_message_at', 'desc')
      .limit(50)
      .get();
      
    response.listQueryIndicators = {
      rawConversationSampleExists: conversationsSnap.size > 0,
      listQueryReturnsRecords: listQuerySnap.size > 0,
      discrepancyDetected: conversationsSnap.size > 0 && listQuerySnap.size === 0
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store'
      }
    });

  } catch (error: any) {
    console.error('[WHATSAPP DIAGNOSTICS] Failed:', error);
    if (error instanceof SessionAuthorizationError) {
      return NextResponse.json({ error: 'Internal Server Error' }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
