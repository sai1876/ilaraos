import assert from 'node:assert/strict';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getIdToken,
  signInAnonymously,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-cafe-claude';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!firestoreHost || !authHost) throw new Error('Run this script through Firebase emulators:exec');

const adminApp = initializeAdminApp({ projectId }, 'rules-admin');
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

async function client(name) {
  const app = initializeApp({ projectId, apiKey: 'demo-api-key' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const user = (await signInAnonymously(auth)).user;
  const firestore = getFirestore(app);
  const [host, port] = firestoreHost.split(':');
  connectFirestoreEmulator(firestore, host, Number(port));
  return { app, auth, user, firestore };
}

const manager = await client('rules-manager');
const customer = await client('rules-customer');

await adminAuth.setCustomUserClaims(manager.user.uid, { token_version: 1 });
await getIdToken(manager.user, true);

await Promise.all([
  adminDb.collection('staff_access').doc(manager.user.uid).set({
    staff_id: 'manager-1', role: 'manager', status: 'active', outlet_id: 'outlet-a', token_version: 1,
  }),
  adminDb.collection('orders').doc('order-a').set({ user_id: customer.user.uid, outlet_id: 'outlet-a' }),
  adminDb.collection('orders').doc('order-b').set({ user_id: 'another-customer', outlet_id: 'outlet-b' }),
  adminDb.collection('point_ledger').doc('points-a').set({ user_id: customer.user.uid, amount: 100, source: 'welcome_bonus' }),
  adminDb.collection('point_ledger').doc('points-b').set({ user_id: 'another-customer', amount: 50, source: 'referral_bonus' }),
  adminDb.collection('users').doc(customer.user.uid).set({ user_id: customer.user.uid, name: 'Customer' }),
  adminDb.collection('staff_private').doc('manager-1').set({ encrypted_fields: { salary: 'ciphertext' } }),
  adminDb.collection('migration_locks').doc('canonical-data-v2').set({ status: 'in_progress' }),
  adminDb.collection('auth_claim_locks').doc('claim-lock').set({ status: 'in_progress' }),
]);

assert.equal((await getDoc(doc(manager.firestore, 'orders', 'order-a'))).exists(), true);
await assert.rejects(getDoc(doc(manager.firestore, 'orders', 'order-b')), /permission|PERMISSION/i);
await assert.rejects(setDoc(doc(manager.firestore, 'orders', 'manager-write'), {
  user_id: manager.user.uid, outlet_id: 'outlet-a', gross_amount: 1,
}), /permission|PERMISSION/i);
await assert.rejects(getDoc(doc(manager.firestore, 'staff_private', 'manager-1')), /permission|PERMISSION/i);
await assert.rejects(getDoc(doc(manager.firestore, 'migration_locks', 'canonical-data-v2')), /permission|PERMISSION/i);
await assert.rejects(getDoc(doc(manager.firestore, 'auth_claim_locks', 'claim-lock')), /permission|PERMISSION/i);

assert.equal((await getDoc(doc(customer.firestore, 'orders', 'order-a'))).exists(), true);
await assert.rejects(getDoc(doc(customer.firestore, 'orders', 'order-b')), /permission|PERMISSION/i);
const ownLedger = await getDocs(query(
  collection(customer.firestore, 'point_ledger'),
  where('user_id', '==', customer.user.uid),
));
assert.equal(ownLedger.size, 1);
await assert.rejects(getDocs(query(
  collection(customer.firestore, 'point_ledger'),
  where('user_id', '==', 'another-customer'),
)), /permission|PERMISSION/i);
await assert.rejects(setDoc(doc(customer.firestore, 'point_ledger', 'customer-write'), {
  user_id: customer.user.uid, amount: 999, source: 'client_write',
}), /permission|PERMISSION/i);
await updateDoc(doc(customer.firestore, 'users', customer.user.uid), { name: 'Updated Customer' });
await assert.rejects(updateDoc(doc(customer.firestore, 'users', customer.user.uid), {
  student_email: 'unverified@example.test',
}), /permission|PERMISSION/i);

await Promise.all([deleteApp(manager.app), deleteApp(customer.app), deleteAdminApp(adminApp)]);
console.log('Firestore authorization tests passed.');
