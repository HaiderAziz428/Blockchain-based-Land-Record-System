# Architectural Patterns

---

## 1. Wagmi Hook Flow (Client-Side Transactions)

Every user-initiated blockchain write follows this four-hook sequence. Appears in all modal components.

```
useAccount()                        → get connected wallet address
useReadContract()                   → read on-chain state before acting
useWriteContract()                  → queue and send transaction
useWaitForTransactionReceipt()      → poll for confirmation
```

Reference implementations:
- `src/app/dashboard/user/page.tsx:25-46` — read flow
- `src/components/FinalizeSaleModal.tsx:3,11-12` — write + receipt flow

After confirmation, a `useEffect` watching `isSuccess` triggers any follow-up side effects (DB sync, UI refresh).

---
**IMPORTNT** When you work on a new feature or bug, create a git branch first. Then work on changes in that branch for the reminder of the session

## 2. Admin Server-Signing Pattern

User-facing actions that require admin authority (e.g., minting NFTs) must not expose the private key client-side. The pattern: frontend sends a POST request to an API route, which holds the private key and signs with Viem.

Flow: `Frontend → POST /api/verify → validate → viem walletClient.writeContract() → return txHash`

Key references:
- `src/app/api/verify/route.ts:3-5` — Viem imports (`createWalletClient`, `privateKeyToAccount`)
- `src/app/api/verify/route.ts:16` — reads `process.env.ADMIN_PRIVATE_KEY`
- `src/app/api/verify/route.ts:37` — creates wallet client
- `src/app/api/verify/route.ts:137` — executes transaction

`ADMIN_PRIVATE_KEY` must never appear in any `NEXT_PUBLIC_` env var.

---

## 3. Blockchain + Database Sync

On-chain state is the source of truth for ownership; Supabase marketplace DB tracks listing metadata. After a contract write succeeds, the component syncs the DB in the same `useEffect` that handles `isSuccess`.

Pattern:
1. `writeContract()` succeeds → `hash` is set
2. `useWaitForTransactionReceipt({ hash })` → `isSuccess = true`
3. `useEffect([isSuccess])` → `marketDb.from('listings').update(...)`

Reference: `src/components/FinalizeSaleModal.tsx:15-49`

A `useRef` flag (`hasProcessedRef`) prevents the effect from firing twice in React strict mode.

---

## 4. Hydration-Safe Components

Pages that read wallet state (`useAccount`, `useReadContract`) would cause SSR/client mismatches. Every such component defers render until after mount.

```
useState(false) → useEffect(() => setMounted(true), []) → if (!mounted) return null
```

Reference: `src/app/dashboard/user/page.tsx:32-33,148`

This pattern appears in every page that accesses blockchain state. Do not remove it.

---

## 5. Authorization Guards

Two layers of authorization exist:

**Admin guard (component-level):** `AdminGuard` reads `owner()` from the contract and compares to `useAccount().address`. Redirects non-owners.
- `src/components/guards/AdminGuard.tsx:10`

**User registration check (page-level):** Pages call `useReadContract` for `users(address)` to verify wallet is registered before allowing actions.
- `src/app/dashboard/user/page.tsx:46`

There is no JWT or session auth — all authorization is purely on-chain.

---

## 6. Dual Supabase Instances

Two independent Supabase projects are used to simulate separate institutional nodes:

| Instance | Purpose | Client |
|----------|---------|--------|
| Government DB | Citizen CNIC records (read-only from app) | `src/lib/supabase.ts` |
| Marketplace DB | Listing metadata, sale status (read-write) | `src/lib/marketplace.ts` |

The `/api/verify` route cross-checks the government DB before minting — if no matching CNIC record exists, minting is rejected.

---

## 7. IPFS Upload (Pinata)

Land document/image uploads happen client-side directly to Pinata before the on-chain transaction. The returned IPFS hash is stored in the marketplace DB and passed to the contract.

Reference: `src/components/CreateListingModal.tsx:32-36`

Note: Pinata keys are `NEXT_PUBLIC_` (client-exposed). If this becomes a security concern, move uploads to an API route.
