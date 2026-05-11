# Occupancy & Use-Rights Frontend

> **Scope.** End-to-end frontend for the v9 occupancy / use-right system. Occupancy is a **separate ledger** from the share ledger and from subdivision — the frontend's job is to make the three-way distinction unmistakable at every touchpoint.

This doc maps to:

- **Contract reads:** `getOccupancyAgreements(landId)`, `getActiveOccupancyAgreements(landId)`, `getOccupancyAgreement(landId, agreementId)`
- **Contract writes:** `grantOccupancy(landId, category, occupant, startTime, endTime, termsCid, descriptionCid)`, `revokeOccupancy(landId, agreementId)`
- **Contract types:** `OccupancyAgreement` struct (`id`, `category`, `grantor`, `occupant`, `startTime`, `endTime`, `termsCid`, `descriptionCid`, `isRevoked`); `OccupancyCategory` enum (`RESIDENTIAL_LEASE`, `AGRICULTURAL_LEASE`, `COMMERCIAL_LEASE`, `USE_RIGHT`, `OTHER`)
- **Contract events:** `OccupancyGranted`, `OccupancyRevoked`

---

## 1. The Three-Way Distinction (UI-enforced)

Every screen that shows occupancy data ALSO shows ownership and (if applicable) subdivision status in adjacent panels. The visual hierarchy makes the layer boundaries obvious.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Plot DHA-9 R-2/417                                                      │
├────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌───────────────────┐  ┌──────────────────────┐ │
│  │ OWNERSHIP        │  │ OCCUPANCY         │  │ SUBDIVISION          │ │
│  │ (layer 2)        │  │ (separate ledger) │  │ (layer 1)            │ │
│  │                  │  │                   │  │                      │ │
│  │ ● Ali Khan       │  │ Upper floor       │  │ Generation 0          │ │
│  │   50.00%         │  │   Tenant Ali Khan │  │ (top-level import)    │ │
│  │ ● Sara Khan      │  │   until 2027-08   │  │                      │ │
│  │   50.00%         │  │ Lower floor       │  │ No subdivision         │ │
│  │                  │  │   Tenant Sara Khan│  │ proposal active       │ │
│  │ Total 100%       │  │   until 2027-08   │  │                      │ │
│  │                  │  │                   │  │                      │ │
│  │ [Manage shares]  │  │ [Grant occupancy] │  │ [Propose subdivision] │ │
│  └─────────────────┘  └───────────────────┘  └──────────────────────┘ │
│                                                                          │
│  ── EXPLAINER (collapsible, default OPEN for new users) ──               │
│  • OWNERSHIP is what fraction of the legal title you hold.              │
│  • OCCUPANCY is a time-bounded right to USE the parcel — it does       │
│    NOT change ownership, and ends at the lease's endTime regardless    │
│    of who owns the land.                                                │
│  • SUBDIVISION is the legal creation of new physical parcels — it      │
│    burns this NFT and mints children. Requires a court order +        │
│    survey document + unanimous shareholder approval.                   │
└────────────────────────────────────────────────────────────────────────┘
```

The explainer collapses for returning users but never disappears entirely (an "ⓘ What's the difference?" link stays in the header).

---

## 2. The Canonical Worked Example (in the UI)

The user spec gives this example. The frontend has a dedicated `/learn/occupancy` page that walks through it as an interactive tour:

```
Two heirs each own 50% of a house.
By private agreement:
   - Ali Khan occupies the upper floor + roof access
   - Sara Khan occupies the lower floor

On-chain, this is THREE records:

OWNERSHIP (share ledger)
   _shareBps['HOUSE-42'][Ali]  = 5000
   _shareBps['HOUSE-42'][Sara] = 5000
   Total: 10000 ✓

OCCUPANCY (separate ledger)
   Agreement #0:
     category:       RESIDENTIAL_LEASE
     grantor:        Sara Khan
     occupant:       Ali Khan
     startTime:      2025-09-01
     endTime:        2030-09-01
     termsCid:       Qm…PartitionAgreement.pdf
     descriptionCid: Qm…UpperFloorRoofPlan.pdf

   Agreement #1:
     category:       RESIDENTIAL_LEASE
     grantor:        Ali Khan
     occupant:       Sara Khan
     startTime:      2025-09-01
     endTime:        2030-09-01
     termsCid:       Qm…PartitionAgreement.pdf       ← same legal doc (deduplicated by sha256)
     descriptionCid: Qm…LowerFloorPlan.pdf

