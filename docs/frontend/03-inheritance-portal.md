# Inheritance Portal — Frontend

> **Scope.** End-to-end frontend for the four-phase inheritance workflow defined by the v9 contract. The portal handles appeal filing by heirs, court-order PDF upload + IPFS pinning, immutable proposal review with **cryptographic self-verification** (`sharesHash`), heir vote / dispute actions, dispute escalation, and resolver-side legal override with full audit metadata.
>
> **Trust posture.** The frontend is built so a citizen can confirm — without trusting the backend or the developer — that the on-chain ownership change matches the court order they're holding in their hand.

This doc maps to:

- **Contract reads:** `getInheritanceRequest`, `hasHeirApproved`, `getInheritanceAppeal`, `getInheritanceAppealsForLand`, `totalInheritanceAppeals`, `getLegalOverrides`, `getLegalOverride`, `totalLegalOverrides`, `computeSharesHash` (pure)
- **Contract writes (citizen):** `fileInheritanceAppeal`, `approveSuccessionPlan`, `disputeSuccessionPlan`, `expireInheritance`
- **Contract writes (registrar):** `initiateInheritance`
- **Contract writes (resolver):** `freezeInheritanceForReview`, `resolveInheritanceDispute`
- **Backend endpoints (per docs 03 + 04):** `/v1/inheritance/appeals` (POST file appeal w/ PDF upload), `/v1/admin/inheritance/appeals/:id/decision`, `/v1/resolver/inheritance/:landId/{freeze,resolve}`, `/v1/court-orders/*`

---

## 1. Three Portal Surfaces

```
┌────────────────────────────────────────────────────────────────────────┐
│  /dashboard/inheritance                  CITIZEN-FACING                  │
│  (heir / lawyer / family member portal)                                  │
│    • file new appeal                                                     │
│    • view my appeals + their status                                     │
│    • vote on inheritance proposals where I'm named                       │
│    • dispute a proposal                                                  │
│    • view per-land inheritance history                                  │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  /admin/inheritance                       REGISTRAR-FACING               │
│  (off-chain reviewer panel — REGISTRAR_ROLE)                             │
│    • pending appeal queue                                                │
│    • appeal detail with court-order PDF + structured-check form          │
│    • compose immutable proposal (heirs[], heirShares[], appealId)        │
│    • dashboard of in-flight proposals                                    │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  /resolver/inheritance                    RESOLVER-FACING                │
│  (court-anchored arbiter — RESOLVER_ROLE)                                │
│    • queue of LOCKED_INHERITANCE_DISPUTE lands                           │
│    • dispute detail with original proposal + uploaded CIDs               │
│    • freeze-for-review action                                           │
│    • force-execute OR cancel with 4 mandatory audit anchors              │
└────────────────────────────────────────────────────────────────────────┘
```

Citizen surface uses `<RegisteredGuard>`; admin and resolver surfaces use `<RoleGuard role={REGISTRAR_ROLE}>` and `<RoleGuard role={RESOLVER_ROLE}>` respectively.

---

## 2. Citizen Portal — Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Inheritance                                                          │
│  Files appeals, votes on proposals, tracks disputes                   │
│                                                                       │
│  ┌──────────────┬─────────────────────┬─────────────────────────┐    │
│  │ Pending vote │ Disputed proposals  │ Appeals I've filed       │   │
│  │ (2)          │ (1)                  │ (3)                       │   │
│  └──────────────┴─────────────────────┴─────────────────────────┘    │
│                                                                       │
│  [+ File new inheritance appeal]                                      │
│                                                                       │
│  ── PENDING YOUR VOTE ──                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Plot Bahria-A-12  ·  deadline 2026-06-12 (8 days)            │    │
│  │  Deceased: Asghar Khan (held 60.00%)                          │    │
│  │  3 heirs proposed — you're one (proposed 20.00%)              │    │
│  │  Court order: AsgharKhan_2025_succession.pdf                  │    │
│  │  sharesHash: 0x1234…  [Verify locally]                        │    │
│  │  [Review and vote →]                                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ── MY APPEALS ──                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Appeal #7  ·  filed 2026-04-08  ·  Status: PROPOSAL ACTIVE   │    │
│  │ Plot DHA-9 R-2/417  ·  Deceased Asghar Khan                   │    │
│  │ → proposal pending heir vote (2 of 3 approved)                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Appeal #4  ·  filed 2026-01-15  ·  Status: REJECTED          │    │
│  │ Plot CDA E-11/3 plot 22  ·  Deceased Yusuf Ahmed              │    │
│  │ → Reviewer notes: "Court order superseded by amended order"   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ── HISTORY ──                                                        │
│  All inheritance events touching a land I have shares in              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Filing an Appeal

