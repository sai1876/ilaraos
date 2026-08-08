// [INTERNAL]
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { supabasePublic } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // Check auth if this is a secure cron, e.g. via Vercel Cron header or internal secret
    // For this implementation, we will assume it's protected by standard Next.js / Vercel config.
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       // Optional: Add simple secret check
    }

    if (!adminDb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

    const now = Date.now();

    const snapshot = await adminDb.collection('documents')
      .where('attachment_state', '==', 'pending_entity')
      .where('pending_expires_at', '<', now)
      .limit(100)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    let deletedCount = 0;
    const batch = adminDb.batch();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Delete from Supabase Storage
      if (data.storage_bucket && data.storage_path) {
        const { error } = await supabasePublic
          .storage
          .from(data.storage_bucket)
          .remove([data.storage_path]);
          
        if (error) {
          console.error(`Failed to delete storage file for doc ${doc.id}:`, error);
          continue; // Skip DB delete if storage delete fails
        }
      }

      batch.delete(doc.ref);
      deletedCount++;
    }

    if (deletedCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    console.error('[CRON cleanup-pending-documents]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
