import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';

const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();

const savedAddressSchema = z.object({
  id: z.string().trim().min(1).max(128),
  label: z.enum(['Home', 'Hostel', 'Library', 'Classroom', 'Other']),
  flatNo: z.string().trim().min(1).max(160),
  floor: z.string().trim().max(80).optional(),
  area: z.string().trim().min(1).max(240),
  landmark: z.string().trim().max(240).optional(),
  fullAddress: z.string().trim().min(5).max(500),
  coordinates: coordinatesSchema.optional(),
}).strict();

const requestSchema = z.object({ addresses: z.array(savedAddressSchema).max(10) })
  .strict()
  .superRefine((value, context) => {
    const ids = value.addresses.map(address => address.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'Address IDs must be unique', path: ['addresses'] });
    }
  });

export async function PUT(request: Request) {
  try {
    const actor = await requireRole(request, ['customer']);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ error: 'Address saving is unavailable' }, { status: 503 });

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid address data' }, { status: 400 });

    const limit = await rateLimitDurable(`customer-addresses:${actor.uid}`, 30, 5 * 60 * 1000);
    if (!limit.success) {
      const unavailable = limit.source === 'unavailable';
      return NextResponse.json({ error: unavailable ? 'Address saving is unavailable' : 'Too many save attempts' }, { status: unavailable ? 503 : 429 });
    }

    await adminDb.collection('users').doc(actor.uid).update({ addresses: parsed.data.addresses });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Customer address update failed:', error);
    return NextResponse.json({ error: 'Unable to save your address' }, { status: 500 });
  }
}
