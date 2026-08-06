import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { createUploadIntent } from '@/server/supabase/storageAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';

const requestSchema = z.object({
  category: z.enum(['menu', 'atmosphere', 'evidence', 'invoice', 'receipt', 'document', 'report', 'media']),
  relatedEntityType: z.string().min(1).max(50),
  relatedEntityId: z.string().min(1).max(128),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024), // 20MB max
  accessLevel: z.enum(['public', 'private', 'role_restricted'])
});

const sanitizeFilename = (filename: string) => {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 100);
};

export async function POST(req: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitRes = await rateLimitDurable(`${ip}_upload_intent`, 30, 60000);
    if (!rateLimitRes.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7), true);
    } catch (err) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userRole = decodedToken.role || 'customer';
    
    // Only staff and owners should upload files, or customers uploading profile pics (if supported)
    if (!['owner', 'manager', 'staff'].includes(userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bodyText = await req.text();
    if (bodyText.length > 32 * 1024) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    let parsedBody;
    try {
      parsedBody = requestSchema.parse(JSON.parse(bodyText));
    } catch (err) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { category, relatedEntityType, relatedEntityId, originalFilename, mimeType, sizeBytes, accessLevel } = parsedBody;

    const documentId = randomUUID();
    const safeFilename = sanitizeFilename(originalFilename);
    const isPublic = category === 'menu' || category === 'atmosphere' || category === 'media';
    const bucket = isPublic ? 'ilara-public-media' : 'ilara-private-files';
    
    const objectPath = `main/${category}/${relatedEntityId}/${documentId}/${safeFilename}`;

    const { signedUrl } = await createUploadIntent(bucket, objectPath);

    const docRef = adminDb.collection('documents').doc(documentId);
    
    // Create the Firestore metadata record
    await docRef.set({
      document_id: documentId,
      outlet_id: 'default', // Assuming single outlet or fetched from session context
      category,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
      bucket,
      object_path: objectPath,
      original_filename: originalFilename,
      stored_filename: safeFilename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      access_level: accessLevel,
      uploaded_by: decodedToken.uid,
      uploaded_by_role: userRole,
      uploaded_at: new Date(),
      upload_expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 mins expiry
      version: 1,
      status: 'uploading'
    });

    return NextResponse.json({
      documentId,
      bucket,
      objectPath,
      uploadToken: signedUrl
    });

  } catch (error: any) {
    console.error('[Upload Intent Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
