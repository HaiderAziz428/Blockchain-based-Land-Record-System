# Frontend Architecture — Production-Grade Hybrid Land Registry

> **Scope.** End-to-end frontend design for LandLedger's v9 contract. The frontend is **ownership-centric, NOT NFT-centric** — users see their bps shares, occupancy rights, inheritance status, disputes, and legal documents. The ERC-721 NFT is identity-only and is never the headline UI element.

This doc is the substrate for three feature-specific docs in this directory:

- **02 — User Ownership Dashboard** — the "what do I own and what are my rights?" surface
- **03 — Inheritance Portal** — appeal filing, proposal review (with `sharesHash` independent verify), vote / dispute actions
- **04 — Occupancy & Use-Rights Module** — time-bounded tenancy/lease/use-right agreements

---

## 1. Design Philosophy

### 1.1 Ownership-centric, not NFT-centric

The land NFT exists, but the user almost never sees it directly. What the user sees is:

| Concept | Where it lives on-chain | How the UI shows it |
|---------|-------------------------|---------------------|
| Legal ownership | `_shareBps[landId][holder]` | "You own **30%** of Plot DHA-9 R-2/417 (3 co-owners)" |
| Land identity | ERC-721 `tokenId` + `tokenURI` | A tokenId chip in the *Provenance* tab — never on the headline card |
| Right of use | `_occupancyAgreements[landId]` | "You occupy the **upper floor** under a residential lease until 2027-08-15" |
| Inheritance status | `_inheritanceRequests[landId]` | "Inheritance pending — vote required by 2026-06-12" |
| Marketplace listing | `_listings[landId][seller]` | "1 of your co-owners is selling 15%" |
| Dispute | `LandStatus.LOCKED_*_DISPUTE` | A red banner: "This property is under legal review" |

A user who has never heard of ERC-721 must still understand "what I own, what I can do, and what's currently disputed" from a single dashboard.

### 1.2 Three explicit distinctions, surfaced everywhere

Every property detail screen shows three separate sections so the layer boundaries are visible:

1. **Ownership** (basis-point shares, who holds them)
2. **Occupancy** (who has the right to use, under what terms, until when)
3. **Subdivision** (parent / child lineage if any)

These are different concepts on-chain and they are different sections in the UI. See doc 04 for the explicit comparison.

### 1.3 Legal clarity over crypto novelty

- No "mint" / "burn" / "transfer" lingo on user-facing surfaces.
- Use "file inheritance appeal" instead of "call `fileInheritanceAppeal`".
- Use "your share" instead of "your bps".
- Use "court order" instead of "CID" (CIDs appear in the *Audit* tab for power users).

---

## 2. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 16** (App Router) | Already in use; server components for SEO of public verify pages; route handlers for API proxying |
| Language | TypeScript 5 | Already in use; full Wagmi/viem ABI inference |
| Styling | **TailwindCSS 4** | Already in use; matches existing design tokens in `globals.css` |
| Component primitives | **shadcn/ui** (Radix-based) | Accessible, copy-paste primitives that compose with the existing `glass-card` / `surface` design language |
| Web3 reads/writes | **wagmi v2 + viem v2** | Already in use; typed contract reads, batched multicall, transaction lifecycle hooks |
| Wallet connect | **RainbowKit v2** | Already in use; MetaMask + WalletConnect + Coinbase out of the box |
| State (server) | **TanStack Query v5** | Already used by wagmi; backend cache; auto-invalidation on WS events |
| State (client UI) | **Zustand** for cross-component UI state (drawer open/closed, theme, current filter) | Lightweight; avoids the React Context boilerplate |
| Forms | **react-hook-form + zod** | Type-safe form schemas; pairs with shadcn/ui's `Form` wrapper |
| Charts | **Recharts** | The donut chart for share splits + the line chart for ownership history |
| PDF preview | **react-pdf** (pdf.js) | Render uploaded court orders + survey documents inline |
| Animation | **Framer Motion** | Already used for `home-stagger`; expand for inheritance vote / share-transfer flows |
| Toasts | **sonner** (via shadcn) | Transaction lifecycle feedback |
| IPFS reads | Pinata gateway with `gateway.pinata.cloud` + fallback to `ipfs.io` | Already in use |
| Real-time | **Native WebSocket** to backend's `wss://api/.../ws` | Push updates for `wallet:{address}` + `land:{landId}` channels |
| i18n | **next-intl** | English at launch; Urdu + Sindhi + Punjabi + Pashto on the roadmap |

