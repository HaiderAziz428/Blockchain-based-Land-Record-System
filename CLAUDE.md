# CLAUDE.md — Project Knowledge Document

> **A complete, self-contained walkthrough of the LandLedger system.**
> If you have read this document end-to-end, you should understand *what* this project is, *why* it exists, *how* it works under the hood, and *how* every piece connects. This is the canonical context file for the codebase.

---

## 1. Executive Summary

**LandLedger** (codebase: *fyp-blockchain-based-land-system*) is a **fully decentralized land registry** built on the Ethereum Sepolia testnet, **targeted at new private and semi-private housing developments in Pakistan** — DHA, Bahria Town, CDA/LDA new sectors, and private real-estate schemes — that issue plot allotments paperless from day one.

LandLedger does **not** attempt to migrate Pakistan's century-old patwari paper-record system onto the blockchain. That is a multi-decade political project, not an engineering scope. Instead, LandLedger replaces the *paper allotment letter* — the document that fraudsters forge, duplicate, and resell in DHA-file and Bahria-file scams — with a cryptographically unforgeable on-chain record.

The system encodes each plot as an **ERC-721 NFT** — making ownership cryptographically unforgeable — and stores all supporting documents (allotment letters, site plans, listing photos) on **IPFS via Pinata**, so the file content itself is content-addressed and tamper-evident. A single Supabase instance simulates the **society's allotment registry** (the developer's own CNIC-keyed list of who has been allotted which plot) — this is a *mock* of the developer's existing internal system, not a database the DApp depends on for trust.

**Bottom line:** ownership lives on-chain. Documents live on IPFS. The society allotment registry is a one-way *input* used to verify a buyer's identity and entitlement at mint time. No off-chain database is in the trust path of the marketplace.

| Quick fact | Value |
|------------|-------|
| Network | Ethereum Sepolia Testnet |
| Contract address | `0xd2a855a8fC38d4E0a871319d5882E696155d1253` |
| ERC-721 token | PakLandRegistry (PLR) |
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5 |
| Web3 | Wagmi 2 · Viem 2 · RainbowKit 2 |
| Off-chain storage | Pinata (IPFS) — documents, photos, ERC-721 metadata, listing metadata |
| Govt DB simulation | Supabase Postgres (single instance — `supabase.ts`) |
| Smart contract source | `contract.sol` (single file, `LandRegistry`) |

---

## 2. The Problem We Are Solving

### 2.1 The market we target

LandLedger targets **new private and semi-private housing developments in Pakistan** — the kind that issue plots through allotment letters rather than through the patwari/revenue office. The most prominent examples:

- **DHA (Defence Housing Authority)** phases in Lahore, Karachi, Islamabad, Multan, etc.
- **Bahria Town** developments
- **CDA / LDA** auctions for new sectors
- **Private real-estate schemes** launching new societies

These developers operate **administratively independent of the patwari system**. They maintain their own allotment registries, issue their own allotment letters, run their own transfer offices, and process their own succession cases. They are paperless-ready: there is no legacy paper record to migrate, only a fresh allotment to mint.

### 2.2 The pain point — fraud in new societies

Even though new societies are independent of the legacy revenue system, they suffer from their own well-documented fraud patterns. Anyone who has bought or sold a DHA file in the last decade has heard of these:

| Issue | Real-world consequence |
|-------|------------------------|
| Forged or duplicated allotment letters | The same plot file is sold to multiple buyers ("DHA file scam") |
| Double allotment by corrupt staff | Two valid-looking files exist for the same plot |
| Ghost plots | The plot exists on paper but not on the ground (or vice versa) |
| Fake transfer letters | Forged seller signatures move ownership without the seller knowing |
| Opaque inheritance | Succession (*virsa*) cases over inherited plots drag on for years |
| No public verification | Secondary-market buyers cannot independently confirm "is this file real, who actually owns it, has it already been sold?" |

These are not theoretical risks — the Pakistani print and digital media regularly report scams running into hundreds of millions of rupees in DHA, Bahria Town, and private-society plot files.

### 2.3 Why blockchain (and not "just a better database")

A centralised database — no matter how well-engineered — concentrates trust in whoever administers it. A developer's internal allotment database can be edited by a corrupt staff member just as easily as a paper ledger can be forged: **whoever controls the DB controls the truth.**

Blockchain inverts this: **no single party can rewrite history** because every node enforces the same immutable rules. By making the allotment itself an on-chain ERC-721 NFT, we get four properties a developer-controlled database cannot provide:

1. **Immutability** — every transfer is permanent and cryptographically signed.
2. **Public verifiability** — any prospective buyer can query "who really owns plot 42, Phase 9?" for free, without going to the developer's office.
3. **Programmable rules** — multi-heir succession voting, time-locked listings, and dispute-locking are enforced by code, not by transfer-office clerks.
4. **Cryptographic ownership** — only the keyholder can transfer; no clerk can "make a mistake," and no forged letter can move a plot.

### 2.4 What this project *is not*

- **Not a replacement for the judiciary.** Disputes still need legal arbitration; we provide the on-chain lock + audit trail to support that process.
- **Not a replacement for the patwari system.** Migrating Pakistan's century-old legacy land records is a separate, much larger problem out of scope for this thesis. We address new developments with no legacy baggage.
- **Not a GIS / surveying platform.** Plot boundaries are still determined off-chain by the developer's site plan.
- **Not a mainnet-ready production system.** Sepolia deployment, faucet ETH, and a mock allotment registry make this a research-grade prototype that demonstrates the architecture; mainnet (or Layer-2) deployment would require partnership with a real developer.

---

## 3. System Architecture (High Level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER (Browser)                                                             │
│  • RainbowKit wallet UI · Next.js client components · Tailwind UI           │
└──────────┬──────────────────────────────┬───────────────────────────────────┘
           │                              │
   read state                      sign transactions
   (Wagmi hooks)                   (MetaMask via Wagmi)
           │                              │
           ▼                              ▼
┌─────────────────────────────┐   ┌──────────────────────────────┐
│ Next.js Server (API Routes) │   │ Sepolia RPC (publicnode.com) │
│ • /api/verify   (mint)      │   │                              │
│ • /api/inheritance          │◄──┤  LandRegistry.sol            │
│ • /api/dispute              │   │  (contract address)          │
│ Holds ADMIN_PRIVATE_KEY     │   │                              │
│ Signs onlyBackend tx via    │   │  • registerUser              │
│ Viem walletClient           │   │  • storeVerifiedLandRecord   │
└────┬─────────────────┬──────┘   │  • listLandForSale           │
     │                 │          │  • buyLand (payable)         │
     │      reads      │          │  • initiateInheritance       │
     │                 │          │  • approveSuccessionPlan     │
     ▼                 ▼          │  • disputeSuccessionPlan     │
