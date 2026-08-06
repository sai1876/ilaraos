import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function resetDemo() {
  console.log("Resetting Demo Files...");
  
  const DEMO_SEED_ID = "ilara-single-restaurant-v1";
  const DEMO_PREFIX = "main/demo/ilara-single-restaurant-v1/";
  const BUCKETS = ['ilara-public-media', 'ilara-private-files'];
  
  // 1. Delete objects under demo prefix from both buckets
  for (const bucket of BUCKETS) {
    console.log(`Checking bucket ${bucket} for demo files...`);
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(DEMO_PREFIX);
    
    if (error) {
      console.warn(`Failed to list demo files in ${bucket}:`, error.message);
      continue;
    }
    
    if (data && data.length > 0) {
      const pathsToRemove = data.map(file => `${DEMO_PREFIX}${file.name}`);
      console.log(`Removing ${pathsToRemove.length} demo files from ${bucket}...`);
      
      const { error: removeError } = await supabaseAdmin.storage.from(bucket).remove(pathsToRemove);
      if (removeError) {
        console.error(`Failed to remove demo files from ${bucket}:`, removeError.message);
      } else {
        console.log(`Removed demo files from ${bucket} successfully.`);
      }
    }
  }

  // 2. Delete Firestore documents with the exact demo_seed_id
  console.log("Removing demo document metadata from Firestore...");
  const snapshot = await db.collection('documents')
    .where('is_demo', '==', true)
    .where('demo_seed_id', '==', DEMO_SEED_ID)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  console.log(`Removed ${snapshot.size} demo documents from Firestore.`);
  
  console.log("Demo reset complete.");
}

resetDemo().catch(console.error);
