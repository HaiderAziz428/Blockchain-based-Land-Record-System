# Backend Architecture — Production-Grade Hybrid Land Registry

> **Scope.** End-to-end backend design for LandLedger's v9 contract. The backend is a deliberately-limited **importer / oracle / indexer** that *cannot finalise ownership alone*. Every privileged action it takes on-chain is either a **proposal** that needs stakeholder consent or an **override** that commits court / legal CIDs to the immutable audit log.

---

## 1. Trust Model (read this first)

The backend is **not** a trusted operator. It holds two on-chain roles:

| Role | What it can do | What it cannot do |
|------|----------------|-------------------|
| `REGISTRAR_ROLE` | Propose land imports; file inheritance proposals; propose subdivisions; cancel its own proposals | Mint, redistribute, or split land alone |
| `RESOLVER_ROLE` *(should be split to a separate operator in production)* | Resolve disputes; freeze proposals for legal review | Resolve without committing a court-order CID + legal-resolution CID + written reason + own identity |

The backend's authority is bounded by **five protocol invariants** the contract enforces:

1. **Owner-verification consensus** — every land import is rejected unless every proposed co-owner calls `verifyLandImport` within `VERIFICATION_DURATION` (90 days).
2. **Immutable inheritance proposals** — once `initiateInheritance` returns, `heirs[]`, `heirShares[]`, `courtOrderCid`, and `sharesHash` are locked under the current `proposalNonce`. The backend cannot edit them in place.
3. **Court-anchored overrides** — every `resolve*Dispute` call must commit `(updatedCourtOrderCid, legalResolutionCid, overrideReason)` to `_legalOverrides[landId]` or `_subdivisionLegalOverrides[parentLandId]`.
4. **Deadline-bound proposals** — anyone may call `expireLandImport` / `expireInheritance` after the deadline to reset stale proposals.
5. **Public auditability** — every state change emits an indexed event; every override appends an append-only record; nothing the backend does is invisible.

Operational consequence: **even a fully-compromised backend cannot steal land**. The worst it can do is spam proposals (which expire) or refuse to act on legitimate appeals (which is observable via the `InheritanceAppealFiled` event going unanswered).

---

## 2. Service Topology

```
                ┌─────────────────────────────────────────────────┐
                │              Sepolia (or L2) RPC                │
                │              LandRegistry contract              │
                └────────────────────▲────────────────────────────┘
                                     │ writeContract / readContract / watchEvents (viem)
                                     │
        ┌────────────────────────────┴──────────────────────────────┐
        │                   BACKEND CLUSTER (NestJS)                 │
        │ ┌──────────────────┬──────────────────┬─────────────────┐  │
        │ │ API Gateway       │ Workers          │ Indexer          │  │
        │ │ /v1/* REST + WS   │ BullMQ jobs      │ Event listener   │  │
        │ │ Wallet-sig auth   │ - import         │ Block confirms   │  │
        │ │ Admin RBAC        │ - inheritance    │ Postgres upsert  │  │
        │ │                   │ - subdivision    │ Redis pub/sub    │  │
        │ │                   │ - notification   │ Reorg handling   │  │
        │ └──────────┬────────┴────────┬─────────┴──────────┬───────┘  │
        │            │                 │                    │          │
        └────────────┼─────────────────┼────────────────────┼──────────┘
                     │                 │                    │
              ┌──────▼──────┐   ┌──────▼──────┐    ┌────────▼───────┐
              │  PostgreSQL  │   │    Redis    │    │ Pinata / IPFS  │
              │  state of    │   │  jobs +     │    │ deeds, court   │
              │  truth for   │   │  cache +    │    │ orders, survey │
              │  off-chain   │   │  rate-limit │    │ docs, listing  │
              │  data        │   │             │    │ metadata       │
              └──────────────┘   └─────────────┘    └────────────────┘
                     ▲
        ┌────────────┘
        │
   ┌────┴───────────────────┐
   │ External integrations  │
   │ - NADRA (mock/real)     │
   │ - DHA / Bahria / CDA    │
   │   allotment registries  │
   │ - Court records APIs    │
   │ - Email / SMS gateway   │
   └────────────────────────┘
```

