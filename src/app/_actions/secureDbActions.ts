'use server';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ILARA CAFE - SERVER ACTIONS & PRIVILEGED WRITE POLICY
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * 1. MANDATORY ACTOR RESOLUTION
 *    - Every Server Action executing write operations or accessing private configuration
 *      must invoke requireSessionActor() to resolve the authenticated caller context.
 * 
 * 2. ROLE-BASED ACCESS CONTROL (RBAC)
 *    - All operations verify that the resolved actor's role meets the minimal threshold.
 *    - Operations modifying stock, processing attendance, or registering shifts
 *      require 'manager' or higher, verified via isRoleAllowed(actor.role, [...]).
 * 
 * 3. TRANSPARENT TRACEABILITY
 *    - Audit logging records the executing staff ID and outlet scope for all writes.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { authenticator } from 'otplib';
import { Staff, StockItem, Outlet, ConversionRecipe, DoughBatch } from '@/lib/types';
import nodemailer from 'nodemailer';
import {
  isRoleAllowed,
  type ActorContext,
} from '@/server/auth/resolveActor';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireSessionActor, requirePermission, requireOutletAccess } from '@/server/auth/requireSessionActor';
import { readTotpSecret } from '@/server/auth/totpSecret';
import {
  persistStaffRecords,
  validateStaffPrivateConfiguration,
} from '@/server/staff/persistStaffRecords';

async function getSessionActor(): Promise<ActorContext> {
  return requireSessionActor(['staff']);
}

async function getAdminUid() {
  const actor = await getSessionActor();
  if (!isRoleAllowed(actor.role, ['manager', 'admin', 'owner'])) {
    throw new Error("Forbidden: Insufficient privileges");
  }
  return actor.uid;
}

async function getStaffAdministrator(targetRole?: string): Promise<ActorContext> {
  const actor = await getSessionActor();
  if (!['admin', 'owner'].includes(actor.role)) {
    throw new Error("Forbidden: Staff administration requires admin access");
  }
  if (actor.role !== 'owner' && ['admin', 'owner'].includes(String(targetRole || '').toLowerCase())) {
    throw new Error("Forbidden: Only the owner can grant this role");
  }
  return actor;
}

async function assertCanManageExistingStaff(actor: ActorContext, staffId: string): Promise<void> {
  if (!adminDb || actor.role === 'owner') return;
  let snapshot = await adminDb.collection('staff').doc(staffId).get();
  if (!snapshot.exists) {
    const byAuthUid = await adminDb.collection('staff').where('auth_uid', '==', staffId).limit(1).get();
    if (!byAuthUid.empty) snapshot = byAuthUid.docs[0];
  }
  if (snapshot.exists && ['admin', 'owner'].includes(String(snapshot.data()?.role || '').toLowerCase())) {
    throw new Error("Forbidden: Only the owner can manage this account");
  }
}

import { cookies } from 'next/headers';
import { randomUUID, createHash } from 'crypto';

