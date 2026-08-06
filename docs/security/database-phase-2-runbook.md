# Database Phase 2 migration runbook

Status: implementation validated locally; no database migration or rules deployment has been executed.

## Preconditions

1. Take and verify a managed Firestore backup. The operational XLSX export is not a disaster-recovery backup.
2. Configure Firebase Admin credentials in `.env.local`.
3. Configure a current encryption version and keys. Keep old versions in the keyring until all records are re-encrypted:

   - `STAFF_PRIVATE_KEY_VERSION`
   - `STAFF_PRIVATE_ENCRYPTION_KEYS` as a JSON object from version to base64 32-byte key
   - `STAFF_PASSCODE_PEPPER` as a separate secret of at least 32 bytes

4. Finish the frontend/server-command cutover for cash sessions, expenses, attendance, shifts, staff scanning, and other direct client writes before deploying the deny-write rules.

## Required sequence

1. Run `npm run typecheck`, `npm run typecheck:scripts`, and the full test suite.
2. Run `npm run db:migrate:dry-run`.
3. Resolve every `blocking_issues` count. The apply path refuses unresolved identities, outlet conflicts, malformed money, accounting mismatches, missing keys, orphan access records, and incomplete scans.
4. Record the dry-run `manifest_hash` and independently verify the Firebase project ID.
5. Apply only with both confirmations:

   `npx tsx scripts/migrate-canonical-data.ts --apply --confirm-project=<project-id> --confirm-manifest=<dry-run-hash>`

   The apply path acquires an exclusive 15-minute lease and verifies every target document's scanned update time inside a transaction. If a runner stops, wait for the lease to expire, run a fresh dry-run, then explicitly continue with:

   `npx tsx scripts/migrate-canonical-data.ts --apply --confirm-project=<project-id> --confirm-manifest=<new-dry-run-hash> --resume-run=<unfinished-manifest-hash>`

6. Run the dry-run again. It must report no blockers and no unexpected writes.
7. Validate Firestore rules against the emulator, deploy indexes, wait until indexes are ready, then deploy rules.
8. Execute role/outlet/customer isolation tests and the critical order/payment/refund/closing journeys before release.

The apply path journals progress in the server-only `migration_runs` collection and holds its lease in the server-only `migration_locks` collection. Every repository claim writer also uses a per-user server-only `auth_claim_locks` lease, and migration claims are compared with the scanned values while holding that lease. Claims are staged before `staff_access`; claims are non-authoritative without the access document. Sensitive plaintext removal and encrypted-record creation share one Firestore transaction group. Never force two migration runners to overlap.

## Key rotation

Add the new key to `STAFF_PRIVATE_ENCRYPTION_KEYS`, set it as `STAFF_PRIVATE_KEY_VERSION`, then run the dry-run with `--rotate-encryption`. After an applied rotation and a clean validation run, retain the prior key until backups containing the old version have expired under the approved retention policy.

## Rollback boundary

Do not use a source-code rollback as a data rollback. If reconciliation fails after apply, stop writes, preserve `migration_runs`, and restore from the verified managed backup or complete a forward repair. Never reintroduce plaintext biometric, TOTP, salary, or passcode fields.
