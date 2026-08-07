import { adminDb } from '../src/lib/firebaseAdmin';

async function run() {
  const byEmail = await adminDb!.collection('staff').where('email', '==', 'manager1@gmail.com').get();
  byEmail.forEach(doc => {
    console.log('Staff doc:', doc.id, doc.data());
  });

  const byAuthEmail = await adminDb!.collection('users').where('email', '==', 'manager1@gmail.com').get();
  byAuthEmail.forEach(doc => {
    console.log('User doc:', doc.id, doc.data());
  });
}

run().catch(console.error);
