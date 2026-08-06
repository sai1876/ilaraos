# Remaining Issues and Remediation Plan

Last updated: 2026-07-14

## Current baseline

- Backend, database, and first frontend security cutover are implemented locally.
- Validation currently passes: 163 unit/security tests, Firestore emulator rule tests, TypeScript, production build, and `git diff --check`.
- No production rules, indexes, migration, TTL policy, or application deployment has been performed.
- Priority order for the remaining work: security and data integrity first, then truthful UX, then performance/polish.

## Release gates — complete before production deployment

| Priority | Issue | Fix process | Verify |
|---|---|---|---|
| P0 | Deploy-gate mismatch: new Firestore indexes and rules are local only. | Review `firestore.rules` and `firestore.indexes.json`; deploy to a staging Firebase project; wait for every composite index to become `READY`; then run the rules emulator plus staging smoke tests. | Kitchen, delivery, cash, attendance, and shift queries work in staging; denied browser writes remain denied. |
| P0 | Canonical-data migration has not run against a real database. Legacy orders may lack `outlet_id`, canonical money, staff-directory links, or delivery fields. | Back up production; run the dry-run mode of `scripts/migrate-canonical-data.ts`; resolve every validation exception; run migration with an operator-approved maintenance window; retain audit output. | Re-run migration validation with zero blocking rows; login, KDS, dispatch, and delivery work for migrated records. |
| P0 | Firestore TTL policy is not configured for `delivery_locations`. The application now writes a Firestore `Timestamp`, but Firebase must be configured to delete `expires_at`. | In Firebase console or IaC, enable TTL for `delivery_locations.expires_at`; document the policy and monitor deletion lag. | Create an expired staging location; confirm it is rejected by API immediately and eventually deleted by TTL. |
| P0 | Live integration coverage is incomplete for the newly added operational APIs. | Add emulator/API tests for cash reconciliation, expense idempotency, attendance sentinels, shifts, KDS ticket projection, rider availability, delivery location expiry, and customer location projection. | Tests cover both success and cross-role/cross-outlet denials; CI runs them. |

## Security and authorization backlog

| Priority | Issue | Fix process | Verify |
|---|---|---|---|
| P0 | Scanner/biometric workflow still has browser-authoritative paths in `src/app/scanner/ScannerClient.tsx` and face-enrollment/dispatch components. Browser code must not create scan sessions, persist face descriptors, or validate dispatch passcodes. | Build server endpoints for short-lived scan sessions, server-side descriptor verification, rate-limited dispatch authorization, and auditable order dispatch. Remove direct Firestore access and any default passcode logic from browser components. | Browser cannot read/write `staff`, `scan_sessions`, biometric descriptors, or passcodes; bad scans are rate-limited; valid scan dispatch is atomic. |
| P0 | Manager/admin catalog, offer, configuration, CRM, rush-mode, and several dispatch mutations still use legacy client services that conflict with deny-by-default rules. | Inventory all direct `setDoc`, `updateDoc`, and `deleteDoc` uses in `menuService`, `offerService`, `configService`, CRM, order-management, and rider-dispatch. Replace each with an authenticated server command using role/outlet checks, Zod validation, audit events, and idempotency where applicable. | Every operational screen works with production rules enabled; static scan finds no privileged browser writes. |
| P0 | Legacy inventory/wastage flow trusts local session state and uses an inconsistent `wastage` collection name. | Remove `SESSION_BYPASS` and browser re-auth assumptions. Use existing server-side inventory adjustment/wastage endpoints only; make stock movement and wastage event one transaction; normalize all references to `wastage_events`. | A forged browser request cannot change stock; each approved wastage action produces exactly one stock movement and one audit record. |
| P1 | KDS profile modal still performs legacy/unscoped history reads and has local-only leave/alert interactions. | Create an outlet/station-scoped KDS history/leave API with a least-data projection. Replace fake success alerts with persisted commands or disabled “coming soon” controls. | Kitchen users see only their permitted station history; errors are explicit; no fake completion message remains. |
| P1 | KDS “bump ticket” is sequential per item and can partially complete a ticket on failure. | Add one batch KDS endpoint that validates all requested item IDs/stations, applies one transaction, and returns the canonical ticket state. Disable the button while pending. | Inject a failure in one item; no partial update occurs. |
| P1 | Legacy owner-provisioning source remains as commented code in `src/app/login/page.tsx`. It is not executed, but it contains obsolete browser seeding logic and hard-coded sample secrets. | Delete the commented legacy block completely. Keep only the staff login/TOTP component. Document the approved server/operator onboarding procedure separately. | Source scan finds no browser Firebase owner creation, `setDoc` seeding, or sample passcodes in login code. |
| P1 | Customer profile/address, coupon, feedback, and referral flows need a rules/API compatibility audit. Some legacy browser mutations may be denied after rules deployment. | Trace each client mutation to a matching server command; require ownership checks, payload validation, per-user rate limits, and idempotency. | Profile save, address save, feedback, referrals, and coupons all work under deployed rules without broadening client permissions. |
| P1 | Customer table/QR flow is not yet cryptographically bound to an outlet/table/session. | Replace URL-only table identifiers with signed, expiring table tokens issued by the server; validate outlet/table at order creation. | Altering a URL cannot place an order for a different table or outlet; expired tokens are rejected. |
| P1 | Sign-up can create a Firebase Auth user before the profile write fails, leaving an orphan account. | Use a server-side registration command or a recovery-safe two-step workflow with explicit incomplete-profile state and cleanup/retry. | Simulated profile failure either rolls back or produces a recoverable, non-login-capable account. |
| P1 | Referral links/reward contract are inconsistent across signup and fulfillment. | Parse and validate referral input during signup; award once only after verified fulfillment; expose one documented reward policy. | Invalid/duplicate referral requests fail safely; successful referral awards exactly once. |

