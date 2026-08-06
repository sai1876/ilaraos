import { readCanonicalMoneyPaise } from './canonicalMoney';

export type DataRecord = Record<string, unknown>;

export interface MigrationPatchResult {
  patch: DataRecord;
  conflicts: string[];
}

export interface OutletSource {
  id: string;
  data: DataRecord;
}

const isRecord = (value: unknown): value is DataRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

export const toPaise = (value: unknown, allowNegative = false): number | null => {
  const number = finiteNumber(value);
  if (number === null || (!allowNegative && number < 0)) return null;
  const scaled = number * 100;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-8) return null;
  return rounded;
};

export const normalizeOutletAlias = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';

export function buildOutletAliasMap(outlets: OutletSource[]): Map<string, string> {
  const aliases = new Map<string, string>();
  const canonicalDocuments = new Map<string, string>();
  for (const outlet of outlets) {
    const canonicalId = typeof outlet.data.outlet_id === 'string' && outlet.data.outlet_id.trim()
      ? outlet.data.outlet_id.trim()
      : outlet.id;
    const normalizedCanonicalId = normalizeOutletAlias(canonicalId);
    const previousDocument = canonicalDocuments.get(normalizedCanonicalId);
    if (previousDocument && previousDocument !== outlet.id) {
      throw new Error(`Duplicate canonical outlet ID: ${canonicalId}`);
    }
    canonicalDocuments.set(normalizedCanonicalId, outlet.id);
    const candidates: unknown[] = [outlet.id, canonicalId, outlet.data.name];
    if (Array.isArray(outlet.data.hatches)) candidates.push(...outlet.data.hatches);
    for (const candidate of candidates) {
      const alias = normalizeOutletAlias(candidate);
      if (!alias) continue;
      const previous = aliases.get(alias);
      if (previous && previous !== canonicalId) {
        throw new Error(`Outlet alias collision for ${alias}`);
      }
      aliases.set(alias, canonicalId);
    }
  }
  return aliases;
}

export function resolveCanonicalOutletId(
  candidates: unknown[],
  aliases: ReadonlyMap<string, string>,
): string | null {
  for (const candidate of candidates) {
    const alias = normalizeOutletAlias(candidate);
    if (alias && aliases.has(alias)) return aliases.get(alias)!;
  }
  return null;
}

export function analyzeOutletEvidence(
  candidates: unknown[],
  aliases: ReadonlyMap<string, string>,
): { outletId: string | null; conflict: boolean; unresolvedEvidence: boolean } {
  const resolved = new Set<string>();
  let unresolvedEvidence = false;
  for (const candidate of candidates) {
    const alias = normalizeOutletAlias(candidate);
    if (!alias) continue;
    const outletId = aliases.get(alias);
    if (outletId) resolved.add(outletId);
    else unresolvedEvidence = true;
  }
  return {
    outletId: resolved.size === 1 && !unresolvedEvidence ? [...resolved][0] : null,
    conflict: resolved.size > 1,
    unresolvedEvidence,
  };
}

function addPaiseField(
  source: DataRecord,
  patch: DataRecord,
  conflicts: string[],
  rupeeField: string,
  paiseField: string,
  label = paiseField,
  allowNegative = false,
): void {
  const hasRupees = source[rupeeField] !== undefined && source[rupeeField] !== null;
  const hasPaise = source[paiseField] !== undefined && source[paiseField] !== null;
  if (!hasRupees && !hasPaise) return;
  const expected = hasRupees ? toPaise(source[rupeeField], allowNegative) : null;
  if (hasRupees && expected === null) {
    conflicts.push(label);
    return;
  }
  const stored = finiteNumber(source[paiseField]);
  if (!hasPaise) {
    patch[paiseField] = expected;
  } else if (stored === null || !Number.isSafeInteger(stored)
      || (!allowNegative && stored < 0) || (expected !== null && stored !== expected)) {
    conflicts.push(label);
  }
}

function addNestedPaiseField(
  source: DataRecord,
  patch: DataRecord,
  conflicts: string[],
  sourceSection: string,
  rupeeField: string,
  targetSection: string,
  paiseField: string,
  allowNegative = false,
): void {
  const sourceData = isRecord(source[sourceSection]) ? source[sourceSection] : {};
  const hasRupees = sourceData[rupeeField] !== undefined && sourceData[rupeeField] !== null;
  const currentTarget = isRecord(source[targetSection]) ? source[targetSection] : {};
  const hasPaise = currentTarget[paiseField] !== undefined && currentTarget[paiseField] !== null;
  if (!hasRupees && !hasPaise) return;
  const expected = hasRupees ? toPaise(sourceData[rupeeField], allowNegative) : null;
  if (hasRupees && expected === null) {
    conflicts.push(`${targetSection}.${paiseField}`);
    return;
  }
  const stored = finiteNumber(currentTarget[paiseField]);
  if (!hasPaise) {
    const nextTarget = isRecord(patch[targetSection]) ? patch[targetSection] : { ...currentTarget };
    nextTarget[paiseField] = expected;
    patch[targetSection] = nextTarget;
  } else if (stored === null || !Number.isSafeInteger(stored)
      || (!allowNegative && stored < 0) || (expected !== null && stored !== expected)) {
    conflicts.push(`${targetSection}.${paiseField}`);
  }
}

