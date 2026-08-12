// [INTERNAL]
import { NextRequest, NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { EVIDENCE_COL } from '@/server/evidence/evidenceService';
import { EvidenceRecord } from '@/server/evidence/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager', 'staff']);
    const doc = await adminDb!.collection(EVIDENCE_COL).doc(params.id).get();
    
    if (!doc.exists) {
      return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const data = doc.data() as EvidenceRecord;

    // RBAC: strict outlet enforcement
    if (actor.role !== 'owner' && actor.role !== 'admin' && data.outlet_id !== actor.outletId) {
      return NextResponse.json({ error: 'Unauthorized outlet' }, { status: 403 });
    }

    // Safe DTO serialization
    // Expose only what operations needs for the detail drawer.
    const {
      expected_drive_file_id,
      archive_lease_owner,
      archive_lease_expires_at,
      supabase_bucket,
      supabase_path,
      drive_file_id,
      drive_folder_id,
      related_entity_keys,
      ...safeDto
    } = data;

    // But owner/admin might need to see hashes or retry info, which is left in safeDto (sha256, provider_checksum).

    return NextResponse.json(safeDto);

  } catch (error: any) {
    console.error('Evidence detail error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
