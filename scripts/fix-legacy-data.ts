import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
}
const db = getFirestore();

async function run() {
  console.log("Starting database repairs...");

  // 1. Create hyd_campus outlet
  console.log("Checking if hyd_campus outlet exists...");
  const hydCampusRef = db.collection('outlets').doc('hyd_campus');
  const hydCampusSnap = await hydCampusRef.get();
  console.log("Setting hyd_campus outlet...");
  await hydCampusRef.set({
    id: 'hyd_campus',
    outlet_id: 'hyd_campus',
    name: 'HYD CAMPUS',
    address: 'IIIT Hyderabad Campus, Gachibowli, Hyderabad, Telangana 500032',
    latitude: 17.4482,
    longitude: 78.3489,
    status: 'active',
    hatches: ['HYD OASIS', 'CANOPY'],
    created_at: 1779560154908
  });
  console.log("hyd_campus outlet configured.");

  // 2. Repair order P6L764DW
  console.log("Repairing order P6L764DW...");
  await db.collection('orders').doc('P6L764DW').update({
    outlet_id: 'out_1779560154908',
    platform_fee: 5,
    platform_fee_paise: 500,
    subtotal_amount: 60,
    subtotal_amount_paise: 6000
  });

  // 3. Repair order RD1QRR11
  console.log("Repairing order RD1QRR11...");
  await db.collection('orders').doc('RD1QRR11').update({
    outlet_id: 'out_1779560154908',
    platform_fee: 5,
    platform_fee_paise: 500,
    subtotal_amount: 60,
    subtotal_amount_paise: 6000
  });

  // 4. Repair order XRNQIIRB
  console.log("Repairing order XRNQIIRB...");
  await db.collection('orders').doc('XRNQIIRB').update({
    outlet_id: 'out_1779560154908',
    platform_fee: 5,
    platform_fee_paise: 500,
    subtotal_amount: 60,
    subtotal_amount_paise: 6000,
    promo_discount: 9,
    promo_discount_paise: 900
  });

  // 5. Create missing payment ledger entry for vSMuc5oAI7UpEHcJcaU5
  console.log("Creating payment ledger entry for vSMuc5oAI7UpEHcJcaU5...");
  const paymentLedgerRef = db.collection('payment_ledger').doc('pay_vSMuc5oAI7UpEHcJcaU5');
  await paymentLedgerRef.set({
    order_id: 'vSMuc5oAI7UpEHcJcaU5',
    status: 'captured',
    amount: 65,
    amount_paise: 6500,
    outlet_id: 'out_1779560154908',
    user_id: 'DpSX5euzVGfspnvZVxEqERzu2X23',
    created_at: 1783593422684
  });

  console.log("Database repairs completed successfully.");
}

run().catch(console.error);
