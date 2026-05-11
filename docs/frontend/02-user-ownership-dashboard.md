# User Ownership Dashboard

> **Scope.** The default landing for an authenticated citizen. The dashboard is **ownership-centric, not NFT-centric** — users see their bps shares, their rights, their disputes, and their pending actions, **never** a raw NFT tokenId on the headline. The land NFT exists for identity continuity; ownership lives in the share ledger.

This doc maps to the v9 contract reads:

- `getLandsByOwner(address)` — array of landIds the wallet has shares in
- `getLandIdentity(landId)` — layer-1 projection (landId, ipfsHash, type, status, timestamps, tokenId)
- `getOwnershipSnapshot(landId)` — layer-2 projection (shareholders, shares, total, count)
- `getLandFullView(landId)` — both layers in one RPC
- `getShareBps(landId, holder)` — caller's specific bps
- `getShareholdersWithBps(landId)` — co-owners + their bps
- `getActiveOccupancyAgreements(landId)` — in-force occupancy
- `getInheritanceRequest(landId)` + `hasHeirApproved(landId, heir)` — pending inheritance state
- `getInheritanceAppealsForLand(landId)` — open appeals
- `getOwnershipHistory(landId)` — append-only timeline
- `getListing(landId, seller)` — caller's open listings
- `pendingProceeds(address)` — unwithdrawn sale proceeds

---

## 1. Information Hierarchy

The dashboard answers four questions, in order:

