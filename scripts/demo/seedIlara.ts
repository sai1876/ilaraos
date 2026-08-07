import 'dotenv/config';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { demoDataset } from './dataset';

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!serviceAccount.projectId) {
  console.error("Missing FIREBASE_PROJECT_ID");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function seed() {
  console.log("Seeding demo data...");

  for (const staff of demoDataset.staff) {
    await db.collection('staff').doc(staff.id).set(staff);
    await db.collection('staff_directory').doc(staff.id).set({
      id: staff.id,
      employee_id: staff.employee_id || staff.id,
      name: staff.name,
      role: staff.role,
      status: staff.status || 'active',
      outlet_id: staff.outlet_id || 'main',
      assigned_hatch: staff.assigned_hatch || 'MAIN',
      demo_seed_id: 'ilara-single-restaurant-v1',
      is_demo: true
    });
  }
  console.log("Staff & Staff Directory seeded.");

  for (const item of demoDataset.menu) {
    await db.collection('menu').doc(item.item_id).set(item);
  }
  console.log("Menu seeded.");

  for (const inv of demoDataset.inventory) {
    await db.collection('inventory').doc(inv.id).set(inv);
  }
  console.log("Inventory seeded.");

  for (const outlet of demoDataset.outlets) {
    await db.collection('outlets').doc(outlet.outlet_id).set(outlet);
  }
  console.log("Outlets seeded.");

  const biCollections: (keyof typeof demoDataset)[] = [
    'orders',
    'shifts',
    'attendance',
    'documents',
    'wastage_events',
    'approvals',
    'refund_requests',
    'bi_daily_snapshots',
    'bi_revenue_daily',
    'gst_snapshots',
    'gst_reconciliations',
    'resource_snapshots',
    'resource_station_load',
    'resource_utility_usage',
    'finance_snapshots',
    'finance_supplier_payments',
    'compliance_tasks',
    'ca_reviews',
    'ai_insights'
  ];

  for (const colKey of biCollections) {
    const items = demoDataset[colKey] as any[];
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await db.collection(colKey).doc(item.id).set(item);
      }
      console.log(`${colKey} seeded.`);
    }
  }

  console.log("Seed complete.");
}

seed().catch(console.error);