## Data integrity and operations backlog

| Priority | Issue | Fix process | Verify |
|---|---|---|---|
| P1 | Cash expected balance calculation needs staging reconciliation against the actual payment/refund schema. | Confirm ledger field names/statuses for cash capture and paid cash refunds; include cash drops/float transfers if used; persist a bounded reconciliation fingerprint/source summary. | A known staging till matches manual reconciliation exactly; duplicate or missing ledger rows are detected. |
| P1 | Operational list endpoints cap results without cursor pagination (`attendance`, `shifts`, `staff-directory`, cash/expenses). | Add stable ordering, signed/validated cursor parameters, `next_cursor`, and explicit truncation metadata; use summary aggregates for dashboards. | A dataset above the old cap returns all records across pages with no duplicates/missing rows. |
| P1 | Attendance date filtering depends on outlet timezone but legacy data has no `business_date`. | Backfill `business_date` and `timezone` for old records; retain the timezone-aware range query as a transition fallback; make outlet timezone mandatory in data model. | A shift crossing UTC midnight appears on the correct local business date. |
| P1 | Cash active-till and active-attendance sentinel collections need repair tooling for interrupted/legacy sessions. | Add owner-only repair command that validates stale sentinel age against source record before clearing/rebuilding it; log every repair. | Simulate interrupted create/close; operations recover without permitting duplicate sessions. |
| P1 | Shift document IDs are deterministic, but legacy random-ID shift records can duplicate a staff/date pair. | Backfill to deterministic IDs or create uniqueness markers, detect duplicates, and require manual resolution before deleting legacy copies. | Duplicate-report query is empty after migration. |
| P1 | Delivery history must remain data-minimized as API contracts evolve. | Keep active and completed order projections separate; prohibit customer address, coordinates, phone, and payment detail from completed-history responses; add contract tests. | Rider history response contains only code, time, and permitted operational summary fields. |
| P1 | Assignment/offline race prevention relies on the staff-directory record. | Ensure every dispatch path reads/writes the same canonical staff-directory document in its transaction; remove legacy dispatch paths. | Concurrent offline and assignment attempts cause one transaction to retry/lose safely. |

## Customer UX, correctness, and privacy backlog

