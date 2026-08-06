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
  const targetIds = ['P6L764DW', 'RD1QRR11', 'XRNQIIRB', 'vSMuc5oAI7UpEHcJcaU5'];
  for (const id of targetIds) {
    const doc = await db.collection('orders').doc(id).get();
    if (doc.exists) {
      console.log(`Order ${id}:`, JSON.stringify(doc.data(), null, 2));
    } else {
      console.log(`Order ${id} not found.`);
    }
  }
}

run().catch(console.error);
