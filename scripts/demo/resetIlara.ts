import 'dotenv/config';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_SEED_ID } from './manifest';

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

const collectionsToClean = [
  'staff',
  'staff_directory',
  'menu',
  'inventory',
  'outlets',
  'orders',
  'shifts',
  'attendance',
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
  'ca_document_requests',
  'ai_insights'
];

async function reset() {
  console.log(`Resetting demo data for seed id: ${DEMO_SEED_ID}...`);

  for (const collection of collectionsToClean) {
    const snapshot = await db.collection(collection)
      .where('demo_seed_id', '==', DEMO_SEED_ID)
      .get();
    
    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`Deleted ${snapshot.size} documents from ${collection}.`);
    } else {
      console.log(`No demo records found in ${collection}.`);
    }
  }

  console.log("Reset complete.");
}

reset().catch(console.error);
