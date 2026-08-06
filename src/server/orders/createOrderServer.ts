import crypto from 'node:crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { BACKUP_MENU_RECIPES } from '@/lib/constants';
import {
  OUTLETS_COL,
  STOCK_MOVEMENTS_COL,
  STOCKS_COL,
} from '@/lib/firebase/collections';
import { triggerLowStockAlert } from '@/server/notifications/triggerLowStockAlert';

export interface OrderItemInput {
  menuItemId: string;
  quantity: number;
  modifiers?: string[];
}

export interface CreateOrderCommand {
  userId: string;
  idempotencyKey: string;
  clientExpectedTotal?: number;
  promoCode?: string;
  pointsRedeemed: number;
  orderType: 'dine-in' | 'pickup' | 'delivery';
  items: OrderItemInput[];
  hatch?: string;
  tableNo?: string;
  outlet: string;
  deliveryAddress?: string;
  deliveryCoordinates?: { lat: number; lng: number };
}

export interface CreateOrderResult extends Record<string, unknown> {
  order_id: string;
  outlet_id: string;
  gross_amount: number;
  points_redeemed: number;
  replayed: boolean;
  delivery_otp?: string;
}

export class OrderCreationError extends Error {
  constructor(public readonly status: number, public readonly publicMessage: string) {
    super(publicMessage);
  }
}

type CanonicalOrderItem = {
  item_id: string;
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  unit_price_paise: number;
  station: string;
  item_status: 'ordered';
  modifiers: string[];
};

type LowStockAlert = { name: string; current: number; threshold: number; unit: string };

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toPaise(value: number): number {
  return Math.round(value * 100);
}

function toRupees(value: number): number {
  return Number((value / 100).toFixed(2));
}

function normalizeModifier(value: string): string {
  return value.trim().toLowerCase();
}

function getExpiryMillis(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return null;
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requestFingerprint(command: CreateOrderCommand): string {
  return hash(JSON.stringify({
    userId: command.userId,
    clientExpectedTotal: command.clientExpectedTotal,
    promoCode: command.promoCode?.trim().toUpperCase() || null,
    pointsRedeemed: command.pointsRedeemed,
    orderType: command.orderType,
    items: command.items.map(item => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      modifiers: [...(item.modifiers || [])].map(normalizeModifier).sort(),
    })),
    hatch: command.hatch || null,
    tableNo: command.tableNo || null,
    outlet: command.outlet,
    deliveryAddress: command.deliveryAddress || null,
    deliveryCoordinates: command.deliveryCoordinates || null,
  }));
}

function deriveDeliveryOtp(orderId: string): { otp: string; otpHash: string } {
  const secret = process.env.DELIVERY_OTP_SECRET;
  if (!secret || secret.length < 32) {
    throw new OrderCreationError(503, 'Delivery verification is temporarily unavailable');
  }
  const digest = crypto.createHmac('sha256', secret).update(`delivery:${orderId}`).digest();
  const otp = String(100000 + (digest.readUInt32BE(0) % 900000));
  const otpHash = crypto.createHmac('sha256', secret).update(`${orderId}:${otp}`).digest('hex');
  return { otp, otpHash };
}

