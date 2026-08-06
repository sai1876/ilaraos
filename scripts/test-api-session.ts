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
  const sid = 'scan_mrlfno30zu8q5';
  console.log("Running GET session API logic simulation...");
  const sessionSnap = await db.collection('scan_sessions').doc(sid).get();
  if (!sessionSnap.exists) {
    console.log("Session not found!");
    return;
  }
  const data = sessionSnap.data()!;
  console.log("Session data:", data);
  
  const targetId = data.type === 'enroll' ? data.staff_id : data.rider_id;
  console.log("Target ID:", targetId);
  
  console.log("Fetching staff_directory doc...");
  const staffDirectorySnap = await db.collection('staff_directory').doc(targetId).get();
  const staffName = staffDirectorySnap.exists ? staffDirectorySnap.data()?.name : 'Unknown Staff';
  console.log("Staff Name:", staffName);
}
run().catch(console.error);
