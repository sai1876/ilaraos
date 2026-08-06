import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { restaurantConfig } from '../src/config/restaurant';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

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

  // Supabase Demo Seeding
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Seeding demo files to Supabase...");
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Create a mock demo file document
    const demoDocId = "demo-menu-image-1";
    const bucket = "ilara-public-media";
    const objectPath = `main/demo/ilara-single-restaurant-v1/${demoDocId}/sample.jpg`;
    
    // We would actually upload a file here. For the setup script, we will just create the metadata
    // assuming the file either doesn't exist yet or is uploaded separately by a real seed script.
    // We'll upload a tiny 1x1 transparent png for completeness.
    const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(objectPath, transparentPng, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.warn("Failed to seed demo file to Supabase:", uploadError.message);
    } else {
      await db.collection('documents').doc(demoDocId).set({
        document_id: demoDocId,
        outlet_id: 'default',
        category: 'menu',
        related_entity_type: 'menu',
        related_entity_id: 'demo-item-1',
        bucket,
        object_path: objectPath,
        original_filename: 'sample.png',
        stored_filename: 'sample.png',
        mime_type: 'image/png',
        size_bytes: transparentPng.length,
        access_level: 'public',
        uploaded_by: 'system_seed',
        uploaded_by_role: 'admin',
        uploaded_at: new Date(),
        confirmed_at: new Date(),
        version: 1,
        status: 'available',
        is_demo: true,
        demo_seed_id: 'ilara-single-restaurant-v1'
      });
      console.log("Demo files seeded successfully.");
    }
  }

  // Create Owner and Manager roles placeholders or prompts
  console.log("Database initialized. Please create Owner and Manager accounts via the application or manual script.");
}

setupCustomer().catch(console.error);
