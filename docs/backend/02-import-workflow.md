# Government Record Import Workflow

> **Scope.** End-to-end design for the backend pipeline that imports land records from government / developer allotment registries and proposes them on-chain. The backend is **only an importer / oracle layer** — it cannot finalise ownership alone. Finalisation happens on-chain via unanimous owner verification.

This doc maps directly to the v9 contract surface:

- `proposeLandImport(landId, ipfsHash, lType, proposedOwners[], proposedShares[], courtOrderCid)` — REGISTRAR_ROLE
- `verifyLandImport(landId)` — each proposed owner
- `disputeLandImport(landId)` — any proposed owner
- `cancelLandImport(landId)` — REGISTRAR_ROLE
- `expireLandImport(landId)` — anyone after `VERIFICATION_DURATION` (90 days)
- `resolveLandImportDispute(landId, forceApprove, courtOrderCid)` — RESOLVER_ROLE
- Events: `LandImportProposed`, `LandImportVerified`, `LandImportDisputed`, `LandImportCancelled`, `LandImportExpired`, `LandImportResolved`, `LandImportFinalized`, `LandMinted`, `ShareholderAdded`

---

## 1. Pipeline States

The off-chain `ImportJob.status` mirrors and extends the on-chain `LandStatus`:

```
QUEUED       — operator submitted a raw row from the source system
                │
                ▼
NORMALIZING  — pipeline mapping source fields → contract inputs
                │
                ▼
DEDUPING     — checking landId / CNIC / wallet uniqueness
                │
                ▼
PINNING      — building ERC-721 metadata JSON + pinning to IPFS
                │
                ▼
PROPOSING    — submitting proposeLandImport tx; awaiting receipt
                │
                ▼
VERIFYING    — on-chain PENDING_VERIFICATION; tracking which owners
                have called verifyLandImport
                │
                ├── all verified → FINALIZED  (on-chain LandStatus.ACTIVE)
                ├── any disputed → DISPUTED   (on-chain LOCKED_IMPORT_DISPUTE)
                │                              ├── resolver force-approve → FINALIZED
                │                              └── resolver cancel       → CANCELLED
                ├── registrar cancel → CANCELLED
                └── deadline elapsed → EXPIRED (anyone may call expireLandImport)
```

Every transition is event-driven (the indexer is the source of truth); workers update `ImportJob.status` from events, never from the request path.

---

## 2. Source-System Adapters

Each adopter (DHA Phase 9, Bahria Town Karachi, CDA E-11, private developer X) has a dedicated adapter implementing a common interface:

```ts
// libs/import/sources/source.adapter.ts
export interface ISourceAdapter {
  readonly sourceSystem: string;          // e.g. "DHA_PHASE_9"

  /** Fetch a batch of raw allotment rows. */
  fetchBatch(opts: { cursor?: string; limit: number }):
    Promise<{ rows: RawAllotmentRow[]; nextCursor?: string }>;

  /** Map a raw row → the canonical normalised shape. */
  normalize(row: RawAllotmentRow): Promise<NormalizedAllotment>;
}
```

```ts
export interface RawAllotmentRow {
  /** Source-system primary key — preserved for audit. */
  sourceRecordId: string;
  /** Whatever the source system returned. */
  rawPayload: Record<string, unknown>;
}

export interface NormalizedAllotment {
  /** Globally unique on-chain landId. Constructed as
   *  `${sourceSystem}:${sourcePlotNo}` to guarantee uniqueness across adopters. */
  landId: string;
  landType: 'RESIDENTIAL' | 'AGRICULTURAL' | 'COMMERCIAL';

  /** Off-chain enrichment for the projection (NOT stored on-chain). */
  area: number;            // sq yards / kanals
  location: string;        // human-readable
  deedDocumentCid?: string; // optional — if the source provided a scan

  /** Proposed co-owners, summing to 10_000 bps. */
  owners: Array<{
    cnic: string;
    sharePct: number;       // human-readable percentage (e.g. 33.33)
  }>;

  /** Optional: a court order if the source allotment was court-anchored. */
  courtOrderCid?: string;
}
```

