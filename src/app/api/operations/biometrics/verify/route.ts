// [INTERNAL] - Biometric verification
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  decryptField,
  encryptField,
  fieldAad,
  fieldEncryptionKeyVersion,
  getConfiguredFieldEncryptionKey,
  getFieldEncryptionKey
} from '@/server/crypto/fieldEncryption';
import { rateLimitDurable } from '@/lib/rateLimit';

function euclideanDistance(arr1: number[], arr2: number[]): number {
  if (arr1.length !== arr2.length) return 1.0;
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    const diff = arr1[i] - arr2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export async function POST(req: Request) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // App Check validation
    const appCheckToken = req.headers.get('x-firebase-appcheck');
    if (process.env.NODE_ENV === 'production' && process.env.APP_CHECK_REQUIRED === 'true') {
      if (!appCheckToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      try {
        const admin = require('firebase-admin');
        await admin.appCheck().verifyToken(appCheckToken);
      } catch (err) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { session_id, descriptor } = body;
    if (!session_id || !Array.isArray(descriptor)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Validate face descriptor dimensions (must be exactly 128 elements)
    if (descriptor.length !== 128) {
      return NextResponse.json({ error: 'Invalid descriptor format' }, { status: 400 });
    }

    // Reject NaN, Infinity and check numbers
    const allValid = descriptor.every(num => typeof num === 'number' && Number.isFinite(num) && !Number.isNaN(num));
    if (!allValid) {
      return NextResponse.json({ error: 'Invalid descriptor elements' }, { status: 400 });
    }

    const sessionRef = adminDb.collection('scan_sessions').doc(session_id);

    // Rate limit verification attempts by session ID
    const limit = await rateLimitDurable(`biometric-verify:${session_id}`, 10, 5 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many verification attempts' }, { status: 429 });
    }

    // Process session verification inside a transaction to prevent replay attacks and race conditions
    const result = await adminDb.runTransaction(async (transaction) => {
      const sessionSnap = await transaction.get(sessionRef);
      if (!sessionSnap.exists) {
        return { error: 'Session not found', status: 404 };
      }

      const sessionData = sessionSnap.data()!;
      if (sessionData.status !== 'pending') {
        return { error: 'Session already completed', status: 410 };
      }

      if (sessionData.expires_at <= Date.now()) {
        return { error: 'Session expired', status: 410 };
      }

      if (sessionData.type === 'enroll') {
        const staffId = sessionData.staff_id;
        if (!staffId) {
          return { error: 'Staff ID missing from session', status: 400 };
        }

        // Encrypt face descriptor and store in staff_private
        const key = getConfiguredFieldEncryptionKey();
        const encrypted = encryptField(
          descriptor,
          key,
          fieldAad('staff_private', staffId, 'face_descriptor')
        );

        // Update staff_private
        transaction.set(adminDb!.collection('staff_private').doc(staffId), {
          staff_id: staffId,
          key_version: fieldEncryptionKeyVersion(),
          schema_version: 1,
          encrypted_fields: {
            face_descriptor: encrypted
          },
          updated_at: Date.now()
        }, { merge: true });

        // Mark biometrics enrolled in staff_directory for client-side visibility
        transaction.set(adminDb!.collection('staff_directory').doc(staffId), {
          face_enrolled: true,
          updated_at: Date.now()
        }, { merge: true });

        // Update session status
        transaction.update(sessionRef, {
          status: 'success',
          updated_at: Date.now()
        });

        return { success: true, message: 'Biometrics enrolled successfully' };
      }

      if (sessionData.type === 'verify') {
        const riderId = sessionData.rider_id;
        if (!riderId) {
          return { error: 'Rider ID missing from session', status: 400 };
        }

        let storedDescriptor: number[] | null = null;

        // Try staff_private encrypted
        const privateSnap = await transaction.get(adminDb!.collection('staff_private').doc(riderId));
        if (privateSnap.exists) {
          const privateData = privateSnap.data()!;
          if (privateData.encrypted_fields?.face_descriptor) {
            try {
              storedDescriptor = decryptField<number[]>(
                privateData.encrypted_fields.face_descriptor,
                getFieldEncryptionKey(privateData.encrypted_fields.face_descriptor.key_version),
                fieldAad('staff_private', riderId, 'face_descriptor')
              );
            } catch (decryptErr) {
              console.error("Failed to decrypt face descriptor:", decryptErr);
            }
          } else if (Array.isArray(privateData.face_descriptor)) {
            storedDescriptor = privateData.face_descriptor;
          }
        }

        // Fallback to staff collection (legacy format)
        if (!storedDescriptor) {
          const staffSnap = await transaction.get(adminDb!.collection('staff').doc(riderId));
          if (staffSnap.exists) {
            const staffData = staffSnap.data()!;
            if (Array.isArray(staffData.faceDescriptor)) {
              storedDescriptor = staffData.faceDescriptor;
            }
          }
        }

        if (!storedDescriptor) {
          transaction.update(sessionRef, { status: 'failed', updated_at: Date.now() });
          return { error: 'Rider has no enrolled biometrics', status: 400 };
        }

        const distance = euclideanDistance(descriptor, storedDescriptor);
        const matched = distance < 0.55;

        if (matched) {
          transaction.update(sessionRef, {
            status: 'success',
            updated_at: Date.now()
          });
          return { success: true, matched: true };
        } else {
          const nextAttempts = (sessionData.attempts || 0) + 1;
          const failed = nextAttempts >= 5;
          transaction.update(sessionRef, {
            attempts: nextAttempts,
            status: failed ? 'failed' : 'pending',
            updated_at: Date.now()
          });
          return {
            success: false,
            matched: false,
            attempts: nextAttempts,
            failed,
            error: 'Biometric verification failed',
            status: 400
          };
        }
      }

      return { error: 'Invalid session state', status: 400 };
    });

    if (result.error) {
      return NextResponse.json({ error: result.error, matched: result.matched, attempts: result.attempts, failed: result.failed }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[biometric-verify] POST failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
