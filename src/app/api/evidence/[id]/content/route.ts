// [INTERNAL]
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { EvidenceRecord } from '@/server/evidence/types';
import { EVIDENCE_COL } from '@/server/evidence/evidenceService';
import { drive } from '@/server/google/driveAdmin';

export const dynamic = 'force-dynamic';

const EVIDENCE_INLINE_PREVIEW_MAX_BYTES = parseInt(process.env.EVIDENCE_INLINE_PREVIEW_MAX_BYTES || '52428800', 10); // Default 50MB

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const evidenceId = params.id;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('access');

    if (!token) {
      return new NextResponse('Missing access token', { status: 401 });
    }

    // Validate token
    const sessionDoc = await adminDb!.collection('evidence_access_sessions').doc(token).get();
    if (!sessionDoc.exists) {
      return new NextResponse('Invalid or expired access token', { status: 403 });
    }

    const sessionData = sessionDoc.data()!;
    if (sessionData.evidence_id !== evidenceId) {
      return new NextResponse('Token mismatch', { status: 403 });
    }

    if (sessionData.expires_at.toDate() < new Date()) {
      return new NextResponse('Token expired', { status: 403 });
    }

    // Load EvidenceRecord
    const doc = await adminDb!.collection(EVIDENCE_COL).doc(evidenceId).get();
    if (!doc.exists) {
      return new NextResponse('Evidence not found', { status: 404 });
    }
    const record = doc.data() as EvidenceRecord;

    if (!record.drive_file_id) {
      return new NextResponse('Not a Drive-backed evidence', { status: 404 });
    }

    // Check size limit for Vercel streaming
    if (record.declared_size_bytes && record.declared_size_bytes > EVIDENCE_INLINE_PREVIEW_MAX_BYTES) {
      return new NextResponse(`File too large for inline proxy stream. Max size: ${EVIDENCE_INLINE_PREVIEW_MAX_BYTES} bytes.`, { status: 413 });
    }

    // Check for Range header
    const rangeHeader = request.headers.get('range');
    
    const requestConfig: any = {
      fileId: record.drive_file_id,
      alt: 'media',
    };

    const headers: Record<string, string> = {};
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const response = await drive.files.get(requestConfig, {
      responseType: 'stream',
      headers: headers as any
    });

    const driveStream = response.data as unknown as NodeJS.ReadableStream;
    
    // Construct readable stream for Response
    const webStream = new ReadableStream({
      start(controller) {
        driveStream.on('data', (chunk) => controller.enqueue(chunk));
        driveStream.on('end', () => controller.close());
        driveStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        if ((driveStream as any).destroy) {
          (driveStream as any).destroy();
        }
      }
    });

    const resHeaders = new Headers();
    resHeaders.set('Content-Type', record.mime_type || 'application/octet-stream');
    resHeaders.set('X-Content-Type-Options', 'nosniff');
    resHeaders.set('Cache-Control', 'private, no-store');
    resHeaders.set('Accept-Ranges', 'bytes');

    const fileName = record.archive_file_name || record.original_file_name;

    // Use Content-Disposition
    // If DOWNLOAD, or if we want to force attachment for certain types.
    if (sessionData.purpose === 'DOWNLOAD') {
      resHeaders.set('Content-Disposition', `attachment; filename="${fileName}"`);
    } else {
      // Safe inline types
      if (record.mime_type?.startsWith('image/') || record.mime_type === 'application/pdf' || record.mime_type?.startsWith('audio/') || record.mime_type?.startsWith('video/')) {
        resHeaders.set('Content-Disposition', `inline; filename="${fileName}"`);
      } else {
        resHeaders.set('Content-Disposition', `attachment; filename="${fileName}"`);
      }
    }

    // Forward relevant Drive headers
    const driveHeaders = response.headers;
    if (driveHeaders['content-length']) resHeaders.set('Content-Length', driveHeaders['content-length']);
    if (driveHeaders['content-range']) resHeaders.set('Content-Range', driveHeaders['content-range']);
    
    return new NextResponse(webStream, {
      status: response.status, // e.g. 200 or 206
      statusText: response.statusText,
      headers: resHeaders
    });
  } catch (error: any) {
    console.error('Evidence content stream error:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}