function migrateItems(
  source: DataRecord,
  itemField: string,
  moneyFields: Array<[string, string]>,
  conflicts: string[],
): unknown[] | null {
  if (!Array.isArray(source[itemField])) return null;
  let changed = false;
  const items = source[itemField].map((item, index) => {
    if (!isRecord(item)) return item;
    const itemPatch: DataRecord = {};
    for (const [rupeeField, paiseField] of moneyFields) {
      addPaiseField(item, itemPatch, conflicts, rupeeField, paiseField, `${itemField}[${index}].${paiseField}`);
    }
    if (Object.keys(itemPatch).length === 0) return item;
    changed = true;
    return { ...item, ...itemPatch };
  });
  return changed ? items : null;
}

export function calculateOrderItemSubtotalPaise(source: DataRecord): number | null {
  if (!Array.isArray(source.items)) return null;
  let subtotal = 0;
  for (const value of source.items) {
    if (!isRecord(value)) return null;
    const quantity = finiteNumber(value.quantity);
    if (quantity === null || !Number.isSafeInteger(quantity) || quantity < 1) return null;
    const unitPrice = readCanonicalMoneyPaise(value, 'unit_price', 'unit_price_paise');
    if (unitPrice === null) return null;
    const lineTotal = unitPrice * quantity;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotal + lineTotal)) return null;
    subtotal += lineTotal;
  }
  return subtotal;
}