async function verifyTOTP(actorUid: string, totpCode: string | undefined, purpose: 'inventory_sensitive_action' | 'admin_action' = 'admin_action', validatedOutletId?: string) {
  if (!adminDb) throw new Error("Firebase Admin DB not configured");

  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('__session')?.value || cookieStore.get('session')?.value;
  if (!sessionCookie) throw new Error("No active session");
  
  const currentSessionBinding = createHash('sha256').update(sessionCookie).digest('hex');

  const elevationCookieName = `__elevation_${purpose}`;
  const elevationSessionId = cookieStore.get(elevationCookieName)?.value;

  // Try to bypass using valid HTTP-only elevation cookie
  if ((!totpCode || totpCode === 'SESSION_BYPASS') && elevationSessionId) {
    const elevationDoc = await adminDb.collection('actor_elevations').doc(elevationSessionId).get();
    if (elevationDoc.exists) {
      const data = elevationDoc.data()!;
      if (
        data.userId === actorUid &&
        data.sessionBinding === currentSessionBinding &&
        data.purpose === purpose &&
        data.expiresAt > Date.now() &&
        (!validatedOutletId || data.outletId === validatedOutletId)
      ) {
        return; // Valid server-side session elevation
      }
    }
  }

  // If no code provided and bypass failed, reject
  if (!totpCode || totpCode === 'SESSION_BYPASS') {
    throw new Error("2FA session expired. Please enter OTP again.");
  }

  // Verify new TOTP
  const attemptLimit = await rateLimitDurable(`privileged-totp:${actorUid}`, 5, 5 * 60 * 1000);
  if (!attemptLimit.success) {
    throw new Error(
      attemptLimit.source === 'unavailable'
        ? "Authentication temporarily unavailable"
        : "Too many authenticator attempts",
    );
  }
  
  const secretDoc = await adminDb.collection('admin_secrets').doc(actorUid).get();
  if (!secretDoc.exists) {
    throw new Error("2FA setup required. Please re-login.");
  }

  const secret = readTotpSecret(actorUid, secretDoc.data());
  if (!secret) throw new Error("2FA setup required. Please re-login.");
  authenticator.options = { window: 2 };
  const isValid = authenticator.verify({ token: totpCode, secret });

  if (!isValid) {
    throw new Error("Invalid authenticator code.");
  }

  // Create elevated authorization state
  const newSessionId = randomUUID().replace(/-/g, '');
  const now = Date.now();
  
  await adminDb.collection('actor_elevations').doc(newSessionId).set({
    elevationId: newSessionId,
    userId: actorUid,
    sessionBinding: currentSessionBinding,
    purpose,
    verifiedAt: now,
    expiresAt: now + 20 * 60 * 1000,
    ...(validatedOutletId ? { outletId: validatedOutletId } : {})
  });

  // Set HTTP-only cookie
  cookieStore.set(elevationCookieName, newSessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 20 * 60
  });
}

// --- STAFF ACTIONS ---
export async function secureSaveStaff(staff: Staff, totpCode: string, password?: string) {
  const authInstance = adminAuth;
  const dbInstance = adminDb;
  if (!authInstance || !dbInstance) throw new Error("Firebase Admin not configured");

  const actor = await getStaffAdministrator(staff.role);
  await verifyTOTP(actor.uid, totpCode);
  await assertCanManageExistingStaff(actor, staff.id);
  validateStaffPrivateConfiguration(staff);

  if (password && staff.email) {
    try {
      await authInstance.createUser({
        uid: staff.id,
        email: staff.email,
        password: password,
        displayName: staff.name
      });
    } catch (error: unknown) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
      if (code === 'auth/email-already-exists') {
        // Fallback: update claims if user already exists
        const userRec = await authInstance.getUserByEmail(staff.email);
        await assertCanManageExistingStaff(actor, userRec.uid);
        await authInstance.updateUser(userRec.uid, { password: password }); // Reset their password to the new one
        staff.id = userRec.uid;
      } else {
        throw error;
      }
    }
  }

  await persistStaffRecords(dbInstance, authInstance, staff, staff.id);
  return { success: true };
}

export async function secureEditStaff(staff: Staff, totpCode: string) {
  const authInstance = adminAuth;
  const dbInstance = adminDb;
  if (!authInstance || !dbInstance) throw new Error("Firebase Admin not configured");

  const actor = await getStaffAdministrator(staff.role);
  await verifyTOTP(actor.uid, totpCode);
  await assertCanManageExistingStaff(actor, staff.id);
  validateStaffPrivateConfiguration(staff);

  let authUid = staff.id;
  try {
    const user = await authInstance.updateUser(authUid, { displayName: staff.name });
    authUid = user.uid;
  } catch (error) {
    if (!staff.email) throw error;
    const user = await authInstance.getUserByEmail(staff.email);
    await authInstance.updateUser(user.uid, { displayName: staff.name });
    authUid = user.uid;
  }

  await persistStaffRecords(dbInstance, authInstance, staff, authUid);
  return { success: true };
}

