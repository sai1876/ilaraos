# Ilara Cafe — Product Specification

Status: FINALIZED

## 1. Vision & Product Goals
Ilara Cafe is a campus dining application that combines premium cafe luxury with highly precise, reliable, and secure UI interactions. The application serves both customers (for table/pickup/delivery ordering) and kitchen/rider staff.

Goals:
- **Premium Light Design:** Clean typographic UI utilizing Outfit and Plus Jakarta Sans with a warm light palette (`#FAF7F2` canvas, `#FFFDFC` surface, brand brass `#9A642C` accents). No global dark mode or generic SaaS styling.
- **P0 Security by Default:** Eliminate client-side administrative database mutations, secure biometric authentication, secure table QR token verification, and lock down Firebase Security Rules.
- **Cost-Safe Data Access:** Limit database read and write actions with client-side caching and bounded collections.
- **Local Webhook Meta WhatsApp Integration:** Handle customer ordering, transactional updates, location messages, and escalations using a deterministic local intent router.

## 2. Infrastructure & Cost Constraints
> [!IMPORTANT]
> Firebase Blaze and Meta WhatsApp Cloud API are the only approved paid services. Vercel must remain on its free tier. All other tooling is free and open-source.
> 
> No external generative AI APIs (e.g. OpenAI, Anthropic, Gemini, Groq) may be utilized for production routing. Webhook payloads, menu looks, and notifications are processed locally.

## 3. Users and Roles
- **Anonymous Customer:** Can browse public menu, create cart, scan table token.
- **Authenticated Customer:** Can place dine-in/pickup/delivery orders, save coordinates, track loyalty points.
- **Staff / Kitchen Operator:** Accesses KDS, updates ticket state.
- **Manager / Admin / Owner:** Full catalog, inventory adjustments, daily cash/till closes, staff permissions, and refund approvals.

## 4. Protected Workflows
- **Customer Authentication:** SMS/WhatsApp signup and passwordless token handshake.
- **Table Ordering:** Orders validated via signed cryptographic table QR tokens.
- **Checkout & Cart:** Bounded cart quantity changes, server-calculated totals, point deduction logic.
- **KDS ticket transitions:** State changes scoped to station and outlet with transaction rollback.
- **Manager Image Uploads:** Direct uploads to Firebase Storage with strict MIME type and file size checks.
- **Reconciliation & Ledger:** Compensating ledger entries for point reversals, never mutating immutable financial records.

## 5. Security & Data Invariants
- **Signing Secrets:** QR table tokens must be verified server-side with a production signing key.
- **Biometric verification:** Enrollment descriptors must be validated server-side for sizing/integrity and consume a secure 128-bit session token in a transaction.
- **Read scopes:** Privileged routes explicitly query on role; client-side NoSQL direct writes are forbidden.

## 6. Migration and Rollback
- Dual writes behind a rollout flag.
- Dry-run validation of legacy schema prior to live execution.
- Lease, resume, and batch-wise backfilling capabilities.
- Staged rollback paths with historical record retention.

## 7. Acceptance Criteria
- All vitest and rules emulator tests must pass.
- Initial load bundle size must be minimized.
- No third-party analytics or image/Redis SaaS providers.
