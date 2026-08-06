import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BUCKETS = [
  {
    name: 'ilara-private-files',
    public: false,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ],
    fileSizeLimit: 15728640 // 15MB
  },
  {
    name: 'ilara-public-media',
    public: true,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp'
    ],
    fileSizeLimit: 8388608 // 8MB
  }
];

async function setupSupabaseStorage() {
  console.log("Setting up Supabase Storage Buckets...");
  
  const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Failed to list buckets:", listError.message);
    process.exit(1);
  }

  const existingBucketNames = existingBuckets.map(b => b.name);

  for (const bucketConfig of BUCKETS) {
    if (!existingBucketNames.includes(bucketConfig.name)) {
      console.log(`Creating bucket: ${bucketConfig.name}...`);
      const { error: createError } = await supabase.storage.createBucket(bucketConfig.name, {
        public: bucketConfig.public,
        allowedMimeTypes: bucketConfig.allowedMimeTypes,
        fileSizeLimit: bucketConfig.fileSizeLimit
      });

      if (createError) {
        console.error(`Failed to create bucket ${bucketConfig.name}:`, createError.message);
      } else {
        console.log(`Bucket ${bucketConfig.name} created successfully.`);
      }
    } else {
      console.log(`Bucket ${bucketConfig.name} already exists. Updating configuration...`);
      const { error: updateError } = await supabase.storage.updateBucket(bucketConfig.name, {
        public: bucketConfig.public,
        allowedMimeTypes: bucketConfig.allowedMimeTypes,
        fileSizeLimit: bucketConfig.fileSizeLimit
      });

      if (updateError) {
        console.error(`Failed to update bucket ${bucketConfig.name}:`, updateError.message);
      } else {
        console.log(`Bucket ${bucketConfig.name} configuration updated.`);
      }
    }
  }

  console.log("Supabase Storage setup complete.");
}

setupSupabaseStorage().catch(console.error);