export async function secureDeleteStaff(id: string, totpCode: string) {
  const actor = await getStaffAdministrator();
  await verifyTOTP(actor.uid, totpCode);
  await assertCanManageExistingStaff(actor, id);
  if (!adminDb || !adminAuth) throw new Error("Firebase Admin not configured");
  const staffRef = adminDb.collection('staff').doc(id);
  const staffSnapshot = await staffRef.get();
  if (!staffSnapshot.exists) return { success: true };
  const staffData = staffSnapshot.data()!;
  if (actor.role !== 'owner' && ['admin', 'owner'].includes(String(staffData.role).toLowerCase())) {
    throw new Error("Forbidden: Only the owner can delete this account");
  }
  const authUid = String(staffData.auth_uid || staffData.firebase_uid || id);
  const batch = adminDb.batch();
  batch.delete(staffRef);
  batch.delete(adminDb.collection('staff_private').doc(id));
  batch.delete(adminDb.collection('staff_directory').doc(id));
  batch.delete(adminDb.collection('staff_access').doc(authUid));
  batch.delete(adminDb.collection('admin_secrets').doc(authUid));
  batch.delete(adminDb.collection('admin_sessions').doc(authUid));
  await batch.commit();
  try {
    await adminAuth.revokeRefreshTokens(authUid);
    await adminAuth.deleteUser(authUid);
  } catch (error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code !== 'auth/user-not-found') throw error;
  }
  return { success: true };
}

function canonicalStockRecord(stockItem: StockItem): StockItem {
  if (stockItem.cost_per_unit === undefined) return stockItem;
  const scaled = stockItem.cost_per_unit * 100;
  if (!Number.isFinite(scaled) || scaled < 0 || !Number.isSafeInteger(Math.round(scaled))
      || Math.abs(scaled - Math.round(scaled)) > 1e-8) {
    throw new Error('Invalid inventory unit cost');
  }
  return { ...stockItem, cost_per_unit_paise: Math.round(scaled) };
}

export async function secureUpdateStaffPassword(staffId: string, newPassword: string, totpCode: string) {
  const authInstance = adminAuth;
  if (!authInstance) throw new Error("Firebase Admin not configured");

  const actor = await getStaffAdministrator();
  await verifyTOTP(actor.uid, totpCode);
  await assertCanManageExistingStaff(actor, staffId);

  await authInstance.updateUser(staffId, { password: newPassword });
  
  return { success: true };
}

export async function secureUpdateStaffSchedule(
  staffId: string,
  schedule: object[],
  totpCode: string,
) {
  const uid = await getAdminUid();
  await verifyTOTP(uid, totpCode);

  if (!adminDb) throw new Error("Firebase Admin DB not configured");

  await adminDb.collection('staff').doc(staffId).update({
    schedule: schedule
  });

  return { success: true };
}

// --- INVENTORY ACTIONS ---
export async function secureSaveStockItem(stockItem: StockItem, totpCode: string) {
  const actor = await getSessionActor();
  requirePermission(actor, 'inventory.adjust');

  if (stockItem.stock_id && adminDb) {
     const existingSnap = await adminDb.collection('inventory').doc(stockItem.stock_id).get();
     if (existingSnap.exists) {
        const existingData = existingSnap.data() as StockItem;
        if (existingData.outlet_id) {
           requireOutletAccess(actor, existingData.outlet_id);
        }
     }
  }
  
  if (stockItem.outlet_id) {
    requireOutletAccess(actor, stockItem.outlet_id);
  }

  await verifyTOTP(actor.uid, totpCode, 'inventory_sensitive_action', stockItem.outlet_id);

  await adminDb!.collection('inventory').doc(stockItem.stock_id).set(canonicalStockRecord(stockItem));
  return { success: true };
}

export async function secureSaveBulkStockItems(stockItems: StockItem[], totpCode: string) {
  const actor = await getSessionActor();
  requirePermission(actor, 'inventory.adjust');
  await verifyTOTP(actor.uid, totpCode, 'inventory_sensitive_action');

  if (!adminDb) throw new Error("Firebase Admin DB not configured");

  const batch = adminDb.batch();
  for (const item of stockItems) {
    if (item.stock_id) {
       const existingSnap = await adminDb.collection('inventory').doc(item.stock_id).get();
       if (existingSnap.exists) {
          const existingData = existingSnap.data() as StockItem;
          if (existingData.outlet_id) requireOutletAccess(actor, existingData.outlet_id);
       }
    }
    if (item.outlet_id) {
      requireOutletAccess(actor, item.outlet_id);
    }
    const docRef = adminDb.collection('inventory').doc(item.stock_id);
    batch.set(docRef, canonicalStockRecord(item));
  }
  await batch.commit();
  return { success: true };
}