The cluster splits into **three pods** that can scale independently:

| Pod | What it runs | Scaling axis |
|-----|--------------|--------------|
| **API Gateway** | REST endpoints, WebSocket pushes, wallet-signature auth, admin RBAC | Horizontal — stateless behind a load balancer |
| **Workers** | BullMQ queue consumers for the long-running pipelines (import, inheritance, court-order verification, IPFS pinning) | Horizontal — one job ID per workflow |
| **Indexer** | Single-leader event listener with reorg handling; writes denormalised projections to Postgres for fast reads | Vertical (one leader, hot standby) |

---

## 3. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js LTS (≥ 20) | Native fetch, ESM, top-level await |
| Framework | NestJS | Dependency injection, modules, decorators, OpenAPI generation, first-class WebSockets — beats Express for a project of this surface area |
| ORM | Prisma | Type-safe queries, migration tooling, Postgres-native enum support |
| DB | PostgreSQL 16 | Row-level security, JSONB for IPFS metadata cache, partial indexes for queue tables |
| Cache / Queue | Redis 7 + BullMQ | Rate limits, idempotency keys, deduplication windows, long-running job state |
| EVM client | **viem** | Tree-shakeable, faster + smaller than ethers, native multicall, typed contracts via wagmi codegen |
| IPFS | Pinata (production: also keep a self-hosted Kubo node as backup pin) | Same provider as the frontend; reliable pinning + gateway |
| Auth | SIWE (EIP-4361) | Wallet-signature login matches the on-chain identity model |
| Observability | OpenTelemetry → Grafana Tempo + Loki | Distributed traces across API → Workers → RPC + indexer |
| Secrets | AWS KMS / GCP KMS / HSM | The two contract role keys (REGISTRAR + RESOLVER) live in HSM, never in env |

> **Critical:** the two on-chain role keys are operated through an HSM-backed signing service, not bare `PRIVATE_KEY` env vars. The signing service exposes `signRegistrar(unsignedTx)` and `signResolver(unsignedTx)`; only the workers can call them, and every call is audit-logged with the originating worker job ID.

---

## 4. Domain Modules (NestJS)

```
backend/
├── apps/
│   ├── api/                         # API gateway (REST + WS)
│   ├── workers/                     # BullMQ consumers
│   └── indexer/                     # Single-leader event listener
├── libs/
│   ├── chain/                       # viem client, contract ABI, role-key signing
│   │   ├── chain.module.ts
│   │   ├── contract.service.ts      # typed wrappers for every contract fn
│   │   ├── signer.service.ts        # HSM-backed signer (REGISTRAR / RESOLVER)
│   │   └── confirmations.service.ts # await N confirmations + reorg detection
│   ├── ipfs/                        # Pinata adapter
│   │   ├── ipfs.module.ts
│   │   ├── pinata.service.ts
│   │   ├── pin-and-verify.ts        # pin + read back + sha256 compare
│   │   └── erc721-metadata.ts       # build standard JSON
│   ├── import/                      # Land import pipeline (see doc 02)
│   ├── inheritance/                 # Inheritance pipeline (see doc 03)
│   ├── court-orders/                # Court-order verification (see doc 04)
│   ├── subdivision/                 # Subdivision proposals
│   ├── occupancy/                   # Occupancy agreement metadata cache
│   ├── marketplace/                 # Listings + trade indexing
│   ├── citizens/                    # Registered-user directory + NADRA mock
│   ├── audit/                       # Append-only audit-log DB
│   ├── notifications/               # Email / SMS / push fanout
│   └── auth/                        # SIWE + admin RBAC
└── prisma/
    └── schema.prisma
```

---

## 5. API Surface (v1)

REST is versioned at `/v1/`. Every mutation goes through a worker; the API enqueues and returns a job ID.

