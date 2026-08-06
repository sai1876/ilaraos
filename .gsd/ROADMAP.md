# Ilara Cafe Roadmap

## Wave 0 — Baseline, Specification, and Regression Map
- [x] Complete the dirty-worktree baseline commit
- [x] Finalize the Ilara Cafe SPEC.md
- [/] Update ROADMAP.md
- [ ] Fix the failing regression tests in the codebase
- [ ] Verify test suite is green

## Wave 1 — P0 Security and Truthful System State
- [ ] Secure table QR tokens by removing literal signing fallbacks and adding signature/expiry verification
- [ ] Secure biometric verification (server-side, 128-bit session tokens, App Check, parameter validation)
- [ ] Scope KDS ticket queries, assign unique immutable order line IDs, implement mutation locks/rollback
- [ ] Restructure route authorization checks and move public storefront reads to public endpoint
- [ ] Fix build configuration to enforce typechecks and lints in production

## Wave 2 — Architecture Foundation & Design Primitives
- [ ] Refactor folder boundaries (app, features, components, lib, server)
- [ ] Implement UI and motion primitives with user-reduced-motion configuration

## Wave 3 — Structured Firebase Model and Migration
- [ ] Create v3 plural snake-case types/Zod schemas/converters
- [ ] Write lease/resume-enabled batch migration runner with dry-run support
- [ ] Deploy strict firestore.rules and composite indexes

## Wave 4 — Cost-Safe Data Access
- [ ] Enforce read document caps for storefront, menu, profile, and KDS
- [ ] Implement client-side query caching and remove unbounded collection scans

## Wave 5 — Prohibited Services Removal & Deterministic WhatsApp
- [ ] Remove Groq, Gemini, Cloudinary, Upstash, Resend, and Supabase dependencies
- [ ] Configure direct Firebase Storage image pipeline with validation
- [ ] Implement signature-verified WhatsApp Webhook and local intent parser

## Wave 6 — Premium Priority Screens
- [ ] Redesign KDS Board with arrival flash, touch target, and offline/error states
- [ ] Redesign Cart, Checkout, Auth, and Menu
- [ ] Redesign Manager Operations Shell & Cash till close/reconciliation

## Wave 7 — Rebranding, PWA & Android
- [ ] Rebrand all user-facing names to "Ilara Cafe"
- [ ] Configure Capacitor Android package settings and offline-cache PWA shell

## Wave 8 — Full Code Clean-up
- [ ] Audit code file boundaries and add developer policy comments
