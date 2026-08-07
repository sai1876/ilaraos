import readline from 'readline';
import { adminAuth, adminDb } from '../src/lib/firebaseAdmin';

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return null;
}

const hasYesFlag = process.argv.includes('--yes') || process.argv.includes('-y');
const email = getArgValue('--email');

if (!email) {
  console.error('Usage: npx ts-node scripts/auth/reset-staff-totp.ts --email <staff-email> [--yes]');
  process.exit(1);
}

async function confirmPrompt(query: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${query} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function runReset() {
  if (!adminAuth || !adminDb) {
    console.error('Firebase Admin SDK is not initialized. Ensure environment variables are loaded.');
    process.exit(1);
  }

  console.log(`\nResolving staff user for email: ${email}`);

  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(email);
  } catch (err: any) {
    console.error(`Firebase Auth user not found for email '${email}':`, err?.message || err);
    process.exit(1);
  }

  const uid = userRecord.uid;

  // Resolve matching staff or staff_access doc
  let staffId = uid;
  let role = 'staff';

  const accessDoc = await adminDb.collection('staff_access').doc(uid).get();
  if (accessDoc.exists) {
    const data = accessDoc.data();
    staffId = data?.staff_id || uid;
    role = data?.role || role;
  } else {
    const staffDoc = await adminDb.collection('staff').doc(uid).get();
    if (staffDoc.exists) {
      const data = staffDoc.data();
      staffId = staffDoc.id;
      role = data?.role || role;
    }
  }

  console.log('\n========================================');
  console.log('STAFF TOTP RESET CONFIRMATION');
  console.log('========================================');
  console.log(`Firebase UID: ${uid}`);
  console.log(`Staff ID:     ${staffId}`);
  console.log(`Role:         ${role}`);
  console.log(`Email:        ${email}`);
  console.log('========================================\n');

  if (!hasYesFlag) {
    const confirmed = await confirmPrompt('Are you sure you want to reset TOTP 2FA for this staff account?');
    if (!confirmed) {
      console.log('TOTP reset cancelled.');
      process.exit(0);
    }
  }

  // Delete ONLY admin_secrets/{uid}
  const secretRef = adminDb.collection('admin_secrets').doc(uid);
  const secretDoc = await secretRef.get();

  if (!secretDoc.exists) {
    console.log(`No existing TOTP secret document found at admin_secrets/${uid}. Account is already un-enrolled.`);
  } else {
    await secretRef.delete();
    console.log(`Successfully deleted admin_secrets/${uid}.`);
  }

  // Record audit log in business_events
  try {
    const auditDocId = `totp_reset_${uid}_${Date.now()}`;
    await adminDb.collection('business_events').doc(auditDocId).set({
      event_id: auditDocId,
      event_type: 'staff_totp_reset',
      actor_type: 'admin',
      actor_id: 'maintenance_script',
      target_type: 'staff',
      target_id: uid,
      severity: 'warning',
      source: 'admin_panel',
      metadata: {
        reason: 'Lost encryption key or explicit admin TOTP reset',
        staff_id: staffId,
        role: role,
      },
      created_at: new Date(),
    });
    console.log('Audit event recorded in business_events.');
  } catch (auditErr) {
    console.error('Warning: Failed to record audit event:', auditErr);
  }

  console.log('\nTOTP reset complete. The staff member can now log in with their password and re-enroll 2FA.');
  process.exit(0);
}

runReset().catch((err) => {
  console.error('Fatal error during TOTP reset:', err);
  process.exit(1);
});