Adapters live in `libs/import/sources/` and are registered with a `SourceAdapterRegistry`. The pipeline is source-agnostic past the adapter boundary.

---

## 3. Normalisation Rules

### 3.1 Building the `landId`

> `landId = "{sourceSystem}:{sourcePlotNo}"`, e.g. `"DHA_PHASE_9:R-2/417"`.

This guarantees global uniqueness even if two source systems use overlapping plot-number schemes (DHA's `R-2/417` and Bahria's `R-2/417` would otherwise collide).

### 3.2 Owner share computation

Source systems express ownership in human-readable forms (percentages, fractions, "all", "joint"). The normaliser converts to integer bps:

| Source form | Normalised bps |
|------------|----------------|
| `"100%"` / `"sole owner"` | `10000` |
| `"50%"` | `5000` |
| `"1/3 share"` | `3333` (and the last heir takes `3334` to make the sum exactly `10000`) |
| `"jointly with spouse"` | `5000` each |

**Rounding rule:** sum the floor of every share, then assign the remainder bps to the LAST owner so the array sums to exactly `TOTAL_SHARES = 10000`. The contract's `_validateOwnerShares` rejects the proposal otherwise.

### 3.3 CNIC → wallet resolution

The source records list CNICs, but the contract expects EVM addresses. Two cases:

1. **The CNIC already maps to a registered wallet** — `_cnicToAddress[cnic]` is non-zero. Pipeline uses that address.
2. **The CNIC has not registered yet** — the pipeline emits a notification to the citizen (via the developer's existing comms — SMS / phone call / in-person) prompting them to register. The import sits in `NORMALIZING` until every owner has a wallet, then proceeds.

> The contract enforces `_isAuthorizedHolder(owner)` (registered citizen OR `GOVT_AUTHORITY_ROLE`) at `proposeLandImport` time, so the pipeline cannot push the import to the chain with unresolved owners.

---

## 4. Validation Pipeline

A failed validation throws the job into a `REJECTED` terminal state with a human-readable reason. No on-chain tx is sent.

| Check | Failure produces |
|-------|------------------|
| Adapter normalised at least one owner | `REJECTED: no owners` |
| Sum of owner shares = 10000 bps | `REJECTED: share total {actual}/10000` |
| Each owner CNIC is unique within this allotment | `REJECTED: duplicate owner` |
| Each owner has a registered wallet (or holds `GOVT_AUTHORITY_ROLE`) | `BLOCKED: awaiting owner registration` (pipeline pauses, not rejects) |
| `landId` does not already exist on-chain (`_landExists[landId] == false`) | `REJECTED: landId collision` |
| `landId` is not in the dedup table from a previous attempt | `BLOCKED: import already in flight` |
| `ipfsHash`, `courtOrderCid` (if present) ≤ MAX_STRING_LENGTH | `REJECTED: oversize string` |
| `landType` ∈ {RESIDENTIAL, AGRICULTURAL, COMMERCIAL} | `REJECTED: unknown landType` |

The pipeline pre-runs **all** these checks before pinning to IPFS, so a failed validation never wastes a Pinata pin.

---

## 5. Duplicate Prevention

Three layers:

### 5.1 Source-side dedup

`ImportJob.sourceRecordId` is unique within `(sourceSystem, sourceRecordId)`. A re-fetch of the same source row hits a Postgres unique-violation and is silently skipped.

### 5.2 LandId-level dedup

The pipeline reads `_landExists(landId)` via viem before submitting `proposeLandImport`. If it's true, the job is moved to `REJECTED: landId collision` without sending a tx.

### 5.3 In-flight dedup

A Redis lock `import:lock:{landId}` is held from `NORMALIZING` through `PROPOSING`. Concurrent attempts get `BLOCKED: import already in flight`. The lock auto-expires after 10 minutes so a stalled worker can't deadlock the landId.

---

## 6. IPFS Pinning

Before `proposeLandImport`, the pipeline builds the ERC-721 metadata JSON and pins it:

```ts
const metadata = {
  name: `Land Record ${landId}`,
  description: `Allotment from ${sourceSystem}`,
  image: deedDocumentCid ? `ipfs://${deedDocumentCid}` : undefined,
  attributes: [
    { trait_type: 'Land Type', value: landType },
    { trait_type: 'Source System', value: sourceSystem },
    { trait_type: 'Area', value: area },
    { trait_type: 'Location', value: location },
    { trait_type: 'Proposed Owners', value: owners.length },
  ],
  documents: deedDocumentCid ? [{
    type: 'allotment_letter',
    ipfs_url: `ipfs://${deedDocumentCid}`,
  }] : [],
};

