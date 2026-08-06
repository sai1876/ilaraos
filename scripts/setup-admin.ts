/**
 * setup-admin.ts
 * Creates or repairs the admin account in Firebase Auth + Firestore.
 * Also clears any existing TOTP secret so first login doesn't block.
 * Run: npx tsx scripts/setup-admin.ts
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const projectId    = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail  = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey   = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌  Missing Firebase Admin env vars in .env.local');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
}

const db   = getFirestore();
const auth = getAuth();

// ── Target admin account ──────────────────────────────────────────────
const TARGET_EMAIL    = 'hauhau0702@gmail.com';
const TARGET_PASSWORD = 'admin@011325';
const TARGET_ROLE     = 'owner';   // owner = highest privilege
const OUTLET_ID       = 'global';
const TOKEN_VERSION   = 1;

async function listAllStaffAccounts() {
  console.log('\n── Existing staff accounts in Firestore ──────────────────────');
  const staffSnap = await db.collection('staff').get();
  if (staffSnap.empty) {
    console.log('  (no staff documents found)');
  } else {
    staffSnap.forEach(doc => {
      const d = doc.data();
      console.log(`  staff/${doc.id}  email=${d.email || '—'}  role=${d.role || '—'}  status=${d.status || '—'}`);
    });
  }

  console.log('\n── Firebase Auth users (first 100) ───────────────────────────');
  const listResult = await auth.listUsers(100);
  listResult.users.forEach(u => {
    const claims = u.customClaims || {};
    console.log(`  uid=${u.uid}  email=${u.email || '—'}  role=${(claims as any).role || '—'}`);
  });
  console.log('');
}

async function ensureAdminAccount() {
  console.log(`\n── Setting up owner/admin: ${TARGET_EMAIL} ───────────────────`);

  // 1. Get or create Firebase Auth user
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(TARGET_EMAIL);
    uid = existing.uid;
    console.log(`  ✅ Auth user exists  uid=${uid}`);
    await auth.updateUser(uid, { password: TARGET_PASSWORD, emailVerified: true });
    console.log(`  ✅ Password confirmed: ${TARGET_PASSWORD}`);
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email: TARGET_EMAIL,
        password: TARGET_PASSWORD,
        emailVerified: true,
        displayName: 'Owner',
      });
      uid = created.uid;
      console.log(`  ✅ Created Firebase Auth user  uid=${uid}`);
    } else {
      throw err;
    }
  }

  // 2. Set custom claims (role=owner, token_version=1)
  await auth.setCustomUserClaims(uid, {
    role: TARGET_ROLE,
    outlet_id: OUTLET_ID,
    token_version: TOKEN_VERSION,
  });
  console.log(`  ✅ Claims: role=${TARGET_ROLE} outlet_id=${OUTLET_ID} token_version=${TOKEN_VERSION}`);

  const STAFF_ID = `admin_${uid.slice(0, 8)}`;
  const now      = Date.now();

  const batch = db.batch();

  // 3. users collection
  batch.set(db.collection('users').doc(uid), {
    uid,
    email: TARGET_EMAIL,
    role: TARGET_ROLE,
    account_status: 'active',
    created_at: now,
    updated_at: now,
  }, { merge: true });

  // 4. staff collection
  batch.set(db.collection('staff').doc(STAFF_ID), {
    id: STAFF_ID,
    auth_uid: uid,
    email: TARGET_EMAIL,
    name: 'Owner',
    role: TARGET_ROLE,
    status: 'active',
    outlet_id: OUTLET_ID,
    token_version: TOKEN_VERSION,
    created_at: now,
    updated_at: now,
  }, { merge: true });

  // 5. staff_access — keyed by uid (resolveActor checks this first)
  batch.set(db.collection('staff_access').doc(uid), {
    staff_id: STAFF_ID,
    role: TARGET_ROLE,
    status: 'active',
    outlet_id: OUTLET_ID,
    token_version: TOKEN_VERSION,
    updated_at: now,
  }, { merge: true });

  // 6. staff_directory
  batch.set(db.collection('staff_directory').doc(STAFF_ID), {
    id: STAFF_ID,
    name: 'Owner',
    role: TARGET_ROLE,
    outlet_id: OUTLET_ID,
    status: 'active',
    updated_at: now,
  }, { merge: false });

  await batch.commit();
  console.log(`  ✅ Firestore docs written (users, staff, staff_access, staff_directory)`);

  // 7. Clear TOTP secret so first login doesn't block on 2FA setup
  const secretRef = db.collection('admin_secrets').doc(uid);
  const secretDoc = await secretRef.get();
  if (secretDoc.exists) {
    await secretRef.delete();
    console.log(`  ✅ Cleared existing TOTP secret — you will set up 2FA fresh on first login`);
  } else {
    console.log(`  ℹ️  No existing TOTP secret (first time setup will prompt QR scan)`);
  }

  console.log('\n✅ Account fully provisioned!');
  console.log(`   Email:    ${TARGET_EMAIL}`);
  console.log(`   Password: ${TARGET_PASSWORD}`);
  console.log(`   Role:     ${TARGET_ROLE}`);
  console.log(`   UID:      ${uid}`);
  console.log('\n📱 IMPORTANT: On first login you MUST scan the QR code with Google Authenticator.');
  console.log('   App: Google Authenticator (iOS/Android) → tap + → Scan QR code\n');
}

async function main() {
  await listAllStaffAccounts();
  await ensureAdminAccount();
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
