# Frontend Implementation Status

This branch (`feat/frontend-implementation`) is the **first slice** of the four-doc design spec under `docs/frontend/`. It is intentionally scoped — the full design is multi-PR work. This file documents what is and isn't here so reviewers don't expect the whole spec at once.

## Important context

- The Sepolia contract at the address in `src/utils/contract.ts` is the **legacy v3** (per CLAUDE.md). The v9 source in `contract.sol` is NOT YET DEPLOYED.
- All new files in this branch target the **v9 ABI**, which lives in the new `src/utils/contractV9.ts`. They will read empty / error against the v3 deployment.
- The existing v3 pages (`/dashboard/user`, `/dashboard/admin`, `/marketplace`, `/verify`) are **untouched** and continue to work against v3.
- To make the new pages functional, deploy the v9 contract and update `CONTRACT_V9_ADDRESS` in `src/utils/contractV9.ts`.

## What's in this slice

### v9 ABI module
- `src/utils/contractV9.ts` — read+write ABI fragment for the v9 surface the new pages use, plus enum helpers (`LandStatusV9`, `LandTypeV9`, `OccupancyCategoryV9`) and label/format utilities.

### Headline components
- `src/components/shared/SharesHashVerifier.tsx` — **THE** cryptographic-anchor component. Recomputes `keccak256(abi.encode(heirs[], heirShares[], courtOrderCid))` client-side using viem's pure crypto, compares to the on-chain `sharesHash`, shows ✓ / ✗. Closes the "backend silently rewrote shares" attack surface.
- `src/components/shared/StatusPill.tsx` — colour-coded 8-state `LandStatus` pill with icons.
- `src/components/shared/CourtOrderPreview.tsx` — IPFS PDF embed with multi-gateway fallback, automatic gateway-sha256 compute on mount, and a "Verify locally" file picker that compares a user-supplied PDF to the gateway-served content.
- `src/components/land/OwnershipPanel.tsx` — basis-point share-ledger table sourced from `getShareholdersWithBps`. Highlights the connected wallet's row. Shows the 10,000-bps invariant check.
- `src/components/occupancy/OccupancyAgreementCard.tsx` — card renderer for the v8/v9 `OccupancyAgreement` struct. Category icon + label, status (active / future / expired / revoked), grantor-only revoke action with explicit "does NOT affect ownership" reminder.

### New routes
- `/dashboard/inheritance` — portal landing with a land-ID jump-to-vote input + "how inheritance works" explainer.
- `/dashboard/inheritance/vote/[landId]` — **headline page**: split-pane `CourtOrderPreview` + proposed-redistribution table + `SharesHashVerifier`. Vote / dispute buttons sign `approveSuccessionPlan` / `disputeSuccessionPlan` from the user's wallet.
- `/dashboard/occupancy` — module landing with a three-card explainer (ownership / occupancy / subdivision) + lookup by landId + active-and-history split.
- `/dashboard/lands/[landId]` — property detail with 5 canonical tabs (Ownership, Occupancy, Inheritance, Subdivision, Audit) and the three-panel layer-summary at top.

## What's deliberately deferred

These pieces from the design docs are not in this slice. Each is a meaningful follow-up PR:

- **Citizen ownership dashboard** (`docs/frontend/02`) — virtualised property grid, summary tiles, actions-bar of pending verifications/votes/withdrawals. Needs `getLandsByOwner(me)` + multicall + indexer-backed actions list.
- **Appeal filing flow** (`/dashboard/inheritance/appeals/new`) — multipart PDF upload to backend, IPFS pin-and-verify, pre-compose-and-sign `fileInheritanceAppeal`. Needs the backend's `/v1/inheritance/appeals` endpoint (see `docs/backend/03`).
- **Admin & resolver portals** — `/admin/*` and `/resolver/*` route groups gated by `RoleGuard`. Listed in the architecture doc; not implemented here.
- **Subdivision lineage UI** — `getSubdivisionLineage` walker + parent/children graph component.
- **Grant occupancy form** — file uploads for `termsCid` + optional `descriptionCid`, `OccupancyCategory` selector, sign `grantOccupancy`.
- **Full audit tab** — indexer-backed event list per land.
- **WebSocket invalidation** — backend WS channel subscriptions (`wallet:{addr}`, `land:{landId}`) to auto-refresh on chain events.
- **i18n via next-intl** — strings are inline English at this stage.
- **shadcn/ui adoption** — using existing `globals.css` design tokens (`.glass-card`, `.surface`, `.btn-primary`, `.field`, `.pill`) rather than introducing shadcn. The design doc mentions shadcn; adoption is a follow-up.
- **`expireInheritance` public-utility button** — easily added to the vote screen once the v9 deployment is live and we can test the timeout path.

## How to make this slice runnable

1. **Deploy `contract.sol` (v9)** to Sepolia or your test network.
2. **Update `CONTRACT_V9_ADDRESS`** in `src/utils/contractV9.ts` to the deployed address.
3. **Run** `npm run dev` and visit `/dashboard/inheritance` or `/dashboard/lands/<landId>`.
4. Without step 1+2, the new pages render but every contract read returns empty / errors. The pages handle this gracefully (skeleton → "v9 contract not deployed" notice).

## How this slice maps to the spec

| Design doc § | Implemented file(s) |
|---|---|
| 03 §5 (Heir Vote Screen — split-pane, SharesHashVerifier) | `vote/[landId]/page.tsx` + `SharesHashVerifier.tsx` |
| 03 §3 (Court-order upload preview) | `CourtOrderPreview.tsx` |
| 04 §1 (Three-way distinction surface) | `LayerSummary` block in `lands/[landId]/page.tsx` + `/dashboard/occupancy/page.tsx` explainer |
| 04 §4 (Per-land occupancy tab) | `OccupancyTab` in `lands/[landId]/page.tsx` + `OccupancyAgreementCard.tsx` |
| 02 §3.1 (Ownership-centric property card field #4-5: share %, co-owners) | `OwnershipPanel.tsx` |
| 02 §3.2 (Six card chrome states for LandStatus) | `StatusPill.tsx` |
| 01 §4 (Module ↔ contract mapping) | `contractV9.ts` ABI fragment |

The pieces above are the foundation. Subsequent PRs build the full dashboard, the appeal-filing flow, the admin/resolver portals, the subdivision UI, and the indexer-backed event feed.
