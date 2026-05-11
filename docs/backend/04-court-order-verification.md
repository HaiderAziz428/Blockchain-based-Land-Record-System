# Court-Order Verification System

> **Scope.** The cryptographic spine that anchors every off-chain court order to an on-chain CID. Used by **three** workflows in the v9 contract:
>
> - **Inheritance** — `fileInheritanceAppeal(.. courtOrderCid)` + `initiateInheritance(.. courtOrderCid, appealId)` (committed into `sharesHash = keccak256(heirs, heirShares, courtOrderCid)`)
> - **Subdivision** — `proposeSubdivision(.. courtOrderCid, surveyMetadataCid)`
> - **All three dispute paths** — `resolveLandImportDispute / resolveInheritanceDispute / resolveSubdivisionDispute` all require `(updatedCourtOrderCid, legalResolutionCid, overrideReason)`
>
> **Goals**: transparency, tamper detection, accountability.

---

## 1. Why this system exists

Every privileged on-chain action that bypasses unanimous-stakeholder consent must commit a court-order CID. This is the contract's core trust-minimisation rule: a backend or resolver cannot mint or redistribute land "because the role permits it" — they must commit a cryptographic anchor to the off-chain legal document that authorises the action.

The court-order verification subsystem is therefore the **chokepoint** through which every legal document flows on its way to an on-chain CID. Done right, it makes every override:

- **Transparent** — anyone can fetch the IPFS document from the CID stored on-chain and read what authorised the action.
- **Tamper-evident** — pin → read-back → sha256 means the on-chain CID always matches a known-content document.
- **Accountable** — every upload, validation decision, and on-chain commit is audit-logged with actor, timestamp, and rationale.

---