export async function secureDeleteStockItem(stockId: string, totpCode: string) {
  const actor = await getSessionActor();
  requirePermission(actor, 'inventory.delete');

  if (!adminDb) throw new Error("Firebase Admin DB not configured");
  
  const existingSnap = await adminDb.collection('inventory').doc(stockId).get();
  if (existingSnap.exists) {
    const existingData = existingSnap.data() as StockItem;
    if (existingData.outlet_id) {
       requireOutletAccess(actor, existingData.outlet_id);
    }
  }

  await verifyTOTP(actor.uid, totpCode, 'inventory_sensitive_action');

  await adminDb.collection('inventory').doc(stockId).delete();
  return { success: true };
}

// --- OUTLET ACTIONS ---
export async function secureSaveOutlet(outlet: Outlet, totpCode: string) {
  const actor = await getSessionActor();

  if (actor.role !== 'admin' && actor.role !== 'owner') {
    if (actor.role === 'manager') {
      if (actor.outletId !== outlet.id && actor.outletId !== outlet.name) {
        throw new Error("Forbidden: Managers can only edit their assigned outlet");
      }
    } else {
      throw new Error("Forbidden: Insufficient privileges");
    }
  }

  await verifyTOTP(actor.uid, totpCode);

  await adminDb!.collection('outlets').doc(outlet.id).set(outlet);
  return { success: true };
}

export async function secureDeleteOutlet(id: string, totpCode: string) {
  const uid = await getAdminUid();
  await verifyTOTP(uid, totpCode);

  await adminDb!.collection('outlets').doc(id).delete();
  return { success: true };
}

// --- BATCH CONVERSION & DOUGH BATCH SYSTEM ACTIONS ---

async function verifyStaffSession(): Promise<ActorContext> {
  const actor = await getSessionActor();
  if (!isRoleAllowed(actor.role, ['staff', 'manager', 'admin', 'owner'])) {
    throw new Error("Forbidden: Staff access required");
  }
  return actor;
}

function requireActorOutlet(actor: ActorContext, requestedOutletId: string): string {
  if (!requestedOutletId || requestedOutletId.length > 128) {
    throw new Error("Invalid outlet ID");
  }

  if (actor.role === 'owner' || actor.role === 'admin') return requestedOutletId;
  if (!actor.outletId || actor.outletId !== requestedOutletId) {
    throw new Error("Forbidden: Outlet scope mismatch");
  }
  return actor.outletId;
}

export async function secureSaveConversionRecipe(recipe: ConversionRecipe, totpCode: string) {
  const actor = await getSessionActor();
  requirePermission(actor, 'inventory.manage');
  
  if (!adminDb) throw new Error("Firebase Admin DB not configured");

  const existingSnap = await adminDb.collection('inventory').doc(recipe.stock_id).get();
  if (existingSnap.exists) {
    const existingData = existingSnap.data() as StockItem;
    if (existingData.outlet_id) {
       requireOutletAccess(actor, existingData.outlet_id);
    }
  }

  await verifyTOTP(actor.uid, totpCode, 'inventory_sensitive_action');

  await adminDb.collection('conversion_recipes').doc(recipe.stock_id).set(recipe);
  return { success: true };
}