---

## 3. Top-Level Route Structure (Next.js App Router)

```
src/app/
├── layout.tsx                              # Root: providers, fonts, Navbar
├── providers.tsx                           # ('use client') Wagmi + RK + QueryClient + WSProvider
├── page.tsx                                # Hero / landing (public)
├── verify/
│   └── page.tsx                            # Public lookup by landId (no wallet required)
├── auth/
│   └── siwe/
│       └── page.tsx                        # SIWE flow if a backend session is needed
├── dashboard/
│   ├── layout.tsx                          # Wallet-gated; sidebar nav
│   ├── page.tsx                            # User Ownership Dashboard (doc 02)
│   ├── lands/
│   │   ├── page.tsx                        # All lands I have shares in
│   │   └── [landId]/
│   │       ├── page.tsx                    # Property detail (5 tabs)
│   │       ├── ownership/page.tsx          # Tab 1 — shareholders, history, transfer
│   │       ├── occupancy/page.tsx          # Tab 2 — agreements, grant, revoke
│   │       ├── inheritance/page.tsx        # Tab 3 — proposals, votes, history
│   │       ├── subdivision/page.tsx        # Tab 4 — parent/child lineage
│   │       └── audit/page.tsx              # Tab 5 — full event log + linked CIDs
│   ├── inheritance/
│   │   ├── page.tsx                        # Inheritance portal (doc 03)
│   │   ├── appeals/
│   │   │   ├── page.tsx                    # My appeals + appeal queue
│   │   │   └── new/page.tsx                # File new appeal
│   │   └── vote/[landId]/page.tsx          # Heir vote screen w/ sharesHash recompute
│   ├── occupancy/
│   │   ├── page.tsx                        # Occupancy module (doc 04)
│   │   ├── grant/page.tsx                  # Grant new occupancy
│   │   └── [agreementId]/page.tsx          # Agreement detail
│   ├── marketplace/
│   │   ├── page.tsx                        # Browse fractional listings
│   │   ├── list/page.tsx                   # List a share for sale
│   │   └── trades/page.tsx                 # My buy/sell history + withdrawProceeds
│   └── disputes/
│       ├── page.tsx                        # All disputes touching me
│       └── [landId]/page.tsx               # Dispute detail
├── admin/
│   ├── layout.tsx                          # REGISTRAR_ROLE-gated
│   ├── imports/page.tsx                    # Import queue
│   ├── inheritance/page.tsx                # Appeal review queue
│   ├── subdivision/page.tsx                # Subdivision proposals
│   └── audit/page.tsx                      # All registrar actions
├── resolver/
│   ├── layout.tsx                          # RESOLVER_ROLE-gated
│   ├── queue/page.tsx                      # All LOCKED_*_DISPUTE lands
│   └── [landId]/page.tsx                   # Dispute resolution detail
└── api/                                    # Server-side proxy routes (frontend → backend)
    ├── auth/siwe/
    ├── uploads/court-order/
    └── ws/                                 # WebSocket reverse proxy if needed
```

The dashboard is the **default authenticated landing**. Users who want a simple "what do I own?" answer never have to leave it.

---

## 4. Module Map (frontend ↔ contract ↔ backend)