const ipfsHash = await ipfs.pinAndVerify(JSON.stringify(metadata));
```

`pinAndVerify` does three things:

1. Pin to Pinata.
2. Read back from `https://gateway.pinata.cloud/ipfs/{cid}`.
3. SHA-256-compare the read-back bytes to the upload — reject the pin if they differ.

The verified CID is then written to `ImportJob.normalizedMetadataCid` (Postgres) and used in the contract call.

---

## 7. Blockchain Submission

The worker enqueues a job that calls `proposeLandImport` via the HSM-backed signer:

```ts
// libs/import/jobs/propose-import.job.ts
async function handle(jobData: ImportJobId): Promise<void> {
  const job = await db.importJob.findUniqueOrThrow({ where: { id: jobData } });
  const { landId, normalizedOwners, normalizedMetadataCid, landType, courtOrderCid } = job;

  // Re-validate at job time — owners' wallets may have changed in the
  // window between NORMALIZING and PROPOSING.
  await validateOnChain(landId, normalizedOwners);

  const proposedOwners = normalizedOwners.map(o => o.wallet);
  const proposedShares = normalizedOwners.map(o => o.shareBps);

  const unsignedTx = await contract.populateTransaction.proposeLandImport(
    landId, normalizedMetadataCid, landTypeEnum(landType),
    proposedOwners, proposedShares, courtOrderCid ?? '',
  );

  const signedTx = await signer.signRegistrar(unsignedTx);
  const receipt = await chain.sendAndAwait(signedTx, { confirmations: 12 });

  await db.importJob.update({
    where: { id: job.id },
    data: {
      status: 'VERIFYING',
      proposedTxHash: receipt.transactionHash,
      proposalNonce: extractNonceFromEvent(receipt),
      verificationDeadline: now() + 90 * 24 * 3600,
    },
  });

  await notifications.notifyProposedOwners(landId, proposedOwners);
  await audit.log({
    actor: signerAddress,
    action: 'PROPOSE_IMPORT',
    landId,
    txHash: receipt.transactionHash,
    payload: { ownerCount: proposedOwners.length, courtOrderCid },
  });
}
```

The worker is **idempotent**:

- If the tx submission fails mid-flight, BullMQ retries — `_landExists(landId) == true` on retry stops the job from sending a duplicate proposal.
- If `LandImportProposed` is observed by the indexer before the worker's local DB write completes, the indexer's upsert still merges cleanly (same landId, same proposalNonce).

---

## 8. Verification Queue

After `proposeLandImport`, the pipeline tracks individual owner verifications:

### 8.1 Per-owner state

```prisma
model ImportVerification {
  landId          String
  proposalNonce   BigInt
  ownerWallet     String
  invitedAt       DateTime @default(now())
  notifiedAt      DateTime?
  verifiedAt      DateTime?
  disputedAt      DateTime?
  verifyTxHash    String?
  @@id([landId, proposalNonce, ownerWallet])
}
```