## 2. Document Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ UPLOAD                                                            │
│ heir/admin/resolver POSTs a PDF via the upload endpoint           │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
              [streaming validation]
                     │
                     │ size ≤ 10 MB
                     │ mime = application/pdf
                     │ sha256 not previously uploaded with different content
                     │
                     ▼
              [pin to Pinata + backup Kubo]
                     │
                     ▼
              [read back from gateway]
                     │
                     │ sha256(read-back) == sha256(upload) ?
                     │
       ┌─────────────┴─────────────┐
       │                            │
       │ NO → REJECT                │ YES → PERSIST CID
       │ (audit; surface to         │
       │  uploader as "pin          │
       │  integrity failed")        │
       └─────────────┬──────────────┘
                     │
                     ▼
              CourtOrderUpload row
              status = UNVERIFIED
                     │
                     ▼
              [admin/reviewer panel]
              │
              │ judge identity check
              │ jurisdiction check
              │ document currency check
              │ signatures present
              │
       ┌─────┴───────┐
       │             │
       │ REJECT      │ VALIDATE
       │             │
       │             ▼
       │      CourtOrderUpload.status = VALIDATED
       │             │
       │             │ CID is now eligible for use in:
       │             │  - fileInheritanceAppeal
       │             │  - initiateInheritance
       │             │  - proposeSubdivision
       │             │  - resolve*Dispute (as either updatedCourtOrderCid
       │             │                       or legalResolutionCid)
       │             │
       │             ▼
       │      [linkage written when consumed]
       │      CourtOrderUpload.linkedAppealId
       │                       .linkedProposalLandId
       │                       .linkedSubdivisionParent
       │
       ▼
   CourtOrderUpload.status = REJECTED
   rejectionReason recorded
```

The CID is **created** by the upload pipeline, **validated** by the reviewer, and **consumed** by zero or more on-chain calls. The DB tracks the linkage so a single review effort can serve multiple downstream actions.

---

## 3. Upload Endpoint

### 3.1 API

```
POST /v1/court-orders
Auth: SIWE session JWT
Content-Type: multipart/form-data

Body:
  - document          (PDF file, ≤ 10 MB)
  - documentKind      ("INHERITANCE_ORDER" | "SUBDIVISION_ORDER" |
                       "LEGAL_RESOLUTION" | "OTHER")
  - associatedLandId  (string, optional — for early linkage)
  - description       (string, optional, ≤ 2 kB — human-readable
                       summary of what the document authorises)
```

Returns:

```json
{
  "uploadId": "ck1n…",
  "ipfsCid": "QmYx…",
  "sha256": "0xabcd…",
  "verifyStatus": "UNVERIFIED",
  "pinnedAt": "2026-05-12T12:34:56Z"
}
```

### 3.2 Upload pipeline (worker job)

```ts
async function processCourtOrderUpload(jobId: string) {
  const upload = await db.courtOrderUpload.findUniqueOrThrow({ where: { id: jobId } });
  const fileBuffer = await tempStore.read(upload.tempPath);

  // 1. Content-hash before any external call.
  const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

  // 2. De-dup against existing uploads.
  const existing = await db.courtOrderUpload.findFirst({ where: { sha256 } });
  if (existing && existing.id !== upload.id) {
    // Same content already pinned — reuse the existing CID.
    await db.courtOrderUpload.update({
      where: { id: upload.id },
      data: {
        ipfsCid: existing.ipfsCid,
        sha256,
        verifyStatus: existing.verifyStatus,
        deduplicatedFrom: existing.id,
      },
    });
    await audit.log({ actor, action: 'COURT_ORDER_DEDUP', payload: { uploadId: upload.id, reusedFrom: existing.id, sha256 } });
    return;
  }

  // 3. Pin to Pinata + backup Kubo.
  const pinataCid = await pinata.pin(fileBuffer);
  const backupCid = await kubo.pin(fileBuffer);
  if (pinataCid !== backupCid) {
    throw new Error(`CID divergence between pinata=${pinataCid} kubo=${backupCid}`);
  }

  // 4. Read-back integrity check.
  const readBack = await pinata.gatewayFetch(pinataCid);
  const readBackSha = createHash('sha256').update(readBack).digest('hex');
  if (readBackSha !== sha256) {
    await pinata.unpin(pinataCid);  // don't leave a corrupt pin
    throw new Error(`pin integrity failed: upload=${sha256} readback=${readBackSha}`);
  }

  // 5. Persist.
  await db.courtOrderUpload.update({
    where: { id: upload.id },
    data: { ipfsCid: pinataCid, sha256, verifyStatus: 'UNVERIFIED' },
  });
  await tempStore.delete(upload.tempPath);

  await audit.log({
    actor: upload.uploaderWallet,
    action: 'COURT_ORDER_PINNED',
    payload: { uploadId: upload.id, cid: pinataCid, sha256, sizeBytes: fileBuffer.length },
  });

  await notifications.notifyReviewers({
    documentKind: upload.documentKind,
    uploadId: upload.id,
    cid: pinataCid,
  });
}
```

Three integrity guarantees:

| Property | Mechanism |
|----------|-----------|
| **Pin succeeded** | Pinata returned a CID + backup Kubo returned the same CID |
| **Pin matches upload** | Read-back from gateway sha256-equals the uploaded bytes |
| **Pin survives single-provider outage** | Mirrored on Pinata + self-hosted Kubo |

---

## 4. Hash Verification (independent client-side)

Beyond the backend's read-back check, the **uploader and any heir** can independently verify a CID matches a document they have locally:

```ts
// frontend snippet — pure client-side
async function verifyCourtOrder(localFile: File, cidFromChain: string): Promise<boolean> {
  const localBytes = new Uint8Array(await localFile.arrayBuffer());
  const localSha = bytesToHex(await crypto.subtle.digest('SHA-256', localBytes));

  const gatewayBytes = await (await fetch(`https://gateway.pinata.cloud/ipfs/${cidFromChain}`)).arrayBuffer();
  const gatewaySha = bytesToHex(await crypto.subtle.digest('SHA-256', new Uint8Array(gatewayBytes)));

  return localSha === gatewaySha;
}
```

The court-order detail screen exposes this as a UI button: **"Verify this CID matches the file I have"**. The check runs entirely in the browser; the backend isn't trusted.

---

## 5. Admin Review Workflow

A reviewer (typically a `REGISTRAR_ROLE` operator with legal training, or an external counsel given a read-only admin role) opens the review queue:

```
GET /v1/admin/court-orders?status=UNVERIFIED
```

Returns a list of pending uploads with:

- uploader identity (CNIC → name from Citizens table)
- documentKind
- associatedLandId (if provided)
- description
- ipfsCid + sha256
- pinnedAt timestamp
- a rendered preview (gateway-fetched PDF embedded via iframe)

### 5.1 Review checklist (UI-enforced)

Each review captures **structured checks**, not just a pass/fail. The reviewer must answer (each as an explicit yes/no/N-A):

1. **Document is a PDF, readable, not corrupted** — visual confirmation.
2. **Bears the issuing court's seal/stamp** — physical authenticity hint.
3. **Lists the issuing judge by name and title** — accountability anchor.
4. **Has a clearly stated jurisdiction** (e.g. "Civil Judge, Lahore Cantt") — must be valid for the land's location.
5. **Has a clearly stated case number / order number** — for cross-checking with the court's own records.
6. **Has a clearly stated date of issue** — for currency check.
7. **Is signed** (wet signature or attested digital signature) — formal validity.
8. **Has not been superseded by a later order known to the reviewer** — currency check.
9. **Specifies the same landId and the same parties as the on-chain proposal it backs** — alignment check.
10. **(Inheritance only)** Lists heirs whose names + shares match the proposed `heirs[]` + `heirShares[]`.
11. **(Subdivision only)** References a survey document or attaches one (which must also be pinned separately as `surveyMetadataCid`).

The reviewer submits:

```
POST /v1/admin/court-orders/:uploadId/decision
Auth: REGISTRAR step-up signature
Body:
  - decision           ("VALIDATE" | "REJECT")
  - checks             ({ #1..#11 → "YES" | "NO" | "N/A" })
  - reviewerNotes      (string)
```

If `VALIDATE`, the row transitions to `VALIDATED` and becomes eligible for on-chain use. If `REJECT`, the row transitions to `REJECTED` with the rejection rationale recorded; the CID remains pinned on IPFS (for audit) but is flagged in the DB so downstream workflows refuse to consume it.

> **No CID is ever deleted from IPFS.** A rejected court order stays pinned indefinitely so the rejection itself is auditable: "the reviewer rejected this specific document; here it is."

---

## 6. Linkage to On-Chain Actions

A validated `CourtOrderUpload` row carries soft-link fields populated when its CID is consumed:

```prisma
model CourtOrderUpload {
  // ... fields from doc 01 ...
  linkedAppealId             BigInt?
  linkedProposalLandId        String?
  linkedSubdivisionParent     String?
  linkedResolutionOverrideId  BigInt?   // primary key of a _legalOverrides row
}
```

The worker that calls each contract function writes the linkage **before** sending the tx:

| When the backend signs… | The CID is linked via… |
|------------------------|------------------------|
| `fileInheritanceAppeal(.. courtOrderCid)` (pre-composed for heir) | `linkedAppealId` (set when the indexer sees `InheritanceAppealFiled`) |
| `initiateInheritance(.. courtOrderCid, appealId)` | `linkedProposalLandId` |
| `proposeSubdivision(.. courtOrderCid, surveyMetadataCid)` | `linkedSubdivisionParent` (for both CIDs) |
| `resolveInheritanceDispute(.. updatedCourtOrderCid, legalResolutionCid, ..)` | `linkedResolutionOverrideId` (for both CIDs — separate rows) |

This is what makes "show me every on-chain action this court order authorised" a one-query lookup.

---

## 7. Frontend Display

### 7.1 Court-order detail screen

`/court-orders/:cid` renders:

- the rendered PDF (IPFS gateway embed)
- the on-chain CID + sha256
- uploader identity
- validation status + reviewer + decision timestamp
- all linked on-chain actions (proposal landIds, appealIds, override IDs)
- the structured-check answers from the reviewer
- a "Verify locally" button (see §4)
- an "Open on IPFS gateway" link

### 7.2 Inheritance vote screen

When an heir votes (`/inheritance/:landId/vote`), the screen shows three blocks side-by-side:

1. **The court order** (PDF embed from `proposal.courtOrderCid`)
2. **The proposed shares** (heirs[] + heirShares[] table)
3. **An independence-verify button**: "Do these shares match the court order?" → opens an instruction modal explaining that the heir should read the PDF and either approve (shares match) or dispute (shares do not match).

The screen also shows the `sharesHash`:

```
On-chain commitment:
  sharesHash = 0xabcd...1234

This hash is computed from (heirs, heirShares, courtOrderCid).
[Recompute client-side] → ✓ matches on-chain value
```

The recompute button calls the contract's pure `computeSharesHash(heirs, heirShares, courtOrderCid)` view. If the recomputed hash matches the on-chain `sharesHash`, the heir has cryptographic proof that what they're seeing on-screen is exactly what the contract will execute on `_executeInheritance`.

This single button closes the entire "backend silently rewrote the shares" attack surface.

### 7.3 Resolver dispute panel

When the resolver opens a `LOCKED_*_DISPUTE` case, they see:

- the original court order (PDF embed)
- the proposed action that the heirs / shareholders disputed
- a side-by-side upload form for:
  - `updatedCourtOrderCid` (may be the same as the original if no amendment)
  - `legalResolutionCid` (the judgment / written decision that resolves the dispute — always a new document)
  - `overrideReason` (textarea, bounded to MAX_STRING_LENGTH = 256 bytes)

Submitting fires the resolver step-up signature flow and ultimately the on-chain `resolveInheritanceDispute` (or its subdivision / import equivalent). The two new CIDs go through the same upload pipeline (pin, read-back, sha256, review).

> The reviewer panel is in fact the same UI used at upload time — every CID, no matter what role uploaded it, passes through the same validation chokepoint.

---

## 8. Dispute Escalation Path

When an heir or shareholder reviews a court order on the vote screen and disagrees with the validity, they have two on-chain primitives:

| Action | Effect |
|--------|--------|
| `disputeSuccessionPlan(landId)` | Status → `LOCKED_INHERITANCE_DISPUTE`. Resolver must resolve with new court CID. |
| `disputeSubdivision(parentLandId)` | Status → `LOCKED_SUBDIVISION_DISPUTE`. Resolver must resolve with new court CID. |
| `disputeLandImport(landId)` | Status → `LOCKED_IMPORT_DISPUTE`. Resolver must resolve with new court CID. |

The backend captures the dispute event and surfaces it on the resolver portal. The resolver's resolution call must commit a *new* `updatedCourtOrderCid` — they cannot just rubber-stamp the disputed one. This forces every contested case back through a fresh court-order upload and review cycle.

---

## 9. Audit Log

Every document state-change appends one `AuditEntry`:

| Action | Actor | Payload |
|--------|-------|---------|
| `COURT_ORDER_UPLOADED` | uploader wallet | `{ uploadId, sizeBytes, mimeType, documentKind, associatedLandId }` |
| `COURT_ORDER_PINNED` | system | `{ uploadId, cid, sha256, sizeBytes }` |
| `COURT_ORDER_DEDUP` | system | `{ uploadId, reusedFrom, sha256 }` |
| `COURT_ORDER_PIN_FAILED` | system | `{ uploadId, reason }` |
| `COURT_ORDER_REVIEWED` | reviewer wallet | `{ uploadId, decision, checks, reviewerNotes }` |
| `COURT_ORDER_LINKED` | system | `{ uploadId, linkType, linkValue }` |
| `COURT_ORDER_INDEPENDENT_VERIFY` | citizen wallet | `{ uploadId, cidFromChain, localSha, verified }` |

The independent-verify event is logged so a court could later confirm that "person X verified document Y on date Z" — useful evidence in a downstream dispute.

---

## 10. Transparency, Tamper Detection, Accountability

The three explicit focus areas the user asked for:

### 10.1 Transparency

- Every CID stored on-chain corresponds to a document pinned on Pinata + backup Kubo with public gateway access.
- Every linkage between a court order and an on-chain action is queryable via `getInheritanceRequest`, `getSubdivisionPlan`, `getLegalOverrides`, `getSubdivisionLegalOverrides`.
- The audit log is append-only at the application level and mirrored to S3 with object-lock.
- The reviewer's structured-check answers are stored in `CourtOrderUpload.checks` (JSONB) — not just a binary yes/no.

### 10.2 Tamper detection

- Pin → read-back → sha256 ensures the on-chain CID always matches the document the uploader sent.
- Cross-pin (Pinata + Kubo) detects divergent CIDs (one provider returning a different content hash).
- `sharesHash = keccak256(heirs, heirShares, courtOrderCid)` makes silent share-rewrites detectable — the inheritance vote screen lets heirs recompute it client-side.
- Postgres `unique(sha256)` prevents two CIDs from claiming the same document content; if a reviewer ever sees two CIDs with the same sha256, the dedup logic surfaces it.

### 10.3 Accountability

- Every action against a court order is signed: uploaders sign uploads (SIWE), reviewers sign decisions (step-up signature with the upload ID in the payload), resolvers sign overrides (step-up signature binding action + CIDs + reason).
- The audit log captures `actor` for every entry; the on-chain audit log captures `resolver` on every `LegalOverrideExecuted`.
- No CID is ever deleted from IPFS — even rejected uploads stay pinned, so the rejection itself is auditable evidence.

---

## 11. Failure Modes

| Failure | Containment |
|---------|-------------|
| Pinata outage | Backup Kubo pin keeps the CID retrievable; gateway-fetch read-back can hit either |
| Reviewer wrongly validates a forged document | Heirs / shareholders dispute on-chain; resolver re-reviews with a fresh `updatedCourtOrderCid`; the new override is audit-logged |
| Reviewer wrongly rejects a valid document | The document stays pinned; uploader can request a second review; rejection is audit-logged so it's challengeable |
| Uploader submits the same document twice | Dedup on sha256; second upload reuses the first CID + carries forward the validation status |
| Resolver supplies an empty or oversize CID | Contract's `boundedString` modifier reverts; pre-validation in the backend's resolver endpoint surfaces the error earlier |
| sha256 mismatch on read-back (CID corruption) | Unpin and reject upload; never persist a corrupted CID |
| sharesHash divergence between off-chain compute and on-chain emit | Critical alert; suggests the registrar's input array changed between off-chain validation and on-chain submission — block the affected proposal pending forensic review |
| Indexer reorg between propose and finalisation | 12-confirmation rule + idempotent upserts on `(txHash, logIndex)` |

---

## 12. Database Schema (consolidated for the chokepoint)

```prisma
model CourtOrderUpload {
  id                String   @id @default(cuid())

  // Upload metadata
  uploaderWallet    String
  originalFilename  String
  mimeType          String
  sizeBytes         Int
  documentKind      String                  // INHERITANCE_ORDER | SUBDIVISION_ORDER | LEGAL_RESOLUTION | OTHER
  associatedLandId  String?
  description       String?

  // Content anchors
  sha256            String   @unique
  ipfsCid           String   @unique
  deduplicatedFrom  String?                 // null if first upload of this sha256

  // Review
  verifyStatus      String   @default("UNVERIFIED")  // UNVERIFIED | VALIDATED | REJECTED
  validatedBy       String?
  validatedAt       DateTime?
  rejectionReason   String?
  checks            Json?                    // structured reviewer responses

  // Soft links to consumers
  linkedAppealId              BigInt?
  linkedProposalLandId        String?
  linkedSubdivisionParent     String?
  linkedResolutionOverrideId  BigInt?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([uploaderWallet])
  @@index([verifyStatus])
  @@index([linkedAppealId])
  @@index([linkedProposalLandId])
  @@index([linkedSubdivisionParent])
}
```

This is the only table that holds the substantive court-order data off-chain. Everything else in the system points back to a `CourtOrderUpload.id` (or its `ipfsCid`).

---

## 13. Diagram — End-to-End Lifetime of a Single CID

```
uploader               backend           IPFS          chain          reviewer        consumer (heir/admin)
   │                     │                │              │                │                 │
   │ POST PDF + metadata │                │              │                │                 │
   ├────────────────────►│                │              │                │                 │
   │                     │ sha256(file)   │              │                │                 │
   │                     │ ──pin─────────►│              │                │                 │
   │                     │ ──pin (Kubo)──►│              │                │                 │
   │                     │ readBack ────► │              │                │                 │
   │                     │ sha256 ✓                       │                │                 │
   │                     │ persist CID   │              │                │                 │
   │ ◄── { cid, sha }    │                │              │                │                 │
   │                     │ ──notify──────────────────────────────────────►│                 │
   │                                                                       │                 │
   │                                                                       │ review checks   │
   │                                                                       │ + decision      │
   │                                                                       │                 │
   │                     │ ◄────── /v1/admin/court-orders/:id/decision ────┤                 │
   │                     │ verifyStatus = VALIDATED                       │                 │
   │                                                                                          │
   │                     │ ◄─── consumer triggers an on-chain action ─────────────────────────┤
   │                     │ pre-compose tx using CID                                          │
   │                     ├──────► chain (initiateInheritance / proposeSubdivision / resolve*)
   │                     │ ◄── event with CID                                                │
   │                     │ link CourtOrderUpload to chain action                             │
   │                                                                                          │
   │                     │ ◄── consumer reads /v1/court-orders/:cid ───────────────────────────┤
   │                     │ returns PDF preview + checks + linked actions + sharesHash         │
```

---

## 14. Future Hooks

- **Court-records API auto-validation** — instead of relying on a human reviewer, integrate with provincial court-records APIs to pre-validate `(case number, judge, jurisdiction)` triples automatically. The structured-check checklist becomes the API integration surface.
- **Document signing standards** — accept signed PDFs (PAdES) and verify the signature against a CA list, instead of relying on visual inspection.
- **OCR + NLP extraction** — auto-extract heir names, share fractions, and dates from the PDF for cross-checking against the proposal arrays.
- **Multi-language support** — Pakistani court orders are often in Urdu or Punjabi; the reviewer panel needs Unicode rendering and (long-term) auto-translation hints.

---

This subsystem is the small surface area where most of the protocol's trust load concentrates. Done right, every on-chain override carries a verifiable cryptographic anchor to a real-world legal document, and anyone — citizen, lawyer, regulator, press — can independently audit the chain of authority that produced any on-chain action.