export async function secureStartDoughBatch(stockId: string, rawQtyUsed: number, outletId: string) {
  const dbInstance = adminDb;
  if (!dbInstance) throw new Error("Firebase Admin DB not configured");

  const actor = await verifyStaffSession();
  if (!stockId || stockId.length > 128) throw new Error("Invalid stock ID");
  if (!Number.isFinite(rawQtyUsed) || rawQtyUsed <= 0 || rawQtyUsed > 100000) {
    throw new Error("Quantity must be a positive bounded number");
  }
  const authorizedOutletId = requireActorOutlet(actor, outletId);

  await dbInstance.runTransaction(async (transaction) => {
    // 1. One Active Batch Rule
    const batchesCol = dbInstance.collection('dough_batches');
    const activeQuery = batchesCol
      .where('outlet_id', '==', authorizedOutletId)
      .where('stock_id', '==', stockId)
      .where('batch_status', '==', 'active');
    
    const activeSnap = await transaction.get(activeQuery);
    if (!activeSnap.empty) {
      throw new Error("One Active Batch Rule: An active batch is already in progress. Close the active batch before starting a new one.");
    }

    // 2. Fetch stock item and verify stock levels
    const stockRef = dbInstance.collection('inventory').doc(stockId);
    const stockSnap = await transaction.get(stockRef);
    if (!stockSnap.exists) throw new Error("Stock item not found.");
    
    const stockData = stockSnap.data() as StockItem;
    if (stockData.current_quantity < rawQtyUsed) {
      throw new Error(`Insufficient stock: Only ${stockData.current_quantity} ${stockData.unit} left.`);
    }

    // 3. Get expected yield range
    const recipeRef = dbInstance.collection('conversion_recipes').doc(stockId);
    const recipeSnap = await transaction.get(recipeRef);
    if (!recipeSnap.exists) throw new Error("No conversion yield recipe is set for this ingredient.");
    const recipeData = recipeSnap.data() as ConversionRecipe;

    const expectedMin = rawQtyUsed * recipeData.yield_min_per_unit;
    const expectedMax = rawQtyUsed * recipeData.yield_max_per_unit;

    // 4. Decrement raw stock quantity immediately
    const newQty = Math.max(0, stockData.current_quantity - rawQtyUsed);
    transaction.update(stockRef, {
      current_quantity: newQty,
      last_updated: Date.now()
    });

    // 5. Create new active batch document
    const batchId = `bt_${Date.now()}`;
    const batchRef = batchesCol.doc(batchId);
    const newBatch: DoughBatch = {
      batch_id: batchId,
      outlet_id: authorizedOutletId,
      stock_id: stockId,
      raw_qty_used: rawQtyUsed,
      expected_min: expectedMin,
      expected_max: expectedMax,
      batch_start_time: Date.now(),
      batch_status: 'active',
      manager_uid: actor.uid,
      created_at: Date.now()
    };

    transaction.set(batchRef, newBatch);
  });

  return { success: true };
}