### 3.1 Flow

```
/dashboard/inheritance/appeals/new
  │
  │ 1. Pick the affected land (landId)
  │    — autocomplete against backend's land registry
  │    — must be ACTIVE (else block with explanation)
  │
  │ 2. Pick the deceased holder
  │    — dropdown of current shareholders of that land
  │    — must have shareBps > 0 (else block)
  │
  │ 3. Upload court-order PDF
  │    — multipart upload to POST /v1/court-orders
  │    — backend pins + read-back + sha256
  │    — returns { ipfsCid, sha256, verifyStatus: UNVERIFIED }
  │
  │ 4. Write a short relationship note (optional)
  │    — "I am the eldest son" — context for the reviewer
  │
  │ 5. Pre-compose unsigned tx
  │    — backend pre-composes fileInheritanceAppeal(landId, deceased, ipfsCid)
  │
  │ 6. Sign and submit (heir's own wallet)
  │    — RainbowKit / wagmi useWriteContract
  │    — appeal carries the heir's accountability on-chain (filer = msg.sender)
  │
  │ 7. Confirmation
  │    — TxToast tracks 12 confirmations
  │    — InheritanceAppealFiled event indexed
  │    — receipt screen shows appealId
  │
  ▼
Appeal #7 filed
```

### 3.2 Court-order upload UX

The PDF upload is its own component (`<CourtOrderUploadField>`):

```
┌─────────────────────────────────────────────────────────────────┐
│  Upload court order                                                │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  📄  Drop a PDF here, or [Browse]                            │  │
│  │     Max 10 MB · PDF only                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                     │
│  After upload:                                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  AsgharKhan_2025_succession.pdf  (2.4 MB)                    │  │
│  │  sha256:  abc123def456…ef89                                  │  │
│  │  IPFS CID: QmYxabc…1234   [Open on gateway]                  │  │
│  │  Pin status: ✓ Verified (pinned + read-back match)           │  │
│  │  [Preview PDF]                                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Status: UNVERIFIED — the registrar will validate the court order   │
│  off-chain before composing the inheritance proposal.               │
└─────────────────────────────────────────────────────────────────┘
```

The component is reused on `/admin/inheritance` (reviewer re-fetches and previews the same CID) and `/dashboard/inheritance/vote/[landId]` (heir reviews the CID before voting).

### 3.3 Frontend validation

Before submitting:

| Check | If fails |
|-------|----------|
| File is ≤ 10 MB and `application/pdf` | Reject inline |
| `landId` exists on-chain (`_landExists(landId) == true`) | "Land not found" |
| `_landRecords[landId].status == ACTIVE` | "Land is not in active state — appeal cannot proceed" |
| `deceasedHolder` has `_shareBps > 0` on this land | "Selected deceased holder owns no shares of this land" |
| Wallet is a registered citizen (`_users[me].isRegistered`) | "Register your CNIC first" |

Skipping any of these results in a contract revert at signing time; we surface them earlier for UX.

---

## 4. Reviewer Panel (REGISTRAR_ROLE)

`/admin/inheritance` is the queue of `PENDING` appeals waiting for off-chain validation.

### 4.1 Queue list

```
PENDING APPEALS (4)

#  ID   Land               Deceased           Filed         Filer
─  ──   ─────────────────  ────────────────   ──────────    ─────────
1  #11  DHA-9 R-2/417       Asghar Khan         2026-05-10    Ali Khan
2  #10  Bahria-K Phase 2    Yusuf Sheikh        2026-05-09    M. Akram (lawyer)
3  #09  CDA E-11/3 #22      Hina Begum          2026-05-08    Reza Ahmed
4  #08  Bahria Lhr P-9     Khalid Mahmood     2026-04-30    Sabir Hussain
```

