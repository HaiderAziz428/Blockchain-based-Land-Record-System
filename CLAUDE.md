# FYP: Blockchain-Based Land Registry System

A Next.js frontend for a decentralized land ownership registry on Ethereum (Sepolia testnet). Land records are minted as ERC-721 NFTs by a government admin, and can be bought, sold, or inherited through smart contract interactions.

---

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript 5
- **Blockchain:** Wagmi 2, Viem 2, RainbowKit 2 — targeting Sepolia testnet
- **Databases:** Supabase (PostgreSQL) — two instances (government records + marketplace)
- **Storage:** IPFS via Pinata (land documents and images)
- **Styling:** TailwindCSS 4

---

## Key Directories

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js App Router pages and API routes |
| `src/app/api/verify/` | Minting endpoint — backend signs with `ADMIN_PRIVATE_KEY` |
| `src/app/api/inheritance/` | Initiate inheritance — backend signs `initiateInheritance` |
| `src/app/api/dispute/` | Resolve dispute — backend signs `resolveDispute` |
| `src/app/dashboard/` | User and admin dashboards |
| `src/app/marketplace/` | Browse and purchase listed land |
| `src/components/` | Feature modals (listing, sale, transfer, registration, etc.) |
| `src/components/guards/` | Authorization wrappers (`AdminGuard`) |
| `src/lib/` | Supabase client instances (`supabase.ts`, `marketplace.ts`) |
| `src/utils/contract.ts` | Contract address and ABI — `src/utils/contract.ts:4` |
| `src/utils/pinata.ts` | IPFS upload helpers |

**Smart contract** is deployed externally — no Hardhat/Foundry config in this repo.

---

## Essential Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server at http://localhost:3000
npm run build        # Production build
npm start            # Serve production build
npm run lint         # ESLint
```

### Required Environment Variables (`.env.local`)

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
NEXT_PUBLIC_MARKET_URL=
NEXT_PUBLIC_MARKET_KEY=
ADMIN_PRIVATE_KEY=          # Server-only — never expose client-side
NEXT_PUBLIC_PINATA_API_KEY=
NEXT_PUBLIC_PINATA_API_SECRET=
```

---

## Smart Contract: `LandRegistry` (Sepolia ERC-721)

**Token name:** PakLandRegistry (PLR) · **Source:** `contract.sol`

### Key Roles
| Role | Who | How determined |
|------|-----|----------------|
| Contract Owner | Deployer wallet | `owner()` — can call `setGovtAuthority` |
| Verification Backend | `verificationBackend` address | Set at deploy; only wallet that can call `onlyBackend` functions |
| Registered User | Any wallet that called `registerUser` | `users(address).isRegistered` |
| Govt Authority | Whitelisted wallet | `isGovtAuthority(address)` |

### Data Structures
- **`LandRecord`** — `currentOwner`, `cnic`, `landId`, `ipfsHash`, `landType` (0=Residential/1=Agricultural/2=Commercial), `status` (0=ACTIVE/1=PENDING_INHERITANCE/2=LOCKED_DISPUTE), `verifiedAt`
- **`Listing`** — `price` (wei), `seller`, `isActive`, `deadline` (unix timestamp, 7-day window)
- **`InheritanceRequest`** — `heirs[]`, `newLandIds[]`, `newIpfsHashes[]`, `approvalCount`, `isExecuted`
- **`UserProfile`** — `name`, `cnic`, `isRegistered`
- **`OwnershipHistory`** — permanent log of each transfer with price (for tax transparency)

### Implemented Contract Functions
| Function | Caller | Modifier | Frontend |
|----------|--------|----------|----------|
| `registerUser(name, cnic)` | User | — | `RegistrationModal` |
| `storeVerifiedLandRecord(owner, landId, ipfsHash, lType)` | Backend server | `onlyBackend` | `POST /api/verify` |
| `listLandForSale(landId, price)` | Owner | `onlyActive` | `FinalizeSaleModal` |
| `buyLand(landId)` | Registered buyer | `onlyActive`, payable | `marketplace/page.tsx` |
| `cancelListing(landId)` | Owner | — | User dashboard |
| `transferLandOwnership(landId, newOwner, salePrice)` | Owner | `onlyActive` | `TransferModal` |
| `initiateInheritance(oldId, heirs, newIds, hashes)` | Backend server | `onlyBackend`, `onlyActive` | `POST /api/inheritance` |
| `approveSuccessionPlan(oldLandId)` | Heir wallet | — | User dashboard succession section |
| `disputeSuccessionPlan(oldLandId)` | Heir wallet | — | User dashboard succession section |
| `resolveDispute(oldLandId, forceExecute)` | Backend server | `onlyBackend` | `POST /api/dispute` |
| `setGovtAuthority(wallet, status)` | Owner | `onlyOwner` | Admin dashboard |
| `getAllLandRecordsPaginated(cursor, pageSize)` | Anyone | view | Admin dashboard table |
| `getLandRecord(landId)` | Anyone | view | User dashboard, marketplace |
| `getLandsByCnic(cnic)` | Anyone | view | Available (not currently used) |
| `getTokenIdFromLandId(landId)` | Anyone | pure | Available (not currently used) |

### Key Contract Rules
- Listings expire after **7 days** (`deadline = block.timestamp + 7 days`) — contract rejects buys after expiry
- Inheritance requires **100% heir approval** — any single dispute locks the land (`LOCKED_DISPUTE`)
- CNIC is a unique key — one wallet per CNIC; one CNIC per wallet
- Token ID is deterministic: `keccak256(abi.encodePacked(landId))` — no sequential IDs
- `tokenURI` returns `"ipfs://" + ipfsHash` — store only the hash, not the full URI

### Supabase Schema (known tables)
| Instance | Table | Key columns |
|----------|-------|-------------|
| Govt DB (`supabase`) | `govt_land_records` | `land_id`, `owner_cnic`, `location`, `area_sq_yards`, `land_type`, `ipfs_hash` |
| Govt DB | `govt_citizens` | `cnic`, `full_name` |
| Marketplace DB (`marketDb`) | `listings` | `land_id`, `seller_wallet`, `status` (listed/on_chain/sold), `final_price`, `photos[]`, `whatsapp` |

---

## Additional Documentation

- [`.claude/docs/architectural_patterns.md`](.claude/docs/architectural_patterns.md) — Wagmi hook flow, admin-signing pattern, blockchain+DB sync, hydration guard, authorization, IPFS upload
