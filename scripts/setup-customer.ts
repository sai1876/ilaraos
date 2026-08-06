import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { restaurantConfig } from '../src/config/restaurant';

// Read service account from environment or file
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  console.error("Missing Firebase Admin credentials in environment variables.");
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function setupCustomer() {
  console.log(`Setting up database for ${restaurantConfig.restaurantName}...`);
  
  // 1. Setup config document
  await db.collection('config').doc('restaurant').set({
    ...restaurantConfig,
    updatedAt: new Date(),
  });
  
  console.log("Restaurant configuration saved.");
  
  // Create Owner and Manager roles placeholders or prompts
  console.log("Database initialized. Please create Owner and Manager accounts via the application or manual script.");
}

setupCustomer().catch(console.error);