### 4.2 Appeal detail screen

```
┌─────────────────────────────────────────────────────────────────────┐
│  Appeal #11                                                            │
│  Filed by 0xabc… (Ali Khan, CNIC 354…)  on 2026-05-10                  │
│                                                                         │
│  ┌──── Land ────┐ ┌──── Deceased ────┐ ┌──── Court order ────┐         │
│  │ DHA-9 R-2/417 │ │ 0xdef…           │ │ Qm…abcd               │         │
│  │ Residential    │ │ Asghar Khan      │ │ sha256 abc…           │         │
│  │ 1 kanal        │ │ Held 60.00%      │ │ pinStatus VERIFIED    │         │
│  │ Status ACTIVE  │ │                  │ │ [Preview PDF inline]  │         │
│  └─────────────┘ └────────────────┘ └─────────────────────┘         │
│                                                                         │
│  Current shareholders of this land:                                    │
│  ● Asghar Khan (deceased)      60.00%                                  │
│  ● Bashir Hussain               40.00%                                 │
│                                                                         │
│  ── REVIEWER CHECKLIST ──                                              │
│  See doc 04 §5 for the 11-point structured-check form.                 │
│                                                                         │
│  ── PROPOSED REDISTRIBUTION (from the court order) ──                  │
│  ┌──────────────────┬──────────────┬──────────────┬─────────────┐    │
│  │ Heir              │ Wallet       │ Share        │ Resolves to  │   │
│  ├──────────────────┼──────────────┼──────────────┼─────────────┤    │
│  │ Ali Khan          │ 0xabc…       │ 20.00%       │ +20.00%     │   │
│  │ Sara Khan         │ 0xdef…       │ 20.00%       │ +20.00%     │   │
│  │ Aamir Khan        │ 0xghi…       │ 20.00%       │ +20.00%     │   │
│  │ TOTAL (must = deceased's bps)     │ 60.00% ✓     │              │   │
│  └──────────────────┴──────────────┴──────────────┴─────────────┘    │
│                                                                         │
│  Pre-flight checks:                                                    │
│  ✓ All heirs registered or hold GOVT_AUTHORITY                         │
│  ✓ No duplicate heirs                                                  │
│  ✓ No heir == deceased                                                 │
│  ✓ Sum of heir shares == deceased's current bps                        │
│  ✓ Court-order CID is VALIDATED                                        │
│                                                                         │
│  ── DECISION ──                                                        │
│  ( ) VALIDATE — compose immutable proposal                              │
│  ( ) REJECT — reason: ______________________________                    │
│                                                                         │
│  [Submit decision]                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Submitting `VALIDATE` triggers two on-chain calls in sequence (chained, both signed via HSM):

1. (optional) re-pin if any court-order CID needs to be updated
2. `initiateInheritance(landId, deceased, heirs[], heirShares[], courtCid, appealId=11)` from the REGISTRAR HSM key

A live progress modal shows: submitted → confirmed → indexed → `sharesHash` cross-validated → heirs notified.

### 4.3 sharesHash cross-validation

Before signing, the reviewer panel:

1. Calls `contract.computeSharesHash(heirs, heirShares, courtCid)` via wagmi `useReadContract`
2. Stores the result in DB as the **expected** `sharesHash`
3. After `initiateInheritance` confirms, the indexer fires `InheritanceInitiated(.., emittedSharesHash, ..)`
4. Frontend compares emitted vs expected — divergence triggers a critical alert (impossible under normal conditions; would indicate that the proposed arrays changed between off-chain validation and on-chain submission)

This is the same chain-of-custody check the contract documents in its preamble.

---

## 5. Heir Vote Screen — the headline page

`/dashboard/inheritance/vote/[landId]` is where the cryptographic anchoring becomes a citizen UX. **One button on this page closes the entire "backend silently rewrote shares" attack surface.**

### 5.1 Layout (split-pane)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Inheritance vote — Plot DHA-9 R-2/417                                       │
│  Proposal nonce 1  ·  Filed by REGISTRAR  ·  Deadline 2026-06-12 (8 days)    │
│                                                                              │
│  ┌────────────── COURT ORDER ──────────────┐  ┌─── PROPOSED CHANGES ──────┐ │
│  │                                          │  │ Deceased Asghar Khan       │ │
│  │  [PDF embed — fills left pane]          │  │ Held 60.00% (6,000 bps)    │ │
│  │  AsgharKhan_2025_succession.pdf         │  │                            │ │
│  │  CID: Qm…abcd                            │  │ Heirs:                     │ │
│  │  sha256 from gateway: abc123…           │  │ • Ali Khan      +20.00%   │ │
│  │  [Verify locally]                        │  │ • Sara Khan     +20.00%   │ │
│  │   ▲                                       │  │ • Aamir Khan    +20.00%   │ │
│  │   re-prompts for the file on your        │  │ Sum:           60.00% ✓   │ │
│  │   device, computes sha256, compares.     │  │                            │ │
│  │                                          │  │ Other co-owners unaffected │ │
│  │  [Open on IPFS gateway]                  │  │ • Bashir Hussain 40.00%   │ │
│  │                                          │  │   (unchanged)              │ │
│  │                                          │  │                            │ │
│  └─────────────────────────────────────────┘  └──────────────────────────┘ │
│                                                                              │
│  ── CRYPTOGRAPHIC ANCHOR ──                                                  │
│  On-chain sharesHash:  0x1234abcd5678ef90 1234abcd5678ef90 …                  │
│  [Recompute client-side]   →  ✓ matches on-chain value                        │
│  ▲                                                                            │
│  This recomputes keccak256(abi.encode(heirs[], heirShares[], courtOrderCid))  │
│  in your browser, with NO backend involvement, and shows ✓ only if it         │
│  matches the value the contract committed at proposal time.                  │
│  If it doesn't match, the backend changed the inputs after court-order        │
│  validation — DISPUTE the proposal.                                           │
│                                                                              │
│  ── YOUR ROLE ──                                                              │
│  You (Ali Khan, 0xabc…) are named as an heir. Proposed share: 20.00%         │
│                                                                              │
│  Heirs who have voted yes (2 of 3):                                          │
│  ● Sara Khan   ✓ approved  2 days ago                                         │
│  ● Aamir Khan  ✓ approved  1 day ago                                          │
│  ● Ali Khan (you)  — not voted —                                              │
│                                                                              │
│  ── ACTIONS ──                                                                │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐    │
│  │  ✓ Approve (sign)              │  │  ⚠ Dispute (sign)              │    │
│  │                                 │  │                                │    │
│  │  Approves the redistribution    │  │  Freezes the proposal in       │    │
│  │  exactly as shown on the right. │  │  LOCKED_INHERITANCE_DISPUTE.   │    │
│  │  If you're the last to approve, │  │  A court-anchored RESOLVER     │    │
│  │  the contract auto-executes the │  │  must resolve with an updated  │    │
│  │  redistribution atomically —    │  │  court order, legal-resolution │    │
│  │  the NFT does NOT move and the  │  │  document, and written reason. │    │
│  │  tokenId does NOT change.       │  │                                │    │
│  │                                 │  │                                │    │
│  └────────────────────────────────┘  └────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Why this design

Five citizen-readable affordances close five specific attack surfaces:

| Affordance | Closes |
|-----------|--------|
| **PDF embed of the actual court order** | "Backend lied about what the court ordered" — heir reads the document directly |
| **Verify locally button** | "Backend served a different PDF from the IPFS one" — heir re-fetches from a public gateway, computes sha256, compares |
| **Side-by-side heir table** | "Heir names / shares don't match the court order" — visible at a glance |
| **Recompute sharesHash button** | "Backend re-wrote the heir array between court-order validation and on-chain proposal" — heir reproduces keccak256 in-browser; ✗ ⇒ the registrar tampered, dispute |
| **Other co-owners shown as unchanged** | "Inheritance secretly affected non-deceased shares" — visible, unchanged |

### 5.3 What happens when the heir clicks Approve

```
Heir clicks Approve
   ▼