### 5.1 Public read APIs (no auth)

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/v1/lands/:landId` | LandRecord + share ledger snapshot + active occupancy |
| `GET` | `/v1/lands/:landId/history` | OwnershipHistory + marketplace trades + audit overrides |
| `GET` | `/v1/lands/:landId/lineage` | Ancestry chain via `getSubdivisionLineage` |
| `GET` | `/v1/lands?cursor=…&limit=50` | Paginated all-lands feed |
| `GET` | `/v1/users/:address` | UserProfile + lands held + pending verifications |
| `GET` | `/v1/marketplace/listings` | Active listings across all lands (filterable) |
| `GET` | `/v1/inheritance/:landId` | Inheritance proposal + appeal references + override history |
| `GET` | `/v1/subdivision/:parentLandId` | Subdivision plan + per-child allocations |

### 5.2 Authed citizen APIs (SIWE)

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/v1/auth/siwe/nonce` | Get a SIWE nonce |
| `POST` | `/v1/auth/siwe/verify` | Verify signed SIWE message → session JWT |
| `POST` | `/v1/citizens/register` | Pre-compose `registerUser(name, cnic)` tx (frontend signs) |
| `POST` | `/v1/inheritance/appeals` | Submit appeal (uploads court-order PDF → pin → enqueue) |
| `GET`  | `/v1/inheritance/appeals/mine` | All appeals filed by the connected wallet |
| `GET`  | `/v1/lands/mine/pending-verifications` | Lands awaiting my verification |
| `POST` | `/v1/disputes/inheritance/:landId` | File a dispute (frontend signs `disputeSuccessionPlan`) |
| `POST` | `/v1/disputes/import/:landId` | File an import dispute |
| `POST` | `/v1/disputes/subdivision/:parentLandId` | File a subdivision dispute |

### 5.3 Authed REGISTRAR APIs (admin-portal)

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/v1/admin/imports` | Submit import job (govt records → propose) |
| `GET`  | `/v1/admin/imports/queue` | Queue state |
| `POST` | `/v1/admin/imports/:landId/cancel` | Cancel a pending import |
| `POST` | `/v1/admin/inheritance/:appealId/process` | Validate appeal + file proposal |
| `POST` | `/v1/admin/inheritance/:appealId/reject` | Reject appeal (off-chain only) |
| `POST` | `/v1/admin/subdivisions` | Submit subdivision proposal |

### 5.4 Authed RESOLVER APIs

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/v1/resolver/inheritance/:landId/freeze` | Call `freezeInheritanceForReview` |
| `POST` | `/v1/resolver/inheritance/:landId/resolve` | Call `resolveInheritanceDispute` (force or cancel + court CID + legal CID + reason) |
| `POST` | `/v1/resolver/subdivision/:landId/resolve` | Same for subdivision |
| `POST` | `/v1/resolver/import/:landId/resolve` | Same for land import |
| `GET`  | `/v1/resolver/queue` | All locked-for-review lands across all dispute types |

### 5.5 WebSocket channels

The API gateway pushes real-time updates so the frontend doesn't poll. Subscriptions are scoped:

- `land:{landId}` — every status change, share-ledger update, listing change, occupancy event
- `wallet:{address}` — every event involving the wallet (as proposed owner, heir, shareholder, buyer/seller, occupant, grantor)
- `marketplace:listings` — global listing feed
- `admin:queues` — admin-portal live queue updates

---

## 6. Database Schema (Postgres / Prisma)

The DB is **a denormalised projection of the chain plus the off-chain inputs the chain doesn't store** (PDFs, normalised citizen data, notification preferences). Chain events drive upserts; the chain is always authoritative.

### 6.1 Core tables