export function buildMoneyMigrationPatch(
  collection: string,
  source: DataRecord,
): MigrationPatchResult {
  const patch: DataRecord = {};
  const conflicts: string[] = [];

  if (collection === 'orders') {
    for (const fields of [
      ['gross_amount', 'gross_amount_paise'],
      ['subtotal_amount', 'subtotal_amount_paise'],
      ['platform_fee', 'platform_fee_paise'],
      ['promo_discount', 'promo_discount_paise'],
      ['refunded_amount', 'refunded_amount_paise'],
      ['refund_approved_amount', 'refund_approved_amount_paise'],
      ['refund_paid_amount', 'refund_paid_amount_paise'],
      ['cash_paid', 'cash_paid_paise'],
    ] as const) addPaiseField(source, patch, conflicts, fields[0], fields[1]);
    const items = migrateItems(
      source,
      'items',
      [['unit_price', 'unit_price_paise'], ['refunded_amount', 'refunded_amount_paise']],
      conflicts,
    );
    if (items) patch.items = items;
    try {
      const itemSubtotal = calculateOrderItemSubtotalPaise(source);
      if (Array.isArray(source.items)) {
        if (itemSubtotal === null) {
          conflicts.push('subtotal_amount_paise:item_total');
        } else {
          const storedSubtotal = readCanonicalMoneyPaise(source, 'subtotal_amount', 'subtotal_amount_paise');
          if (storedSubtotal === null) {
            patch.subtotal_amount = itemSubtotal / 100;
            patch.subtotal_amount_paise = itemSubtotal;
          } else if (storedSubtotal !== itemSubtotal) {
            conflicts.push('subtotal_amount_paise:item_total');
          }
        }
      }
    } catch {
      conflicts.push('subtotal_amount_paise:item_total');
    }
  } else if (collection === 'payment_ledger') {
    addPaiseField(source, patch, conflicts, 'amount', 'amount_paise');
  } else if (collection === 'inventory') {
    addPaiseField(source, patch, conflicts, 'cost_per_unit', 'cost_per_unit_paise');
    if (source.unit_cost !== undefined && source.unit_cost !== null) {
      const legacyCost = toPaise(source.unit_cost);
      if (legacyCost === null) {
        conflicts.push('cost_per_unit_paise:unit_cost');
      } else {
        try {
          const canonicalCost = readCanonicalMoneyPaise(source, 'cost_per_unit', 'cost_per_unit_paise');
          if (canonicalCost === null) {
            patch.cost_per_unit = source.unit_cost;
            patch.cost_per_unit_paise = legacyCost;
          } else if (canonicalCost !== legacyCost) {
            conflicts.push('cost_per_unit_paise:unit_cost');
          }
        } catch {
          conflicts.push('cost_per_unit_paise:unit_cost');
        }
      }
    }
  } else if (collection === 'expenses') {
    addPaiseField(source, patch, conflicts, 'amount', 'amount_paise');
  } else if (collection === 'cash_sessions') {
    addPaiseField(source, patch, conflicts, 'opening_cash', 'opening_cash_paise');
    addPaiseField(source, patch, conflicts, 'closing_cash', 'closing_cash_paise');
    addPaiseField(source, patch, conflicts, 'expected_cash', 'expected_cash_paise');
    addPaiseField(source, patch, conflicts, 'cash_difference', 'cash_difference_paise', 'cash_difference_paise', true);
  } else if (collection === 'refunds') {
    addPaiseField(source, patch, conflicts, 'refund_amount', 'refund_amount_paise');
    addPaiseField(source, patch, conflicts, 'order_refunded_amount', 'order_refunded_amount_paise');
    const items = migrateItems(
      source,
      'items_refunded',
      [['refund_amount', 'refund_amount_paise']],
      conflicts,
    );
    if (items) patch.items_refunded = items;
  } else if (collection === 'refund_requests') {
    addPaiseField(source, patch, conflicts, 'requested_amount', 'requested_amount_paise');
    const items = migrateItems(
      source,
      'items_requested',
      [['requested_amount', 'requested_amount_paise']],
      conflicts,
    );
    if (items) patch.items_requested = items;
  } else if (collection === 'wastage_events') {
    const items = migrateItems(
      source,
      'items',
      [['unit_cost_estimate', 'unit_cost_estimate_paise']],
      conflicts,
    );
    if (items) patch.items = items;
  } else if (collection === 'daily_closings') {
    const mappings = [
      { source: 'sales_summary', rupees: 'gross_sales', paise: 'gross_sales' },
      { source: 'sales_summary', rupees: 'net_sales', paise: 'net_sales' },
      { source: 'sales_summary', rupees: 'discount_amount', paise: 'discount_amount' },
      { source: 'sales_summary', rupees: 'unpaid_amount', paise: 'unpaid_amount' },
      { source: 'sales_summary', rupees: 'cash_sales', paise: 'cash_captured' },
      { source: 'sales_summary', rupees: 'upi_sales', paise: 'upi_captured' },
      { source: 'sales_summary', rupees: 'card_sales', paise: 'card_captured' },
      { source: 'sales_summary', rupees: 'wallet_sales', paise: 'wallet_captured' },
      { source: 'refund_summary', rupees: 'refund_amount_paid_today', paise: 'refunds_paid' },
      { source: 'wastage_summary', rupees: 'estimated_wastage_cost', paise: 'estimated_wastage_cost' },
      { source: 'cash_reconciliation', rupees: 'opening_cash', paise: 'opening_cash' },
      { source: 'cash_reconciliation', rupees: 'expected_cash', paise: 'expected_cash' },
      { source: 'cash_reconciliation', rupees: 'counted_cash', paise: 'counted_cash' },
      { source: 'cash_reconciliation', rupees: 'cash_difference', paise: 'cash_difference', signed: true },
      { source: 'payment_reconciliation', rupees: 'expected_upi', paise: 'expected_upi' },
      { source: 'payment_reconciliation', rupees: 'verified_upi', paise: 'verified_upi' },
      { source: 'payment_reconciliation', rupees: 'upi_difference', paise: 'upi_difference', signed: true },
    ];
    for (const mapping of mappings) {
      addNestedPaiseField(
        source,
        patch,
        conflicts,
        mapping.source,
        mapping.rupees,
        'money_paise',
        mapping.paise,
        mapping.signed === true,
      );
    }
  }

  return { patch, conflicts };
}

export function stockMovementBalances(source: DataRecord): boolean | null {
  const previous = finiteNumber(source.previous_quantity);
  const delta = finiteNumber(source.quantity_delta);
  const next = finiteNumber(source.new_quantity);
  if (previous === null || delta === null || next === null) return null;
  return Math.abs((previous + delta) - next) < 1e-9;
}

export function publicStaffProjection(
  staffId: string,
  source: DataRecord,
  outletId: string,
): DataRecord {
  return {
    staff_id: staffId,
    employee_id: typeof source.employee_id === 'string' ? source.employee_id : staffId,
    name: typeof source.name === 'string' ? source.name : 'Staff member',
    role: typeof source.role === 'string' ? source.role.trim().toLowerCase() : 'staff',
    status: typeof source.status === 'string' ? source.status.trim().toLowerCase() : 'inactive',
    outlet_id: outletId,
    ...(typeof source.assigned_hatch === 'string' ? { assigned_hatch: source.assigned_hatch } : {}),
    updated_at: Date.now(),
  };
}