Confirm Sheet shows:
   "You're voting YES on the proposal above.
    If you are the last heir to approve, the redistribution executes
    atomically (your share becomes 30.00% total)."
   [Cancel]   [Sign and submit]
   ▼
wagmi useWriteContract → approveSuccessionPlan(landId)
   ▼
TxToast shows 1/12 → 12/12 confirmations
   ▼
Receipt screen:
  "Your approval was confirmed at block N.
   2 of 3 heirs approved; 1 more needed to execute."
   ▼
WebSocket pushes HeirApproved event → other heirs' dashboards update
   ▼
When the last heir approves, _executeInheritance auto-fires:
   • _shareBps decreases for deceased, increases for each heir
   • OwnershipChange rows written
   • status → ACTIVE
   • InheritanceFinalized event indexed
   ▼
All affected wallets receive WS push:
   "Inheritance for Plot DHA-9 R-2/417 is finalized.
    Your share is now 30.00%."
```

### 5.4 What happens when the heir clicks Dispute

```
Heir clicks Dispute
   ▼
Confirm Sheet shows:
   "Disputing freezes this proposal in LOCKED_INHERITANCE_DISPUTE.
    A court-anchored RESOLVER must resolve before the redistribution
    can execute. The resolver must commit:
      • an updated court-order CID
      • a legal-resolution document CID
      • a written reason
    Their action will be publicly auditable on-chain."
   Optional: [Describe your grievance (off-chain note)] ___________
   [Cancel]   [Sign and submit]
   ▼
