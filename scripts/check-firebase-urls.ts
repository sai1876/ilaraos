import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config();

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

async function checkStorageUrls() {
  console.log("Checking Firestore for existing Firebase Storage URLs...");
  
  let menuCount = 0;
  let atmosphereCount = 0;
  let evidenceCount = 0;
  let otherCount = 0;

  // Check Menu
  const menuSnapshot = await db.collection('menu').get();
  menuSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.image_url && data.image_url.includes('firebasestorage')) {
      menuCount++;
    }
  });

  // Check config/atmosphere
  const configSnapshot = await db.collection('config').doc('restaurant').get();
  if (configSnapshot.exists) {
    const data = configSnapshot.data() || {};
    const atm = data.ui_atmosphere || {};
    const assets = [
      atm.logo_url,
      atm.banner_url,
      atm.background_url,
      ...(atm.custom_assets || [])
    ];
    assets.forEach(url => {
      if (typeof url === 'string' && url.includes('firebasestorage')) {
        atmosphereCount++;
      }
    });
  }

  console.log(`Menu images: ${menuCount}`);
  console.log(`UI atmosphere assets: ${atmosphereCount}`);
  
  const total = menuCount + atmosphereCount + evidenceCount + otherCount;
  if (total === 0) {
    console.log("No existing Firebase Storage URLs found. Target deployment is fresh.");
  }
}

checkStorageUrls().catch(console.error);