| Frontend module | Contract reads | Contract writes | Backend endpoints |
|-----------------|----------------|-----------------|-------------------|
| **Verify page** | `getLandIdentity`, `getOwnershipSnapshot`, `getOwnershipHistory`, `getSubdivisionLineage` | — | `GET /v1/lands/:landId` |
| **User dashboard** | `getLandsByOwner(msg.sender)`, `getLandFullView(landId)` for each | — | `GET /v1/users/:address` |
| **Property detail / Ownership tab** | `getShareholdersWithBps`, `getOwnershipHistory`, `getTotalShares` | `transferShare`, `listShareForSale`, `buyShare`, `cancelListing`, `updateListingPrice`, `withdrawProceeds` | `GET /v1/lands/:landId/history` |
| **Property detail / Occupancy tab** | `getOccupancyAgreements`, `getActiveOccupancyAgreements` | `grantOccupancy`, `revokeOccupancy` | — |
| **Property detail / Inheritance tab** | `getInheritanceRequest`, `getInheritanceAppealsForLand`, `hasHeirApproved`, `getLegalOverrides` | `fileInheritanceAppeal`, `approveSuccessionPlan`, `disputeSuccessionPlan`, `expireInheritance` | `POST /v1/inheritance/appeals` |
| **Property detail / Subdivision tab** | `getSubdivisionPlan`, `getSubdivisionPart`, `getParentLand`, `getChildLands`, `getSubdivisionLineage` | `approveSubdivision`, `disputeSubdivision` | — |
| **Property detail / Audit tab** | `getOwnershipHistory`, `getMarketplaceHistory`, `getLegalOverrides`, `getSubdivisionLegalOverrides` | — | `GET /v1/lands/:landId/audit` |
| **Inheritance portal** | All inheritance reads + `computeSharesHash` (pure) | All inheritance writes | All `/v1/inheritance/*` |
| **Marketplace** | `getListing`, `getMarketplaceHistory`, `totalMarketplaceTrades`, `pendingProceeds`, `getAllLandRecordsPaginated` | All marketplace writes | `GET /v1/marketplace/listings` |
| **Admin / Imports** | `getImportProposal`, `getPendingVerifiers`, `getVerificationStatus` | `proposeLandImport`, `cancelLandImport`, `expireLandImport` | All `/v1/admin/imports/*` |
| **Resolver / Disputes** | All `*_DISPUTE` queries | `freezeInheritanceForReview`, `resolveInheritanceDispute`, `freezeSubdivisionForReview`, `resolveSubdivisionDispute`, `resolveLandImportDispute` | All `/v1/resolver/*` |

---

## 5. State Management

### 5.1 On-chain reads — wagmi + TanStack Query

Every contract view is wrapped in a typed hook:

```ts
// src/hooks/contract/useLandFullView.ts
export function useLandFullView(landId: string | undefined) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: LAND_REGISTRY_ABI,
    functionName: 'getLandFullView',
    args: landId ? [landId] : undefined,
    query: {
      enabled: !!landId,
      staleTime: 30_000,
    },
  });
}
```

Cache keys include `landId` so two component instances reading the same land deduplicate naturally. The WSProvider (§5.4) invalidates `['readContract', { functionName: 'getLandFullView', args: [landId] }]` whenever it sees a `LandStatusChanged` or `ShareholderAdded` event for that landId.

### 5.2 On-chain writes — wagmi `useWriteContract` + `useWaitForTransactionReceipt`

Every write follows the same lifecycle:

```ts
const { writeContractAsync, data: txHash } = useWriteContract();
const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

async function approve() {
  const hash = await writeContractAsync({
    address: CONTRACT_ADDRESS,
    abi: LAND_REGISTRY_ABI,
    functionName: 'approveSuccessionPlan',
    args: [landId],
  });
  toast.loading('Confirming approval…', { id: hash });
}

useEffect(() => {
  if (isSuccess) {
    toast.success('Approval confirmed', { id: txHash });
    queryClient.invalidateQueries(invalidationKeys.land(landId));
  }
}, [isSuccess]);
```

The same pattern is used for every contract write. A shared `useTxLifecycle` hook bundles the toast + invalidation; per-feature components only declare what to invalidate.

### 5.3 Backend reads — TanStack Query against REST