disputeSuccessionPlan(landId)
   ▼
Status → LOCKED_INHERITANCE_DISPUTE
   ▼
RESOLVER portal is updated; all named heirs are notified
```

The optional grievance note is stored off-chain (the contract has no field for it) and forwarded to the resolver via the backend's `/v1/resolver/queue` payload. It doesn't change anything on-chain.

---

## 6. Dispute Tracking (citizen-facing)

After a dispute is filed, the heir's dashboard shows:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠ Plot DHA-9 R-2/417 — IN LEGAL REVIEW                            │
│                                                                     │
│  Status: LOCKED_INHERITANCE_DISPUTE  ·  Frozen since 2026-05-12     │
│  Disputed by: Sara Khan                                             │
│                                                                     │
│  Original court order:    Qm…abcd  [PDF]  [Verify locally]          │
│  Original proposal:       Heirs 3 × 20%                              │
│                                                                     │
│  Awaiting resolution by RESOLVER (court-anchored arbiter).          │
│  When resolved, the resolver must publish:                          │
│     • updated court order CID                                       │
│     • legal-resolution document CID                                 │
│     • written reason                                                │
│                                                                     │
│  Resolution history (0)                                             │
│  — none yet —                                                        │
└─────────────────────────────────────────────────────────────────┘
```

When the resolver resolves, the timeline updates:

```
Resolution history (1)

2026-05-25 09:14  resolved by RESOLVER 0xres…1234
  Force-executed: YES
  Updated court order:        Qm…amended  [PDF]  [Verify locally]
  Legal-resolution document:  Qm…judgment [PDF]  [Verify locally]
  Reason: "Original heir Ali Khan's share corrected from 20% to 25%
            per amended succession order dated 2026-05-20"
  Recompute new sharesHash:   0x9999…
  [Recompute client-side]  →  ✓ matches new on-chain value
```

The recompute affordance is offered **again** on the resolution — citizens verify the new amended shares against the new court order with the same cryptographic check.

---

## 7. Inheritance History Tab

`/dashboard/lands/[landId]/inheritance` shows every inheritance event ever on this land:

```
INHERITANCE HISTORY (2 cycles)

╔══ Cycle 2 (current) ═══════════════════════════════════════════╗
║ proposalNonce 2                                                 ║
║ Initiated 2026-05-10 by REGISTRAR (linked to appealId 11)       ║
║ Court order Qm…abcd  [PDF] [Verify locally]                     ║
║ Deceased: Asghar Khan (60.00%)                                  ║
║ Heirs: Ali +20%, Sara +20%, Aamir +20%                          ║
║ Status: PENDING_INHERITANCE — 2 of 3 approved                   ║
║                                                                  ║
║ Vote timeline                                                    ║
║   2026-05-11  Sara Khan      ✓ approved                          ║
║   2026-05-12  Aamir Khan     ✓ approved                          ║
║   ...        Ali Khan        — your vote needed —                ║
╠══════════════════════════════════════════════════════════════════╣
║ Cycle 1                                                          ║
║ proposalNonce 1                                                 ║
║ Initiated 2024-09-01 (linked to appealId 4) — REJECTED off-chain ║
║ Court order Qm…superseded                                       ║
║ Status: REJECTED at off-chain review (never proposed on-chain)   ║
╚══════════════════════════════════════════════════════════════════╝
```