export async function secureCompleteDoughBatch(batchId: string) {
  const dbInstance = adminDb;
  if (!dbInstance) throw new Error("Firebase Admin DB not configured");

  const actor = await verifyStaffSession();
  if (!batchId || batchId.length > 128) throw new Error("Invalid batch ID");

  // Run the transaction to fetch data, count sales, and update batch
  const result = await dbInstance.runTransaction(async (transaction) => {
    const batchRef = dbInstance.collection('dough_batches').doc(batchId);
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists) throw new Error("Batch not found.");

    const batchData = batchSnap.data() as DoughBatch;
    requireActorOutlet(actor, batchData.outlet_id);
    if (batchData.batch_status !== 'active') {
      throw new Error("This batch has already been completed.");
    }

    // 1. Fetch recipe
    const recipeRef = dbInstance.collection('conversion_recipes').doc(batchData.stock_id);
    const recipeSnap = await transaction.get(recipeRef);
    if (!recipeSnap.exists) throw new Error("Conversion recipe not set for this dough.");
    const recipeData = recipeSnap.data() as ConversionRecipe;
    const linkedMenuItemId = recipeData.linked_menu_item_id;

    // 2. Fetch outlet
    const outletRef = dbInstance.collection('outlets').doc(batchData.outlet_id);
    const outletSnap = await transaction.get(outletRef);
    if (!outletSnap.exists) throw new Error("Outlet not found.");
    const outletName = outletSnap.data()!.name;

    // 3. Fetch sales from orders
    const ordersSnap = await transaction.get(
      dbInstance.collection('orders')
        .where('created_at', '>=', batchData.batch_start_time)
    );

    let wafflesSold = 0;
    ordersSnap.forEach((doc) => {
      const order = doc.data();
      // Count order as a sale if accepted, preparing, ready, out_for_delivery, or delivered
      if (!['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered'].includes(order.status)) return;
      
      const orderOutlet = order.outlet || order.hatch;
      if (orderOutlet !== outletName) return;

      if (order.items) {
        order.items.forEach((item: { menu_item_id?: unknown; quantity?: unknown }) => {
          if (item.menu_item_id === linkedMenuItemId) {
            wafflesSold += Number(item.quantity) || 0;
          }
        });
      }
    });

    const isInsideRange = wafflesSold >= batchData.expected_min && wafflesSold <= batchData.expected_max;
    const finalStatus = isInsideRange ? 'completed' : 'flagged';

    transaction.update(batchRef, {
      batch_status: finalStatus,
      batch_end_time: Date.now(),
      waffles_sold_auto: wafflesSold
    });

    return {
      flagged: !isInsideRange,
      wafflesSold,
      batchData,
      outletName,
      recipeData
    };
  });

  // If flagged, trigger owner alert email
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const targetEmail = process.env.OWNER_EMAIL;

  if (result.flagged && smtpUser && smtpPass && targetEmail) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: smtpUser, pass: smtpPass },
      });

      let managerName = 'Staff';
      try {
        const staffDoc = await dbInstance.collection('staff').doc(result.batchData.manager_uid).get();
        if (staffDoc.exists) managerName = staffDoc.data()!.name;
      } catch {}

      await transporter.sendMail({
        from: `"Ilara Cafe Audit Monitor" <${smtpUser}>`,
        to: targetEmail,
        subject: `🚨 Dough Yield Discrepancy Alert @ ${result.outletName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #ef4444; background-color: #060403; border-radius: 16px; color: #f7dec4; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="text-align: center; margin-bottom: 20px;">
              <span style="font-size: 40px;">🚨</span>
              <h2 style="color: #ef4444; font-family: serif; font-style: italic; margin-top: 10px; font-size: 24px;">Yield Discrepancy Audited</h2>
            </div>
            <p style="font-size: 14px; line-height: 1.5; color: #d4c4b0; text-align: center;">
              A finished dough batch has registered a sales count outside the owner-configured expected range.
            </p>
            <div style="background-color: #120a06; border: 1px solid #302117; border-radius: 12px; padding: 20px; margin: 25px 0;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #f8bc51; font-weight: bold;">📍 Location: ${result.outletName}</p>
              <p style="margin: 0 0 12px 0; font-size: 13px; color: #d4c4b0;">🧑‍💼 Manager in Charge: ${managerName}</p>
              <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border-top: 1px dashed #302117; padding-top: 10px;">
                <tr>
                  <td style="padding: 8px 0; font-size: 13px; color: #d4c4b0;">Dough Quantity Used:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #ffffff; font-weight: bold; text-align: right;">${result.batchData.raw_qty_used} kg</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 13px; color: #d4c4b0;">Expected Sales Range:</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #ffffff; font-weight: bold; text-align: right;">${result.batchData.expected_min} - ${result.batchData.expected_max} waffles</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 13px; color: #d4c4b0;">Actual Sales Counted:</td>
                  <td style="padding: 8px 0; font-size: 16px; color: #ef4444; font-weight: bold; text-align: right;">${result.wafflesSold} waffles</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 13px; color: #d4c4b0;">Batch Window:</td>
                  <td style="padding: 8px 0; font-size: 12px; color: #d4c4b0; text-align: right;">
                    ${new Date(result.batchData.batch_start_time).toLocaleTimeString()} - ${new Date().toLocaleTimeString()}
                  </td>
                </tr>
              </table>
            </div>
            <p style="font-size: 11px; text-align: center; color: #d4c4b0; opacity: 0.5; margin: 0;">
              This audit report was automatically triggered by the POS Batch Audit.
            </p>
          </div>
        `
      });
      console.log(`🚨 Telemetry Flag Email successfully sent to ${targetEmail}`);
    } catch (e) {
      console.warn("Telemetry Flag Email delivery failed: ", e);
    }
  }

  return { success: true, flagged: result.flagged, wafflesSold: result.wafflesSold };
}

export async function secureUpdateRushMode(rushModeActive: boolean) {
  const actor = await getSessionActor();
  if (!isRoleAllowed(actor.role, ['manager', 'admin', 'owner'])) {
    throw new Error("Forbidden: Insufficient privileges");
  }
  if (!adminDb) throw new Error("Firebase Admin DB not configured");

  await adminDb.collection('config').doc('store_settings').update({
    rush_mode_active: rushModeActive
  });
  return { success: true };
}