The house is still ONE parcel with ONE NFT.
No subdivision occurred.
The share ledger is unchanged.

If the heirs later want two physically distinct plots:
   → propose subdivision (court order + survey doc required)
```

The tour ends with: **"This page is for ordinary lease/tenancy/use arrangements. For physical subdivision, use the Subdivision portal."**

---

## 3. Occupancy Module Surfaces

```
/dashboard/lands/[landId]/occupancy        — per-land occupancy tab
/dashboard/occupancy                        — global "occupancy I'm involved in"
/dashboard/occupancy/grant/[landId]         — grant a new agreement
/dashboard/occupancy/[landId]/[agreementId] — agreement detail
```

---

## 4. Per-Land Occupancy Tab

`/dashboard/lands/[landId]/occupancy`

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Plot DHA-9 R-2/417 — Occupancy                                       │
│                                                                       │
│  ⓘ Occupancy is separate from ownership. See the explainer at top.   │
│                                                                       │
│  ── ACTIVE AGREEMENTS (2) ──                                          │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  🏠 Upper floor + Roof access                                    │  │
│  │  RESIDENTIAL_LEASE                                               │  │
│  │  Granted by Sara Khan                                            │  │
│  │  Occupant Ali Khan (you)                                         │  │
│  │  Active 2025-09-01 → 2030-09-01  (4 years remaining)             │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │ Terms (PartitionAgreement.pdf)                              │  │  │
│  │  │ [PDF preview embedded]                                     │  │  │
│  │  │ sha256 abc…  CID Qm…  [Verify locally] [Open on gateway]   │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │  Floor plan (UpperFloorRoofPlan.pdf)                            │  │
│  │  [PDF preview]                                                  │  │
│  │                                                                  │  │
│  │  (Only the grantor can revoke; see actions ⓘ)                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  🏠 Lower floor                                                  │  │
│  │  RESIDENTIAL_LEASE                                               │  │
│  │  Granted by Ali Khan (you)                                       │  │
│  │  Occupant Sara Khan                                              │  │
│  │  Active 2025-09-01 → 2030-09-01                                  │  │
│  │  [PartitionAgreement.pdf]  [LowerFloorPlan.pdf]                  │  │
│  │  [Revoke this agreement]   ← only visible to grantor             │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  [+ Grant new occupancy]   ← visible only if I'm a shareholder        │
│                                                                       │
│  ── HISTORY (revoked + expired) ──                                    │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Garden plot — AGRICULTURAL_LEASE                                │  │
│  │  Grantor: Bashir Hussain  Occupant: Mehmood Farmer               │  │
│  │  2023-04-01 → 2025-03-31  (EXPIRED)                              │  │
│  │  [GardenLease_2023.pdf]                                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Roof access — USE_RIGHT                                         │  │
│  │  Revoked by Ali Khan on 2025-08-15                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Active vs full history

Two data sources:

- **Active**: `getActiveOccupancyAgreements(landId)` — already filtered by the contract to `!isRevoked && start <= now < end`.
- **Full**: `getOccupancyAgreements(landId)` — everything, including revoked and expired (for the History section).

Frontend uses the active view for the top section and computes "EXPIRED" / "REVOKED" labels on the history rows by comparing timestamps + the `isRevoked` flag.

### 4.3 Revoke action

The "Revoke this agreement" button is rendered only when:

- The connected wallet is the original grantor (`agreement.grantor == me`)
- The agreement is not already revoked (`!agreement.isRevoked`)

Clicking opens a Sheet:

```
┌─────────────────────────────────────────────────────────────────┐
│  Revoke occupancy?                                                  │
│                                                                     │
│  You are about to revoke this agreement:                            │
│  Lower floor lease to Sara Khan (since 2025-09-01)                  │
│                                                                     │
│  ⚠ Revocation is recorded on-chain and is irreversible.             │
│  The occupancy ends immediately. The legal agreement document       │
│  (PartitionAgreement.pdf) is NOT deleted — it remains pinned on    │
│  IPFS for audit.                                                    │
│                                                                     │
│  ⓘ Revocation does NOT affect ownership. Sara Khan still owns 50%   │
│  of this land. To change ownership shares, use the Ownership tab.   │
│                                                                     │
│  [Cancel]   [Sign and revoke]                                       │
└─────────────────────────────────────────────────────────────────┘
```

The explicit reminder that revocation doesn't affect ownership is intentional — it pre-empts the common user confusion.

---

## 5. Grant Occupancy Form

`/dashboard/occupancy/grant/[landId]` — accessible only to shareholders (`<ShareholderGuard>`).

### 5.1 Form

```
┌─────────────────────────────────────────────────────────────────────┐
│  Grant occupancy on Plot DHA-9 R-2/417                                │
│                                                                       │
│  ⓘ Occupancy grants a TIME-BOUNDED right of use. It does NOT          │
│     transfer ownership. The occupant has the legal right to use the   │
│     parcel between startTime and endTime under the terms you upload.  │
│                                                                       │
│  Occupant address                                                     │
│  ┌──────────────────────────────────────────────┐                    │
│  │  0xdef…                                       │                    │
│  └──────────────────────────────────────────────┘                    │
│  → Resolves to: Sara Khan (CNIC 354…)                                 │
│                                                                       │
│  Category (display hint for indexers / UIs)                           │
│  ( ) RESIDENTIAL_LEASE      ( ) AGRICULTURAL_LEASE                    │
│  ( ) COMMERCIAL_LEASE        ( ) USE_RIGHT  (easement, licence, etc.) │
│  ( ) OTHER                                                            │
│                                                                       │
│  Start date    [ 2026-06-01 ]   ← must be in the future (or today)    │
│  End date      [ 2031-06-01 ]   ← must be after start                 │
│  Duration: 5 years 0 months                                            │
│                                                                       │
│  Lease / use-right agreement (REQUIRED — IPFS-pinned)                 │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  📄  PartitionAgreement.pdf  (2.1 MB)                          │    │
│  │  sha256 abc…   CID Qm…                                         │    │
│  │  ✓ Pin verified                                                │    │
│  │  [Preview]   [Verify locally]                                  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  [Upload a different file]                                            │
│                                                                       │
│  Floor / portion description (OPTIONAL — IPFS-pinned)                 │
│  Use this to attach a floor plan, drone photo, or partition diagram.  │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  📄  UpperFloorRoofPlan.pdf  (640 KB)                          │    │
│  │  sha256 def…   CID Qm…                                         │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  [+ Add description]    [Skip — no description]                       │
│                                                                       │
│  ── PREVIEW ──                                                         │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Plot DHA-9 R-2/417                                            │    │
│  │  Upper floor + Roof access                                     │    │
│  │  RESIDENTIAL_LEASE                                             │    │
│  │  Granted by Ali Khan (you) to Sara Khan                        │    │
│  │  2026-06-01 → 2031-06-01                                       │    │
│  │  [PartitionAgreement.pdf]  [UpperFloorRoofPlan.pdf]            │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ⓘ This will NOT change ownership shares. You still own 50.00% of     │
│     this land after granting this lease.                              │
│                                                                       │
│  [Grant occupancy and sign]                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Frontend validation