Each cycle is a separate proposalNonce. The history is a permanent record of every attempt — including rejected ones — so the audit trail of who tried what is complete.

---

## 8. Resolver Portal

`/resolver/inheritance` — for `RESOLVER_ROLE` wallets only.

### 8.1 Queue

```
LOCKED INHERITANCE DISPUTES (3)

#  Land               Frozen since   Disputed by    Heirs    Court order
─  ─────────────────  ─────────────  ──────────────  ─────    ──────────────
1  DHA-9 R-2/417      2026-05-12     Sara Khan       3        Qm…abcd
2  Bahria-K P-2       2026-04-30     M. Akram        4        Qm…wxyz
3  CDA E-11/3 #22     2026-04-22     R. Ahmed        2        Qm…zzz
```

### 8.2 Dispute detail (resolution form)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Resolve dispute — Plot DHA-9 R-2/417                                │
│                                                                       │
│  Original proposal (frozen):                                          │
│    Court order Qm…abcd  [PDF]  [Verify locally]                       │
│    Deceased: Asghar Khan (60.00%)                                     │
│    Heirs: Ali Khan +20%, Sara Khan +20%, Aamir Khan +20%              │
│    sharesHash:  0x1234…                                               │
│                                                                       │
│  Disputer's grievance (off-chain note):                              │
│    "Sara Khan claims the court order has been amended to give Ali 25%│
│     and Aamir 15% per the May 2026 amendment hearing."               │
│                                                                       │
│  ── YOUR DECISION ──                                                   │
│  ( ) Force-execute the standing plan  (use this if the dispute is invalid)│
│  ( ) Force-execute with amended shares (re-upload court order + shares)│
│  ( ) Cancel the proposal (back to ACTIVE; registrar may re-propose)   │
│                                                                       │
│  ── REQUIRED AUDIT METADATA ──                                         │
│  Updated court order CID                                              │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │  [Upload PDF or paste existing validated CID]              │        │
│  │  → pin + read-back + sha256 + reviewer chain               │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                       │
│  Legal-resolution document CID                                        │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │  [Upload PDF or paste existing validated CID]              │        │
│  │  This is the JUDGMENT or written decision that resolves    │        │
│  │  this specific dispute — distinct from the inheritance     │        │
│  │  court order itself.                                       │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                       │
│  Reason  (will be permanently logged on-chain)                        │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │  Original heir Ali Khan's share corrected from 20% to 25%  │        │
│  │  per amended succession order dated 2026-05-20             │        │
│  │  (256 char limit · 89 used)                                │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                       │
│  [Resolve dispute and sign]                                           │
└─────────────────────────────────────────────────────────────────────┘
```

The submit button is enabled only when all three audit anchors are populated and pass `boundedString` (non-empty + ≤ MAX_STRING_LENGTH).

The signing flow uses a **step-up signature** binding `(action='resolveInheritanceDispute', landId, forceExecute, updatedCourtCid, legalResolutionCid, reason)` so a captured signature cannot be replayed for a different action.

After signing:

1. RESOLVER HSM signs the tx.
2. `resolveInheritanceDispute` emits `LegalOverrideExecuted` with the full payload.
3. `_legalOverrides[landId]` gets a new row.
4. All named heirs + the original appeal filer + the registrar receive a WS push.
5. The heir's vote screen shows the new resolution timeline entry (see §6).

### 8.3 Freeze-for-review action

A separate action on the queue is **"Freeze a non-disputed proposal for legal review"**:

```
Open proposals (not yet disputed)

Plot Bahria Lahore P-9   ·  status: PENDING_INHERITANCE
[Freeze for review] →
   Reason: ___________________________________________________________
   [Sign and submit]   →  freezeInheritanceForReview(landId, reason)
