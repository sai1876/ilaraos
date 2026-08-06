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
  }
  console.log("Staff seeded.");

  for (const item of demoDataset.menu) {
    await db.collection('menu').doc(item.item_id).set(item);
  }
  console.log("Menu seeded.");

  for (const inv of demoDataset.inventory) {
    await db.collection('inventory').doc(inv.id).set(inv);
  }
  console.log("Inventory seeded.");

  console.log("Seed complete.");
}

seed().catch(console.error);