1. **What do I own?** (per-property cards with my bps, the land's type, size, status)
2. **What rights do I have?** (occupancy I've granted, occupancy granted *to* me on others' lands, marketplace listings)
3. **What actions await me?** (pending inheritance votes, import verifications, dispute notifications)
4. **What money do I have on the contract?** (pull-payment escrow balance, ready to withdraw)

The page is laid out top-to-bottom in that order. A user who only looks at the first screen still gets the answer to "what do I own and what's urgent?"

---

## 2. Top-Level Layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Navbar                                                          (sticky) │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ⚠️  3 actions await you                                                  │ ← Notice bar (collapsible)
│  • Verify import of Plot DHA-9 R-2/417   [Review]                          │
│  • Vote on inheritance of Plot Bahria-A-12 (deadline in 8 days)  [Vote]    │
│  • Withdraw 0.42 ETH in sale proceeds                            [Claim]   │
│                                                                             │
├───────────────────────────────────────────────────────────────────────────┤
│  Summary tiles                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│  │ 5 lands  │ │ 42.5%    │ │ 1 dispute│ │ 0.42 ETH │                       │
│  │ I own a  │ │ Avg      │ │ pending  │ │ pull     │                       │
│  │ share in │ │ share    │ │          │ │ proceeds │                       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                       │
├───────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Filters: [Type ▾] [Status ▾] [Min share % ▾]   Sort: [Acquired ▾] │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Property cards (grid; virtualised if > 24)                                │
│  ┌────────────────────────────┐ ┌────────────────────────────┐             │
│  │  LandCard 1                │ │  LandCard 2                │             │
│  └────────────────────────────┘ └────────────────────────────┘             │
│  ┌────────────────────────────┐ ┌────────────────────────────┐             │
│  │  LandCard 3                │ │  LandCard 4                │             │
│  └────────────────────────────┘ └────────────────────────────┘             │
│                                                                             │
└───────────────────────────────────────────────────────────────────────────┘
```

Mobile collapses tiles into a horizontal scroll and renders cards single-column.

---

## 3. The Property Card (the ten required fields)

The user-spec lists ten data points per property. Each appears on the card in a deliberate visual position so the eye picks up the most important fact first.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  Plot DHA-9 R-2/417                              🟢 ACTIVE            │ ← Land ID + Status pill
│  Residential · 1 kanal (605 yd²)                                      │ ← Property type + Size
│                                                                       │
│  ┌─────────────────────────────────┬─────────────────────────────┐   │
│  │                                  │                              │   │
│  │   YOU OWN                        │   Co-owners (3)              │   │
│  │   30.00%                          │   ● Ali Khan      30.00%    │   │
│  │   3,000 / 10,000 bps              │   ● Sara Khan     30.00%    │   │
│  │   ───────                         │   ● Bashir H.     40.00%    │   │
│  │   [donut chart]                   │                              │   │
│  │                                  │                              │   │
│  └─────────────────────────────────┴─────────────────────────────┘   │
│                                                                       │
│  🏠 OCCUPANCY                                                          │
│  You occupy the upper floor under a residential lease.               │
│  Lease document: PartitionAgreement.pdf · Active until 2027-08-15    │
│                                                                       │
│  ⚖️  INHERITANCE                                                       │
│  No pending inheritance.                                              │
│                                                                       │
│  📄 LEGAL DOCUMENTS (3)                                               │
│  • Initial allotment letter (court-anchored import, 2024-02-03)      │
│  • Inheritance court order (2025-08-14) — added 60% to you + sister  │
│  • Partition agreement (2025-09-01) — your occupancy basis           │
│                                                                       │
│  ✓ VERIFICATION                                                       │
│  Verified by all 3 proposed owners on 2024-02-08                     │
│                                                                       │
│  [View detail]  [Transfer share]  [List for sale]                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.1 Field-by-field source

| # | Field | Contract read | Render rule |
|---|-------|---------------|-------------|
| 1 | **Land ID** | `getLandIdentity(landId).landId` | Headline title; monospace font |
| 2 | **Property type** | `getLandIdentity(landId).landType` | `RESIDENTIAL` / `AGRICULTURAL` / `COMMERCIAL`, locale-translated |
| 3 | **Total land size** | ERC-721 metadata `attributes` (off-chain enrichment) | Fallback to "Size pending" if metadata unreachable |
| 4 | **Ownership percentage (mine)** | `getShareBps(landId, msg.sender)` / 100 | Always rendered as **bold, large** — the user's primary fact |
| 5 | **Co-owners** | `getShareholdersWithBps(landId)` | Top-3 with bps; "+N more" link expands a sheet |
| 6 | **Occupancy rights** | `getActiveOccupancyAgreements(landId)` filtered to `occupant == msg.sender` OR `grantor == msg.sender` | Plain-English summary; "View agreement" reveals the PDF + terms |
| 7 | **Inheritance status** | `getInheritanceRequest(landId)` + status check | "No pending" / "Pending — vote by DD-MM-YY" / "Disputed" / "Locked for legal review" |
| 8 | **Disputes** | `getLandIdentity(landId).status` ∈ {`LOCKED_*_DISPUTE`} OR an open dispute event in the last 30 days | Red banner + link to dispute detail |
| 9 | **Legal documents** | Aggregated from `_landRecords[landId].ipfsHash`, `getInheritanceRequest(landId).courtOrderCid`, `getActiveOccupancyAgreements(landId).termsCid`, `getLegalOverrides(landId)[].updatedCourtOrderCid` | Up to 3 most-recent inline; "View all (N)" sheet |
| 10 | **Verification status** | `getLandIdentity(landId).status == ACTIVE` AND `verifiedAt > 0` | Green ✓ + "Verified by all N owners on DD-MM-YY"; if `PENDING_VERIFICATION`, shows the per-owner verify table |

### 3.2 Card states

Every card renders one of six prominent visual states based on `LandStatus`:

| Status | Card chrome | Headline tone |
|--------|-------------|---------------|
| `PENDING_VERIFICATION` | Yellow border, hourglass icon | "Awaiting verification — N / M owners verified" |
| `ACTIVE` | Normal `glass-card` | Standard |
| `PENDING_INHERITANCE` | Indigo border, scales icon | "Inheritance vote pending — deadline DD-MM-YY" |
| `PENDING_SUBDIVISION` | Indigo border, map icon | "Subdivision proposed — N new parcels" |
| `LOCKED_IMPORT_DISPUTE` / `LOCKED_INHERITANCE_DISPUTE` / `LOCKED_SUBDIVISION_DISPUTE` | Red border, gavel icon | "Locked for legal review by RESOLVER" |
| `SUBDIVIDED` | Grey border, archive icon | "This land has been subdivided. View N child parcels →" |

Subdued cards (SUBDIVIDED, expired) sort to the bottom by default; filters can flip this.

---

## 4. The Detail Page — Five Tabs

Clicking **View detail** opens `/dashboard/lands/[landId]` with five tabs.

### 4.1 Ownership tab

```
┌─────────────────────────────────────────────────────────────────────┐
│  Ownership  │  Occupancy  │  Inheritance  │  Subdivision  │  Audit  │ ← active
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Current shareholders                                                 │
│                                                                       │
│  ┌──────────────────┬────────────────────┬─────────┬───────────┐    │
│  │ Holder            │ Identity            │ Share   │ Acquired   │    │
│  ├──────────────────┼────────────────────┼─────────┼───────────┤    │
│  │ 0xabc... (you)    │ Ali Khan            │ 30.00%  │ 2025-08-14 │    │
│  │ 0xdef...          │ Sara Khan           │ 30.00%  │ 2025-08-14 │    │
│  │ 0xghi...          │ Bashir Hussain       │ 40.00%  │ 2024-02-03 │    │
│  │ Total                                    │ 100.00% │             │   │
│  └──────────────────┴────────────────────┴─────────┴───────────┘    │
│                                                                       │
│  [ShareDonut chart]                                                   │
│                                                                       │
│  Actions                                                              │
│  [Transfer share]  [List for sale]  [Cancel my listing]  [Withdraw    │
│   proceeds (0.42 ETH)]                                                │
│                                                                       │
│  Ownership history                                                    │
│  (vertical timeline — see frontend doc 01 §8.3)                       │
└─────────────────────────────────────────────────────────────────────┘
```

#### Actions

| Action | Pre-conditions | Contract call |
|--------|---------------|---------------|
| **Transfer share** | `getShareBps(landId, msg.sender) > 0` AND `status == ACTIVE` | `transferShare(landId, recipient, shareBps, salePrice)` |
| **List for sale** | Same | `listShareForSale(landId, shareBpsForSale, price, metadataCid)` (metadata pinned via Pinata first) |
| **Cancel my listing** | `getListing(landId, msg.sender).isActive == true` | `cancelListing(landId)` |
| **Update price** | Active listing of mine | `updateListingPrice(landId, newPrice)` — **lower only**; UI rejects raises with explainer |
| **Withdraw proceeds** | `pendingProceeds(msg.sender) > 0` | `withdrawProceeds()` |

Each action opens a Sheet (right-side drawer) with a 4-step UX (confirm → sign → confirm on-chain → success). The drawer reuses `components/land/*` and `components/marketplace/*` per doc 01 §7.

### 4.2 Occupancy tab

See doc 04 for the full design. Headline:

```
ACTIVE OCCUPANCY AGREEMENTS (2)

┌─────────────────────────────────────────────────────────────────┐
│  Upper floor + Roof access                                         │
│  Granted by Sara Khan to Ali Khan (you)                          │
│  RESIDENTIAL_LEASE · 2025-09-01 to 2027-08-15                     │
│  [View partition agreement (PDF)]                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Lower floor                                                       │
│  Granted by Ali Khan (you) to Sara Khan                            │
│  RESIDENTIAL_LEASE · 2025-09-01 to 2027-08-15                     │
│  [View partition agreement (PDF)]   [Revoke]                       │
└─────────────────────────────────────────────────────────────────┘

[Grant new occupancy]
```

### 4.3 Inheritance tab

See doc 03 for the full design. Headline:

```
NO PENDING INHERITANCE

──── HISTORY ────

2025-08-14  Inheritance executed
   Deceased Asghar Khan (60% holder)
   Heirs: Ali Khan (+30%), Sara Khan (+30%)
   Court order: [View PDF — sha256 abc…]
   sharesHash on-chain: 0x1234… ✓ verifies

[File an inheritance appeal]
```

### 4.4 Subdivision tab

```
This parcel: Plot DHA-9 R-2/417 (generation 0 — top-level import)

PARENT: none

CHILDREN: none

NO PENDING SUBDIVISION PROPOSAL

──── HISTORY ────

(empty — this parcel has never been subdivided)
```

If the land **is** a child of a subdivision:

```
This parcel: Plot DHA-9 R-2/417A (generation 1)

PARENT: Plot DHA-9 R-2/417 (SUBDIVIDED on 2025-08-14)
   Lineage: R-2/417 → R-2/417A

SIBLINGS:
   R-2/417B (ACTIVE)

Authorising court order: [PDF — sha256 def…]
Survey document:        [PDF — sha256 ghi…]
```

### 4.5 Audit tab

The full event log + IPFS document inventory, intended for lawyers and power users:

```
EVENTS (37)

2026-05-10 14:22 ShareSold
  buyer 0xjkl... ← seller 0xabc... · 5% · 0.4 ETH
  tx 0xabcd1234… [Etherscan]

2025-08-14 09:01 InheritanceFinalized
  proposalNonce 1
  sharesHash 0x1234…
  appealId 7
  tx 0x5678cd…

[ ... ]

LEGAL DOCUMENTS (5 CIDs ever attached to this land)

• Qm…abcd  Inheritance court order (2025-08-14)         [PDF] [Verify locally]
• Qm…defg  ERC-721 metadata JSON (mint, 2024-02-03)     [JSON]
• Qm…hijk  Partition agreement (occupancy, 2025-09-01)   [PDF] [Verify locally]
• Qm…lmno  Listing photos pack (2026-05-08)              [JSON]
• Qm…pqrs  (deduplicated from Qm…abcd — same content)
```

Every row is filterable / sortable / exportable to CSV for legal discovery.

---

## 5. The Actions Bar (top of dashboard)

A collapsible Notice that surfaces every action awaiting the connected wallet:

| Trigger | Contract read | Action |
|---------|---------------|--------|
| **Verify import** | `getPendingVerifiers(landId)` returns my address for any landId | "Verify import of {landId}" → opens detail with verify CTA |
| **Vote on inheritance** | `_isHeirFor[landId][nonce][me]` AND `!hasHeirApproved(landId, me)` for any landId in `PENDING_INHERITANCE` | "Vote on inheritance of {landId}" |
| **Vote on subdivision** | `getShareBps(landId, me) > 0` AND status `PENDING_SUBDIVISION` AND I haven't voted | "Vote on subdivision of {landId}" |
| **Dispute notification** | New `*Disputed` event involving a land I have shares in | "{landId} entered legal review" (informational) |
| **Withdraw proceeds** | `pendingProceeds(me) > 0` | "Withdraw {amount} ETH" |
| **Listing expired** | Any active listing of mine whose `deadline < now` | "Your listing of {landId} expired — relist?" |
| **Expirable proposal** | `_inheritanceRequests[landId].votingDeadline < now` AND not resolved | "Inheritance proposal on {landId} is expirable — reset?" |

The bar collapses by default to "3 actions await you" with an expand chevron. Dismissed items go to a "/dashboard/notifications" feed.

---

## 6. Summary Tiles

Four KPIs above the property grid:

| Tile | Source | Tooltip |
|------|--------|---------|
| **Lands I own a share in** | `getLandsByOwner(me).length` | "Each is a parcel where you hold a basis-point share" |
| **Average share** | Σ(bps for each land) / count / 100 | "Higher means you have more concentrated ownership" |
| **Disputes touching me** | Lands of mine with `status` ∈ {`LOCKED_*`} | Red if > 0; greys out if 0 |
| **Pull-payment balance** | `pendingProceeds(me)` formatted as ETH | Click to claim |

---

## 7. Filters & Sort

Filters apply to the property grid:

- **Type**: All / Residential / Agricultural / Commercial
- **Status**: All / Active / Pending verification / Pending inheritance / Pending subdivision / Disputed / Subdivided
- **Min share %**: 0% / 10% / 25% / 50% / 100%
- **Has open listing**: yes / no
- **Has active occupancy I'm involved in**: yes / no

Sort:
- Acquired (most recent first) [default]
- My share % (highest first)
- Total area (largest first)
- Land ID (alphabetical)

State lives in the URL query (`?type=RESIDENTIAL&minShare=25`) so dashboards can be linked.

---

## 8. Co-owners Drill-Down

Each shareholder row in the card or detail page expands to a small popover:

```
┌──────────────────────────────────────────┐
│  Sara Khan                                 │
│  CNIC 35202-1234567-8                      │
│  Wallet 0xdefa…1234   [Copy]               │
│                                             │
│  Holds 30.00% (3,000 bps)                   │
│  Acquired: 2025-08-14 via inheritance       │
│  Other lands: 2 parcels                     │
│                                             │
│  [View profile]                            │
└──────────────────────────────────────────┘
```

`View profile` opens `/dashboard/users/[address]` with that user's portfolio (public).

---

## 9. Verification Status Detail

When a land is in `PENDING_VERIFICATION`, the detail page shows a per-owner verification table:

```
PENDING VERIFICATION

This land is awaiting verification by every proposed co-owner before
it activates. The NFT will mint and share ledger populate atomically
once the last owner verifies.

Verification deadline: 2026-08-12 (45 days remaining)

┌──────────────────────────┬────────────┬────────────┬───────────┐
│  Proposed Owner            │ Identity   │ Share      │ Status     │
├──────────────────────────┼────────────┼────────────┼───────────┤
│  0xabc... (you)            │ Ali Khan   │ 30.00%     │ ✓ Verified │
│  0xdef...                  │ Sara Khan  │ 30.00%     │ ✗ Pending  │
│  0xghi...                  │ Bashir H.  │ 40.00%     │ ✓ Verified │
└──────────────────────────┴────────────┴────────────┴───────────┘

Court order (if any): [PDF preview]   sha256 abc…
ERC-721 metadata:      [JSON preview]
```

If I'm one of the pending verifiers and I haven't acted, a prominent **"Verify this import"** button is shown above the table. Clicking opens the verify Sheet with the same court-order PDF preview and a confirm + sign flow.

---

## 10. The Empty State

New wallets see:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│  No properties yet                                                │
│                                                                   │
│  You don't currently hold a share in any registered parcel.       │
│                                                                   │
│  Three reasons this might be:                                     │
│                                                                   │
│  1. You haven't registered your CNIC on-chain yet.                │
│     → [Register now]                                              │
│                                                                   │
│  2. The developer hasn't proposed your import yet.                │
│     → Contact your transfer office with this wallet address:      │
│       0xabc… [Copy]                                               │
│                                                                   │
│  3. A pending import is awaiting your verification.               │
│     → [Check pending imports]                                      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

This converts the "I see nothing" experience into a self-service onboarding path.

---

## 11. Real-Time Updates

The dashboard subscribes to `wallet:{me}` on the backend's WebSocket channel. Incoming events refresh the relevant tile / card without a manual reload:

| Event | Frontend reaction |
|-------|-------------------|
| `ShareTransferred` involving me | Update the affected card's share + history |
| `ShareSold` involving me as buyer / seller | Update card + bump pull-payment tile |
| `LandImportFinalized` for a land I'm a proposed owner of | Promote the card from "PENDING_VERIFICATION" to "ACTIVE" |
| `InheritanceInitiated` for a land where I'm a heir | Add to actions bar |
| `OccupancyGranted` / `Revoked` with me as grantor / occupant | Update card's occupancy summary |
| `LandStatusChanged` for any of my lands | Re-render card chrome |

---

## 12. Performance

- Per-card data fetched in one multicall via wagmi's batched calls (`getLandFullView` + `getActiveOccupancyAgreements` + `getShareBps(landId, me)` + `getInheritanceRequest` aggregated)
- Cards virtualised when count > 24 (`@tanstack/react-virtual`)
- IPFS enrichment (area, location, photos) lazy-loaded after the card is in view
- The first paint uses the backend's denormalised projection (`GET /v1/users/:address`) so the dashboard is full-fidelity within ~200 ms; on-chain reads upgrade in-place

---

## 13. Empty / Edge / Error states

| Scenario | UI |
|----------|----|
| Wallet not connected | Hero with "Connect wallet to view your properties" CTA |
| Wallet connected, not registered | Empty-state path #1 (see §10) |
| RPC down | Banner "Live data unavailable — showing last synced data from {timestamp}" |
| Backend down | Same banner; everything reads still work because contract is the source of truth |
| IPFS gateway slow | Card renders without photos; "Loading metadata…" placeholder |
| Pull-payment send fails | Toast: "Withdrawal reverted — your balance is unchanged"; the contract's CEI guarantees no funds are lost |

---

## 14. Accessibility Highlights

- Tab order: Notice bar → Summary tiles → Filter row → Property cards (grid traversal in reading order)
- The ShareDonut has an `aria-label` that reads "30% Ali Khan; 30% Sara Khan; 40% Bashir Hussain"
- The Actions bar uses `role="status"` so screen readers announce new items
- All countdown timers have `aria-live="polite"` updates every minute (not every second — would be noisy for screen readers)

---

## 15. Component Reuse

```
DashboardPage
├── ActionsBar             (src/components/dashboard/ActionsBar.tsx)
├── SummaryTiles           (src/components/dashboard/SummaryTiles.tsx)
├── FilterRow              (src/components/dashboard/FilterRow.tsx)
└── LandGrid               (src/components/dashboard/LandGrid.tsx)
    └── LandCard           (src/components/land/LandCard.tsx)
        ├── StatusPill
        ├── ShareDonut          [tab-1 reuse]
        ├── ShareholderTableInline
        ├── OccupancySummary   [tab-2 reuse]
        ├── InheritanceSummary [tab-3 reuse]
        └── LegalDocList
```

Each sub-component pulls its own slice via `useReadContract` so cards are independently refreshable.

---

## 16. Diagram — Dashboard Data Flow

```
                 ┌─────────────────────┐
   wallet conn ─►│ useAccount()         │
                 └────────┬─────────────┘
                          │ address
                          ▼
              ┌────────────────────────┐
              │ useLandsByOwner(addr)   │ ──read──► contract.getLandsByOwner
              └──────────┬──────────────┘
                         │ landIds[]
                         ▼
        ┌────────────────────────────────────────┐
        │  for each landId — useLandFullView(id)  │ ──multicall──► contract.getLandFullView(id)
        └─────────────────┬───────────────────────┘
                          │ (identity, ownership)
                          ▼
            ┌──────────────────────────┐
            │  RENDER  LandCard         │
            │  with all 10 fields       │
            └──────────────────────────┘
                          ▲
                          │ invalidate on
                          │ Share/Status/etc events
            ┌──────────────────────────┐
            │  WSProvider (wallet:{addr})│
            └──────────────────────────┘
```

The dashboard is a deliberately thin layer: read on-chain, render. The backend's contribution is the actions-bar denormalisation, citizen-name lookup for co-owners, and the WebSocket fan-out.