```

This is used when an external authority (court / prosecutor / regulator) instructs the resolver to stay a case independent of any heir disputing.

---

## 9. Notifications

Citizens are notified via three channels:

| Trigger | Channel | Content |
|---------|---------|---------|
| `InheritanceAppealFiled` (filer or named deceased shareholders) | In-app + email | "Appeal #11 filed against your land DHA-9 R-2/417" |
| `InheritanceInitiated` (heirs) | In-app + email + SMS | "You are named as an heir to Plot DHA-9. Vote by 2026-06-12." |
| `HeirApproved` | In-app push to other heirs | "Sara Khan approved. 2 of 3 votes received." |
| `InheritanceDisputed` | In-app + email | "Plot DHA-9 R-2/417 is now in legal review." |
| `InheritanceFinalized` | In-app + email | "Inheritance complete. Your new share is 30%." |
| `InheritanceFrozenForReview` | In-app + email | "Plot DHA-9 R-2/417 frozen by RESOLVER. Reason: …" |
| `LegalOverrideExecuted` | In-app + email + SMS | "Resolver decision: force-executed / cancelled. View the new court order + judgment." |
| `InheritanceExpired` | In-app + email | "Proposal expired without consensus. The registrar may re-propose." |
| Deadline approaching (7 / 1 day before) | In-app + email + SMS | Reminders for heirs who haven't voted |

All notifications carry a deep link to the vote screen or the dispute detail.

---

## 10. Expirable Proposals

If the 30-day voting window elapses without unanimous approval, anyone can call `expireInheritance(landId)`. The frontend exposes this as a public utility:

```
On the heir vote screen, when block.timestamp > votingDeadline:

   ⚠ This proposal's voting window has expired (deadline 2026-06-12).
   Anyone may reset the land to ACTIVE so the registrar can re-propose.

   [Reset proposal (gas-paid by you)]
```

Clicking signs `expireInheritance(landId)` from the user's wallet. The contract bears no role check on this function — it's a public utility.

---

## 11. State Mapping Reference

| Contract state | Citizen sees | Vote button | Dispute button | Expire button |
|----------------|--------------|-------------|----------------|---------------|
| `ACTIVE` | "No pending inheritance" | hidden | hidden | hidden |
| `PENDING_INHERITANCE` AND deadline > now AND I'm heir AND not voted | "Pending your vote" | enabled | enabled | hidden |
| `PENDING_INHERITANCE` AND deadline > now AND I'm heir AND voted | "Awaiting other heirs" | disabled (voted) | enabled | hidden |
| `PENDING_INHERITANCE` AND deadline > now AND I'm NOT heir | informational only | hidden | hidden | hidden |
| `PENDING_INHERITANCE` AND deadline <= now | "Voting expired" | hidden | hidden | enabled (anyone) |
| `LOCKED_INHERITANCE_DISPUTE` | "In legal review" | hidden | hidden | hidden |

---

## 12. Performance & Edge Cases

| Concern | Approach |
|---------|----------|
| Heir wallet on a slow IPFS gateway | Multi-gateway fallback (Pinata → ipfs.io → cloudflare) with 5s timeout each |
| Recompute hash on a 50-heir proposal | keccak256 in-browser via viem's `keccak256` is sub-ms even for 50 heirs |
| Heir loses access mid-vote | Contract enforces single-vote per nonce; if heir wallet is compromised, they dispute via a recovery process off-chain → resolver path |
| Resolver step-up signature lost (page reload) | Signature is single-use; resolver re-signs |
| Indexer lag on confirmation | TxToast shows live block-counter; user sees confirmation in real-time |
| WS disconnect | Polls every 30 s as fallback; reconnects automatically |

---

## 13. Reuse Map

```
InheritancePortal (/dashboard/inheritance)
├── PendingVoteList
│   └── ProposalCard          src/components/inheritance/ProposalCard.tsx
│       ├── HeirShareTable
│       ├── CourtOrderPreview        src/components/shared/CourtOrderPreview.tsx
│       └── SharesHashVerifier       src/components/inheritance/SharesHashVerifier.tsx
├── MyAppealsList
│   └── AppealCard             src/components/inheritance/AppealCard.tsx
└── HistoryTimeline            src/components/inheritance/HistoryTimeline.tsx

