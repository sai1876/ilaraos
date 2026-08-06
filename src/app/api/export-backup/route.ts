// [OWNER] - Minimized operational export. This is not a disaster-recovery backup.
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

export const dynamic = 'force-dynamic';
const MAX_ROWS_PER_SHEET = 10_000;

const safeCell = (value: unknown): string | number | boolean => {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const pick = (data: Record<string, unknown>, fields: string[]): Record<string, string | number | boolean> =>
  Object.fromEntries(fields
    .filter(field => data[field] !== undefined)
    .map(field => [field, safeCell(data[field])])) as Record<string, string | number | boolean>;

export async function GET(req: Request) {
  try {
    const actor = await requireRole(req, ['owner']);
    if (actor instanceof NextResponse) return actor;
    if (actor.role !== 'owner') return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    if (!adminDb) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    const pseudonymSecret = process.env.EXPORT_PSEUDONYM_SECRET;
    if (!pseudonymSecret || pseudonymSecret.length < 32) {
      return NextResponse.json({ success: false, error: 'Export is not configured' }, { status: 503 });
    }
    const limit = await rateLimitDurable(`operational-export:${actor.uid}`, 2, 60 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: limit.source === 'unavailable' ? 503 : 429 });
    }
    const pseudonym = (value: unknown) => value
      ? crypto.createHmac('sha256', pseudonymSecret).update(String(value)).digest('hex').slice(0, 24)
      : '';

    const definitions = [
      { name: 'orders', fields: ['order_id', 'display_order_code', 'token_number', 'gross_amount', 'subtotal_amount', 'platform_fee', 'promo_discount', 'points_redeemed', 'order_type', 'outlet_id', 'status', 'payment_status', 'payment_method', 'items', 'created_at', 'completed_at', 'delivered_at'] },
      { name: 'payment_ledger', fields: ['payment_id', 'order_id', 'outlet_id', 'amount', 'currency', 'payment_method', 'status', 'captured_at'] },
      { name: 'refund_requests', fields: ['request_id', 'order_id', 'outlet_id', 'request_scope', 'requested_amount', 'reason_category', 'status', 'payment_status', 'created_at', 'paid_at'] },
      { name: 'inventory', fields: ['stock_id', 'name', 'outlet_id', 'current_quantity', 'unit', 'low_threshold', 'unit_cost', 'last_updated'] },
      { name: 'stock_movements', fields: ['movement_id', 'order_id', 'event_id', 'outlet_id', 'stock_id', 'movement_type', 'quantity_delta', 'quantity_before', 'quantity_after', 'reason', 'created_at'] },
      { name: 'wastage_events', fields: ['event_id', 'order_id', 'outlet_id', 'source_type', 'event_type', 'items', 'reason_category', 'status', 'deduct_inventory', 'deduction_method', 'created_at', 'approved_at'] },
      { name: 'daily_closings', fields: ['closing_id', 'outlet_id', 'business_date', 'business_window', 'status', 'sales_summary', 'cash_reconciliation', 'payment_reconciliation', 'refund_summary', 'wastage_summary', 'inventory_summary', 'source_hash', 'created_at', 'locked_at'] },
      { name: 'menu', fields: ['item_id', 'name', 'category', 'price', 'station', 'is_available', 'recipe'] },
      { name: 'offers', fields: ['code', 'discountPercent', 'description', 'categoryScope', 'isActive', 'expiryDate'] },
    ];
    const workbook = xlsx.utils.book_new();
    let totalRows = 0;
    for (const definition of definitions) {
      const snapshot = await adminDb.collection(definition.name).limit(MAX_ROWS_PER_SHEET).get();
      const rows = snapshot.docs.map(document => {
        const data = document.data();
        const row: Record<string, string | number | boolean> = {
          document_id: safeCell(document.id),
          ...pick(data, definition.fields),
        };
        if ('user_id' in data) row.customer_ref = pseudonym(data.user_id);
        return row;
      });
      totalRows += rows.length;
      const worksheet = xlsx.utils.json_to_sheet(rows.length ? rows : [{ status: 'No records' }]);
      xlsx.utils.book_append_sheet(workbook, worksheet, definition.name.slice(0, 31));
    }
    const manifest = xlsx.utils.json_to_sheet([{
      export_type: 'minimized_operational_export',
      generated_at: new Date().toISOString(),
      generated_by: actor.uid,
      row_limit_per_sheet: MAX_ROWS_PER_SHEET,
      total_rows: totalRows,
      excluded: 'users,staff,credentials,biometrics,OTP,exact delivery locations,customer notes',
      disaster_recovery_backup: false,
    }]);
    xlsx.utils.book_append_sheet(workbook, manifest, 'manifest');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    await logBusinessEvent({
      event_type: 'operational_export_generated',
      actor_type: 'owner',
      actor_id: actor.uid,
      target_type: 'system',
      target_id: 'operational_export',
      severity: 'warning',
      source: 'admin_panel',
      metadata: { total_rows: totalRows, sheet_count: definitions.length },
    });
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cafe-operational-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[OPERATIONAL EXPORT ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