┌──────────┐   ┌───────────────┐  │  • resolveDispute            │
│ Govt DB  │   │ Pinata IPFS   │  │  • transferLandOwnership     │
│ (mock,   │   │               │  │  ERC-721 (OpenZeppelin)      │
│ Supabase)│   │ • Land docs   │  └──────────────────────────────┘
│          │   │ • ERC-721 JSON│
│ • citizen│   │ • Listing JSON│
│   CNICs  │   │ • Photos      │
│ • land   │   │               │
│   records│   │ Returns CID;  │
│ • ipfs   │   │ CID stored    │
│   hash   │   │ on-chain      │
└──────────┘   └───────────────┘
```

The diagram tells the *whole story*:

- **The blockchain is the source of truth** for ownership, status, and listings.
- **IPFS is the source of truth** for *content* (the deed image, the photos).
- **The govt DB is a mock input** — it represents the legacy system being onboarded. After mint, the chain takes over.
- **API routes never call the chain on the user's behalf for ownership transfers** — those are user-signed via MetaMask. API routes only sign *privileged* `onlyBackend` transactions (mint, inheritance, dispute resolution) where a govt authority is needed.

---

## 4. Decentralization Story (Why We Removed the Marketplace DB)

The project went through three architecture phases:

| Phase | Storage Layout | Trust Properties |
|-------|----------------|------------------|
| v1 (early) | Listings in Supabase + on-chain ownership | Marketplace data lived in a centralised DB — admin could silently delete or rewrite listings. |
| v2 (intermediate) | Listings in Supabase + photos on IPFS | Photos became immutable, but the listing record itself (price, status) was still a DB row. |
| **v3 (current)** | **Listings on-chain + photos+metadata on IPFS** | **Fully decentralized:** price, seller, deadline, and metadata-CID live in the contract; the JSON containing description/photos/WhatsApp lives on IPFS. The DB is no longer in the trust path. |

The change was deliberate: **a decentralized ownership ledger paired with a centralised marketplace would be only half decentralized.** The CLAUDE.md you are reading documents the **v3 architecture**.

What actually moved:
- ❌ `src/lib/marketplace.ts` — **deleted** (was a second Supabase client just for listings).
- ❌ `marketplace.listings` table — **no longer used** (replaced by `landListings[landId]` on-chain).
- ❌ `NEXT_PUBLIC_MARKET_URL`, `NEXT_PUBLIC_MARKET_KEY` env vars — **removed**.
- ✅ `Listing` struct on-chain gained a `metadataHash` field (IPFS CID).
- ✅ Photos uploaded directly to Pinata in `CreateListingModal.tsx`.
- ✅ Listing metadata JSON (`{name, description, location, area, photos[], whatsapp}`) pinned to IPFS in the same modal.
- ✅ `marketplace/page.tsx` reads listings entirely from chain + hydrates JSON from IPFS at display time.

The Supabase instance **stays** because it represents the developer's mock allotment registry — the existing CNIC-keyed list of who has been allotted which plot. After purchase, ownership is synced back to `govt_land_records.owner_cnic` (best-effort, non-critical) so the developer's internal records reflect current owners — but the chain is authoritative. (The table name is a legacy of the original framing; semantically it is now the *society allotment registry*.)

---

## 5. Tech Stack & Why Each Choice

| Layer | Tech | Version | Reason |
|-------|------|---------|--------|
| Runtime | Node.js | ≥ 18 | Required by Next.js 16 |
| Framework | Next.js (App Router) | 16.1.1 | File-based routing, server components, native API routes (we need server-only routes for admin signing) |
| UI library | React | 19.2.3 | Latest concurrent renderer, `useTransition` for smoother on-chain UX |
| Language | TypeScript | 5 | Type-safe contract calls; Wagmi infers ABI types automatically |
| Styling | TailwindCSS | 4 | Utility-first; rapid iteration without context-switching to CSS files |
| Icons | Lucide React | 0.577 | Consistent, tree-shakable icon set |
| Wallet UI | RainbowKit | 2.2 | Best-in-class wallet connection — supports MetaMask, WalletConnect, Coinbase out of the box |
| React-Web3 hooks | Wagmi | 2.19 | Type-safe `useReadContract`, `useWriteContract`, `useWaitForTransactionReceipt` |
| EVM client | Viem | 2.43 | Modern, lightweight, tree-shakable; used both client-side (read) and server-side (admin sign) |
| Cache layer | TanStack Query | 5.90 | Powers Wagmi's caching; deduplicates concurrent reads |
| Smart contract | Solidity | ^0.8.20 | Built-in overflow checks, custom errors, modern features |
| Token standard | ERC-721 | OpenZeppelin 5.x | Audited NFT primitive; perfect semantic fit for unique land parcels |
| Govt DB | Supabase (Postgres) | — | Free hosted Postgres with row-level security — simulates the govt civil registry |
| File storage | Pinata IPFS | — | Free pinning tier; content-addressed; on-chain CID makes files tamper-evident |
| RPC | publicnode.com | — | Free Sepolia RPC; used in `/api/*` routes |

---

## 6. Smart Contract Deep Dive

The contract is **a single file** (`contract.sol`) — `LandRegistry`. Splitting into multiple contracts was considered and rejected: cross-contract calls cost more gas and the system is tightly coupled by design.

### 6.1 Roles & access control

| Role | How identified | Powers |
|------|----------------|--------|
| **Contract Owner** | `Ownable.owner()` (deployer) | `setGovtAuthority(wallet, status)` |
| **Verification Backend** | `verificationBackend` immutable address (set in constructor) | `storeVerifiedLandRecord`, `initiateInheritance`, `resolveDispute` (i.e. all `onlyBackend` functions) |
| **Govt Authority** | `isGovtAuthority[wallet] == true` | Can hold land without a personal CNIC (CDA, DHA, etc.) |
| **Registered Citizen** | `users[wallet].isRegistered == true` | Mint via backend, transfer own land, list, buy |
| **Anyone** | — | View functions (`getLandRecord`, `getLandsByCnic`, `getAllLandRecordsPaginated`) |

Two crucial modifiers:

- `onlyBackend` — `require(msg.sender == verificationBackend)`. Only the wallet whose private key lives in `ADMIN_PRIVATE_KEY` (server-side) can call privileged functions.
- `onlyActive(landId)` — `require(landRecords[landId].status == ACTIVE)`. Disputed or pending-inheritance land cannot be transferred.

### 6.2 Core data structures

```solidity
enum LandType   { RESIDENTIAL, AGRICULTURAL, COMMERCIAL }
enum LandStatus { ACTIVE, PENDING_INHERITANCE, LOCKED_DISPUTE }

struct LandRecord       { address currentOwner; string cnic; string landId; string ipfsHash; LandType landType; LandStatus status; uint256 verifiedAt; }
struct UserProfile      { string name; string cnic; bool isRegistered; }
struct Listing          { uint256 price; address seller; bool isActive; uint256 deadline; string metadataHash; }
struct OwnershipHistory { address owner; uint256 timestamp; uint256 price; }
struct InheritanceRequest {
    address[] heirs;
    string[] newLandIds;
    string[] newIpfsHashes;
    uint256 approvalCount;
    bool isExecuted;
    mapping(address => bool) hasApproved;
}
```

Note: `LandRecord.ipfsHash` is the CID of the **ERC-721 metadata JSON** (built by `DigitizationModal`), *not* the raw deed file. The metadata JSON in turn references the raw deed via `image:` and `documents[]:` fields. This follows the ERC-721 metadata standard exactly.

### 6.3 Key functions and their callers

| Function | Caller | Modifier | Purpose |
|----------|--------|----------|---------|
| `registerUser(name, cnic)` | Citizen | — | Bind wallet ↔ CNIC. Enforces 1-wallet-1-CNIC + 1-CNIC-1-wallet. |
| `storeVerifiedLandRecord(owner, landId, ipfsHash, lType)` | Backend (`/api/verify`) | `onlyBackend` | Mints the NFT. Sets owner, stores CID, records initial history entry. |
| `transferLandOwnership(landId, newOwner, salePrice)` | Owner | `landMustExist`, `onlyActive` | Direct (off-marketplace) transfer with sale-price logged for tax transparency. |
| `listLandForSale(landId, price, metadataHash)` | Owner | `onlyActive` | Creates a 7-day listing. `metadataHash` is the IPFS CID of the listing JSON. |
| `buyLand(landId)` | Registered buyer | `landMustExist`, `onlyActive`, `payable` | Atomic purchase. Validates registration, expiry, price. Reentrancy-safe. |
| `cancelListing(landId)` | Owner | — | Removes an active listing. |
| `initiateInheritance(oldId, heirs, newIds, hashes)` | Backend (`/api/inheritance`) | `onlyBackend`, `onlyActive` | Locks land → `PENDING_INHERITANCE`, creates proposal. |
| `approveSuccessionPlan(oldLandId)` | Heir | — | Vote yes. Auto-executes when all heirs have approved (100% threshold). |
| `disputeSuccessionPlan(oldLandId)` | Heir | — | Single dispute → permanent `LOCKED_DISPUTE` until backend resolves. |
| `resolveDispute(oldLandId, force)` | Backend (`/api/dispute`) | `onlyBackend` | Either `_executeInheritance` (if force=true) or revert to `ACTIVE`. |
| `setGovtAuthority(wallet, status)` | Owner | `onlyOwner` | Whitelist institutional wallets. |
| `getLandRecord(landId)` | Anyone | view | Public verification — returns the full LandRecord struct. |
| `getAllLandRecordsPaginated(cursor, size)` | Anyone | view | Cursor-based pagination — bounds gas. |
| `getLandsByCnic(cnic)` | Anyone | view | Returns array of landIds owned by the wallet linked to that CNIC. |

### 6.4 Critical contract design decisions

1. **Deterministic tokenId.** `tokenId = uint256(keccak256(abi.encodePacked(landId)))`. No counter SSTORE on mint; landId↔tokenId is globally unique without coordination.
2. **Manual `_tokenIdToLandId` mapping** instead of `ERC721URIStorage` — saves per-token string storage; `tokenURI(tokenId)` is computed as `"ipfs://" + landRecords[landId].ipfsHash`.
3. **7-day listing deadline.** Listings expire automatically (`deadline = block.timestamp + 7 days`) — buyer transactions revert after expiry. Prevents stale offers.
4. **Reentrancy defense in `buyLand`.** Before sending ETH to the seller, the listing is `delete`d (state cleared). Even if the seller is a malicious contract, reentry finds an empty listing and reverts. This is the canonical *checks-effects-interactions* pattern.
5. **Inheritance requires 100% approval.** A single dissenting heir (`disputeSuccessionPlan`) hard-locks the asset (`LOCKED_DISPUTE`). The backend has an escape hatch (`resolveDispute(force=true)`) for cases where legal mediation has decided to proceed — providing a verifiable on-chain record of the override.
6. **Swap-and-pop in `_removeFromOwnerList`.** Removes from `ownerToLands[]` in O(1) by swapping with the last element and popping.
7. **Cursor-based pagination.** `getAllLandRecordsPaginated(cursor, size)` returns a slice + `nextCursor` — bounds gas per query regardless of total record count.

### 6.5 Events

```
UserRegistered(user, name, cnic)
LandMinted(owner, landId, lType, tokenId)
LandTransferred(landId, from, to, price)
LandListed(landId, price, seller, metadataHash)
LandSold(landId, buyer, price)
ListingCancelled(landId)
InheritanceInitiated(oldLandId, totalHeirs)
HeirApproved(oldLandId, heir)
InheritanceDisputed(oldLandId, heir)
InheritanceFinalized(oldLandId)
LandStatusChanged(landId, status)
```

Events are the canonical source for off-chain indexing (e.g. The Graph subgraph in future work).

---

## 7. Frontend Architecture

### 7.1 Directory map

```
src/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout, providers, fonts
│   ├── page.tsx                      # Hero / landing
│   ├── providers.tsx                 # RainbowKit + Wagmi + QueryClient ('use client' boundary)
│   ├── verify/page.tsx               # Public land verification — anyone can look up by landId
│   ├── marketplace/page.tsx          # Browse on-chain listings, buy
│   ├── dashboard/
│   │   ├── user/page.tsx             # User dashboard: portfolio, mint, list, transfer, succession votes
│   │   └── admin/page.tsx            # Admin dashboard: paginated land table, dispute resolution, govt-authority mgmt
│   └── api/
│       ├── verify/route.ts           # POST → admin signs storeVerifiedLandRecord
│       ├── inheritance/route.ts      # POST → admin signs initiateInheritance
│       └── dispute/route.ts          # POST → admin signs resolveDispute
├── components/
│   ├── Header.tsx, Navbar.tsx, Hero.tsx, Footer.tsx, PortalSelection.tsx
│   ├── RegistrationModal.tsx         # Wagmi flow → registerUser
│   ├── DigitizationModal.tsx         # Pinata uploads → write metadata CID to govt_land_records.ipfs_hash
│   ├── CreateListingModal.tsx        # Pinata uploads + listLandForSale tx
│   ├── TransferModal.tsx             # Wagmi flow → transferLandOwnership
│   ├── UserAuthModal.tsx             # CNIC-gated entry to user portal
│   ├── TxToast.tsx                   # In-app transaction confirmation toast
│   └── guards/AdminGuard.tsx         # Reads owner() from chain; blocks non-owners
├── lib/
│   └── supabase.ts                   # Single Supabase client — govt DB
└── utils/
    ├── contract.ts                   # CONTRACT_ADDRESS + full ABI
    └── pinata.ts                     # uploadFileToIPFS, uploadJSONToIPFS
```

### 7.2 The seven recurring patterns

These are the patterns you will see repeatedly across the codebase. Recognising them is essential to navigating the project.

#### Pattern 1: Wagmi 4-hook write flow

Every user-initiated blockchain write follows this sequence:

```
useAccount()                      → connected wallet
useReadContract()                 → optional preflight reads
useWriteContract()                → queue & send transaction (MetaMask popup)
useWaitForTransactionReceipt()    → poll for confirmation, expose isSuccess
useEffect([isSuccess])            → run side effects (toast, refetch, DB sync)
```

Reference: `CreateListingModal.tsx`, `TransferModal.tsx`, every `dashboard/user/page.tsx` action.

#### Pattern 2: Admin server-signing for `onlyBackend` calls

User-facing flows that require admin authority cannot expose `ADMIN_PRIVATE_KEY` to the browser. The pattern:

```
Frontend  ── POST {payload} ──►  /api/<route>  ── viem.writeContract() ──►  Sepolia
                                       │
                                       └── reads ADMIN_PRIVATE_KEY (server-only env)
```

Used by:
- `/api/verify` → `storeVerifiedLandRecord` (mint)
- `/api/inheritance` → `initiateInheritance`
- `/api/dispute` → `resolveDispute`

`ADMIN_PRIVATE_KEY` is **never** prefixed with `NEXT_PUBLIC_`, so it never reaches the client bundle. The `verificationBackend` address in the contract is permanent — set in the constructor as immutable.

#### Pattern 3: Hydration-safe rendering

Pages reading wallet state would cause SSR ↔ client mismatches because the server has no wallet. Every wallet-aware page defers render until after mount:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return null;
```

Reference: `dashboard/user/page.tsx:35-36,233`, `marketplace/page.tsx:41-42,209`.

#### Pattern 4: `useRef` flag against React Strict Mode double-effects

`useEffect` fires twice in dev/strict mode. For one-shot side effects (DB sync, toast) we guard with a ref:

```tsx
const processedRef = useRef(false);
useEffect(() => {
  if (isSuccess && !processedRef.current) {
    processedRef.current = true;
    // one-shot side effect
  }
}, [isSuccess]);
```

Reference: `CreateListingModal.tsx:39,60-66`, `dashboard/user/page.tsx` (multiple places).

#### Pattern 5: Authorization via `AdminGuard`

There is **no JWT, no session, no auth context** anywhere in the app. All authorization is on-chain. `AdminGuard` reads `owner()` from the contract and compares it to the connected wallet:

```
useAccount().address  ===  contract.owner()  →  render children, else redirect
```

Reference: `components/guards/AdminGuard.tsx`.

#### Pattern 6: IPFS-first, on-chain-second

For both the digitization flow (citizen onboarding) and the listing flow (marketplace), the order is always:

1. Upload raw file(s) to Pinata → get CIDs.
2. Build a JSON metadata object referencing those CIDs.
3. Pin the JSON to Pinata → get the metadata CID.
4. Write the metadata CID to the destination (govt DB row OR `listLandForSale` tx).

This means even if the on-chain write fails or the user closes the tab, the IPFS files are already pinned (idempotent). The chain only ever stores the CID — never the raw bytes.

#### Pattern 7: On-chain reads hydrate UI; IPFS reads enrich UI

The UI never trusts off-chain data for *trust-bearing* facts (price, owner, status). Those come from the chain. IPFS reads add *display-only* enrichment (photos, description, area). If an IPFS fetch fails, the listing card still renders — just without photos. Reference: `marketplace/page.tsx:91-97` (the `try/catch` swallows IPFS errors so the listing remains visible).

---

## 8. End-to-End Workflows

### 8.1 Citizen onboarding & first mint

```
1. Visit / → click "User Portal"
2. Connect MetaMask (RainbowKit)
3. RegistrationModal: enter name + CNIC
4. Wagmi → registerUser(name, cnic)  [user signs]
5. Dashboard loads: fetches govt_land_records WHERE owner_cnic = my CNIC
   → shows plots that exist in govt records but aren't yet on-chain
6. Click "Verify & Mint" on a plot
   ├─ If govt_land_records.ipfs_hash is empty:
   │  → DigitizationModal opens
   │    a. User uploads deed PDF/image
   │    b. uploadFileToIPFS(file)          → docCid
   │    c. Build ERC-721 metadata JSON {name, image: ipfs://docCid, attributes[], documents[]}
   │    d. uploadJSONToIPFS(metadata)      → metadataCid
   │    e. supabase.update({ipfs_hash: metadataCid}) on govt_land_records
   └─ Once ipfs_hash is set:
      a. POST /api/verify {userAddress, landId}
      b. API reads users(userAddress) on-chain → confirms isRegistered + cnic
      c. API queries govt_land_records WHERE land_id=? AND owner_cnic=?  (cross-check)
      d. API reads getLandRecord(landId) → confirms not already minted
      e. API simulateContract → walletClient.writeContract(storeVerifiedLandRecord)
      f. Returns txHash
7. UI shows TxToast with Etherscan link, refetches dashboard
8. Plot now displays "On-Chain" badge with status = ACTIVE
```

### 8.2 Marketplace listing (fully decentralized — no DB)

```
User clicks "Sell via Marketplace" on a minted plot →
CreateListingModal opens:
  1. User fills price (ETH) + description + WhatsApp + selects up to 3 photos
  2. uploadFileToIPFS × N for photos        → photoCids[]
  3. Build metadata JSON {
       name, description, land_id, location, area_sq_yards, land_type,
       price_eth, whatsapp_contact, photos: ['ipfs://...', ...]
     }
  4. uploadJSONToIPFS(metadata)              → listingCid
  5. writeContract(listLandForSale, [landId, parseEther(price), listingCid])
  6. User signs → tx submits → useWaitForTransactionReceipt → isSuccess
  7. onSuccess(txHash) → TxToast, dashboard reloads, listing card flips to "Active on Marketplace"
```

**Note:** at no point in this flow does the marketplace touch any database. Price + seller + deadline + metadata-CID all live on-chain. The JSON + photos all live on IPFS.

### 8.3 Buying from the marketplace

```
Visit /marketplace:
  1. publicClient.readContract(getAllLandRecordsPaginated, [0, 200])
  2. For each land where status=ACTIVE:
       readContract(landListings, [landId])  → [price, seller, isActive, deadline, metadataCid]
       if isActive && metadataCid:
         fetch(`https://gateway.pinata.cloud/ipfs/${metadataCid}`)  → photos, description, etc.
  3. Render cards

Buyer clicks "Buy Now":
  1. Sanity checks (not own listing, registered, listing still active, not expired)
  2. confirm(`Buy Land ${landId} for ${priceEth} ETH?`)
  3. writeContract(buyLand, [landId], {value: priceWei})
  4. User signs → tx submits → useWaitForTransactionReceipt
  5. On-chain in buyLand:
       - delete landListings[landId]              (reentrancy-safe FIRST)
       - landRecords[landId].currentOwner = buyer
       - _safeTransfer(seller → buyer, tokenId)
       - seller.call{value: price}                (last)
  6. After isSuccess:
       - sync govt_land_records.owner_cnic to buyer's CNIC (best-effort, non-critical)
       - TxToast, refetch listings
```

### 8.4 Inheritance lifecycle

```
1. Govt admin (via Admin Dashboard) or CLI tool:
     POST /api/inheritance {oldLandId, heirs[], newLandIds[], newIpfsHashes[]}
2. /api/inheritance signs initiateInheritance(...) as backend
3. On-chain: landRecords[oldLandId].status = PENDING_INHERITANCE
   → Old NFT is now LOCKED — cannot be transferred or listed
4. Heirs visit User Dashboard → "Succession Plans" section
5. Heir enters oldLandId → handleCheckPlan reads inheritanceRequests[oldLandId]
6. Each heir clicks "Approve" → approveSuccessionPlan(oldLandId)
   - Contract verifies caller is in heirs[]
   - Increments approvalCount
   - When approvalCount == heirs.length: _executeInheritance auto-fires
     · Burn old NFT
     · For each heir: mint new NFT with new landId + new ipfsHash
7. OR: Any heir clicks "Dispute" → disputeSuccessionPlan(oldLandId)
   - status = LOCKED_DISPUTE  (permanent until resolved)
8. Admin (via /api/dispute) decides:
     resolveDispute(oldLandId, true)  → force-execute the original plan
     resolveDispute(oldLandId, false) → revert to ACTIVE (allows redrafting)
```

### 8.5 Public verification

```
Anyone (no wallet required) visits /verify:
  1. Enters landId
  2. publicClient.readContract(getLandRecord, [landId])
  3. Renders: currentOwner, cnic (masked), landType, status, verifiedAt, ipfsHash
  4. Optionally fetches the ERC-721 metadata JSON from IPFS for richer display
  5. Optionally fetches ownershipHistory[landId] for full timeline
```

This is the killer-feature for buyer protection: anyone can verify *before* sending money. No clerk, no fee, no wait.

---

## 9. Data Model

### 9.1 On-chain (source of truth)

| Mapping / Variable | Type | Purpose |
|-------------------|------|---------|
| `users[address]` | `UserProfile` | Wallet → name, cnic, isRegistered |
| `cnicToAddress[string]` | `address` | Reverse lookup; enforces 1-CNIC-1-wallet |
| `landRecords[string]` | `LandRecord` | Authoritative ownership record |
| `landExists[string]` | `bool` | O(1) existence check |
| `_tokenIdToLandId[uint256]` | `string` | NFT tokenId → landId reverse map |
| `ownerToLands[address]` | `string[]` | All landIds owned by a wallet |
| `ownerLandIndex[address][string]` | `uint256` | Position in `ownerToLands` for O(1) removal |
| `ownershipHistory[string]` | `OwnershipHistory[]` | Append-only transfer log per land |
| `landListings[string]` | `Listing` | Active marketplace listings |
| `inheritanceRequests[string]` | `InheritanceRequest` | Open succession proposals |
| `isGovtAuthority[address]` | `bool` | Whitelist of institutional wallets |
| `verificationBackend` | `address` (immutable) | The trusted backend signer |
| `allLandIds` | `string[]` | Master list for paginated reads |

### 9.2 IPFS (content-addressed)

| Object | Pinned by | CID stored where |
|--------|-----------|------------------|
| Raw deed file (PDF/image) | `DigitizationModal` | Inside ERC-721 metadata JSON (`image`, `documents[].ipfs_url`) |
| ERC-721 metadata JSON | `DigitizationModal` | `govt_land_records.ipfs_hash` (DB) → then `landRecords[landId].ipfsHash` (chain) |
| Listing photo | `CreateListingModal` (×3) | Inside listing metadata JSON (`photos[]`) |
| Listing metadata JSON | `CreateListingModal` | `landListings[landId].metadataHash` (chain) |

### 9.3 Off-chain (Govt Supabase — single instance)

| Table | Columns | Role |
|-------|---------|------|
| `govt_land_records` | `land_id` (PK), `owner_cnic`, `location`, `area_sq_yards`, `land_type`, `ipfs_hash` | Mock of pre-existing govt land registry. `ipfs_hash` holds the ERC-721 metadata CID after digitization. After purchase, `owner_cnic` is updated to reflect new owner (best-effort). |
| `govt_citizens` | `cnic` (PK), `full_name` | Mock of CNIC database. Used by `/api/verify` to confirm citizen identity. |

There is **no marketplace table**, **no users table**, **no listings table** — all of that lives on-chain or on IPFS.

### 9.4 On-chain vs off-chain — the decision rule

| Data | Where | Why |
|------|-------|-----|
| Ownership (currentOwner) | Chain | Trust-bearing — must be tamper-proof |
| Sale price history | Chain | Tax transparency; auditable forever |
| Land status (Active/Locked/Pending) | Chain | Drives transfer rules; must be enforced |
| Listing price + seller + deadline | Chain | Trust-bearing — buyer trusts these numbers |
| Land deed image | IPFS | Too large + expensive on-chain; CID anchors integrity |
| Listing photos, description, WhatsApp | IPFS | Too large; not legally binding (display-only) |
| Govt civil records (mock) | Supabase | Simulates pre-existing institutional system |

---

## 10. API Routes (server-only)

All three follow the same shape: validate input → load `ADMIN_PRIVATE_KEY` → simulate → broadcast → return txHash.

### 10.1 `POST /api/verify`

**Purpose:** mint a new land NFT for a citizen.

**Input:** `{ userAddress: 0x..., landId: "LND-001" }`

**Steps:**
1. Validate env vars present.
2. Read `users(userAddress)` from chain → confirm `isRegistered === true`.
3. Query `govt_land_records WHERE land_id = ? AND owner_cnic = ?` — if no match → 403.
4. Read `getLandRecord(landId)` → confirm `currentOwner === ZERO_ADDRESS` (not already minted).
5. Read `govt_land_records.ipfs_hash` → use as CID; map `land_type` string to enum.
6. `simulateContract` → catches reverts pre-broadcast.
7. `walletClient.writeContract(storeVerifiedLandRecord, [...])`.
8. Return `{ success: true, txHash }`.

**Critical:** the API server is *not* a custodian of citizen funds. It only signs *minting* transactions, which are gas-only — it never moves user ETH. The mint-recipient is always the citizen's own wallet (passed in `userAddress`).

### 10.2 `POST /api/inheritance`

**Purpose:** initiate a succession proposal.

**Input:** `{ oldLandId, heirs[], newLandIds[], newIpfsHashes[] }`

**Steps:** validate equal-length arrays → simulate → broadcast `initiateInheritance(...)`.

### 10.3 `POST /api/dispute`

**Purpose:** resolve a locked dispute (force-execute or revert to active).

**Input:** `{ oldLandId, forceExecute: bool }`

**Steps:** simulate → broadcast `resolveDispute(oldLandId, forceExecute)`.

---

## 11. Methodology

### 11.1 Software development methodology

**Agile / Scrum**, 2-week sprints over an 8-month project. Chosen because blockchain-frontend integration involves frequent contract redeployment and unanticipated learning — Waterfall would have locked us into early design mistakes (the v1→v2→v3 architecture evolution is the proof).

| Sprints | Focus |
|---------|-------|
| 1–2 | Literature review · requirement gathering · stack selection |
| 3–4 | Smart contract v1 (registration + minting) · Hardhat tests |
| 5–6 | Frontend scaffold · RainbowKit · AdminGuard |
| 7–8 | Govt DB schema · `/api/verify` admin-signing pattern |
| 9–10 | Marketplace contract module + UI (v1: with marketplace DB) |
| 11–12 | Inheritance module + multi-heir voting + dispute |
| 13 | IPFS migration · Pinata integration · DigitizationModal |
| 14 | **v3 architecture: removed marketplace DB, moved listing metadata to IPFS** |
| 15 | Hydration fixes · transaction toasts · UX polish |
| 16 | Security hardening · gas profiling · documentation |

### 11.2 Research methodology

```
Literature Review → Requirement Gathering → Architecture Design →
Smart Contract Implementation → Frontend Implementation →
Integration Testing → Security Review → Evaluation & Comparison → Documentation
```

### 11.3 Version control & PM

- Trunk-based with short-lived feature branches (`feat/*`, `fix/*`); merge to `main` via PR.
- GitHub Issues + GitHub Projects for sprint tracking.
- Weekly sync with supervisor (Google Meet).

---

## 12. Security Posture

| Threat | Mitigation |
|--------|-----------|
| Reentrancy on `buyLand` | `delete landListings[landId]` *before* `seller.call{value}` (CEI pattern) |
| Unauthorized minting | `onlyBackend` modifier; `verificationBackend` is immutable |
| Private key exposure | `ADMIN_PRIVATE_KEY` server-only; never `NEXT_PUBLIC_*`; never reaches client bundle |
| Duplicate CNIC | `cnicToAddress` mapping enforces uniqueness at registration |
| Land ID collision | `landExists[landId]` check + deterministic `keccak256(landId)` tokenId |
| Front-running on marketplace | Listing price is fixed — buyer cannot be sniped at a different price |
| Failed ETH send | `(bool ok, ) = .call{value}("");  require(ok);` — reverts entire purchase |
| Inheritance forgery | Only backend can `initiateInheritance`; only listed heirs can vote; 100% threshold |
| Dispute deadlock | `resolveDispute(force)` provides verifiable on-chain escape hatch for legal mediation |
| Self-transfer abuse | `require(newOwner != msg.sender)` and `require(buyer != seller)` |
| SSR/client wallet mismatch | `mounted` gate on every wallet-aware page |
| Pinata key exposure | ⚠️ Currently `NEXT_PUBLIC_*` (known limitation — production should move uploads server-side) |

---

## 13. Known Limitations & Future Work

**Current limitations:**
- Sepolia testnet only; real-world deployment would need a Layer-2 (Polygon, Arbitrum) for sub-cent gas.
- Allotment registry is a **mock** — production would integrate the developer's actual transfer-office API (DHA's, Bahria Town's, etc.) and CNIC verification via NADRA.
- Pinata API keys are client-exposed — should be moved to a server route.
- No private key recovery — if an allottee loses their seed phrase, they lose their plot. Future: ERC-4337 account abstraction with social recovery.
- IPFS gateway latency can be 1-3s — cards render with placeholders if a fetch is slow.

**Future work:**
- **Pilot deployment with a single developer phase** (e.g., one DHA phase or a private society launch) — the most realistic path to production.
- Extension to legacy patwari records — the much larger problem we deliberately scoped out of this thesis.
- Native mobile (React Native + WalletConnect Mobile SDK).
- The Graph subgraph for fast indexed event queries.
- AI-based allotment-letter forgery detection (vision model over uploaded scans).
- Multi-language UI (Urdu, Sindhi, Punjabi, Pashto, English).
- ZK-CNIC proofs (verify citizenship without revealing CNIC on-chain).
- DAO-based dispute resolution (community jurors stake to vote, replacing single-admin escape hatch).
- Mortgage / lien primitive (lock NFT to lending contract).
- GIS map integration (Leaflet/Mapbox parcel boundary overlay against the society's site plan).

---

## 14. Working in This Repo (For Future Agents)

### 14.1 Essential commands

```bash
npm install          # install deps
npm run dev          # http://localhost:3000 (Next.js Turbopack)
npm run build        # production build
npm start            # serve production build
npm run lint         # ESLint
```

### 14.2 Required `.env.local`

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SUPABASE_URL=                            # Govt mock DB
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
NEXT_PUBLIC_PINATA_API_KEY=
NEXT_PUBLIC_PINATA_API_SECRET=
ADMIN_PRIVATE_KEY=                                   # Server-only — never NEXT_PUBLIC_
```

⚠️ **The marketplace DB env vars (`NEXT_PUBLIC_MARKET_URL`, `NEXT_PUBLIC_MARKET_KEY`) no longer exist** — they were removed when the marketplace went fully on-chain + IPFS.

### 14.3 Key files to know

| File | Why it matters |
|------|----------------|
| `contract.sol` | The whole on-chain logic in one file |
| `src/utils/contract.ts` | Contract address + ABI — every Wagmi call imports from here |
| `src/utils/pinata.ts` | The two upload helpers used everywhere |
| `src/lib/supabase.ts` | The single Govt DB client |
| `src/app/api/verify/route.ts` | The admin-signing reference implementation |
| `src/components/CreateListingModal.tsx` | The IPFS-first → on-chain reference flow |
| `src/components/DigitizationModal.tsx` | The ERC-721 metadata-builder reference |
| `src/app/dashboard/user/page.tsx` | Most complex page; combines reads, writes, modals, succession |
| `src/components/guards/AdminGuard.tsx` | The on-chain authorization pattern |

### 14.4 Conventions

- **Always** create a feature branch for non-trivial work; commit to `main` via PR.
- **Never** add a JWT/session/auth context — authorization is on-chain only.
- **Never** prefix `ADMIN_PRIVATE_KEY` with `NEXT_PUBLIC_`.
- **Always** use the hydration `mounted` gate on pages reading wallet state.
- **Always** use the `useRef` flag for one-shot side effects after `isSuccess`.
- **IPFS first, chain second.** Pin files before sending the on-chain transaction — keeps the flow idempotent if the user retries.

### 14.5 Additional documentation

- [`.claude/docs/architectural_patterns.md`](.claude/docs/architectural_patterns.md) — the seven patterns listed in §7.2 with file:line references.

### 14.6 UI conventions (design system)

The frontend follows a small, consistent design language. Use the existing utilities before reaching for ad-hoc Tailwind:

| Convention | Where defined | When to use |
|------------|---------------|-------------|
| `bg-brand-dark` (#0a0b1e) | `globals.css` `@theme` | Every page background. Do not introduce new dark-blue variants like `[#020817]` or `[#0f172a]`. |
| `.glass-card` | `globals.css` | Modal panels and floating cards (e.g. `UserAuthModal`, `TransferModal`, `CreateListingModal`). Inner padding/radius is per-component. |
| `.surface` + `.surface-hover` | `globals.css` | Subtle list/info tiles inside dashboards (admin info cards, plot cards, verify-page panels). |
| `.btn-primary` / `.btn-secondary` / `.btn-ghost` | `globals.css` | Default buttons. Inline indigo-600 button classes are only acceptable inside form-bound components where button state styling is more nuanced. |
| `.field` | `globals.css` | Standard input. `bg-black/30 border-white/10` inputs predate this and may be migrated opportunistically. |
| `.pill` | `globals.css` | Status/role pills with rounded-full + xs text. Pair with a `bg-*/10 text-*-400 border-*/20` tone class. |
| Indigo-600 | brand primary | Primary CTA color (`bg-indigo-600 hover:bg-indigo-500`). Avoid mixing with `bg-blue-600` — there is no blue accent in the brand. |
| Inline `Notice` banner | each page that uses it | Replace `alert()` with an inline yellow/red/indigo banner above the content. Keep dismiss UX (`×` button + `setNotice(null)`). Native browser alerts are banned in user-facing flows. |
| Hydration `mounted` gate | every wallet-aware page | See §7.2 Pattern 3. Required on any page that reads `useAccount` or `useReadContract`. |
| `home-stagger` class | `app/page.tsx` only | Triggers the fade-up cascade for hero/portals. Do **not** apply to dashboards or the marketplace — they manage their own loading states. |

**Navbar (canonical nav).** `src/components/Navbar.tsx` is the only navbar — `Header.tsx` was deleted in v3.1 (UI polish branch). Always use `<Navbar />` at the top of a page; the active link is computed via `usePathname()`. The mobile drawer toggles via a hamburger button at the top-right.

**Footer.** `src/components/Footer.tsx` reads `CONTRACT_ADDRESS` from `utils/contract.ts` and links straight to Etherscan for the deployed contract. Replace placeholder `href="#"` links with real destinations or remove them.

---

## 15. Glossary

| Term | Meaning |
|------|---------|
| **CNIC** | Computerised National Identity Card (Pakistan's national ID) |
| **Allotment letter** | The paper document a developer issues confirming a buyer has been allotted a specific plot — the artefact LandLedger replaces with an on-chain NFT |
| **DHA file scam** | Catch-all term for fraud involving fake/duplicated/forged DHA allotment files in the Pakistani secondary market — the headline pain point this project addresses |
| **Society allotment registry** | The developer's internal CNIC-keyed list of who has been allotted which plot. Simulated in this codebase by the `govt_land_records` Supabase table (legacy name) |
| **CDA / DHA / LDA** | Capital / Defence / Lahore Development Authority — the largest institutional developers and our primary target adopters |
| **NADRA** | National Database & Registration Authority — Pakistan's civil registry; would issue real CNIC verification in a production deployment |
| **Patwari / Fard / Intiqal / Virsa** | Patwari = village-level revenue clerk; fard = paper ownership record; intiqal = mutation entry; virsa = inheritance. These belong to the **legacy** revenue system, deliberately *out of scope* for LandLedger — included here only as background context |
| **CID** | Content Identifier — IPFS's content-addressed hash |
| **Backend (in contract terms)** | The wallet whose private key is `ADMIN_PRIVATE_KEY`; corresponds to `verificationBackend` on-chain. In production this is operated by the developer's transfer office |
| **`onlyBackend`** | Solidity modifier restricting a function to that backend wallet |
| **Govt Authority** | Whitelisted institutional wallet — can hold a plot without a personal CNIC. Used for the developer itself and for institutional buyers (corporates, trusts) |

---

## 16. Recent Iterations (Change Log)

This section captures meaningful changes made on top of the v3 architecture documented above. For full diff context use `git log`; this is a high-level summary so future agents can orient quickly.

### 16.1 UI Polish

**Branch:** `feat/ui-polish` → merged to `main`

A focused pass to make the frontend feel like one coherent product instead of a collection of pages.

- **New design-system utilities in `globals.css`** — `.btn-primary` / `.btn-secondary` / `.btn-ghost`, `.field`, `.pill`, `.surface` / `.surface-hover`. Use these by default; reach for ad-hoc Tailwind only when these don't fit. (See §14.6 for the full table.)
- **Fade-up animation scoped to `.home-stagger`** — was previously global on `main > *`, which fought live data hydration on dashboards. Now only `app/page.tsx` opts in.
- **Navbar rewritten** — Next.js `<Link>` (no full-page reloads), active-link state via `usePathname()`, mobile hamburger drawer (the previous version had no mobile menu at all), correct hrefs (`/dashboard/user`, `/dashboard/admin`).
- **Footer with real links** — Etherscan link to the deployed contract, GitHub repo, Sepolia faucet. Auto-current copyright via `new Date().getFullYear()`.
- **Native `alert()` calls eliminated** — replaced with dismissable inline notice banners on PortalSelection (wallet-connect prompt), Marketplace (5 cases), User Dashboard (mint errors), and UserAuthModal (CNIC verification).
- **`/verify` page consistency** — switched from a parallel `Header` component to the canonical `Navbar`; normalized to `bg-brand-dark`; cleaner timeline; status pill icons.
- **Deleted unused components**: `src/components/Header.tsx` (duplicate of Navbar) and `src/components/RegistrationModal.tsx` (unused — `UserAuthModal` is the canonical registration flow).

### 16.2 Verify-Page History RPC Fix

**Branch:** `fix/verify-history-rpc-range` → merged to `main`

The `/verify` page was silently rendering an empty Chain-of-Title for every land. Root cause: `getLogs({ fromBlock: 'earliest' })` scans ~5M blocks since Sepolia genesis, but every public RPC (PublicNode, RPC2.Sepolia, the Thirdweb fallback) caps `eth_getLogs` at a 10,000-block range. The request rejected; the empty `catch` block swallowed the error.

Fix:
- Bound the scan using `LandRecord.verifiedAt` (the mint timestamp). A land's history can only start at its mint, so we estimate the mint block from `verifiedAt` ÷ ~12s Sepolia block time, then walk forward to head in 9,500-block chunks (safely under the 10k cap).
- Replaced the synchronous `fetchHistory(landId)` call in `handleSearch` with an effect that waits for `landRecord` to load (so we have `verifiedAt`).
- Added an inline error banner with a Retry button when the RPC fails — previously it failed silently.
- Used `BigInt()` constructors instead of `n` literals (the project targets ES2017; bigint *literals* require ES2020 but bigint *values* are runtime-supported).

If a future redeploy of the contract changes its deployment block, this code keeps working — the lower bound is per-record (each land's own mint block), not a hardcoded contract-deploy block.

### 16.3 Scope Reframe to New Housing Societies

**Branch:** `docs/reframe-new-societies` → merged to `main`

A purely-textual reframe of the project's stated scope. **Zero code changed.**

Old positioning: "Fix Pakistan's patwari/revenue-office paper-record corruption" — rhetorically dramatic but operationally indefensible (no FYP can credibly claim it will replace a 100-year-old, court-anchored revenue system).

New positioning: **LandLedger targets new private and semi-private housing developments in Pakistan** — DHA, Bahria Town, CDA/LDA new sectors, and private real-estate schemes — that issue plot allotments paperless from day one. This:
- Has identifiable adopters (any single DHA phase or new-society launch can adopt it month one).
- Solves a documented pain point (DHA-file scams, double allotments, forged transfer letters, ghost plots).
- Avoids the legal/political mess of legacy migration.
- Maps cleanly to every feature already built — the contract doesn't care whether the asset is "Mauza Rakh, district X" or "DHA Phase 9, Plot 42."

What changed:
- **CLAUDE.md** — §1 Executive Summary, §2 fully rewritten (now: market we target → pain points → why blockchain → what this isn't), §4 reframed the Supabase mock as the developer's allotment registry, §13 added "pilot deployment with a single developer phase" as the realistic adoption path, glossary updated (added allotment letter / DHA file scam / society allotment registry; demoted patwari/fard/intiqal/virsa to background context only).
- **README.md** — new tagline; new "🎯 Who This Is For" section; problem statement rewritten around DHA-file scams, double allotment, forged transfer letters, ghost plots; target users re-roled (allottees, secondary-market buyers, developer authority, developer's transfer office); comparison table now "Traditional Society Transfer Office" with society-specific numbers (PKR 25k–200k+ transfer fees, 2–8-week timelines, "DHA-file scam exposure" row).
- **Thesis DOCX** (`LandLedger_FYP_Thesis_v2.docx` in Downloads) — Abstract, Ch 1 (Background, Problem Statement, Importance, Scope, Contributions), Ch 5.4 comparison table, Ch 6 Conclusion + Future Work all reframed. Patwari mentions reduced to 9 (background only); DHA/Bahria/allotment mentions now 24 (the new core framing).

The `govt_land_records` table name in Supabase is preserved for backward-compat; semantically it now represents the developer's allotment registry. The `verificationBackend` role on-chain is now described as "the developer's transfer office" rather than "the government oracle."

---

**End of CLAUDE.md** — if any concept above is unclear in the codebase, the answer is almost certainly in §6 (contract), §7 (frontend patterns), or §8 (workflows). Start there.
