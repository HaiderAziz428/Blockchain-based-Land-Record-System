# Backend Inheritance Workflow

> **Scope.** End-to-end design for the inheritance pipeline. The backend receives heir-filed appeals, validates court-order authenticity off-chain, files immutable on-chain proposals, and surfaces vote progress + dispute escalation. **The backend cannot edit inheritance silently, bypass approvals, or manipulate proposals secretly** — every guarantee is enforced by the v9 contract.

This doc maps directly to the v9 contract surface:

- `fileInheritanceAppeal(landId, deceasedHolder, courtOrderCid)` — any registered citizen (heir / lawyer / family member)
- `initiateInheritance(landId, deceasedHolder, heirs[], heirShares[], courtOrderCid, appealId)` — REGISTRAR_ROLE
- `approveSuccessionPlan(landId)` — each heir
- `disputeSuccessionPlan(landId)` — any heir
- `expireInheritance(landId)` — anyone after `INHERITANCE_VOTING_DURATION` (30 days)
- `freezeInheritanceForReview(landId, reason)` — RESOLVER_ROLE
- `resolveInheritanceDispute(landId, forceExecute, updatedCourtOrderCid, legalResolutionCid, overrideReason)` — RESOLVER_ROLE
- Events: `InheritanceAppealFiled`, `InheritanceInitiated`, `HeirApproved`, `InheritanceDisputed`, `InheritanceFinalized`, `InheritanceExpired`, `InheritanceFrozenForReview`, `LegalOverrideExecuted`

The contract's `sharesHash = keccak256(abi.encode(heirs, heirShares, courtOrderCid))` is the cryptographic anchor preventing silent share-rewrites.

---

## 1. Pipeline State Machine

```
                ┌─────────────────────────────────────────────────┐
                │ HEIR (any registered citizen) files appeal      │
                │ via POST /v1/inheritance/appeals                │
                │ → court-order PDF upload + landId + deceased    │
                └────────────────────┬────────────────────────────┘
                                     │
                                     ▼
                          ┌────────────────────────┐
                          │ Appeal state: PENDING  │
                          │ (off-chain DB row)     │
                          └────────┬───────────────┘
                                   │ admin/reviewer reads
                                   │ uploaded PDF + court CID
                                   │
        ┌──────────────────────────┼───────────────────────────────┐
        │                          │                                 │
        ▼ REJECTED                  ▼ VALIDATED                       │
   (off-chain only;          backend signs initiateInheritance        │
   stays on-chain                  + appealId                          │
   as evidence)                    │                                  │
                                   ▼                                  │
                       ┌────────────────────────┐                     │
                       │ PENDING_INHERITANCE    │                     │
                       │ (on-chain status)      │                     │
                       └─────────┬──────────────┘                     │
                                 │                                     │
                                 │ heirs see proposal + courtCid       │
                                 │                                     │
              ┌──────────────────┴────────────────────┐                │
              │                                       │                │
              ▼  all heirs approve                    ▼  any disputes   │
         FINALIZED                              LOCKED_INHERITANCE_    │
       (shares redistributed                         DISPUTE           │
       on the same NFT)                                 │              │
                                                       │              │
                                                       ▼              │
                                          ┌───────────────────────┐    │
                                          │ resolver decides:     │    │
                                          │  - force-execute      │    │
                                          │    (+ courtCid +      │    │
                                          │     legal CID + reason)    │
                                          │  - cancel             │    │
                                          │    (+ courtCid +      │    │
                                          │     legal CID + reason)    │
                                          └───────────────────────┘    │
                                                       │              │
                                                       ▼              │
                                                  back to ACTIVE       │
                                                                       │
              ▼  deadline elapses (30 days)                            │
         EXPIRED → ACTIVE (anyone may call expireInheritance) ─────────┘
              (registrar may re-propose with fresh nonce)
```

The backend mediates **only** the off-chain segments. The chain enforces every state transition past `initiateInheritance`.

---

## 2. Four-Phase Backend Pipeline

### Phase 1 — Heir-side appeal submission

**Endpoint**

```
POST /v1/inheritance/appeals
Content-Type: multipart/form-data
Auth: SIWE session JWT
Body:
  - landId             (string)
  - deceasedHolder     (address)
  - courtOrder         (PDF file, ≤ 10 MB)
  - relationshipNote   (string, optional — "I am the eldest son")
```

**Flow** (API gateway):