export const createOrderServer = async (command: CreateOrderCommand): Promise<CreateOrderResult> => {
  if (!adminDb) throw new OrderCreationError(503, 'Ordering is temporarily unavailable');
  const db = adminDb;

  const idempotencyHash = hash(`${command.userId}:${command.idempotencyKey}`);
  const orderId = idempotencyHash.slice(0, 40);
  const orderRef = db.collection('orders').doc(orderId);
  const requestHash = requestFingerprint(command);
  const displayOrderCode = idempotencyHash.slice(0, 10).toUpperCase();
  const deliveryProof = command.orderType === 'delivery' ? deriveDeliveryOtp(orderId) : null;

  const transactionResult = await db.runTransaction(async transaction => {
    const existingOrder = await transaction.get(orderRef);
    if (existingOrder.exists) {
      const existingData = existingOrder.data()!;
      if (existingData.user_id !== command.userId || existingData.request_hash !== requestHash) {
        throw new OrderCreationError(409, 'Checkout attempt was already used');
      }
      return {
        created: false,
        order: existingData,
        alerts: [] as LowStockAlert[],
      };
    }

    const outlets = db.collection(OUTLETS_COL);
    const [outletByName, outletById, outletByDocumentId] = await Promise.all([
      transaction.get(outlets.where('name', '==', command.outlet).limit(1)),
      transaction.get(outlets.where('outlet_id', '==', command.outlet).limit(1)),
      transaction.get(outlets.doc(command.outlet)),
    ]);
    const outletDocument = !outletByName.empty
      ? outletByName.docs[0]
      : !outletById.empty
        ? outletById.docs[0]
        : outletByDocumentId.exists
          ? outletByDocumentId
          : null;
    if (!outletDocument) {
      throw new OrderCreationError(409, 'Selected outlet is unavailable');
    }
    const outletData = asRecord(outletDocument.data());
    if (outletData.status !== 'active') {
      throw new OrderCreationError(409, 'Selected outlet is unavailable');
    }
    const outletId = typeof outletData.outlet_id === 'string' && outletData.outlet_id
      ? outletData.outlet_id
      : outletDocument.id;
    const outletName = typeof outletData.name === 'string' ? outletData.name : command.outlet;
    const allowedHatches = asArray(outletData.hatches).filter((value): value is string => typeof value === 'string');
    if (command.orderType === 'pickup' && allowedHatches.length > 0 && !command.hatch) {
      throw new OrderCreationError(400, 'Please select a pickup point');
    }
    if (command.orderType === 'pickup' && command.hatch && !allowedHatches.includes(command.hatch)) {
      throw new OrderCreationError(409, 'Selected pickup point is unavailable');
    }

    const uniqueMenuIds = [...new Set(command.items.map(item => item.menuItemId))];
    const menuRefs = uniqueMenuIds.map(id => db.collection('menu').doc(id));
    const menuSnapshots = await Promise.all(menuRefs.map(ref => transaction.get(ref)));
    const menuMap = new Map<string, Record<string, unknown>>();
    menuSnapshots.forEach(snapshot => {
      if (snapshot.exists) menuMap.set(snapshot.id, asRecord(snapshot.data()));
    });

    let subtotalPaise = 0;
    const canonicalItems: CanonicalOrderItem[] = [];
    const requiredQuantities = new Map<string, number>();
    const backupRequirements: Array<{ name: string; quantity: number }> = [];

    command.items.forEach((requestedItem, index) => {
      const menu = menuMap.get(requestedItem.menuItemId);
      if (!menu || menu.is_available === false) {
        throw new OrderCreationError(409, 'One or more menu items are unavailable');
      }
      const basePrice = finiteNumber(menu.price, -1);
      if (basePrice < 0) {
        throw new OrderCreationError(409, 'Menu pricing is unavailable');
      }

      const optionRecords = asArray(menu.customizationOptions)
        .flatMap(group => asArray(asRecord(group).options))
        .map(asRecord);
      const requestedModifiers = [...new Set((requestedItem.modifiers || []).map(normalizeModifier))];
      const canonicalModifiers: string[] = [];
      let unitPricePaise = toPaise(basePrice);

      for (const requestedModifier of requestedModifiers) {
        const option = optionRecords.find(candidate =>
          typeof candidate.name === 'string' && normalizeModifier(candidate.name) === requestedModifier,
        );
        if (!option || typeof option.name !== 'string') {
          throw new OrderCreationError(400, 'Invalid item customization');
        }
        canonicalModifiers.push(option.name);
        const optionPrice = finiteNumber(option.price, 0);
        if (optionPrice < 0) throw new OrderCreationError(409, 'Menu pricing is unavailable');
        unitPricePaise += toPaise(optionPrice);

        if (typeof option.stock_id === 'string' && option.stock_id) {
          const optionQuantity = finiteNumber(option.quantity, 0);
          if (optionQuantity > 0) {
            requiredQuantities.set(
              option.stock_id,
              (requiredQuantities.get(option.stock_id) || 0) + optionQuantity * requestedItem.quantity,
            );
          }
        }
      }

      const recipeEntries = asArray(menu.recipe).map(asRecord);
      if (recipeEntries.length > 0) {
        for (const ingredient of recipeEntries) {
          if (typeof ingredient.stock_id !== 'string' || !ingredient.stock_id) {
            throw new OrderCreationError(409, 'Inventory configuration is incomplete');
          }
          const ingredientQuantity = finiteNumber(ingredient.quantity, 0);
          if (ingredientQuantity <= 0) {
            throw new OrderCreationError(409, 'Inventory configuration is incomplete');
          }
          requiredQuantities.set(
            ingredient.stock_id,
            (requiredQuantities.get(ingredient.stock_id) || 0) + ingredientQuantity * requestedItem.quantity,
          );
        }
      } else {
        for (const fallback of BACKUP_MENU_RECIPES[requestedItem.menuItemId] || []) {
          backupRequirements.push({
            name: fallback.name,
            quantity: fallback.requiredQty * requestedItem.quantity,
          });
        }
      }

      subtotalPaise += unitPricePaise * requestedItem.quantity;
      canonicalItems.push({
        item_id: hash(`${orderId}:${index}`).slice(0, 20),
        menu_item_id: requestedItem.menuItemId,
        name: typeof menu.name === 'string' ? menu.name : 'Menu item',
        quantity: requestedItem.quantity,
        unit_price: toRupees(unitPricePaise),
        unit_price_paise: unitPricePaise,
        station: typeof menu.station === 'string'
          ? menu.station
          : typeof menu.preparation_station === 'string'
            ? menu.preparation_station
            : 'KITCHEN',
        item_status: 'ordered',
        modifiers: canonicalModifiers,
      });
    });

    for (const requirement of backupRequirements) {
      const stockQuery = db.collection(STOCKS_COL).where('name', '==', requirement.name).limit(10);
      const candidates = await transaction.get(stockQuery);
      const matching = candidates.docs.find(document => {
        const stock = asRecord(document.data());
        return !stock.outlet_id || stock.outlet_id === outletId;
      });
      if (!matching) throw new OrderCreationError(409, 'Inventory configuration is incomplete');
      requiredQuantities.set(
        matching.id,
        (requiredQuantities.get(matching.id) || 0) + requirement.quantity,
      );
    }

    let promoDiscountPaise = 0;
    let acceptedPromoCode: string | undefined;
    const normalizedPromo = command.promoCode?.trim().toUpperCase();
    if (normalizedPromo) {
      const offerQuery = db.collection('offers').where('code', '==', normalizedPromo).limit(1);
      const offerSnapshot = await transaction.get(offerQuery);
      if (!offerSnapshot.empty) {
        const offer = asRecord(offerSnapshot.docs[0].data());
        const expiryDate = typeof offer.expiryDate === 'string' ? offer.expiryDate : '';
        const today = new Date().toISOString().slice(0, 10);
        const discountPercent = finiteNumber(offer.discountPercent, 0);
        if (offer.isActive === true && expiryDate >= today && discountPercent > 0 && discountPercent <= 100) {
          const categoryScope = typeof offer.categoryScope === 'string' ? offer.categoryScope : 'All';
          const eligiblePaise = categoryScope === 'All'
            ? subtotalPaise
            : canonicalItems.reduce((sum, item) => {
                const menu = menuMap.get(item.menu_item_id);
                return menu?.category === categoryScope ? sum + toPaise(item.unit_price) * item.quantity : sum;
              }, 0);
          promoDiscountPaise = Math.round(eligiblePaise * discountPercent / 100);
          acceptedPromoCode = normalizedPromo;
        }
      }
    }

    const platformFeePaise = 500;
    const prePointsTotalPaise = Math.max(0, subtotalPaise - promoDiscountPaise + platformFeePaise);
    const maxAllowedPoints = Math.floor((prePointsTotalPaise / 100) * 0.2);
    if (command.pointsRedeemed > maxAllowedPoints) {
      throw new OrderCreationError(409, `A maximum of ${maxAllowedPoints} points can be used`);
    }

    const userRef = db.collection('users').doc(command.userId);
    const sequenceRef = db.collection('config').doc(`order_sequence_${hash(outletId).slice(0, 16)}`);
    const configRef = db.collection('config').doc('store_settings');
    const stockRefs = [...requiredQuantities.keys()].map(id => db.collection(STOCKS_COL).doc(id));
    const [userSnapshot, sequenceSnapshot, configSnapshot, ...stockSnapshots] = await Promise.all([
      transaction.get(userRef),
      transaction.get(sequenceRef),
      transaction.get(configRef),
      ...stockRefs.map(ref => transaction.get(ref)),
    ]);

    if (!userSnapshot.exists) throw new OrderCreationError(403, 'Account is not eligible to order');
    const user = asRecord(userSnapshot.data());
    const userActive = user.is_active === true
      && (user.account_status === 'active' || user.status === 'active');
    if (!userActive) throw new OrderCreationError(403, 'Account is not eligible to order');

    let activePointEntries: Array<{
      ref: FirebaseFirestore.DocumentReference;
      amount: number;
      expiresAt: number;
    }> = [];
    if (command.pointsRedeemed > 0) {
      const pointQuery = db.collection('point_ledger').where('user_id', '==', command.userId).limit(200);
      const pointSnapshot = await transaction.get(pointQuery);
      const now = Date.now();
      activePointEntries = pointSnapshot.docs
        .map(document => {
          const data = asRecord(document.data());
          return {
            ref: document.ref,
            amount: finiteNumber(data.amount, 0),
            expiresAt: getExpiryMillis(data.expires_at) || 0,
            isExpired: data.is_expired === true,
          };
        })
        .filter(entry => entry.amount > 0 && !entry.isExpired && entry.expiresAt > now)
        .sort((a, b) => a.expiresAt - b.expiresAt);

      const availablePoints = activePointEntries.reduce((sum, entry) => sum + entry.amount, 0);
      if (command.pointsRedeemed > availablePoints) {
        throw new OrderCreationError(409, 'Insufficient active points');
      }
    }

    const alerts: LowStockAlert[] = [];
    const stockData = new Map<string, Record<string, unknown>>();
    stockSnapshots.forEach(snapshot => {
      if (snapshot.exists) stockData.set(snapshot.id, asRecord(snapshot.data()));
    });
    for (const [stockId, requiredQuantity] of requiredQuantities) {
      const stock = stockData.get(stockId);
      if (!stock) throw new OrderCreationError(409, 'Inventory configuration is incomplete');
      if (stock.outlet_id && stock.outlet_id !== outletId) {
        if (process.env.NODE_ENV === 'production') {
          throw new OrderCreationError(409, 'Inventory outlet mismatch');
        }
      }
      const currentQuantity = finiteNumber(stock.current_quantity, -1);
      if (currentQuantity < requiredQuantity) {
        throw new OrderCreationError(409, `Insufficient stock for ${stock.name || 'one or more items'}`);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const sequenceData = sequenceSnapshot.exists ? asRecord(sequenceSnapshot.data()) : {};
    const currentSequence = sequenceData.date === today
      ? Math.max(1, Math.floor(finiteNumber(sequenceData.last_val, 0)) + 1)
      : 1;
    const tokenNumber = String(currentSequence).padStart(4, '0');
    const finalAmountPaise = Math.max(0, prePointsTotalPaise - command.pointsRedeemed * 100);
    const now = Date.now();

    const orderData: Record<string, unknown> = {
      order_id: orderId,
      display_order_code: displayOrderCode,
      token_number: tokenNumber,
      user_id: command.userId,
      gross_amount: toRupees(finalAmountPaise),
      gross_amount_paise: finalAmountPaise,
      points_redeemed: command.pointsRedeemed,
      cash_paid: 0,
      cash_paid_paise: 0,
      order_type: command.orderType,
      subtotal_amount: toRupees(subtotalPaise),
      subtotal_amount_paise: subtotalPaise,
      platform_fee: toRupees(platformFeePaise),
      platform_fee_paise: platformFeePaise,
      ...(acceptedPromoCode
        ? {
            promo_code: acceptedPromoCode,
            promo_discount: toRupees(promoDiscountPaise),
            promo_discount_paise: promoDiscountPaise,
          }
        : {}),
      pricing_source: 'server',
      outlet_id: outletId,
      outlet: outletName,
      ...(command.hatch ? { hatch: command.hatch } : {}),
      ...(command.tableNo ? { table_no: command.tableNo } : {}),
      ...(command.deliveryAddress ? { delivery_address: command.deliveryAddress } : {}),
      ...(command.deliveryCoordinates ? { delivery_coordinates: command.deliveryCoordinates } : {}),
      ...(deliveryProof ? {
        delivery_proof: {
          otp_hash: deliveryProof.otpHash,
          expires_at: now + 24 * 60 * 60 * 1000,
          attempts: 0,
          consumed: false,
        },
      } : {}),
      status: 'confirmed',
      is_stock_refunded: false,
      inventory_refunded: false,
      rush_held: configSnapshot.exists ? Boolean(configSnapshot.data()?.rush_mode_active) : false,
      estimated_time_mins: 8,
      items: canonicalItems,
      idempotency_hash: idempotencyHash,
      request_hash: requestHash,
      points_awarded: false,
      created_at: now,
      updated_at: now,
    };

    for (const [stockId, requiredQuantity] of requiredQuantities) {
      const stockRef = db.collection(STOCKS_COL).doc(stockId);
      const stock = stockData.get(stockId)!;
      const currentQuantity = finiteNumber(stock.current_quantity);
      const newQuantity = currentQuantity - requiredQuantity;
      transaction.update(stockRef, { current_quantity: newQuantity, last_updated: now });
      const movementId = hash(`${orderId}:${stockId}`).slice(0, 40);
      transaction.create(db.collection(STOCK_MOVEMENTS_COL).doc(movementId), {
        movement_id: movementId,
        order_id: orderId,
        outlet_id: outletId,
        stock_id: stockId,
        quantity_before: currentQuantity,
        quantity_delta: -requiredQuantity,
        quantity_after: newQuantity,
        reason: 'order_created',
        created_at: now,
      });

      const threshold = finiteNumber(stock.low_threshold, -1);
      if (threshold >= 0 && newQuantity < threshold && currentQuantity >= threshold) {
        alerts.push({
          name: typeof stock.name === 'string' ? stock.name : 'Inventory item',
          current: newQuantity,
          threshold,
          unit: typeof stock.unit === 'string' ? stock.unit : 'unit',
        });
      }
    }

    if (command.pointsRedeemed > 0) {
      let remaining = command.pointsRedeemed;
      for (const entry of activePointEntries) {
        if (remaining <= 0) break;
        const deduction = Math.min(entry.amount, remaining);
        transaction.update(entry.ref, { amount: entry.amount - deduction, updated_at: now });
        remaining -= deduction;
      }
      if (remaining !== 0) throw new OrderCreationError(409, 'Insufficient active points');
      transaction.create(db.collection('point_ledger').doc(`order_${orderId}_debit`), {
        user_id: command.userId,
        order_id: orderId,
        amount: -command.pointsRedeemed,
        original_amount: -command.pointsRedeemed,
        source: 'order_redemption',
        is_expired: false,
        created_at: now,
      });
      const availableBefore = activePointEntries.reduce((sum, entry) => sum + entry.amount, 0);
      transaction.update(userRef, { points: availableBefore - command.pointsRedeemed });
    }

    transaction.set(sequenceRef, { date: today, last_val: currentSequence, outlet_id: outletId });
    transaction.create(orderRef, orderData);

    return { created: true, order: orderData, alerts };
  });

  if (transactionResult.created) {
    const outletName = String(transactionResult.order.outlet || command.outlet);
    await Promise.allSettled(
      transactionResult.alerts.map(alert => triggerLowStockAlert(alert, outletName)),
    );
  }

  const order = { ...transactionResult.order };
  delete order.request_hash;
  delete order.idempotency_hash;
  return {
    ...order,
    replayed: !transactionResult.created,
    ...(deliveryProof ? { delivery_otp: deliveryProof.otp } : {}),
  } as CreateOrderResult;
};