```prisma
model Citizen {
  id                String   @id @default(cuid())
  wallet            String?  @unique         // populated after on-chain registerUser
  cnic              String   @unique
  name              String
  email             String?
  phone             String?
  isRegistered      Boolean  @default(false) // mirrors _users[wallet].isRegistered
  createdAt         DateTime @default(now())
  notificationPrefs Json     @default("{}")
}

model Land {
  landId             String   @id            // the on-chain key
  ipfsHash           String                  // ERC-721 metadata CID
  landType           String                  // "RESIDENTIAL" | "AGRICULTURAL" | "COMMERCIAL"
  status             String                  // mirrors LandStatus enum
  proposedAt         DateTime
  verifiedAt         DateTime?
  parentLandId       String?
  generation         Int      @default(0)
  // chain bookkeeping
  tokenId            String                  // string-encoded uint256
  lastSyncedBlock    BigInt
  // off-chain enrichment
  area               Decimal?
  location           String?
  surveyMetadataCid  String?                 // populated only after subdivision
  @@index([status])
  @@index([parentLandId])
}

model Shareholder {
  landId     String
  wallet     String
  shareBps   Int                              // mirrors _shareBps[landId][wallet]
  joinedAt   DateTime @default(now())
  @@id([landId, wallet])
  @@index([wallet])
}

model OwnershipChangeLog {
  id        BigInt   @id @default(autoincrement())
  landId    String
  fromAddr  String?  // null = mint
  toAddr    String
  shareBps  Int
  price     Decimal  @default(0)
  blockTs   DateTime
  txHash    String
  source    String                            // MINT|TRANSFER|MARKET|INHERITANCE|SUBDIVISION_SEED
  @@index([landId])
  @@index([toAddr])
}
```

### 6.2 Import-pipeline tables (detailed in doc 02)

```prisma
model ImportJob {
  id                  String   @id @default(cuid())
  landId              String   @unique
  status              String   // QUEUED | NORMALIZING | PINNING | PROPOSED | VERIFYING | FINALIZED | DISPUTED | EXPIRED | CANCELLED
  sourceSystem        String   // DHA_PHASE_9 | BAHRIA_KARACHI | CDA_E11 | etc.
  rawSourceData       Json
  normalizedOwners    Json     // [{cnic, wallet?, sharePct}]
  proposedTxHash      String?
  proposalNonce       BigInt?
  verificationDeadline DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model ImportVerification {
  landId            String
  proposalNonce     BigInt
  ownerWallet       String
  verifiedAt        DateTime?
  verifyTxHash      String?
  @@id([landId, proposalNonce, ownerWallet])
}
```

### 6.3 Inheritance tables (detailed in doc 03)

```prisma
model InheritanceAppeal {
  id                 BigInt   @id            // mirrors on-chain appealId
  landId             String
  deceasedHolder     String
  filer              String
  courtOrderCid      String
  filedAt            DateTime
  isProcessed        Boolean  @default(false)
  reviewStatus       String   @default("PENDING")  // PENDING | VALIDATED | REJECTED
  reviewerWallet     String?
  reviewedAt         DateTime?
  reviewNotes        String?
}

model InheritanceProposal {
  landId             String
  proposalNonce      BigInt
  deceasedHolder     String
  heirs              String[]
  heirShares         Int[]
  sharesHash         String   // hex
  courtOrderCid      String
  appealId           BigInt?
  votingDeadline     DateTime
  approvalCount      Int      @default(0)
  isExecuted         Boolean  @default(false)
  status             String   // PENDING | EXECUTED | DISPUTED | EXPIRED | RESOLVED
  @@id([landId, proposalNonce])
}
```

### 6.4 Court-order verification tables (detailed in doc 04)

```prisma
model CourtOrderUpload {
  id                String   @id @default(cuid())
  uploaderWallet    String
  originalFilename  String
  mimeType          String
  sizeBytes         Int
  sha256            String   @unique         // file content hash
  ipfsCid           String   @unique         // pin verified by read-back
  verifyStatus      String   // UNVERIFIED | VALIDATED | REJECTED
  validatedBy       String?
  validatedAt       DateTime?
  rejectionReason   String?
  // soft links to the workflows that consume this CID
  linkedAppealId    BigInt?
  linkedProposalLandId   String?
  linkedSubdivisionParent String?
  createdAt         DateTime @default(now())
  @@index([linkedAppealId])
  @@index([uploaderWallet])
}
```

### 6.5 Marketplace projection

