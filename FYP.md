# LandLedger — Full Architecture Reference

> **Purpose of this document:** If anyone asks "where is X, what does it do, how does it work?" — the answer is in here. Every file, every API, every button click, every blockchain call is mapped out.

---

## 1. What Happens When the Dev Server Starts

```bash
npm run dev
```

**Next.js (Turbopack) starts on `http://localhost:3000`.**

The first file that runs is:

### `src/app/layout.tsx`
- Sets the page `<title>`, `<meta>` description, and keywords (line 29–34)
- Loads three Google fonts: **Manrope** (body), **Noto Serif** (headings), **JetBrains Mono** (addresses, hashes)
- Wraps everything in `<Providers>` — the single most important wrapper in the app
- Also wraps in `<SmoothScroll>` for page scroll behaviour

### `src/app/providers.tsx` — THE BRAIN OF THE APP
This is where all Web3 is set up. It runs once and wraps every single page.

```
ThemeProvider (dark/light mode)
  └── WagmiProvider (wallet state, contract reads/writes)
        └── QueryClientProvider (TanStack Query — caches blockchain reads)
              └── RainbowKitProvider (wallet connect UI)
                    └── {your page content}
```

**What each layer does:**
| Layer | File | What it provides |
|-------|------|-----------------|
| `ThemeProvider` | `providers.tsx:64` | Dark/light mode toggle stored in `localStorage` |
| `WagmiProvider` | `providers.tsx:65` | `useAccount()`, `useReadContract()`, `useWriteContract()` — all Wagmi hooks work because of this |
| `QueryClientProvider` | `providers.tsx:66` | Caches blockchain reads so the same call isn't repeated 10 times |
| `RainbowKitProvider` | `providers.tsx:67` | The wallet connection popup/modal |

**RPC setup** (line 19–31): The app connects to Sepolia via three fallback RPCs in order:
1. `https://ethereum-sepolia.publicnode.com` (primary)
2. `https://rpc2.sepolia.org` (fallback)
3. MetaMask injected provider (last resort)

---

## 2. Wallet Connection — Exactly What Happens

### Where the "Connect Wallet" button lives
**File:** `src/components/Navbar.tsx` — line 84–111 (desktop), line 164–200 (mobile drawer)

The button is a custom render of RainbowKit's `<ConnectButton.Custom>`.

```
User sees:
  - "Connect Wallet" button (green) → wallet NOT connected
  - Truncated address button (e.g. "0x1234…5678") → wallet connected
```

### When user clicks "Connect Wallet":
1. `openConnectModal()` is called — this is a RainbowKit function
2. **RainbowKit popup appears** — this popup is styled by `providers.tsx:41–56` using `darkTheme()` or `lightTheme()`
3. The popup lists available wallets: **MetaMask, WalletConnect, Coinbase Wallet, Rainbow, etc.**
4. User picks a wallet → browser extension opens → user approves connection
5. RainbowKit internally calls `wagmi connect()` which stores wallet state globally
6. Now **every page in the app** can call `useAccount()` and get `{ address, isConnected }`

### After connection — what updates automatically:
- Navbar button changes from "Connect Wallet" → shows the wallet address
- Any page using `useAccount()` re-renders with the connected address
- `useReadContract()` hooks that have `enabled: !!address` start firing

### Theme of the RainbowKit popup:
- Dark mode: green accent `#16a34a` — `providers.tsx:52`
- Light mode: green accent `#15803d` — `providers.tsx:44`

---

## 3. Page Map — Every Route

| URL | File | Who can access |
|-----|------|----------------|
| `/` | `src/app/page.tsx` | Everyone |
| `/marketplace` | `src/app/marketplace/page.tsx` | Everyone (buy requires wallet + registered) |
| `/verify` | `src/app/verify/page.tsx` | Everyone (decrypt requires wallet + ownership) |
| `/dashboard/user` | `src/app/dashboard/user/page.tsx` | Wallet connected + registered |
| `/dashboard/admin` | `src/app/dashboard/admin/page.tsx` | Wallet with ADMIN/REGISTRAR/RESOLVER role |
| `/dashboard/lands/[landId]` | `src/app/dashboard/lands/[landId]/page.tsx` | Anyone |
| `/dashboard/inheritance` | `src/app/dashboard/inheritance/page.tsx` | Heirs |
| `/dashboard/inheritance/vote/[landId]` | `src/app/dashboard/inheritance/vote/[landId]/page.tsx` | Heirs |
| `/dashboard/occupancy` | `src/app/dashboard/occupancy/page.tsx` | Occupants |