```ts
export function useMyAppeals() {
  return useQuery({
    queryKey: ['inheritance', 'appeals', 'mine'],
    queryFn: () => api.get('/v1/inheritance/appeals/mine').then(r => r.data),
    staleTime: 30_000,
  });
}
```

For trust-bearing data (current shareholders, listing price, dispute status), the frontend **prefers the on-chain read** and uses the backend cache only to enrich it (off-chain metadata, citizen names, notification preferences). For pagination-heavy reads (marketplace browse, all-lands feed), the backend's denormalised projection is used directly, and every page bears a "synced to block N" marker.

### 5.4 Real-time — backend WebSocket

A single shared `<WSProvider>` opens a WebSocket on session start, subscribes to:

- `wallet:{address}` for the connected wallet
- `land:{landId}` for every landId currently mounted on the page

Incoming events trigger `queryClient.invalidateQueries(...)` against the matching keys. Per-event mapping:

| Event | Invalidates |
|-------|-------------|
| `ShareholderAdded` / `Removed` / `ShareTransferred` | `getShareholdersWithBps`, `getLandFullView`, `getOwnershipHistory` |
| `LandStatusChanged` | every key for that landId |
| `InheritanceInitiated` / `HeirApproved` / `InheritanceFinalized` | inheritance request + `getLandFullView` |
| `LegalOverrideExecuted` | `getLegalOverrides` |
| `ShareSold` | `getListing`, `getMarketplaceHistory`, `pendingProceeds` for buyer + seller |
| `OccupancyGranted` / `Revoked` | `getOccupancyAgreements`, `getActiveOccupancyAgreements` |

Same on-chain pattern: the user sees state change without manually refreshing.

### 5.5 UI-only state — Zustand

A single store for cross-component UI state:

```ts
// src/stores/ui.store.ts
export const useUIStore = create<{
  drawerOpen: 'transfer' | 'list' | 'grant-occupancy' | null;
  setDrawer: (d: ... | null) => void;
  activeLandId: string | null;
  setActiveLandId: (id: string | null) => void;
  filters: { landType?: LandType; status?: LandStatus; minShareBps?: number };
  setFilter: (k: string, v: unknown) => void;
}>(...);
```

No business data goes through Zustand — it's strictly for ephemeral UI concerns.

---

## 6. Authentication & Authorisation (Frontend Side)

### 6.1 Wallet-based identity

The connected wallet is the identity. `useAccount()` from wagmi is the source of truth. No JWT, no email, no password — except where the backend's API explicitly needs a SIWE session for non-read endpoints (e.g. submitting an appeal PDF).

### 6.2 SIWE flow when needed

For backend-mutating actions (upload PDF, file appeal payload, submit admin review decision), the user signs an EIP-4361 message once per session:

```
client                      backend
  │                            │
  │ POST /v1/auth/siwe/nonce    │
  ├───────────────────────────►│
  │ ◄── { nonce, statement }   │
  │ sign EIP-4361 message      │
  │ POST .../verify            │
  ├───────────────────────────►│
  │ ◄── { sessionJwt }         │
```

The session JWT lives in an httpOnly cookie. Step-up signatures (per-action) are requested at the moment of action — see §5 of the inheritance doc.

### 6.3 Role-based UI gating

Three guards wrap the gated route groups:

```ts
// src/components/guards/RoleGuard.tsx
export function RoleGuard({ role, children }: { role: Hex; children: ReactNode }) {
  const { address } = useAccount();
  const { data: hasRole, isLoading } = useReadContract({
    abi: LAND_REGISTRY_ABI,
    address: CONTRACT_ADDRESS,
    functionName: 'hasRole',
    args: address ? [role, address] : undefined,
  });
  if (isLoading) return <Skeleton />;
  if (!hasRole) return <NotAuthorized />;
  return <>{children}</>;
}
```