| Priority | Issue | Fix process | Verify |
|---|---|---|---|
| P1 | Menu and offers services can present mock data after a production read failure, creating false availability, prices, and promos. | Remove production mock fallbacks. Return typed errors and render an offline/retry state. Keep fixtures only in tests/storybook/development behind an explicit flag. | Disable Firestore in staging; customers see “menu temporarily unavailable,” not purchasable mock items. |
| P1 | Home page displays hard-coded open status and preparation time. | Source open/closed state and preparation ETA from a server-controlled outlet config; label unavailable data clearly. | Closing an outlet changes customer messaging without a frontend release. |
| P1 | Sold-out item cards remain clickable because the parent card handles click. | Do not attach the add action to unavailable cards; use a non-button card or guard `onAdd` with `item.is_available`; add `aria-disabled`. | Clicking a sold-out card never adds it to cart. |
| P1 | Customer delivery map sends coordinates to third-party OSRM/Google services without a product disclosure. | Add an in-product privacy notice before first map use, document vendors/purpose/retention, and consider a self-hosted routing provider. | Consent/disclosure is visible and stored; privacy policy matches actual requests. |
| P1 | Live tracking should show clear stale/offline/no-location states. | Use `updated_at` from the assignment-scoped route API; show last update, retry, and “location temporarily unavailable” rather than a static map. | Stop rider updates; customer sees a truthful stale state within the chosen threshold. |
| P1 | Profile data is persisted in browser storage. | Minimize persisted Zustand fields; do not store addresses/email/rewards unless essential; clear state on logout and set a retention policy. | Inspect local storage after logout; sensitive profile fields are absent. |
| P2 | Social, CRM, leave, alerts, and some order-management controls are demo/local-only. | Either implement a durable server-backed workflow or label and disable the control until implemented. | No UI reports success unless a server acknowledgement is received. |
| P2 | Protected-route failure states need consistent redirect/error UX on mobile and slow networks. | Add a reusable authenticated-page boundary with timeout, retry, and logout/account controls; test unauthenticated and expired-cookie paths. | No indefinite spinner; every protected route gives a clear recovery path. |
| P2 | Dialogs, icon buttons, toggle controls, map markers, and cards need a full accessibility pass. | Add accessible names, keyboard behavior, focus trapping/restoration, `aria-modal`, visible focus, and reduced-motion coverage. | Run axe plus keyboard-only journey tests with no critical violations. |

## Performance and maintainability backlog

| Priority | Issue | Fix process | Verify |
|---|---|---|---|
| P2 | `/admin` and `/manager` first-load bundles are approximately 382–404 KB because every panel is imported eagerly. | Split panels with `next/dynamic` and load on tab selection; prefetch only likely next panels. | Lighthouse/Web Vitals and build stats show a materially smaller initial bundle. |
| P2 | Scanner build emits a `face-api` critical-dependency warning. | Isolate face API in a browser-only dynamic module or replace the dependency/import pattern with a documented bundler-safe adapter. | Production build contains no scanner critical-dependency warning and scanner still initializes on supported devices. |
| P2 | Several routes use raw `<img>` and produce Next.js image warnings. | Use `next/image` for local/approved remote images, configure remote patterns, and retain meaningful `alt` text. | Build has no image warnings; LCP is measured before/after. |
| P2 | Folder/service boundaries remain mixed between legacy Firebase client services and server commands. | Adopt `src/server/<domain>` for authority/invariants, `src/app/api/<domain>` for transport, `src/features/<domain>` for UI adapters, and delete dead legacy exports only after callers migrate. | `rg` shows no privileged direct Firestore access from client routes; each domain has clear ownership. |

## Recommended execution order

1. Finish the production release gates and add API regression tests.
2. Replace scanner, dispatch, inventory, catalog/configuration, and KDS-profile legacy browser paths.
3. Complete customer integrity/privacy work: table tokens, signup/referrals, no mock outage fallback, truthful tracking.
4. Add pagination/repair tooling and run canonical migration in staging, then production.
5. Run accessibility, mobile journey, and performance work; only then treat the frontend phase as complete.

## Required checks for every item

1. Add a focused automated test for the failure mode and authorization boundary.
2. Run `npm run typecheck`, the related Vitest tests, and scoped ESLint.
3. Run `npm run db:rules:test` if Firestore access/rules are touched.
4. Use a mobile and desktop browser journey for any user-facing change.
5. Run `npm run build` before merging or deploying.
