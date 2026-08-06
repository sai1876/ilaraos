import { rateLimitDurable } from '../src/lib/rateLimit';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  console.log("Testing rateLimitDurable...");
  const res = await rateLimitDurable('test-identifier', 5, 60_000);
  console.log("Result:", JSON.stringify(res, null, 2));
}

run().catch(console.error);
