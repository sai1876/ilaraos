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
  const staffId = 'st_1779623007325';
  const sid = 'scan_mrlfno30zu8q5';
  console.log("Simulating verify transaction...");
  
  await db.runTransaction(async transaction => {
    console.log("Inside transaction...");
    const privateRef = db.collection('staff_private').doc(staffId);
    const directoryRef = db.collection('staff_directory').doc(staffId);
    const sessionRef = db.collection('scan_sessions').doc(sid);
    
    transaction.set(privateRef, {
      updated_at: Date.now()
    }, { merge: true });
    
    transaction.set(directoryRef, {
      face_enrolled: true,
      updated_at: Date.now()
    }, { merge: true });
    
    transaction.update(sessionRef, {
      status: 'success',
      updated_at: Date.now()
    });
    console.log("Transaction operations queued...");
  });
  console.log("Transaction committed successfully!");
}

run().catch(console.error);
