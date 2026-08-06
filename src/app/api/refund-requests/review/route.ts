import { NextResponse } from 'next/server';
import { requireRole } from '@/server/auth/requireRole';
import { adminDb } from '@/lib/firebaseAdmin';
import { z } from 'zod';
import { rateLimitDurable } from '@/lib/rateLimit';
import {
  processRefundTransaction,
  RefundCommandError,
  type ProcessRefundParams,
  type RefundResultPayload,
} from '@/server/refunds/processRefund';
import { logBusinessEvent, ActorType } from '@/server/events/logBusinessEvent';

const exactRoles = new Set(['manager', 'admin', 'owner']);

type RefundLine = NonNullable<ProcessRefundParams['requestItems']>[number];
type OrderRecord = Record<string, unknown> & { items?: Array<Record<string, unknown>> };
type WastageItem = {
  menu_item_id: string;
  order_item_id: string;
  item_name: string;
  quantity: number;
  loss_basis: 'menu_item';
};

const ReviewRefundRequestSchema = z.object({
  request_id: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
  manager_note: z.string().min(3).max(500),
  approved_refund_amount: z.number().finite().positive().max(1_000_000).optional(),
  approved_items: z.array(z.object({
    item_id: z.string().trim().min(1).max(128),
    quantity_refunded: z.number().int().min(1).max(100),
    refund_amount: z.number().finite().positive().max(1_000_000).optional()
  }).strict()).min(1).max(50).optional(),
  create_wastage_record: z.boolean().optional(),
  wastage_event_type: z.enum(['remake', 'wastage', 'spoilage', 'missing_item']).optional()
}).strict();