1. Validate SIWE session; require `_users[msg.sender].isRegistered == true`.
2. Pre-check on-chain: `_landRecords[landId].status == ACTIVE` AND `_shareBps[landId][deceasedHolder] > 0`. If either fails, return 400 immediately — no point pinning a PDF for an invalid appeal.
3. Stream the PDF to disk; reject anything > 10 MB or non-PDF mime type. Compute sha256 of the file content.
4. Enqueue a BullMQ job `inheritance.appeal.process` with the uploaded file reference.

**Worker** (BullMQ consumer):

5. Pin to IPFS via `ipfs.pinAndVerify` — pin → read-back → sha256 compare.
6. Create a `CourtOrderUpload` row (see doc 04) linked to this appeal.
7. Pre-compose an unsigned `fileInheritanceAppeal(landId, deceasedHolder, ipfsCid)` tx and return it to the frontend for the heir to sign **with their own wallet**.

> **Important:** the appeal is filed from the **heir's** wallet, not the backend. The backend only does the legwork (pin, validate, pre-compose) — the on-chain `filer` address is the heir's, which means the appeal carries the heir's accountability on-chain. The backend never holds custody of this signature.

**On-chain return**

When the heir submits the signed tx, the contract emits:

```solidity
event InheritanceAppealFiled(
    uint256 indexed appealId,
    string indexed landId,
    address indexed filer,
    address deceasedHolder,
    string courtOrderCid
);
```

The indexer captures this and creates an `InheritanceAppeal` row in Postgres:

```ts
{
  id: appealId,
  landId,
  deceasedHolder,
  filer: msg.sender,
  courtOrderCid,
  filedAt: blockTs,
  isProcessed: false,
  reviewStatus: 'PENDING',
}
```

---

### Phase 2 — Backend authenticity validation (off-chain review)

The admin / reviewer (`REGISTRAR_ROLE` operator) opens the appeal in the admin portal:

```
GET /v1/admin/inheritance/appeals?status=PENDING
```

Returns:

- appeal metadata
- court-order PDF preview (rendered from IPFS gateway)
- the appeal filer's identity (CNIC → name lookup)
- the deceased holder's identity
- the current share ledger for `landId` (`getShareholdersWithBps`)
- any other open appeals on this land

The reviewer performs **off-chain** validation:

| Check | Why |
|-------|-----|
| Court-order document is signed by a real judge | Backend cannot mint heirship from a forged PDF |
| Jurisdiction is correct (the issuing court has authority over this land's location) | Out-of-jurisdiction orders are nullities |
| Document is current (not superseded by a later order) | Old orders may have been appealed |
| Heirs named in the court order match the family-tree facts known off-chain | Plus / minus what NADRA / civil records say |
| heirShares in the court order sum to the deceased's current bps | The contract will reject otherwise; pre-check saves a tx |
| Each heir is registered on-chain (or holds GOVT_AUTHORITY_ROLE) | The contract enforces `_isAuthorizedHolder(heir)` |

The reviewer marks the appeal `VALIDATED` or `REJECTED` via:

```
POST /v1/admin/inheritance/appeals/:appealId/decision
Auth: REGISTRAR step-up signature
Body:
  - decision           ("VALIDATE" | "REJECT")
  - heirs              (address[])      // only if VALIDATE
  - heirShares         (uint16[])       // only if VALIDATE; must sum to deceased's bps
  - reviewNotes        (string)
```

The audit row is written immediately. If `REJECT`, no on-chain action is taken — the appeal lives on-chain forever as a "filed but not actioned" record (the contract makes no provision to delete an appeal; `isProcessed` simply stays `false`).

---

### Phase 3 — Immutable proposal filing

If `VALIDATED`, the worker:

1. Re-validates inputs on-chain:
   - `_landRecords[landId].status == ACTIVE`
   - `_shareBps[landId][deceasedHolder] > 0`
   - `sum(heirShares) == _shareBps[landId][deceasedHolder]`
   - no duplicate heirs; no heir == deceased; all heirs `_isAuthorizedHolder`
2. Computes the expected `sharesHash` off-chain via the contract's pure helper `computeSharesHash(heirs, heirShares, courtOrderCid)` and stores it in the DB for later comparison.
3. Signs `initiateInheritance(landId, deceasedHolder, heirs, heirShares, courtOrderCid, appealId)` with the REGISTRAR HSM key.
4. Awaits 12 confirmations.

**On success**, the indexer captures:

```solidity
event InheritanceInitiated(
    string indexed landId,
    address indexed deceasedHolder,
    uint256 totalHeirs,
    uint16 deceasedShareBps,
    uint256 proposalNonce,
    string courtOrderCid,
    uint256 appealId,
    bytes32 sharesHash,
    uint64 votingDeadline
);
```

The indexer:

- creates `InheritanceProposal` row keyed by `(landId, proposalNonce)`,
- compares the emitted `sharesHash` against the DB-cached `sharesHash` — divergence is a critical alert (something between the off-chain review and the on-chain tx changed the inputs),
- marks the linked `InheritanceAppeal.isProcessed = true`,
- pushes notifications to all named heirs (see Phase 4),
- starts the 30-day voting timer.

---

### Phase 4 — Heir consensus tracking

#### 4a. Notifications

Each named heir receives:

| Channel | Content |
|---------|---------|
| In-app (WebSocket on `wallet:{heir}`) | "An inheritance proposal names you as an heir to {landId}. Review and vote." |
| Email | Same + deep link to `/inheritance/{landId}/vote` |
| SMS (if `Citizen.phone` set) | Short version + deep link |

The notification payload includes:

- the courtOrderCid (so the heir can review the document before voting),
- the proposed heirs and shares,
- the `sharesHash` (so the heir can independently verify off-chain via `computeSharesHash`),
- the voting deadline.

#### 4b. Voting

Heirs vote from their own wallets — the backend never holds custody of a vote signature.

```
POST /v1/inheritance/:landId/approve
POST /v1/inheritance/:landId/dispute
Auth: SIWE session JWT of the heir
```

Each endpoint pre-composes the unsigned `approveSuccessionPlan(landId)` or `disputeSuccessionPlan(landId)` tx and returns it for the heir to sign.

The contract enforces:

- `_landRecords[landId].status == PENDING_INHERITANCE`
- `block.timestamp <= req.votingDeadline`
- `_isHeirFor[landId][nonce][msg.sender]` (heir membership)
- `!_heirApproved[landId][nonce][msg.sender]` (single-vote)

So the backend doesn't need to re-implement any of those checks — pre-composing the tx is enough.

#### 4c. Auto-execution

When the last heir approves, the contract internally calls `_executeInheritance(landId)`:

- decrements deceased's bps to zero (`_decreaseShare`),
- distributes each heir's bps (`_increaseShare`),
- appends an `OwnershipChange` row per heir leg to `_ownershipHistory[landId]`,
- transitions status back to `ACTIVE`,
- emits `InheritanceFinalized(landId, proposalNonce)` + `LandStatusChanged(landId, ACTIVE)`.

The land NFT and its tokenId persist unchanged — this is the protocol's core "inheritance is layer-2 redistribution, not subdivision" guarantee.

The indexer:

- updates `Shareholder` rows (deceased removed, heirs added/incremented),
- appends entries to `OwnershipChangeLog`,
- marks `InheritanceProposal.isExecuted = true`,
- broadcasts `wallet:{heir}` + `land:{landId}` WebSocket updates.

---

## 3. Dispute Path

If any heir calls `disputeSuccessionPlan(landId)` before the deadline:

1. Contract sets status to `LOCKED_INHERITANCE_DISPUTE`.
2. Indexer captures `InheritanceDisputed(landId, disputer, nonce)`.
3. Backend:
   - Notifies every named heir + the appeal filer + the registrar that the proposal is frozen.
   - Surfaces the case on the RESOLVER portal queue: `GET /v1/resolver/queue`.

### 3.1 Resolver workflow

The resolver opens the dispute and reviews:

- the appeal court-order PDF (from IPFS),
- the deceased's history,
- the heirs' identities,
- the disputer's stated grievance (if filed off-chain),
- any other evidence.

The resolver then files a decision via:

```
POST /v1/resolver/inheritance/:landId/resolve
Auth: RESOLVER step-up signature
Body:
  - forceExecute         (bool)
  - updatedCourtOrderCid (string)  // IPFS CID of the latest/amended court order
  - legalResolutionCid   (string)  // IPFS CID of the judgment / written decision
  - overrideReason       (string)  // human-readable rationale
```

The contract enforces `boundedString` on all three string args, so empty fields revert. The backend additionally:

- pre-validates that both CIDs are pinned (read-back check),
- ensures the resolver wallet has `RESOLVER_ROLE` (re-checked at request time),
- requires a fresh step-up signature whose payload binds `(landId, forceExecute, both CIDs, reason)` so the signature can't be replayed.

The contract appends an immutable `LegalOverride` row to `_legalOverrides[landId]` and emits `LegalOverrideExecuted` carrying the full payload.

### 3.2 Freeze-for-review (resolver-initiated escalation)

The resolver can also freeze a proposal without an heir dispute, e.g. on receipt of an external court order to stay the case:

```
POST /v1/resolver/inheritance/:landId/freeze
Auth: RESOLVER step-up signature
Body:
  - reason   (string)
```

Calls `freezeInheritanceForReview(landId, reason)`. Status moves to `LOCKED_INHERITANCE_DISPUTE`; the same `resolveInheritanceDispute` call (with full metadata) is required to resolve.

---

## 4. Expiry Path

If 30 days pass without unanimous approval and no dispute:

1. Daily cron reads `InheritanceProposal` rows with `status = 'PENDING'` and `votingDeadline < now()`.
2. Backend calls `expireInheritance(landId)` on each (gas-paid public utility).
3. Indexer captures `InheritanceExpired(landId, proposalNonce, deadline)`.
4. Backend transitions `InheritanceProposal.status` to `EXPIRED`.
5. Notifies all named heirs + the appeal filer + the registrar.
6. The registrar can re-propose under a new nonce — `initiateInheritance` increments internally.

Anyone — not just the backend — may call `expireInheritance`. The cron is just operational convenience.

---

## 5. Audit Log (per inheritance case)

Every state-changing action appends one `AuditEntry`:

| Action | Actor | Payload |
|--------|-------|---------|
| `INHERITANCE_APPEAL_PINNED` | system | `{ ipfsCid, sha256, sizeBytes }` |
| `INHERITANCE_APPEAL_FILED` | heir wallet | `{ appealId, landId, deceased, courtOrderCid }`, txHash |
| `INHERITANCE_APPEAL_REVIEW_DECISION` | reviewer wallet | `{ appealId, decision, heirs, heirShares, reviewNotes }` |
| `INHERITANCE_PROPOSAL_FILED` | registrar wallet | `{ landId, proposalNonce, heirs, heirShares, sharesHash, courtOrderCid, appealId }`, txHash |
| `INHERITANCE_HEIR_NOTIFIED` | system | `{ landId, heir, channel, deadline }` |
| `INHERITANCE_APPROVED` | heir wallet | `{ landId, proposalNonce }`, txHash |
| `INHERITANCE_DISPUTED` | disputer wallet | `{ landId, proposalNonce, reason? }`, txHash |
| `INHERITANCE_FINALIZED` | system | `{ landId, proposalNonce }`, txHash |
| `INHERITANCE_EXPIRED` | system / anyone | `{ landId, proposalNonce, deadline }`, txHash |
| `INHERITANCE_FROZEN_FOR_REVIEW` | resolver wallet | `{ landId, reason }`, txHash |
| `INHERITANCE_LEGAL_OVERRIDE` | resolver wallet | `{ landId, forceExecuted, updatedCourtOrderCid, legalResolutionCid, overrideReason, overrideIndex }`, txHash |

The audit log is the canonical "who did what to this inheritance, when, and with what evidence" record. Every privileged backend action is in the log; every on-chain action emits an indexed event that the indexer mirrors into the same audit table.

---

## 6. Trust-Minimisation Guarantees

The contract enforces — and the backend cannot circumvent — five inheritance-specific properties:

| Guarantee | Contract mechanism | Why backend cannot violate it |
|-----------|--------------------|-------------------------------|
| **Backend cannot edit inheritance silently.** | `sharesHash` committed at propose time; immutable per `proposalNonce`. | A silent edit would require either editing `_heirApproved` (impossible; mapping owned by contract) or re-proposing (which bumps nonce and resets all votes — observable). |
| **Backend cannot bypass approvals.** | `_executeInheritance` runs only inside `approveSuccessionPlan` when `approvalCount == heirs.length`, OR inside `resolveInheritanceDispute` (resolver, with court CIDs). | The backend has no other path to mutate `_shareBps` for inheritance. |
| **Backend cannot manipulate proposals secretly.** | Every proposal change emits `InheritanceInitiated` with full payload, indexed by `proposalNonce`. | An indexer (or any third party) running the same event watcher sees every proposal in real time. |
| **Heirs cannot edit shares.** | The contract has no `editHeirShare` or analogous function. | Heirs' only primitives are `approveSuccessionPlan` / `disputeSuccessionPlan`. |
| **Vote replay across reissued proposals is impossible.** | Vote state keyed by `(landId, proposalNonce, heir)`. | A new proposal bumps the nonce → fresh empty vote slots. |

Even a fully-compromised backend has only two effective attack surfaces:

1. **Refuse to file legitimate appeals** — observable (the heir's `InheritanceAppealFiled` event is on-chain regardless; if the registrar never follows up, the heir / lawyer / press / regulator can see it).
2. **Spam invalid proposals** — they go through the 30-day vote window, get rejected or expired, and waste only gas. No shares move.

---

## 7. Failure Modes

| Failure | Containment |
|---------|-------------|
| Reviewer wrongly validates a forged court order | Heirs dispute → resolver re-reviews with updated court CID + legal-resolution CID; override is audit-logged |
| Reviewer wrongly rejects a valid appeal | The appeal lives on-chain forever; heir / lawyer can re-file with the same court CID; reviewer rejection is visible in audit log |
| Backend sign-service compromise | HSM-bound; every signing is audit-logged with worker job ID; rogue proposals would have to survive the 30-day window with no heir dissent — fail-closed |
| Heir mid-process death | The new inheritance can be filed against the deceased heir's share once their death court order is issued — no special handling needed |
| Heir wallet loss | Heir can recover via separate court process; resolver path with new court CID handles the redistribution |
| `expireInheritance` cron failure | Anyone can call it manually; chain doesn't care who pays the gas |
| Indexer reorg | 12-confirmation rule + idempotent upserts on `(txHash, logIndex)` |

---

## 8. Frontend Contract

The frontend renders three inheritance screens:

1. **Citizen — File appeal** (`/inheritance/appeal/new`) — court-order PDF upload form, landId + deceased selectors, signature flow.
2. **Heir — Review and vote** (`/inheritance/{landId}/vote`) — proposal view with:
   - heirs[] + heirShares[] table
   - courtOrderCid IPFS preview (PDF embed)
   - `sharesHash` displayed with an "Independently verify" button that re-hashes the (heirs, shares, courtCid) tuple client-side and shows ✓ / ✗
   - deadline countdown
   - Approve / Dispute buttons with wallet-sign flow
3. **Resolver — Dispute queue** (`/resolver/inheritance`) — list of `LOCKED_INHERITANCE_DISPUTE` lands; per-land detail showing all uploaded CIDs, ownership history, and the resolve / freeze action panel.

All three subscribe to `wallet:{address}` and `land:{landId}` WebSocket channels for real-time updates.

---

## 9. Diagram — Single Inheritance Lifetime

```
  HEIR                BACKEND              CHAIN              OTHER HEIRS
   │                    │                    │                       │
   │ POST appeal +PDF   │                    │                       │
   ├───────────────────►│ pin + pre-compose  │                       │
   │ ◄── unsigned tx    │                    │                       │
   │ sign + send                              │                       │
   ├──────────────────────────────────────────►                       │
   │                    │ ◄── InheritanceAppealFiled event           │
   │                    │ (admin reviewer panel)                     │
   │                    │                                             │
   │                    │ reviewer validates off-chain               │
   │                    │ + composes proposal                        │
   │                    │                    │                       │
   │                    │ initiateInheritance (REGISTRAR signs)      │
   │                    ├───────────────────►│                       │
   │                    │ ◄── InheritanceInitiated event             │
   │                    │ sharesHash verified                        │
   │                    │ notify all heirs ──────────────────────────►
   │                                                                  │
   │                                                                  │ sign approve/dispute
   │                                                                  ├──────► CHAIN
   │                                                                  │
   │   ... (repeat for each heir) ...                                 │
   │                                                                  │
   │                    │ ◄── HeirApproved × N                       │
   │                    │ ◄── InheritanceFinalized                   │
   │                    │ shares redistributed                        │
   │                    │ tokenId unchanged                           │
   │                    │ notify all heirs ──────────────────────────►
```

---

## 10. Future Hooks

- **Court-records API integration** — pre-validate the court-order CID against an authenticated court-records API before allowing `initiateInheritance` to be signed.
- **ZK-proof of heirship** — instead of revealing the heir CNICs publicly, attach a ZK proof showing the family-tree match against a NADRA Merkle root. Out of v9 scope.
- **Multi-deceased proposals** — combine multiple deceased holders into one proposal. Currently each deceased needs a separate `initiateInheritance` call; a future helper could batch them.

This pipeline is the operational embodiment of the contract's "courts decide, chain enforces" principle. Court-order verification — the cryptographic spine that anchors every inheritance to a legal artefact — is detailed separately in doc 04.
