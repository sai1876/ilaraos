import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { processOfferPublished } from '@/server/whatsapp/offers/offerBroadcastService';
import { Offer } from '@/server/whatsapp/offers/offerBroadcastTypes';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: { offerId: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!adminAuth) {
      return NextResponse.json({ error: 'Auth unavailable' }, { status: 500 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7), true);
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Authenticate & Authorize
    const userRole = decodedToken.role || 'customer';
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Owner/Admin access required.' }, { status: 403 });
    }

    const offerId = params.offerId;
    if (!offerId) {
      return NextResponse.json({ error: 'Missing offerId' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const offerRef = adminDb.collection('offers').doc(offerId);

    // 2. Database Transaction to transition offer state
    const publishedOffer = await adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(offerRef);
      if (!doc.exists) {
        throw new Error('NOT_FOUND');
      }

      const data = doc.data() as any;

      // Validate required fields
      if (!data.title || !data.description || !data.valid_until) {
        throw new Error('INVALID_DATA');
      }

      if (data.status === 'ACTIVE') {
         // Already active, maybe we just return it or increment version if they edited it?
         // For now, if they explicitly clicked publish, we increment version to trigger a new broadcast.
         // A more complex system might check if fields changed.
      }

      const newVersion = (data.version || 0) + 1;
      
      const updatePayload = {
        status: 'ACTIVE',
        published_at: Date.now(),
        updated_at: Date.now(),
        version: newVersion
      };

      transaction.update(offerRef, updatePayload);

      return {
        ...data,
        ...updatePayload,
        offer_id: offerId
      } as Offer;
    });

    // 3. Emit idempotent business event (OUTSIDE the transaction)
    await logBusinessEvent({
      event_type: 'offer_published',
      actor_type: userRole as any,
      actor_id: decodedToken.uid,
      target_type: 'offer',
      target_id: offerId,
      severity: 'info',
      source: 'api',
      metadata: {
        version: publishedOffer.version,
        title: publishedOffer.title
      }
    });

    // 4. Asynchronously trigger the broadcast service
    // We intentionally do not await this so the API responds quickly 
    // and broadcast failure does NOT rollback the database transaction.
    processOfferPublished(publishedOffer).catch(err => {
      console.error(`[OFFER PUBLISH API] Background broadcast failed for offer ${offerId}:`, err);
    });

    // 5. Return the canonical published offer
    return NextResponse.json({ success: true, offer: publishedOffer });

  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }
    if (error.message === 'INVALID_DATA') {
      return NextResponse.json({ error: 'Offer missing required fields for publishing' }, { status: 400 });
    }
    
    console.error('[OFFER PUBLISH API ERROR]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