```prisma
model Listing {
  landId          String
  seller          String
  shareBpsForSale Int
  price           Decimal
  metadataCid     String
  deadline        DateTime
  isActive        Boolean
  createdAt       DateTime
  cancelledAt     DateTime?
  @@id([landId, seller])
  @@index([isActive, deadline])
}

model MarketplaceTrade {
  id        BigInt   @id @default(autoincrement())
  landId    String
  seller    String
  buyer     String
  shareBps  Int
  price     Decimal
  blockTs   DateTime
  txHash    String
  @@index([landId])
}
```

### 6.6 Audit log

```prisma
model AuditEntry {
  id          BigInt   @id @default(autoincrement())
  actor       String           // wallet that called the action
  action      String           // PROPOSE_IMPORT | VERIFY_IMPORT | ... etc.
  landId      String?
  txHash      String?
  payload     Json             // structured action arguments
  createdAt   DateTime @default(now())
  @@index([actor])
  @@index([action])
  @@index([landId])
}
```

> The audit log is *append-only at the application level*: Prisma migrations never expose UPDATE or DELETE on this table. A nightly job snapshots the table hash into S3 with object-lock so a compromised DB cannot retroactively forge entries.

---

## 7. Authentication & Authorisation

### 7.1 Citizen auth — Sign-In With Ethereum (SIWE)

```
client                      backend                   chain
  │                            │                        │
  │  POST /v1/auth/siwe/nonce  │                        │
  ├───────────────────────────►│ store nonce in Redis    │
  │                            │ (5-min TTL)             │
  │  ◄── { nonce }             │                        │
  │  sign EIP-4361 message     │                        │
  │  POST .../verify           │                        │
  ├───────────────────────────►│ verify signature        │
  │                            │ check on-chain         │
  │                            │ _users[addr].isRegistered ─►
  │                            │ issue session JWT       │
  │  ◄── { jwt, profile }      │                        │
```

JWT claims: `{ sub: wallet, registered: bool, roles: [REGISTRAR|RESOLVER|ADMIN]? }`. Roles are derived on each verify by calling `hasRole(role, wallet)` on the contract — never cached.

### 7.2 Admin / Resolver routes

Two layers gate every privileged route:

1. **On-chain role check** — middleware re-reads `hasRole(REGISTRAR_ROLE, wallet)` or `hasRole(RESOLVER_ROLE, wallet)` at request time. Even if the JWT is somehow forged with the wrong claim, the on-chain check is authoritative.
2. **Step-up auth** — every privileged write requires a fresh SIWE signature for THIS specific action, not just a session JWT. The signature payload includes the action name + landId + nonce so a captured signature can't be replayed against a different action.

### 7.3 Backend signing keys (NOT user auth)

The two role keys live in an HSM. The `signer.service.ts` exposes:

```ts
signer.signRegistrar(unsignedTx) → signedTx
signer.signResolver(unsignedTx)  → signedTx
```

Only the **worker processes** can call these — never the API gateway. The API gateway only ever enqueues jobs; workers pull from BullMQ and sign. This means an API-gateway compromise cannot directly call any privileged contract function.

---

## 8. Blockchain Synchronization

### 8.1 Indexer architecture

A single-leader process subscribes to chain events via viem's `watchEvent` over a WebSocket RPC and writes denormalised projections to Postgres.

```
Sepolia/L2 WS RPC  ──viem.watchEvent──►  Indexer
                                          │
                            ┌─────────────┴───────────────┐
                            │                              │
                       Process event                Update Postgres
                            │                              │
                            └─────────► Redis pub/sub ────►│ API gateway pushes
                                                              to WebSocket subs
```

### 8.2 Event coverage

Every event the contract emits is indexed:

| Event family | Handler responsibilities |
|--------------|--------------------------|
| `UserRegistered` | upsert `Citizen.wallet`, mark `isRegistered = true` |
| `LandImportProposed / Verified / Disputed / Cancelled / Expired / Resolved / Finalized` | drive `ImportJob.status` transitions; populate `Land` only on `LandImportFinalized` |
| `LandMinted` | seed `Shareholder` rows (already done from `ShareholderAdded`) |
| `ShareholderAdded / Removed / ShareTransferred` | upsert `Shareholder.shareBps`, append `OwnershipChangeLog` |
| `ShareListed / ListingPriceUpdated / ListingCancelled / ShareSold` | upsert `Listing`; append `MarketplaceTrade` on `ShareSold` |
| `ProceedsCredited / Withdrawn` | track pending-withdrawal balances |
| `InheritanceAppealFiled / Initiated / HeirApproved / Disputed / Finalized / Expired` | drive `InheritanceAppeal` + `InheritanceProposal` state |
| `InheritanceFrozenForReview / LegalOverrideExecuted` | append to `_legalOverrides` projection; notify all named heirs |
| `SubdivisionProposed / Approved / Disputed / Finalized / FrozenForReview / LegalOverrideExecuted` | mirror for subdivision |
| `ChildLandCreated` | populate parent-child pointers in `Land` |
| `OccupancyGranted / Revoked` | upsert occupancy projection |
| `LandStatusChanged` | redundant with the specific event; used as a fallback during reorg recovery |
| `EmergencyWithdrawal` | append audit entry |

### 8.3 Confirmation & reorg handling

Two-phase write:

1. **Tentative**: on event seen, write a row with `confirmations = 1`. Frontend shows "pending" status.
2. **Confirmed**: after N confirmations (N = 12 on Sepolia / 64 on mainnet), set `confirmed = true`. WebSocket fires.

On reorg detection (block hash mismatch on a previously-seen block), the indexer:

1. Rolls back projections to the last confirmed block.
2. Re-fetches events from that block forward.
3. Re-applies. Idempotent because every projection upsert is keyed by `(landId, eventLogIndex)` or `(txHash, eventLogIndex)`.

### 8.4 Reading is always from Postgres; writing is always through the chain

Critically: the backend **never serves a "current state" answer from its own cache without revalidating against the chain** for trust-bearing reads (ownership, status). The Postgres projection is for *fast pagination and filtering*; the chain is the source of truth. The API attaches `lastSyncedBlock` to every read so the frontend knows how fresh the projection is.

---

## 9. Audit Logging

Every privileged backend action — every `signRegistrar` / `signResolver` call, every admin review decision, every IPFS pin, every notification dispatched — appends to two stores:

1. **`AuditEntry` table** (Postgres) — structured, queryable.
2. **Append-only log file** rotated daily to S3 with object-lock — tamper-evident.

The two are reconciled nightly: the S3 daily snapshot's sha256 is logged into the Postgres audit table, so any divergence is detectable.

Audit entries carry:

- `actor` (wallet that triggered the action)
- `action` (enum)
- `landId`
- `txHash` (if it produced an on-chain tx)
- `payload` (structured action parameters)
- timestamp

---

## 10. Security Posture

| Surface | Mitigation |
|---------|------------|
| Role-key compromise | Keys live in HSM; only workers can sign; every signing is audit-logged |
| API-gateway compromise | Gateway cannot sign on-chain — it only enqueues jobs |
| Step-up auth replay | Every privileged action requires a fresh signed payload that includes action name + landId + nonce |
| IPFS-pin tampering | Pin → read back → sha256 compare before writing the CID anywhere |
| Reorg-induced state corruption | 12-confirmation rule + idempotent upserts keyed on `(txHash, logIndex)` |
| Backend deciding ownership unilaterally | Architecturally impossible — every privileged contract call is either propose-and-consent or commit-to-CIDs |
| DB tampering | Audit log mirrored to S3 with object-lock; nightly hash reconciliation |
| DoS via giant uploads | Multer size cap (10 MB for PDFs); rate limit via Redis token bucket |
| Replay of citizen votes | The contract enforces `_heirApproved[landId][nonce][heir]` one-shot voting — backend just forwards |
| Worker failure mid-pipeline | BullMQ retries with exponential backoff; idempotent steps (pin is idempotent on CID; on-chain propose is idempotent on landId) |