- `/admin/*` wrapped in `<RoleGuard role={REGISTRAR_ROLE}>`
- `/resolver/*` wrapped in `<RoleGuard role={RESOLVER_ROLE}>`
- Pause-only routes wrapped in `<RoleGuard role={PAUSER_ROLE}>` (governance settings)
- `/admin/governance/*` (role grants) wrapped in `<RoleGuard role={ADMIN_ROLE}>`

The guard re-reads the role on every mount — a wallet that loses its role in-flight loses access at the next navigation.

---

## 7. Reusable Components (`src/components/`)

### 7.1 Domain components

```
src/components/
├── land/
│   ├── LandCard.tsx                # Ownership-centric headline card (see doc 02)
│   ├── ShareDonut.tsx              # Recharts donut showing per-shareholder bps
│   ├── ShareholderTable.tsx        # holders + shares + identities
│   ├── OwnershipHistory.tsx        # timeline
│   ├── StatusPill.tsx              # the 8-state lifecycle indicator
│   ├── LineageGraph.tsx            # parent ↔ children visual
│   └── LandIdentityBadge.tsx       # the *small* tokenId chip (audit-tab only)
├── inheritance/
│   ├── AppealForm.tsx
│   ├── ProposalCard.tsx
│   ├── HeirShareTable.tsx
│   ├── SharesHashVerifier.tsx      # the "recompute client-side" button (doc 04)
│   ├── VotePanel.tsx
│   └── OverrideTimeline.tsx
├── occupancy/
│   ├── OccupancyAgreementCard.tsx
│   ├── OccupancyCategoryBadge.tsx
│   ├── GrantOccupancyDrawer.tsx
│   └── ActiveOccupancyBanner.tsx
├── subdivision/
│   ├── SubdivisionPlanCard.tsx
│   ├── LineageGraph.tsx
│   └── SubdivisionVotePanel.tsx
├── marketplace/
│   ├── ListingCard.tsx
│   ├── ListShareDrawer.tsx
│   ├── BuyShareDrawer.tsx
│   └── PendingProceedsCard.tsx
├── disputes/
│   ├── DisputeBanner.tsx
│   ├── DisputeTimeline.tsx
│   └── ResolverDecisionForm.tsx
├── shared/
│   ├── CourtOrderPreview.tsx       # PDF embed + "verify locally" button (doc 04)
│   ├── CidLink.tsx                 # "Open on IPFS" link
│   ├── AddressIdentity.tsx         # 0xabc… → "Ali Khan (CNIC 354…)" hover
│   ├── BpsPercent.tsx              # 3000 → "30.00%"
│   ├── CountdownPill.tsx           # deadline countdown
│   ├── TxToast.tsx                 # transaction lifecycle toast (already exists)
│   └── Notice.tsx                  # inline yellow/red/indigo banner (already exists)
└── guards/
    ├── RoleGuard.tsx
    ├── RegisteredGuard.tsx
    └── ShareholderGuard.tsx         # gate actions on _shareBps > 0
```

### 7.2 shadcn/ui primitives

The project adopts shadcn's standard set: `Button`, `Card`, `Sheet`, `Dialog`, `Table`, `Tabs`, `Form`, `Input`, `Select`, `Badge`, `Skeleton`, `Toast` (sonner), `DropdownMenu`, `Tooltip`, `Accordion`, `Progress`, `Separator`, `Avatar`.

These compose with the existing `globals.css` utilities (`.glass-card`, `.surface`, `.btn-primary`, `.field`, `.pill`) — shadcn's class-variance-authority pattern lets us alias them.

---

## 8. Multi-Owner Visualisation

The protocol's headline feature is fractional co-ownership. Three reusable views surface it everywhere:

### 8.1 ShareDonut

A Recharts donut showing each shareholder's bps as a colour-coded slice. Hovering a slice reveals `(name, wallet abbreviated, bps, %)`. Co-owners with sub-1% shares aggregate into an "Others" slice with a drill-down click.

### 8.2 ShareholderTable