### 8.2 Notification cadence

| When | Channel | Content |
|------|---------|---------|
| t = 0 (proposal landed on-chain) | Email + SMS + in-app | "Your allotment for {landId} is awaiting your verification" + deep link |
| t = 7 days, 30 days, 60 days | Email + SMS | Reminder with countdown to deadline |
| t = 80 days | Email + SMS + phone call (manual ops) | Final reminder |
| t = 91 days | None | `expireLandImport` is now callable by anyone |

### 8.3 Queue dashboard

The admin portal renders the verification queue, joining `ImportJob` × `ImportVerification`:

```
landId          | status      | owners verified  | deadline       | days left
─────────────── | ─────────── | ──────────────── | ────────────── | ──────────
DHA_PHASE_9:... | VERIFYING   | 2/3              | 2026-08-15     | 45
BAHRIA_KHI:...  | DISPUTED    | 1/2              | (frozen)       | —
CDA_E11:...     | VERIFYING   | 3/3 ✓            | (finalized)    | —
```

### 8.4 Indexer-driven completion

When the indexer sees `LandImportVerified(landId, owner, nonce, count, total)`:

1. Mark `ImportVerification.verifiedAt = blockTs`.
2. If `count == total`, transition `ImportJob.status` to `FINALIZED` (in practice the indexer will see `LandImportFinalized` on the same tx — both upserts are idempotent).
3. Push a `wallet:{owner}` WebSocket update + email confirmation.
4. Append `AuditEntry { action: 'OWNER_VERIFIED_IMPORT', actor: owner, landId, txHash }`.

When all owners verify in the same block, the contract atomically:

- mints the NFT to `address(this)`,
- populates the share ledger via `_increaseShare`,
- emits `ShareholderAdded` × N + `LandMinted` + `LandImportFinalized` + `LandStatusChanged`.

The indexer handles all of those in a single processing pass.

---

## 9. Dispute Path

If `LandImportDisputed(landId, disputer, nonce)` fires, the pipeline:

1. Transitions `ImportJob.status` to `DISPUTED`.
2. Pushes a `wallet:{owner}` and `admin:queues` WebSocket update.
3. Notifies every proposed owner that the proposal is frozen.
4. Surfaces the dispute on the RESOLVER portal dashboard.

The RESOLVER can then either:

- `resolveLandImportDispute(landId, forceApprove=true, courtOrderCid)` — proceeds with the mint using the (possibly amended) court order.
- `resolveLandImportDispute(landId, forceApprove=false, courtOrderCid)` — cancels the import; the landId is freed for re-proposal.

Both paths require a non-empty `courtOrderCid` (the contract enforces `boundedString`). The audit entry stores the resolver's identity and the CIDs.

---

## 10. Expiry Path

If 90 days pass without unanimous verification, anyone may call `expireLandImport(landId)`. The backend runs a daily cron that:

1. Reads `ImportJob` rows with `status = 'VERIFYING'` and `verificationDeadline < now()`.
2. Calls `expireLandImport(landId)` for each — the call is gas-paid by the backend itself as a public utility.
3. On `LandImportExpired` event, transitions the job to `EXPIRED`.
4. Notifies all proposed owners + the registrar.
5. The registrar can immediately re-propose under a new `proposalNonce` (the contract bumps internally).

> Anyone — not just the backend — can trigger expiry. The cron is just a convenience for keeping the queue clean. If the developer goes silent, citizens or third parties can still unstick the landId.

---

## 11. Audit Log (per import)

Every state-changing action appends one `AuditEntry`:

| Action | Actor | Payload |
|--------|-------|---------|
| `IMPORT_QUEUED` | admin wallet | `{ sourceSystem, sourceRecordId }` |
| `IMPORT_NORMALIZED` | system | `{ landId, ownerCount, shareSum }` |
| `IMPORT_REJECTED` | system | `{ landId, reason }` |
| `IPFS_PINNED` | system | `{ cid, sha256, sizeBytes }` |
| `PROPOSE_IMPORT` | registrar wallet | `{ landId, ownerCount, courtOrderCid }`, txHash |
| `OWNER_NOTIFIED` | system | `{ landId, owner, channel }` |
| `OWNER_VERIFIED_IMPORT` | owner wallet | `{ landId, proposalNonce }`, txHash |
| `OWNER_DISPUTED_IMPORT` | disputer wallet | `{ landId, proposalNonce }`, txHash |
| `IMPORT_CANCELLED` | registrar wallet | `{ landId }`, txHash |
| `IMPORT_EXPIRED` | system / anyone | `{ landId, deadline }`, txHash |
| `IMPORT_RESOLVED` | resolver wallet | `{ landId, forceApprove, courtOrderCid }`, txHash |
| `IMPORT_FINALIZED` | system | `{ landId, proposalNonce, tokenId }`, txHash |

The audit log is the canonical answer to "what happened on this import, and who is responsible?"

---

## 12. Failure Modes

| Failure | What happens | How it's contained |
|---------|--------------|--------------------|
| Source-system API down | `fetchBatch` retries with backoff; alert after 3× failures | No blast — no proposals submitted |
| CNIC unresolved (owner unregistered) | Job stuck in `BLOCKED` until owner registers | Cron reminds operator + citizen |
| IPFS pin fails | Worker retries; alert after 5× failures | No on-chain tx sent without verified pin |
| `proposeLandImport` tx reverts | BullMQ retries; if revert reason indicates landId collision, job → `REJECTED` | One landId, one proposal at a time |
| Owner wallet was compromised mid-flight | Owner can `disputeLandImport`; resolver resolves with court CID | Compromise doesn't auto-finalise |
| Backend operator goes rogue | Worst case: spam proposals that all expire; cannot mint without owner approval | Stakeholder-consent invariant |
| Deadline expires while owners are still trying to verify | Backend re-proposes with a fresh nonce; owners verify against the new proposal | Re-proposal is just another import job |
| Indexer misses an event | Reorg-recovery routine refetches from `lastSyncedBlock` | 12-confirmation rule + idempotent upserts |

---

## 13. Diagram: Single Import Lifetime

```
[adapter] fetchBatch → [normalize] → [validate]
                                          │ pass
                                          ▼
                                  [resolve CNIC → wallet]
                                          │ all resolved
                                          ▼
                                     [pin metadata]
                                          │ verified CID
                                          ▼
                                [propose on-chain]  ── REGISTRAR signs
                                          │
                                          ▼
                              ImportJob.status = VERIFYING
                                          │
                                          ▼
              ┌─────────────────────────── owners ──────────────────────────────┐
              │                                                                  │
              ▼ verify                                                            ▼ dispute
       (3/3 verifications)                                                (any heir disputes)
              │                                                                  │
              ▼                                                                  ▼
       FINALIZED                                                             DISPUTED
       NFT minted                                                                │
       Shareholders seeded                                                       ▼
                                                                       resolver decides:
                                                                       - force-approve(courtCid) → FINALIZED
                                                                       - cancel(courtCid)         → CANCELLED
```

---

## 14. Future Hooks

- **NADRA integration** — replace the mock CNIC directory with the real National Database & Registration Authority API. The `citizens` module already isolates the lookup.
- **Court-API integration** — pre-validate `courtOrderCid` against a court-records API at import time, instead of just at dispute resolution.
- **Bulk import** — `proposeMany` endpoint that submits a batch under one tx with `Multicall3` aggregation, to onboard a whole society phase in one shot.
- **The Graph subgraph** — replace the bespoke indexer with a Graph deployment once the contract ABI stabilises.

This pipeline is the substrate for every land that enters the registry. The inheritance and subdivision workflows (docs 03 and 12.g) build on the active state this pipeline produces.