---

## 4. Navigation — `src/components/Navbar.tsx`

The Navbar appears on **every page** (imported in each page's JSX).

**Links defined** at line 14–20:
```
Home        →  /
Marketplace →  /marketplace
Verify      →  /verify
User        →  /dashboard/user
Admin       →  /dashboard/admin
```

**Active link detection:** `usePathname()` from Next.js (line 6) — compares current URL to each link href. Active link gets `text-accent bg-accent/10` class.

**Mobile hamburger:** lines 114–205 — collapses/expands via CSS `grid-rows` animation. Closes automatically when route changes (line 29: `useEffect` on `pathname`).

---

## 5. Admin Guard — `src/components/guards/AdminGuard.tsx`

Wraps the entire Admin Dashboard. **No JWT, no session, no cookie** — all auth is on-chain.

**What it checks, in order:**
1. `!mounted` → renders nothing (prevents hydration mismatch)
2. `!isConnected` → shows "Wallet Not Connected" screen
3. `chainId !== sepolia.id` → shows "Wrong Network" screen
4. Reads `hasRole(ADMIN_ROLE, address)` from contract → line 19
5. Reads `hasRole(REGISTRAR_ROLE, address)` from contract → line 20
6. Reads `hasRole(RESOLVER_ROLE, address)` from contract → line 21
7. While loading roles → shows spinner
8. None of the roles match → shows "Access Denied" with the connected wallet address
9. Any role matches → renders the admin dashboard

**Role hashes** are in `src/utils/roleConstants.ts`:
```
ADMIN_ROLE     = 0x000...000  (OpenZeppelin DEFAULT_ADMIN_ROLE)
REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE")
RESOLVER_ROLE  = keccak256("RESOLVER_ROLE")
PAUSER_ROLE    = keccak256("PAUSER_ROLE")
```

---

## 6. Smart Contract — Where Everything Lives On-Chain

**Contract address:** `0x1d08E371447c0a923B8b935Ffe83A146f9fe457A` (Sepolia)
**ABI + address file:** `src/utils/contractV9.ts`

This is a **Diamond Proxy (EIP-2535)** — one address, multiple logic contracts called "facets".

### Diamond structure — `contracts/diamond/`

| File | What it does |
|------|-------------|
| `Diamond.sol` | The proxy — receives all calls and delegates to the right facet |
| `AppStorage.sol` | All state variables shared across all facets (one storage layout) |
| `LibDiamond.sol` | Diamond management library — adds/replaces/removes facets |
| `LibLandCore.sol` | Shared land logic used by multiple facets |
| `Modifiers.sol` | Reusable `onlyRegistrar`, `onlyResolver`, `onlyActive` etc. |
| `Errors.sol` | All custom errors in one place |

### Facets — `contracts/diamond/facets/`

| Facet | Functions it handles |
|-------|---------------------|
| `IdentityFacet.sol` | `registerUser`, `getUser`, `cnicToAddress` |
| `ImportFacet.sol` | `proposeLandImport`, `verifyLandImport`, `getLandRecord` |
| `LandCoreFacet.sol` | `transferShare`, `getShareBps`, `getLandsByOwner`, `getAllLandRecordsPaginated` |
| `MarketplaceFacet.sol` | `listShareForSale`, `buyShare`, `cancelListing`, `getListing` |
| `InheritanceFacet.sol` | `initiateInheritance`, `approveSuccessionPlan`, `disputeSuccessionPlan`, `resolveInheritanceDispute` |
| `SubdivisionFacet.sol` | `proposeSubdivision`, `approveSubdivision`, `disputeSubdivision`, `resolveSubdivisionDispute` |
| `OccupancyFacet.sol` | `grantOccupancy`, `revokeOccupancy`, `getOccupancyAgreements` |
| `DiamondCutFacet.sol` | Upgrade facets (owner only) |
| `DiamondLoupeFacet.sol` | View facets, supports ERC-165 |

---

## 7. Off-Chain Storage

### Supabase (Government Registry Mock)
**File:** `src/lib/supabase.ts`
**Connection:** reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` from `.env.local`

**Tables:**

| Table | Columns | Purpose |
|-------|---------|---------|
| `govt_land_records` | `land_id`, `owner_cnic`, `location`, `area_sq_yards`, `land_type`, `ipfs_hash`, `enc_key` | Mock allotment registry — which CNIC owns which plot |
| `govt_citizens` | `cnic`, `full_name` | Mock NADRA — CNIC → full name lookup |
| `inheritance_requests` | `id`, `land_id`, `requester_address`, `court_order_cid`, `heirs_json`, `deceased_address`, `status`, `created_at` | User-submitted inheritance requests pending admin action |

### Pinata / IPFS
**File:** `src/utils/pinata.ts`
**Keys:** `NEXT_PUBLIC_PINATA_API_KEY` + `NEXT_PUBLIC_PINATA_API_SECRET` from `.env.local`

Two functions:
- `uploadFileToIPFS(file, name)` → line 38 — uploads a binary file (PDF, image), returns CID
- `uploadJSONToIPFS(content, name)` → line 73 — uploads a JSON object, returns CID

**IPFS Gateway for reading:** `https://gateway.pinata.cloud/ipfs/{CID}`

### Encryption — `src/utils/encryption.ts`
Metadata JSON contains CNIC + owner name — sensitive. Before pinning, it is encrypted:
- Algorithm: **AES-256-GCM**
- `encryptJSON(obj)` → returns `{ payload: EncryptedPayload, keyHex: string }`
- `decryptJSON(payload, keyHex)` → returns original object
- The `keyHex` is stored in `govt_land_records.enc_key` (Supabase), never on-chain
- Raw IPFS content looks like: `{ "encrypted": true, "algorithm": "aes-256-gcm", "iv": "...", "data": "..." }`

---

## 8. API Routes — Every Server-Side Endpoint

All API routes live in `src/app/api/`. They run **server-side only** — they can safely read `ADMIN_PRIVATE_KEY`.

---

### `POST /api/verify` — Mint a Land NFT
**File:** `src/app/api/verify/route.ts`
**Called from:** User Dashboard → "Verify & Mint" button
**Who calls it:** The citizen who owns the land

**Flow:**
```
1. Reads ADMIN_PRIVATE_KEY from env
2. Calls getUser(userAddress) on-chain → confirms wallet is registered
3. Queries govt_land_records WHERE land_id=? AND owner_cnic=? → confirms CNIC matches
4. Calls getLandRecord(landId) on-chain → confirms not already minted
5. If govt_land_records.ipfs_hash is empty:
     a. Builds metadata JSON {name, description, attributes: [landId, type, location, area, CNIC, ownerName]}
     b. Calls encryptJSON(metadata) → gets {payload, keyHex}
     c. Pins encrypted payload to Pinata → gets CID
     d. Updates govt_land_records SET ipfs_hash=CID, enc_key=keyHex
     e. IF this DB update fails → returns 500, ABORTS (never mints with lost key)
6. Calls simulateContract(proposeLandImport, [landId, ipfsHash, landType, [userAddress], [10000], ''])
7. Calls walletClient.writeContract(txRequest) using ADMIN_PRIVATE_KEY
8. Returns { success: true, txHash }
```

**Why admin signs it:** `proposeLandImport` has `onlyRegistrar` modifier — only the backend wallet can call it.

---

### `POST /api/inheritance` — Initiate Inheritance On-Chain
**File:** `src/app/api/inheritance/route.ts`
**Called from:** Admin Dashboard → "Initiate Inheritance" form
**Who calls it:** Admin (REGISTRAR role)

**Body:**
```json
{
  "landId": "DHA-P9-042",
  "deceasedHolder": "0x...",
  "courtOrderCid": "bafyrei...",
  "appealId": 0,
  "heirs": [
    { "address": "0x...", "shareBps": 5000 },
    { "address": "0x...", "shareBps": 5000 }
  ]
}
```

**Flow:**
```
1. Validates all fields present and shareBps > 0 for each heir
2. Calls simulateContract(initiateInheritance, [landId, deceasedHolder, heirAddresses[], heirShares[], courtOrderCid, appealId])
3. Calls walletClient.writeContract using ADMIN_PRIVATE_KEY
4. Returns { success: true, txHash }
```

**On-chain effect:** Land status → `PENDING_INHERITANCE`. Land is locked — cannot be transferred or listed.

---

### `POST /api/inheritance-request` — Save User's Inheritance Request
**File:** `src/app/api/inheritance-request/route.ts`
**Called from:** User Dashboard → Succession tab → "Submit Request" button
**Who calls it:** The citizen/heir

**Body:**
```json
{
  "landId": "DHA-P9-042",
  "requesterAddress": "0x...",
  "courtOrderCid": "bafyrei..."
}
```

**Flow:**
```
1. Checks inheritance_requests for existing pending request with same land_id
2. If exists → returns 409 Conflict
3. Inserts new row: { land_id, requester_address, court_order_cid, status: 'pending' }
4. Returns { success: true }
```

**Note:** This does NOT call the blockchain. It just saves the request for admin to review.

---

### `POST /api/dispute` — Resolve a Locked Dispute
**File:** `src/app/api/dispute/route.ts`
**Called from:** Admin Dashboard → "Resolve Disputes" tab
**Who calls it:** Admin (RESOLVER role)

**Body:**
```json
{
  "landId": "DHA-P9-042",
  "disputeType": "inheritance",
  "forceExecute": true,
  "updatedCourtOrderCid": "bafyrei...",
  "legalResolutionCid": "bafyrei...",
  "overrideReason": "Court confirmed original plan"
}
```

**Two paths:**
- `disputeType === 'import'` → calls `resolveLandImportDispute(landId, forceExecute, courtOrderCid)`
- `disputeType === 'inheritance'` → calls `resolveInheritanceDispute(landId, forceExecute, updatedCourtOrderCid, legalResolutionCid, overrideReason)`

---

### `POST /api/subdivision` — Propose Land Subdivision
**File:** `src/app/api/subdivision/route.ts`
**Called from:** Admin Dashboard → "Propose Subdivision" tab
**Who calls it:** Admin (REGISTRAR role)

**Body:**
```json
{
  "parentLandId": "DHA-P9-042",
  "courtOrderCid": "bafyrei...",
  "surveyMetadataCid": "bafyrei...",
  "children": [
    {
      "landId": "DHA-P9-042-A",
      "ipfsHash": "bafyrei...",
      "owners": [{ "address": "0x...", "shareBps": 10000 }]
    }
  ]
}
```

**Validation:** Each child's `owners[].shareBps` must sum to exactly 10000.

**Flow:** Calls `proposeSubdivision(parentLandId, {newLandIds, newIpfsHashes, newLandShareholders, newLandShares, courtOrderCid, surveyMetadataCid})`

---

### `POST /api/metadata` — Decrypt Land Metadata (GATED)
**File:** `src/app/api/metadata/route.ts`
**Called from:** Verify page → "Decrypt as owner / admin" button
**Who can call it:** Land owner OR admin wallet (proven by signature)

**Body:**
```json
{
  "landId": "DHA-P9-042",
  "address": "0x...",
  "signature": "0x...",
  "timestamp": 1719000000000
}
```

**Flow:**
```
1. Timestamp check: Math.abs(Date.now() - timestamp) > 5 minutes → 401 Expired
2. Signature verification: recoverMessageAddress({message, signature}) must equal address → 401 if mismatch
   Message format: "LandLedger — decrypt land metadata\nLand ID: {landId}\nWallet: {address}\nTimestamp: {timestamp}"
3. Authorization check:
     - Is it the admin wallet? (privateKeyToAccount(ADMIN_PRIVATE_KEY).address)
     - OR getShareBps(landId, address) > 0 on-chain
   Neither → 403 Forbidden
4. Queries govt_land_records for ipfs_hash + enc_key
5. Fetches encrypted blob from Pinata IPFS gateway
6. decryptJSON(ipfsData, keyHex) → returns plaintext metadata
7. Returns { decrypted: true, metadata: { name, cnic, ownerName, attributes... } }
```

**The AES key NEVER leaves the server.** Only the decrypted JSON is returned.

---

## 9. User Dashboard — `src/app/dashboard/user/page.tsx`

### On load:
1. `mounted` gate (line 167–168) — waits for client to mount, prevents SSR hydration errors
2. `useAccount()` → gets connected wallet address
3. `useReadContract(getUser, [address])` → checks if wallet is registered on-chain
4. If not registered → shows inline `RegisterInlineForm`
5. `loadLands()` → loads all lands for this user

### `loadLands()` — How user's lands are fetched:
```
Step 1: Query govt_land_records WHERE owner_cnic = profile.cnic (from Supabase)
Step 2: Call getLandsByOwner(address) on-chain → get on-chain land IDs
Step 3: For each on-chain land:
          - Call getLandRecord(landId) → status, ipfsHash, landType
          - Call getShareBps(landId, address) → user's % share
          - Call getListing(landId) → active marketplace listing if any
          - Build LandSummary object { landId, shareBps, status, isOnChain: true }
Step 4: For each Supabase record NOT in on-chain list:
          - Call getLandRecord(landId) on-chain
          - If landId !== '' → it's PENDING_VERIFICATION (proposed but not confirmed)
          - If landId === '' → true unminted → shows "Verify & Mint" button
Step 5: setLands([...onChainSummaries, ...unmintedSummaries])
```

### Tabs and what each does:

**My Lands tab:**
- Shows all land cards
- "Confirm Ownership" → calls `verifyLandImport(landId)` (user signs, no server needed)
- "Verify & Mint" → `POST /api/verify` → `proposeLandImport` on-chain
- "List for Sale" → opens `CreateListingModal`
- "Transfer Share" → opens `TransferModal`
- "Occupancy" → switches to Occupancy tab pre-loaded for this land

**Succession Voting tab:**
- Top section: loads from `inheritance_requests` WHERE status='initiated' AND user is in `heirs_json`
- Shows plan cards automatically — no manual land ID entry needed
- Each card shows: court order thumbnail/link, share table with "← You" highlight, vote count
- "I Agree" → `writeContract(approveSuccessionPlan, [landId])`
- "Dispute" → `writeContract(disputeSuccessionPlan, [landId])`
- Tab badge shows count of pending votes

- Bottom section: "Request Inheritance" form
  - User selects their ACTIVE land from dropdown
  - Uploads court order PDF → `uploadFileToIPFS(file)` → Pinata → CID
  - `POST /api/inheritance-request` { landId, requesterAddress, courtOrderCid }

**Subdivision Voting tab:**
- Similar to succession — heirs of a subdivision proposal vote here
- "Approve" → `writeContract(approveSubdivision, [landId])`
- "Dispute" → `writeContract(disputeSubdivision, [landId])`

**Occupancy tab:**
- Shows occupancy agreements for a selected land
- Grantor can revoke → `writeContract(revokeOccupancy, [agreementId])`

**Withdraw tab:**
- Shows `pendingProceeds(address)` — ETH owed from marketplace sales
- "Withdraw" → `writeContract(withdrawProceeds)`

---

## 10. Admin Dashboard — `src/app/dashboard/admin/page.tsx`

Wrapped in `<AdminGuard>` — blocked unless wallet has ADMIN/REGISTRAR/RESOLVER role.

### Tabs:

**Import Land:**
- Admin manually enters: Land ID, IPFS hash, land type, court order CID, owner addresses + bps
- `POST /api/verify` (same endpoint as user mint, but with manual fields)
- Used for admin-initiated imports (not self-service)

**All Lands:**
- `getAllLandRecordsPaginated(cursor, 10)` → paginated list
- Shows land ID, status pill, IPFS hash
- Pagination with Prev/Next buttons

**Initiate Inheritance:**
- **Top panel:** Pending Requests from Supabase (`inheritance_requests WHERE status='pending'`)
  - Each request shows: land ID, requester wallet, creation date
  - "Court Order" button → opens IPFS link in new tab
  - "Initiate" button → auto-fills the form below with land ID + court order CID
- **Bottom form:** Admin fills deceased address, heir addresses + bps
  - `POST /api/inheritance` → `initiateInheritance` on-chain
  - On success: updates `inheritance_requests` row to `status='initiated'`, saves `heirs_json` + `deceased_address`

**Resolve Disputes:**
- Selects dispute type: inheritance or import
- Selects force execute or revert
- `POST /api/dispute`

**Propose Subdivision:**
- Admin enters parent land ID, court order CID, survey metadata CID
- Adds child parcels with their land IDs, IPFS hashes, owners
- `POST /api/subdivision`

**Role Management:**
- `grantRole(role, address)` → `writeContract` (user signs as admin)
- `revokeRole(role, address)` → `writeContract`

---

## 11. Marketplace — `src/app/marketplace/page.tsx`

### On load:
```
1. getAllLandRecordsPaginated(0, 200) → all land IDs
2. For each land → getListing(landId) → checks if active listing exists
3. If listing isActive + has metadataCid:
     fetch(`https://gateway.pinata.cloud/ipfs/${metadataCid}`) → photos, description, WhatsApp
4. Renders listing cards (IPFS fetch errors are swallowed — card still shows without photos)
```

### Buying:
```
User clicks "Buy Now":
1. Checks: not your own listing, wallet registered, listing not expired
2. writeContract(buyShare, [landId], { value: priceWei })
3. User signs in MetaMask
4. useWaitForTransactionReceipt → polls Sepolia
5. On isSuccess: sync govt_land_records.owner_cnic to buyer's CNIC (best-effort), show TxToast
```

---

## 12. CreateListingModal — `src/components/CreateListingModal.tsx`

**IPFS-first flow:**
```
User fills: price (ETH), description, WhatsApp, up to 3 photos

1. uploadFileToIPFS(photo1) → CID1
   uploadFileToIPFS(photo2) → CID2
   uploadFileToIPFS(photo3) → CID3
2. Build listing JSON:
   {
     name, description, land_id, location, area_sq_yards, land_type,
     price_eth, whatsapp_contact,
     photos: ["ipfs://CID1", "ipfs://CID2", "ipfs://CID3"]
   }
3. uploadJSONToIPFS(listingJson) → listingCid
4. writeContract(listShareForSale, [landId, shareBps, parseEther(price), listingCid, deadline])
5. useWaitForTransactionReceipt → isSuccess → TxToast, close modal
```

---

## 13. TransferModal — `src/components/TransferModal.tsx`

```
User enters: recipient wallet address + bps to transfer

1. readContract(getUser, [recipientAddress]) → confirms recipient is registered
2. writeContract(transferShare, [landId, recipient, shareBps, salePrice])
3. useWaitForTransactionReceipt → isSuccess → TxToast, reload lands
```

---

## 14. Verify Page — `src/app/verify/page.tsx`

### Public lookup (no wallet needed):
```
User enters land ID → clicks "Verify"
1. publicClient.readContract(getLandRecord, [landId])
2. Shows: current owner wallet, land type, status, verified date, IPFS hash
3. Fetches ownership history via event logs (chunked 9500 blocks at a time from mint block)
```

### Decrypt metadata (wallet required):
```
User clicks "Decrypt as owner / admin"
1. Signs message: "LandLedger — decrypt land metadata\nLand ID: {landId}\nWallet: {address}\nTimestamp: {now}"
   via useSignMessage() from wagmi
2. POST /api/metadata { landId, address, signature, timestamp }
3. Server verifies signature + checks ownership on-chain
4. Returns decrypted metadata including CNIC, owner name, full attributes
5. Page shows full record including previously hidden fields
```

---

## 15. The Wagmi 4-Hook Pattern (Used Everywhere)

Every on-chain write in this project follows this exact sequence:

```typescript
// Step 1: Get wallet
const { address } = useAccount();

// Step 2: Optional pre-flight read
const { data: someData } = useReadContract({ functionName: 'getSomething', ... });

// Step 3: Queue the transaction
const { writeContract, data: hash, isPending } = useWriteContract();

// Step 4: Watch for confirmation
const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

// Step 5: Side effect after success
const processedRef = useRef(false); // prevents double-fire in React Strict Mode
useEffect(() => {
  if (isSuccess && hash && !processedRef.current) {
    processedRef.current = true;
    // show toast, refetch data, update DB, etc.
  }
}, [isSuccess, hash]);
```

---

## 16. Environment Variables — `.env.local`

| Variable | Used in | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `providers.tsx:17` | WalletConnect cloud project ID |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase.ts:5` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | `lib/supabase.ts:6` | Supabase anon key |
| `NEXT_PUBLIC_PINATA_API_KEY` | `utils/pinata.ts:3` | Pinata API key for uploads |
| `NEXT_PUBLIC_PINATA_API_SECRET` | `utils/pinata.ts:4` | Pinata API secret |
| `ADMIN_PRIVATE_KEY` | All `/api/*` routes | Registrar/resolver wallet private key — **never NEXT_PUBLIC_** |

---

## 17. File-by-File Quick Reference

| File | What it is |
|------|-----------|
| `src/app/layout.tsx` | Root HTML, fonts, wraps in Providers |
| `src/app/providers.tsx` | Wagmi + RainbowKit + TanStack Query setup |
| `src/app/page.tsx` | Landing page — Hero, Features, HowItWorks, CTA, Footer |
| `src/app/marketplace/page.tsx` | Browse + buy listings (fully on-chain) |
| `src/app/verify/page.tsx` | Public land verification + gated decrypt |
| `src/app/dashboard/user/page.tsx` | Mint, list, transfer, succession, subdivision, occupancy, withdraw |
| `src/app/dashboard/admin/page.tsx` | Import, all lands, inheritance, disputes, subdivision, roles |
| `src/app/api/verify/route.ts` | Server: mint a land NFT (proposeLandImport) |
| `src/app/api/inheritance/route.ts` | Server: initiate inheritance on-chain |
| `src/app/api/inheritance-request/route.ts` | Server: save user's inheritance request to Supabase |
| `src/app/api/dispute/route.ts` | Server: resolve locked dispute |
| `src/app/api/subdivision/route.ts` | Server: propose subdivision |
| `src/app/api/metadata/route.ts` | Server: gated decrypt of IPFS metadata |
| `src/components/Navbar.tsx` | Navigation bar + Connect Wallet button |
| `src/components/guards/AdminGuard.tsx` | On-chain role check before admin dashboard |
| `src/components/CreateListingModal.tsx` | IPFS upload + listShareForSale |
| `src/components/TransferModal.tsx` | transferShare on-chain |
| `src/components/TxToast.tsx` | Transaction success notification with Etherscan link |
| `src/components/UserAuthModal.tsx` | CNIC-gated entry to user portal |
| `src/lib/supabase.ts` | Supabase client singleton |
| `src/utils/contractV9.ts` | Contract address + full combined ABI |
| `src/utils/pinata.ts` | uploadFileToIPFS + uploadJSONToIPFS |
| `src/utils/encryption.ts` | AES-256-GCM encryptJSON / decryptJSON |
| `src/utils/roleConstants.ts` | keccak256 role hashes + formatBps helper |
| `contracts/diamond/Diamond.sol` | The proxy contract — entry point for all calls |
| `contracts/diamond/AppStorage.sol` | All state variables for the whole system |
| `contracts/diamond/facets/IdentityFacet.sol` | registerUser, getUser |
| `contracts/diamond/facets/ImportFacet.sol` | proposeLandImport, verifyLandImport |
| `contracts/diamond/facets/LandCoreFacet.sol` | transferShare, getShareBps, getLandsByOwner |
| `contracts/diamond/facets/MarketplaceFacet.sol` | listShareForSale, buyShare, getListing |
| `contracts/diamond/facets/InheritanceFacet.sol` | initiateInheritance, approveSuccessionPlan, disputeSuccessionPlan |
| `contracts/diamond/facets/SubdivisionFacet.sol` | proposeSubdivision, approveSubdivision |
| `contracts/diamond/facets/OccupancyFacet.sol` | grantOccupancy, revokeOccupancy |