export async function POST(req: Request) {
  try {
    const authResult = await requireRole(req, ['manager', 'admin', 'owner']);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const uid = authResult.uid!;
    const role = authResult.role!;
    if (!exactRoles.has(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!adminDb) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    const limit = await rateLimitDurable(`refund-request-review:${uid}`, 30, 5 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { success: false, error: limit.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: limit.source === 'unavailable' ? 503 : 429 },
      );
    }

    const body = await req.json();
    const parseResult = ReviewRefundRequestSchema.safeParse(body);
    
    if (!parseResult.success) {
      return NextResponse.json({ success: false, error: parseResult.error.issues[0].message || "Invalid payload." }, { status: 400 });
    }

    const { 
      request_id, 
      decision, 
      manager_note, 
      approved_refund_amount, 
      approved_items,
      create_wastage_record,
      wastage_event_type 
    } = parseResult.data;

    const db = adminDb!;
    const requestRef = db.collection('refund_requests').doc(request_id);
    let refundResult: RefundResultPayload | null = null;
    let order_id = '';
    let outlet_id = '';
    let refund_scope = '';
    let orderData: OrderRecord | null = null;
    let wastageWarning = '';
    let refundedItemsForWastage: RefundLine[] | undefined;

    try {
      const db = adminDb!;
      await db.runTransaction(async (transaction) => {
        const reqSnap = await transaction.get(requestRef);
        if (!reqSnap.exists) {
          throw new RefundCommandError(404, 'Refund request not found');
        }

        const reqData = reqSnap.data()!;
        if (reqData.status !== 'pending') {
          throw new RefundCommandError(409, 'Refund request was already reviewed');
        }

        order_id = reqData.order_id;
        refund_scope = reqData.request_scope;
        const db = adminDb!;
        const orderRef = db.collection('orders').doc(order_id);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) {
          throw new RefundCommandError(404, 'Order not found');
        }
        orderData = (orderSnap.data() || {}) as OrderRecord;
        outlet_id = String(orderData.outlet_id || orderData.outlet || '');
        if (!['admin', 'owner'].includes(role)
            && (!authResult.outletId || authResult.outletId !== outlet_id)) {
          throw new RefundCommandError(403, 'Forbidden for this outlet');
        }

        if (decision === 'rejected') {
          transaction.update(requestRef, {
            status: 'rejected',
            manager_note: manager_note.trim(),
            reviewed_by: uid,
            reviewed_at: Date.now(),
            updated_at: Date.now()
          });
          return;
        }

        const finalRefundAmount = approved_refund_amount ?? reqData.requested_amount;
        if (reqData.request_scope === 'custom_amount' && !finalRefundAmount) {
          throw new RefundCommandError(400, 'Approved refund amount is required');
        }

        let finalItems: RefundLine[] | undefined;

        if (reqData.request_scope === 'items') {
          if (approved_items && approved_items.length > 0) {
            finalItems = approved_items;
          } else if (reqData.items_requested && reqData.items_requested.length > 0) {
            const requestedItems = reqData.items_requested as Array<Record<string, unknown>>;
            finalItems = requestedItems.map(reqItem => ({
              item_id: String(reqItem.item_id || ''),
              quantity_refunded: Number(reqItem.quantity || 0),
              ...(typeof reqItem.requested_amount === 'number' ? { refund_amount: reqItem.requested_amount } : {}),
            }));
          } else {
            throw new RefundCommandError(400, 'Item scope requires approved items');
          }
        }
        refundedItemsForWastage = finalItems;
        
        const params: ProcessRefundParams = {
          refund_scope: reqData.request_scope,
          refund_amount: finalRefundAmount,
          reason: `Approved refund request: ${reqData.reason_category} - ${manager_note}`,
          method: 'manual', // or wallet, etc if extended later
          requestItems: finalItems,
          uid,
          idempotencyKey: request_id,
          actorRole: role,
          actorOutletId: authResult.outletId,
        };

        refundResult = await processRefundTransaction(transaction, orderRef, params);
        
        outlet_id = refundResult.outlet_id;

        transaction.update(requestRef, {
          status: 'approved',
          payment_status: 'pending',
          linked_refund_id: refundResult.refundId,
          manager_note: manager_note.trim(),
          reviewed_by: uid,
          reviewed_at: Date.now(),
          updated_at: Date.now()
        });
      });
    } catch (txError) {
      if (txError instanceof RefundCommandError) {
        return NextResponse.json({ success: false, error: txError.publicMessage }, { status: txError.status });
      }
      throw txError;
    }
    const completedRefund = refundResult as RefundResultPayload | null;
    const reviewedOrder = orderData as OrderRecord | null;
    const wastageRefundItems = refundedItemsForWastage as RefundLine[] | undefined;

    // Outside transaction logging
    await logBusinessEvent({
      event_type: 'refund_request_reviewed',
      actor_type: role as ActorType,
      actor_id: uid,
      target_type: 'order',
      target_id: order_id,
      order_id: order_id,
      ...(outlet_id && { outlet_id }),
      severity: 'info',
      source: 'api',
      metadata: {
        request_id,
        decision,
        manager_note: manager_note.trim()
      }
    });

    if (decision === 'approved' && completedRefund) {
      await logBusinessEvent({
        event_type: 'refund_processed',
        actor_type: role as ActorType,
        actor_id: uid,
        target_type: 'order',
        target_id: order_id,
        order_id: order_id,
        ...(outlet_id && { outlet_id }),
        severity: 'warning',
        source: 'api',
        metadata: {
          request_id,
          refund_scope,
          refund_amount: completedRefund.canonicalRefundAmount,
          refund_status: completedRefund.nextRefundStatus,
          refund_method: 'manual',
          reason: manager_note.trim(),
          ...(refund_scope === 'items' && { item_count: completedRefund.itemCount })
        }
      });
    }

    if (decision === 'approved' && create_wastage_record && completedRefund) {
      try {
        if (refund_scope === 'custom_amount' && (!wastageRefundItems || wastageRefundItems.length === 0)) {
          // Log skipped wastage and warn user
          wastageWarning = "Custom amount refund has no item mapping, so no food-loss record was created.";
          await logBusinessEvent({
            event_type: 'wastage_auto_create_skipped',
            actor_type: role as ActorType,
            actor_id: uid,
            target_type: 'order',
            target_id: order_id,
            order_id: order_id,
            severity: 'info',
            source: 'api',
            metadata: {
              request_id,
              refund_scope,
              reason: 'custom_amount_no_item_mapping'
            }
          });
        } else {
          const event_id = crypto.randomUUID();
          const now = Date.now();
          const event_type = wastage_event_type || 'wastage';
          
          let deduct_inventory = false;
          let deduction_method: 'none' | 'recipe' | 'stock_direct' = 'none';

          if (event_type === 'remake') {
            deduct_inventory = true;
            deduction_method = 'recipe';
          }

          const items: WastageItem[] = [];
          let skippedSomeItems = false;
          const orderItems: Array<Record<string, unknown>> = Array.isArray(reviewedOrder?.items)
            ? reviewedOrder.items
            : [];
          
          if (wastageRefundItems && wastageRefundItems.length > 0) {
            for (const i of wastageRefundItems) {
              const matchedOrderItem = orderItems.find(oi => oi.item_id === i.item_id || oi.id === i.item_id);
              if (!matchedOrderItem || !matchedOrderItem.menu_item_id) {
                skippedSomeItems = true;
                continue;
              }
              items.push({
                menu_item_id: String(matchedOrderItem.menu_item_id),
                order_item_id: i.item_id,
                item_name: String(matchedOrderItem.name || `Refunded Item ${matchedOrderItem.menu_item_id}`),
                quantity: i.quantity_refunded,
                loss_basis: 'menu_item'
              });
            }
          } else if (refund_scope === 'full_order') {
            for (const i of orderItems) {
              const menu_item_id = i.menu_item_id;
              if (!menu_item_id) {
                skippedSomeItems = true;
                continue;
              }
              items.push({
                menu_item_id: String(menu_item_id),
                order_item_id: String(i.item_id || i.id || ''),
                item_name: String(i.name || `Refunded Item ${menu_item_id}`),
                quantity: Number(i.quantity || 1),
                loss_basis: 'menu_item'
              });
            }
          }

          if (skippedSomeItems) {
            await logBusinessEvent({
              event_type: 'wastage_items_skipped',
              actor_type: role as ActorType,
              actor_id: uid,
              target_type: 'order',
              target_id: order_id,
              order_id: order_id,
              severity: 'warning',
              source: 'api',
              metadata: {
                request_id,
                refund_scope,
                reason: 'missing_menu_item_ids',
                all_skipped: items.length === 0
              }
            });
          }

          if (items.length === 0 && skippedSomeItems) {
            // All items were skipped due to missing menu_item_id
            wastageWarning = "No valid menu items were found for food-loss record.";
          } else if (items.length > 0) {
            await adminDb!.collection('wastage_events').doc(event_id).set({
              event_id,
              order_id,
              source_type: 'customer_complaint',
              event_type,
              items,
              reason_category: 'refund_linked',
              manager_note: `Auto-created from refund ${request_id}`,
              reported_by: uid,
              status: 'reported',
              deduct_inventory,
              deduction_method,
              linked_refund_request_id: request_id,
              created_at: now,
              updated_at: now
            });
            
            await logBusinessEvent({
              event_type: 'wastage_event_reported',
              actor_type: role as ActorType,
              actor_id: uid,
              target_type: 'wastage_event',
              target_id: event_id,
              order_id: order_id,
              severity: 'info',
              source: 'api',
              metadata: {
                event_type,
                source_type: 'customer_complaint',
                deduct_inventory,
                deduction_method,
                item_count: items.length,
                linked_refund_request_id: request_id
              }
            });
          }
        }
      } catch (err) {
        console.warn("[WASTAGE AUTO-CREATE FAILED]", err);
      }
    }
    return NextResponse.json({
      success: true,
      request_id,
      decision,
      ...(wastageWarning ? { wastage_warning: wastageWarning } : {}),
      ...(completedRefund && {
        refund_id: completedRefund.refundId,
        refunded_amount: completedRefund.newRefundedAmount
      })
    });

  } catch (error) {
    console.error("[REFUND REQUEST REVIEW ERROR]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