| Check | If fails |
|-------|----------|
| Connected wallet has `getShareBps(landId, me) > 0` | "Only a shareholder of this land can grant occupancy" |
| Land status is `ACTIVE` (not PENDING_*, LOCKED_*, SUBDIVIDED) | "Land is not in an active state — occupancy cannot be granted" |
| Occupant address is non-zero, valid checksum | "Invalid occupant address" |
| `startTime < endTime` | "End must be after start" |
| `endTime > now` | "End must be in the future" |
| `termsCid` is uploaded and pin-verified | "Upload the legal agreement document" |
| `termsCid` length ≤ 256 | (impossible with IPFS CIDs; rejected by `boundedString`) |
| `descriptionCid` if provided is also pin-verified | "If you upload a description, it must finish pinning first" |

### 5.3 Submission

`grantOccupancy(landId, category, occupant, startTime, endTime, termsCid, descriptionCid)` from the user's wallet — backend pre-composes, user signs.

The returned `agreementId` comes from the event payload (`OccupancyGranted.agreementId`). The receipt screen shows the agreement card filled in.

---

## 6. Global "Occupancy I'm Involved In"

`/dashboard/occupancy`

For users who want a cross-land view of their occupancy footprint:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Occupancy I'm involved in                                            │
│                                                                       │
│  Tabs: [As occupant (3)]  [As grantor (2)]  [History (5)]             │
│                                                                       │
│  ── AS OCCUPANT (active 3) ──                                         │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  🏠 Plot DHA-9 R-2/417 — Upper floor + Roof                     │  │
│  │  Granted by Sara Khan · RESIDENTIAL_LEASE                       │  │
│  │  Until 2030-09-01 (4 years)                                      │  │
│  │  [View land]  [View agreement]                                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  🌾 Plot Bahria-K agri 99 — 5-acre tract                         │  │
│  │  Granted by Bashir Hussain · AGRICULTURAL_LEASE                  │  │
│  │  Until 2028-03-15 (2 years)                                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ── AS GRANTOR (2) ──                                                 │
│  …                                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

