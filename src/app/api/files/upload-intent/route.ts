// [INTERNAL] Upload intent route
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { createUploadIntent } from '@/server/supabase/storageAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { resolveActorContext } from '@/server/auth/resolveActor';

const requestSchema = z.object({
  category: z.enum(['evidence', 'invoice', 'receipt', 'document', 'report', 'media', 'menu', 'atmosphere']),
  documentType: z.string().min(1).max(80).optional(),
  relatedEntityType: z.string().min(1).max(50),
  relatedEntityId: z.string().min(1).max(128),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024), // 50MB max
  accessLevel: z.enum(['public', 'private', 'role_restricted']).optional(),
  description: z.string().max(500).optional(),
  invoiceNumber: z.string().max(100).optional(),
  invoiceDate: z.string().max(20).optional(),
  vendorId: z.string().max(128).optional(),
  amountPaise: z.number().int().nonnegative().optional(),
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
    const rateLimitRes = await rateLimitDurable(`${ip}_upload_intent`, 40, 60000);
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
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Server-side authoritative actor resolution
    const actorRes = await resolveActorContext(adminDb, decodedToken);
    if (!actorRes.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bodyText = await req.text();
    if (bodyText.length > 32 * 1024) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    let parsedBody;
    try {
      parsedBody = requestSchema.parse(JSON.parse(bodyText));
    } catch (err: any) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const {
      category,
      documentType,
      relatedEntityType,
      relatedEntityId,
      originalFilename,
      mimeType,
      sizeBytes,
      description,
      invoiceNumber,
      invoiceDate,
      vendorId,
      amountPaise,
    } = parsedBody;

    const isPublic = category === 'menu' || category === 'atmosphere' || category === 'media';
    const bucket = isPublic ? 'ilara-public-media' : 'ilara-private-files';
    const accessLevel = isPublic ? 'public' : 'private';

    const documentId = randomUUID();
    const safeFilename = sanitizeFilename(originalFilename);
    const objectPath = `main/${category}/${relatedEntityId}/${documentId}/${safeFilename}`;

    // Create Supabase signed upload URL
    const intentRes = await createUploadIntent(bucket, objectPath);

    const docData: Record<string, any> = {
      document_id: documentId,
      outlet_id: 'main',
      category,
      document_type: documentType || category,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
      bucket,
      object_path: objectPath,
      original_filename: originalFilename,
      stored_filename: safeFilename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      access_level: accessLevel,
      uploaded_by: actorRes.actor.uid,
      uploaded_by_role: actorRes.actor.role,
      uploaded_at: Date.now(),
      upload_expires_at: Date.now() + 15 * 60 * 1000,
      version: 1,
      status: 'uploading',
    };

    if (description) docData.description = description;
    if (invoiceNumber) docData.invoice_number = invoiceNumber;
    if (invoiceDate) docData.invoice_date = invoiceDate;
    if (vendorId) docData.vendor_id = vendorId;
    if (typeof amountPaise === 'number') docData.amount_paise = amountPaise;

    await adminDb.collection('documents').doc(documentId).set(docData);

    return NextResponse.json({
      success: true,
      documentId,
      bucket,
      objectPath,
      signedUrl: intentRes.signedUrl,
      token: (intentRes as any).token || intentRes.signedUrl,
      document: docData,
    });
  } catch (error: any) {
    console.error('[Upload Intent Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