```
Owner                       Identity          Share        Acquired       Source
─────────────────────────  ───────────────── ─────────── ─────────────  ─────────────
0xabc... (you)             Ali Khan          30.00% ●●●● 2025-08-14    Inheritance
0xdef...                   Sara Khan         30.00% ●●●● 2025-08-14    Inheritance
0xghi...                   Bashir Hussain    40.00% ●●●●● 2024-02-03    Initial import
                                             ─────
Total                                        100.00%
```

The "Source" column maps each holder to the most recent `OwnershipChangeLog` row that brought them in (mint / inheritance / market / transfer / subdivision-seed).

### 8.3 OwnershipHistory

A vertical timeline showing every entry of `_ownershipHistory[landId]`:

```
2026-05-10  ▶ Bashir Hussain transferred 5.00% to Saira Bibi via marketplace (0.4 ETH)
2025-08-14  ▶ Inheritance executed — deceased Asghar Khan's 60.00% redistributed:
                 → Ali Khan +30.00%
                 → Sara Khan +30.00%
2025-08-14  ▶ Inheritance proposal filed (court order Qm…abcd)
2024-02-03  ▶ Land minted — initial owners:
                 → Asghar Khan 60.00%
                 → Bashir Hussain 40.00%
```

Each row links to its tx on Etherscan + (for inheritance and overrides) the court-order CID's PDF preview.

---

## 9. IPFS Integration

All IPFS reads go through a shared client:

```ts
// src/lib/ipfs.ts
const GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs',
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
];

export async function fetchIpfs(cid: string): Promise<Response> {
  for (const g of GATEWAYS) {
    try {
      const r = await fetch(`${g}/${cid}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) return r;
    } catch (_) { /* try next */ }
  }
  throw new IpfsUnreachableError(cid);
}

export async function fetchJsonIpfs<T>(cid: string): Promise<T> {
  const r = await fetchIpfs(cid);
  return r.json() as Promise<T>;
}