The "As occupant" tab filters across **all** lands by `occupant == me`; the "As grantor" tab by `grantor == me`. Implemented client-side from the indexer's projection (the contract only exposes per-land queries).

---

## 7. Agreement Detail Screen

`/dashboard/occupancy/[landId]/[agreementId]`

A single agreement, fully expanded:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Occupancy agreement #1                                                │
│  Plot DHA-9 R-2/417                                                    │
│                                                                       │
│  ┌──── Status ──────┐                                                 │
│  │ 🟢 ACTIVE         │                                                 │
│  │ 4 years remaining │                                                 │
│  └─────────────────┘                                                  │
│                                                                       │
│  Category:    RESIDENTIAL_LEASE                                       │
│  Grantor:     Ali Khan (you)            0xabc…                        │
│  Occupant:    Sara Khan                  0xdef…                        │
│  Period:      2026-06-01 → 2031-06-01    (1827 days · 5 years)        │
│  Granted on:  2026-05-28 (block #4892331, tx 0x1234…)                 │
│                                                                       │
│  ── LEGAL DOCUMENTS ──                                                │
│                                                                       │
│  Lease agreement (PartitionAgreement.pdf)                             │
│   CID:    Qm…abcd                                                      │
│   sha256: abc123def456…                                                │
│   Pin status: ✓ Verified                                              │
│   [PDF preview embedded]                                              │
│   [Verify locally]   [Open on gateway]   [Copy CID]                   │
│                                                                       │
│  Floor / portion description (UpperFloorRoofPlan.pdf)                 │
│   CID:    Qm…efgh                                                      │
│   sha256: def456abc…                                                   │
│   [PDF preview embedded]                                              │
│                                                                       │
│  ── REVOKE ──                                                          │
│  As the grantor, you can revoke this agreement at any time.           │
│  Revocation is on-chain and irreversible.                             │
│  [Revoke this agreement]                                              │
│                                                                       │
│  ── AUDIT ──                                                           │
│  Granted:  2026-05-28 14:22  tx 0x1234… [Etherscan]                   │
│  Revoked:  —                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Visual Distinguishers (the user-spec example, made literal)

The user spec gave this example:

```
Ownership:
50%

Occupancy Rights:
Upper Floor + Roof Access

Legal Agreement:
PartitionAgreement.pdf
```

The frontend renders that **literally** in the property card occupancy summary:

```
🏠 OCCUPANCY  (you on this land)

   Ownership share:    50.00%
   Occupancy rights:   Upper Floor + Roof Access
   Legal agreement:    PartitionAgreement.pdf   [Open]
   Period:             2025-09-01 → 2030-09-01

   These three things are independent — your ownership stays at 50%
   regardless of any occupancy arrangement.
```

The "ownership share" line links to the Ownership tab; the "legal agreement" link opens the PDF preview; the inline footnote is the literal explainer the user spec asks for.

---

## 9. Category-Specific Display Hints

The `OccupancyCategory` enum is a UI-only display hint. The renderer uses it to choose iconography and copy:

| Category | Icon | Label | Default copy |
|----------|------|-------|--------------|
| `RESIDENTIAL_LEASE` | 🏠 | Residential lease | "Tenant: {occupant} (residential lease until {endDate})" |
| `AGRICULTURAL_LEASE` | 🌾 | Agricultural lease | "Farmer-of-record: {occupant} (agricultural lease until {endDate})" |
| `COMMERCIAL_LEASE` | 🏪 | Commercial lease | "Tenant business: {occupant} (commercial lease until {endDate})" |
| `USE_RIGHT` | 📜 | Use right | "Use-right holder: {occupant} (until {endDate})" — used for easements, licences |
| `OTHER` | 📋 | Other agreement | "Occupant: {occupant} (see uploaded agreement for terms)" |

These are localised via `next-intl`.

---

## 10. Multi-Owner Reminder Panel

Every occupancy screen carries a small panel that re-states the ownership / occupancy distinction, because the question recurs even after the explainer is collapsed:

```
ⓘ Quick reminder

OWNERSHIP (this property's shareholders)            see Ownership tab
   ● Ali Khan      50.00%
   ● Sara Khan      50.00%

OCCUPANCY (who has the right to use, right now)     see below
   ● Ali Khan      Upper floor + roof
   ● Sara Khan     Lower floor

These two facts are independent. Granting or revoking occupancy
does NOT change ownership.  Changing ownership (transfer, sale,
inheritance) does NOT automatically end occupancy — the lease
runs to its endTime unless the grantor revokes it.

For physical subdivision into separate parcels, use the
[Subdivision] tab — a court order + survey document are required.
```

---

## 11. Real-Time Updates

Subscribed to `land:{landId}`:

| Event | Frontend reaction |
|-------|-------------------|
| `OccupancyGranted` | Append a new agreement card to the active list; toast for the occupant + grantor |
| `OccupancyRevoked` | Move the agreement from "active" to "history" with the `isRevoked` flag; toast |
| `LandStatusChanged` to `SUBDIVIDED` | Lock the Grant button with a tooltip: "This land has been subdivided — see the new parcels for their separate occupancy ledgers" |
| `LandStatusChanged` to `LOCKED_*` | Banner: "Land is in legal review — new occupancy cannot be granted until resolution" |
| Time-passage (every minute) | Re-evaluate `active vs expired` for all agreements based on `endTime` |

---

## 12. Permissions Summary

| Action | Required permission |
|--------|---------------------|
| View agreements (active + history) | Public — anyone can read |
| Grant new agreement | `getShareBps(landId, me) > 0` AND status `ACTIVE` |
| Revoke an agreement | `agreement.grantor == me` AND `!agreement.isRevoked` |
| Edit terms / extend duration | **Not supported** — the contract has no `updateOccupancy` function. To change terms, revoke + grant a fresh agreement. This is explicit so the audit log never has "silent edits" |

---

## 13. Edge Cases & Failure Modes

| Scenario | UI |
|----------|----|
| Grantor's share goes to 0 (sold all of it) | Existing agreements they granted remain valid (the contract enforces this); UI shows "Original grantor no longer holds shares — only an admin via dispute escalation can override this lease" with a link to the audit doc explanation |
| Occupant's wallet lost / compromised | UI shows the original agreement; revocation by grantor is still possible; a new agreement to a recovered wallet starts fresh |
| Land is subdivided while a lease is active | The parent enters SUBDIVIDED state; existing agreements appear on the parent's history forever (audit trail); children start with empty occupancy ledgers — heirs of the lease must re-grant on the relevant child if needed (off-chain coordination + new on-chain grant) |
| Multiple agreements covering the same physical area (overlapping leases) | Allowed by the contract (no overlap detection); UI surfaces a warning if two active agreements share the same `descriptionCid` |
| The lease document was pinned to IPFS but the pin is later unpinned | The on-chain CID is unaffected; UI falls back to ipfs.io / cloudflare gateways; if all gateways fail, shows "Document temporarily unavailable — the CID is permanent; try again later" |
| User tries to grant an end date in the past | `block.timestamp >= endTime` → contract reverts `InvalidOccupancyPeriod`; UI rejects before signing |

---

## 14. Component Reuse Map

```
OccupancyTab (/dashboard/lands/[landId]/occupancy)
├── OccupancyExplainer            src/components/occupancy/OccupancyExplainer.tsx
├── ActiveOccupancyList
│   └── OccupancyAgreementCard    src/components/occupancy/OccupancyAgreementCard.tsx
│       ├── OccupancyCategoryBadge
│       ├── CourtOrderPreview     (shared — reuses PDF preview from doc 04)
│       ├── CountdownPill         (shared — until endTime)
│       └── RevokeAction          (grantor-only)
└── OccupancyHistoryList
    └── OccupancyAgreementCard (variant=history)

GrantOccupancyPage (/dashboard/occupancy/grant/[landId])
├── OccupantPicker
├── OccupancyCategorySelect
├── DateRangePicker
├── DocumentUploadField           (reuses from doc 04, applied to termsCid and descriptionCid)
├── PreviewCard
└── GrantSubmitButton

OccupancyAgreementDetail (/dashboard/occupancy/[landId]/[agreementId])
├── AgreementHeader
├── LegalDocumentSection × 2
├── RevokeAction (grantor-only)
└── AuditFooter

GlobalOccupancyPage (/dashboard/occupancy)
├── Tabs: AsOccupant / AsGrantor / History
└── (reuses OccupancyAgreementCard)
```

---

## 15. Diagram — Single Occupancy Lifetime

```
SHAREHOLDER             FRONTEND              CONTRACT
   │                       │                     │
   │ /dashboard/occupancy/  │                     │
   │  grant/[landId]        │                     │
   ├──────────────────────►│                     │
   │ pick occupant + dates  │                     │
   │ upload termsCid PDF    │                     │
   │ (optional descriptionCid)                    │
   │ form preview shown                            │
   │                                               │
   │ [Grant occupancy]      │                     │
   ├──────────────────────►│ pre-compose tx ──────►│
   │ sign in wallet         │                     │
   ├──────────────────────────────────────────────►│
   │                       │ ◄── OccupancyGranted │
   │                       │ indexer upserts row  │
   │                       │ ws push to grantor + │
   │                       │ occupant              │
   │ ◄── receipt screen     │                     │
   │ "Agreement #1 created" │                     │
   │                       │                     │
   │ later:                                        │
   │ [Revoke this agreement]│                     │
   ├──────────────────────►│ pre-compose tx ──────►│
   │ sign                   │                     │
   ├──────────────────────────────────────────────►│
   │                       │ ◄── OccupancyRevoked │
   │                       │ row's isRevoked flips│
   │                       │ ws push to both      │
```

The defining property is that **the contract never mints or moves an NFT during this whole lifetime**, and the share ledger never changes. Occupancy is its own ledger, with its own lifecycle, anchored to IPFS legal documents.

---

## 16. What This Module Refuses To Do

To preserve the three-way distinction, the occupancy module deliberately does not:

- **Assign physical portions algorithmically.** The user-spec is explicit: "the smart contract should NOT algorithmically assign physical portions". The frontend reflects this — there is no "auto-split the floors based on share %" feature. Users describe portions via uploaded floor plans / descriptions.
- **Tie occupancy to ownership share automatically.** Granting occupancy doesn't change shares; selling shares doesn't auto-revoke leases. Users get explicit on-screen reminders of this independence.
- **Conflict-detect across overlapping leases.** Two co-owners might each grant their own occupancy on the same portion. The contract permits this; the UI flags it; resolution is off-chain.
- **Edit existing agreements in place.** No `updateOccupancy`. To change terms: revoke + grant fresh. This makes every audit log entry final.
- **Confuse occupancy with subdivision.** When a user clicks Grant Occupancy on a land in `PENDING_SUBDIVISION` or `LOCKED_SUBDIVISION_DISPUTE`, the action is blocked with a clear pointer to the Subdivision tab.

These refusals are themselves part of the trust posture — the contract enforces some, the frontend enforces others, and the user education explains why both layers refuse.

---

This is the final piece of the frontend design. With docs 01 (architecture), 02 (ownership dashboard), 03 (inheritance portal), and 04 (occupancy module), every contract surface in v9 has a corresponding citizen-facing experience that respects the protocol's hybrid governance and ownership-centric design principles.