AppealNewPage (/dashboard/inheritance/appeals/new)
├── LandPicker
├── DeceasedPicker
├── CourtOrderUploadField      src/components/shared/CourtOrderUploadField.tsx
└── AppealComposeAndSign

VoteScreen (/dashboard/inheritance/vote/[landId])
├── CourtOrderPreview          (reused)
├── HeirShareTable             (reused)
├── SharesHashVerifier         (reused — the headline cryptographic affordance)
├── VotePanel                  src/components/inheritance/VotePanel.tsx
│   ├── ApproveButton
│   └── DisputeButton
└── ResolutionTimeline         src/components/inheritance/ResolutionTimeline.tsx

ReviewerPanel (/admin/inheritance)
├── AppealQueue
├── AppealReviewForm           src/components/inheritance/AppealReviewForm.tsx
│   ├── CourtOrderPreview      (reused)
│   ├── ReviewerChecklist      src/components/inheritance/ReviewerChecklist.tsx
│   └── ComposeProposalForm
└── ProposalSubmissionLog

ResolverPanel (/resolver/inheritance)
├── DisputeQueue
└── ResolverDecisionForm       src/components/disputes/ResolverDecisionForm.tsx
    ├── CourtOrderPreview      (reused)
    ├── CourtOrderUploadField  (reused for updated court order + legal resolution)
    └── StepUpSignatureSubmit
```

The `SharesHashVerifier` component is intentionally tiny but headline:

```tsx
// src/components/inheritance/SharesHashVerifier.tsx
export function SharesHashVerifier({ landId, heirs, heirShares, courtOrderCid, expected }: Props) {
  const { data: computed } = useReadContract({
    abi, address, functionName: 'computeSharesHash',
    args: [heirs, heirShares, courtOrderCid],
  });

  const matches = computed && expected && computed.toLowerCase() === expected.toLowerCase();
  return (
    <div className="surface">
      <code>on-chain: {expected}</code>
      <button onClick={trigger}>Recompute client-side</button>
      {computed && (
        <Badge variant={matches ? 'success' : 'destructive'}>
          {matches ? '✓ matches' : '✗ MISMATCH — dispute this proposal'}
        </Badge>
      )}
    </div>
  );
}
```

One button. Five lines of UI. Closes the entire silent-rewrite attack class.

---

## 14. Diagram — Full Inheritance Lifetime (citizen view)

```
HEIR                BACKEND              CHAIN                OTHER HEIRS / RESOLVER
 │                    │                   │                            │
 │ POST appeal +PDF   │                   │                            │
 ├───────────────────►│ pin + pre-compose │                            │
 │ ◄── unsigned tx    │                   │                            │
 │ sign + send                              │                            │
 ├──────────────────────────────────────────►                            │
 │                    │ ◄── InheritanceAppealFiled                       │
 │                    │ (admin reviewer panel)                          │
 │                    │ reviewer validates + composes                   │
 │                    │ initiateInheritance (REGISTRAR HSM signs)       │
 │                    ├──────────────────►│                            │
 │                    │ ◄── InheritanceInitiated                         │
 │                    │ sharesHash cross-validated                      │
 │                    │ notify ALL heirs ────────────────────────────────►
 │                                                                       │
 │  vote screen loads sharesHash                                          │
 │  Recompute client-side ──► viem keccak256 ──► ✓ matches                │
 │  Approve / Dispute ──► sign tx ──► chain                              │
 │                                                                       │
 │  ... repeat for each heir ...                                         │
 │                                                                       │
 │                    │ ◄── HeirApproved × N                             │
 │                    │ ◄── InheritanceFinalized                          │
 │                    │ shares redistributed; tokenId unchanged          │
 │                    │ notify all heirs ────────────────────────────────►
```

The pipeline's defining property is that **every dotted line ending in a citizen action ends with the citizen's own wallet signature** — not the backend's. The backend pre-composes; the citizen signs and submits. The contract is the source of truth; the frontend's job is to expose every cryptographic anchor for citizen inspection.
