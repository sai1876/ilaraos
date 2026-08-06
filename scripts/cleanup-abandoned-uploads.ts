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

const isDryRun = process.argv.includes('--dry-run');

async function cleanupAbandonedUploads() {
  console.log(`Starting cleanup of abandoned uploads... ${isDryRun ? '(DRY RUN)' : ''}`);
  
  const now = new Date();
  
  // Find uploading documents where upload_expires_at is in the past
  const snapshot = await db.collection('documents')
    .where('status', '==', 'uploading')
    .where('upload_expires_at', '<', now)
    .get();
    
  console.log(`Found ${snapshot.size} expired uploading documents.`);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Never process available or finalized
    if (data.status !== 'uploading') {
      continue;
    }
    
    console.log(`Processing abandoned document: ${data.document_id} (${data.object_path})`);
    
    if (!isDryRun) {
      try {
        // Try to remove object from Supabase in case it was uploaded but not confirmed
        if (data.bucket && data.object_path) {
           await supabaseAdmin.storage
              .from(data.bucket)
              .remove([data.object_path]);
        }
        
        // Mark metadata as expired
        await doc.ref.update({
          status: 'expired',
          failure_reason: 'Abandoned upload',
          updated_at: new Date()
        });
        console.log(`Document ${data.document_id} marked as expired and object deleted (if existed).`);
      } catch (error: any) {
        console.error(`Failed to cleanup ${data.document_id}:`, error.message);
      }
    }
  }
  
  console.log("Cleanup finished.");
}

cleanupAbandonedUploads().catch(console.error);