---

## 11. Scalability

| Concern | Approach |
|---------|----------|
| Read traffic | Postgres read replicas behind the API gateway; cache hot reads (active listings, public land lookups) in Redis with 30-second TTL invalidated on relevant events |
| Write traffic | All writes go through BullMQ — workers can scale horizontally; rate-limited per-wallet to prevent abuse |
| Indexer throughput | Single-leader by design (chain ordering matters); the leader runs on a beefier instance; warm standby promotes on failure |
| Pinata throughput | Multiple Pinata API keys behind a round-robin; backup self-hosted Kubo node for redundancy |
| Geographic latency | API behind a CDN; WebSocket-edge close to user; RPC behind a multi-region pool |

---

## 12. Observability

| Signal | Tool |
|--------|------|
| Distributed traces | OpenTelemetry → Tempo (API → worker → RPC → IPFS) |
| Metrics | Prometheus + Grafana (queue depth per pipeline, RPC latency p50/p95/p99, indexer lag, IPFS pin success rate) |
| Structured logs | Pino → Loki (all `audit:` namespaced lines also dual-write to S3) |
| Alerts | Indexer lag > 50 blocks; RPC error rate > 1%; signing-service failure; pin failure rate > 5% |

---

## 13. Legal Realism Considerations

The backend is the operational embodiment of the contract's hybrid governance:

- **REGISTRAR_ROLE wallet** is operated by the developer's transfer office (DHA Phase X transfer office, Bahria Heights transfer office, etc.).
- **RESOLVER_ROLE wallet** must be held by a *different* operator — ideally a court-anchored body (district legal-aid office, an independent ombudsman, or a Gnosis-Safe multisig with a judge-appointed signer).
- **ADMIN_ROLE multisig** holds governance (role grants, govt-authority whitelist). Signers should be appointed by a memorandum of understanding between the developer, a regulator, and a citizen-advocacy body so no single operator can rotate the other roles.
- **PAUSER_ROLE** can be the same as ADMIN or a separate ops team. Pausing only halts new operations — withdrawals stay open.

This split matches what the contract enforces:

- A REGISTRAR-only compromise produces, at worst, garbage proposals that all expire after 90 days.
- A RESOLVER-only compromise can only act on already-disputed proposals and must commit court / legal CIDs that are publicly auditable on IPFS.
- An ADMIN compromise requires multisig collusion.

---

## 14. Deployment Checklist

- [ ] Deploy v9 contract; record `CONTRACT_ADDRESS` and `BACKEND_KEY_REGISTRAR`, `BACKEND_KEY_RESOLVER` HSM key IDs.
- [ ] Grant `REGISTRAR_ROLE` to the registrar key; revoke from any test addresses.
- [ ] Grant `RESOLVER_ROLE` to the resolver key (separate wallet — not the same as registrar).
- [ ] Transfer `ADMIN_ROLE` to a multisig.
- [ ] Whitelist initial `GOVT_AUTHORITY_ROLE` wallets (developer entity wallet, etc.).
- [ ] Migrate Postgres schema; seed `Citizen` from the developer's allotment registry.
- [ ] Configure Pinata API keys + backup Kubo node.
- [ ] Start indexer; confirm `lastSyncedBlock` reaches head.
- [ ] Run a smoke import (`proposeLandImport` → verify → confirm `LandImportFinalized`).
- [ ] Subscribe alerts (PagerDuty, Slack).

---

## 15. Sub-System Specs

Each of the following workflows has a dedicated design doc in this directory:

- **02 — Government Record Import Workflow** — fetching, normalising, deduplicating, and proposing imports with multi-owner verification.
- **03 — Inheritance Workflow** — appeal handling, court-order processing, immutable proposal generation, dispute handling, notifications.
- **04 — Court-Order Verification System** — heir-side PDF upload, backend authenticity validation, IPFS hashing, admin review, audit logging.

The architecture in this document is the substrate; the workflow docs are the specific pipelines that run on top.