export async function sha256OfIpfs(cid: string): Promise<string> {
  const r = await fetchIpfs(cid);
  const buf = await r.arrayBuffer();
  return bytesToHex(await crypto.subtle.digest('SHA-256', new Uint8Array(buf)));
}
```

Uploads (during appeal filing or listing creation) go through the existing `src/utils/pinata.ts` helper.

### 9.1 PDF preview

`<CourtOrderPreview cid={...}>` renders the PDF inline via `react-pdf`, with a header showing:

- the CID
- the document's sha256 (computed client-side from the fetched bytes)
- a "Verify locally" button that re-prompts for the source PDF and compares its sha256 to the gateway's
- an "Open on IPFS gateway" external link

### 9.2 Metadata enrichment

Land cards show area + location + photos pulled from the ERC-721 metadata JSON at `_landRecords[landId].ipfsHash`. The fetch is non-blocking — if IPFS is slow, the card renders the on-chain data (landId, status, share split) immediately and slots in the enrichment when it arrives.

---

## 10. Transaction UX

Every write follows a four-step UX:

1. **Confirm** — Sheet/Dialog with action summary ("You will transfer 15% of Plot DHA-9 R-2/417 to 0xdef…") + cost estimate.
2. **Sign** — Wallet prompt (RainbowKit handles this).
3. **Confirm on-chain** — `TxToast` shows "Awaiting confirmations…" with a live block-counter (1/12 → 12/12).
4. **Success / Failure** — Toast collapses; success replays the action summary; failure shows the revert reason mapped from the contract's custom error.

Custom-error decoding:

```ts
// src/lib/errors.ts
const ERROR_MAP: Record<string, (args: unknown[]) => string> = {
  'LandRegistry__InsufficientShare': ([holder, held, required]) =>
    `Insufficient share — you hold ${formatBps(held)} but tried to move ${formatBps(required)}`,
  'LandRegistry__ListingExpired': ([landId]) =>
    `The listing for ${landId} has expired — ask the seller to relist`,
  'LandRegistry__PriceExceedsMax': ([actual, max]) =>
    `Listing price ${formatEth(actual)} is above your ${formatEth(max)} ceiling`,
  'LandRegistry__ShareTotalMismatch': ([provided, expected]) =>
    `Heir shares sum to ${formatBps(provided)} but must sum to ${formatBps(expected)}`,
  // … etc for every custom error in the contract
};
```

This turns Etherscan-style revert messages into citizen-readable explanations.

---

## 11. Performance & Scalability

| Concern | Approach |
|---------|----------|
| First-paint for dashboards | Backend's denormalised projection serves a "synced as of block N" snapshot; on-chain reads upgrade in-place |
| Many cards on one page (50+ lands) | Virtualised list (`@tanstack/react-virtual`); per-card multicall batched via wagmi's `multicall` setting |
| Wallet on a slow RPC | Set up multiple RPCs in wagmi's `transports`; fallback transport handles failures transparently |
| Large ownership histories | Backend paginates; frontend uses `useInfiniteQuery` |
| Real-time WS lag | Show "syncing…" indicator if backend's `lastSyncedBlock` is more than 5 blocks behind chain tip |
| IPFS slow on mobile | Multi-gateway fallback + 5 s timeout per gateway + skeleton loader |

---

## 12. Accessibility

- Every interactive element is keyboard-navigable (shadcn primitives are Radix-based).
- Colour-coded status pills also carry an icon (`🟢 ACTIVE`, `🟡 PENDING_VERIFICATION`, `🔴 LOCKED_DISPUTE`, `⚫ SUBDIVIDED`).
- ShareDonut has a `aria-label` describing every slice; the same data is available as a sortable table for screen readers.
- All forms use `react-hook-form`'s `aria-invalid` / `aria-describedby` bindings via shadcn's `<FormMessage>`.
- The "Verify locally" button announces the verification result via `aria-live="polite"`.

---

## 13. Audit / Transparency Affordances

Every property detail page has an **Audit** tab that surfaces what the user-friendly tabs hide:

- Every event in chronological order with a link to its tx on Etherscan
- Every court-order CID that touched this land, with a "View PDF" + "Verify locally" affordance
- Every legal override (force / cancel) with the resolver address, the two CIDs, the reason, and the timestamp
- The full `_ownershipHistory` + `_marketplaceHistory` lists exposed for the curious

This is where the user can answer the lawyer's questions: "show me every change to this title, every dispute, every court order".

---

## 14. Internationalisation

Launch in English. Roadmap supports Urdu, Sindhi, Punjabi, Pashto via `next-intl`:

```
locales/
├── en.json                    # default
├── ur.json
├── sd.json
├── pa.json
└── ps.json
```

All user-facing strings go through `t('...')`. The court-order PDF preview is locale-independent (it's whatever language the court issued the order in).

---

## 15. Design System References

See `CLAUDE.md` §14.6 for the existing design tokens (`bg-brand-dark`, `.glass-card`, `.surface`, `.btn-primary`, etc.). All new shadcn components alias these tokens via `class-variance-authority` so the look stays consistent with the existing pages (Hero, Navbar, Footer, Verify).

---

## 16. Deployment

- **Vercel** for the Next.js app (already in use).
- The `CONTRACT_ADDRESS` and `BACKEND_API_URL` are read from `NEXT_PUBLIC_*` env vars.
- Static assets cached by Vercel's edge CDN.
- The `/verify/*` route is opt-in for server-side rendering for SEO of public land lookups; everything wallet-aware uses the existing `mounted` gate (CLAUDE.md §7.2 Pattern 3).

---

## 17. Sub-System Specs

The following docs in this directory build on this architecture:

- **02 — User Ownership Dashboard** — what users see on login: their lands, their shares, their rights, pending actions.
- **03 — Inheritance Portal** — appeal filing, immutable proposal review with cryptographic verification, vote / dispute, override tracking.
- **04 — Occupancy & Use-Rights Module** — time-bounded tenancy / lease / use-right agreements, with the explicit three-section UI distinguishing ownership / occupancy / subdivision.

Doc 01 is the substrate; the others are the experiences that run on it.
