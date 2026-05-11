// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ============================================================================
// IMPORTS
// ============================================================================

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

// Generic
error LandRegistry__ZeroAddress();
error LandRegistry__InvalidStringLength();
error LandRegistry__ArrayLengthMismatch();
error LandRegistry__EthTransferFailed();
error LandRegistry__NoBalance();
error LandRegistry__NoStrayBalance();
error LandRegistry__NftNonTransferable();

// Identity
error LandRegistry__AlreadyRegistered(address account);
error LandRegistry__CnicAlreadyLinked(string cnic);
error LandRegistry__NotAuthorizedHolder(address account);

// Land core
error LandRegistry__LandAlreadyExists(string landId);
error LandRegistry__LandNotFound(string landId);
error LandRegistry__LandNotActive(string landId);
error LandRegistry__InvalidLandStatus(string landId);

// Share ledger
error LandRegistry__InvalidShare();
error LandRegistry__InsufficientShare(address holder, uint16 held, uint16 required);
error LandRegistry__ShareTotalMismatch(uint16 provided, uint16 expected);
error LandRegistry__DuplicateOwner(address owner);
error LandRegistry__NoOwners();
error LandRegistry__TooManyShareholders(uint256 current, uint256 max);
error LandRegistry__NotAShareholder(address account);
error LandRegistry__SelfTransfer();

// Marketplace
error LandRegistry__InvalidPrice();
error LandRegistry__PriceMustDecrease(uint256 currentPrice, uint256 attempted);
error LandRegistry__PriceExceedsMax(uint256 actualPrice, uint256 maxPrice);
error LandRegistry__ListingNotActive(string landId, address seller);
error LandRegistry__ListingExpired(string landId, address seller);
error LandRegistry__InsufficientPayment(uint256 sent, uint256 required);
error LandRegistry__SellerCannotBuy();

// Import
error LandRegistry__NotInImportPhase(string landId);
error LandRegistry__NotAProposedOwner(address caller);
error LandRegistry__AlreadyVerified();
error LandRegistry__ImportNotDisputed(string landId);
error LandRegistry__VerificationExpired(string landId, uint64 deadline);
error LandRegistry__VerificationNotExpired(string landId, uint64 deadline);
error LandRegistry__InvalidVerificationDuration();

// Inheritance
error LandRegistry__InheritanceArrayMismatch();
error LandRegistry__NoHeirs();
error LandRegistry__TooManyHeirs(uint256 provided, uint256 max);
error LandRegistry__DuplicateHeir(address heir);
error LandRegistry__HeirIsDeceased(address heir);
error LandRegistry__DeceasedHasNoShares(address deceased, string landId);
error LandRegistry__NoPendingPlan(string landId);
error LandRegistry__InheritanceNotDisputed(string landId);
error LandRegistry__PlanAlreadyExecuted(string landId);
error LandRegistry__AlreadyVoted();
error LandRegistry__NotAnHeir(address caller);
error LandRegistry__InheritanceVotingExpired(string landId, uint64 deadline);
error LandRegistry__InheritanceVotingNotExpired(string landId, uint64 deadline);
error LandRegistry__InvalidAppealId(uint256 appealId);
error LandRegistry__AppealLandMismatch(uint256 appealId, string expected, string got);
error LandRegistry__AppealAlreadyProcessed(uint256 appealId);

// Subdivision
error LandRegistry__InvalidSubdivisionCount();
error LandRegistry__DuplicateNewLandId(string landId);
error LandRegistry__NoPendingSubdivision(string landId);
error LandRegistry__SubdivisionNotDisputed(string landId);

// Occupancy
error LandRegistry__InvalidOccupancyPeriod();
error LandRegistry__OccupancyNotFound(uint64 agreementId);
error LandRegistry__NotOccupancyGrantor(address caller);
error LandRegistry__OccupancyAlreadyRevoked();

// ============================================================================
// INTERFACES — none required externally
// ============================================================================

// ============================================================================
// LIBRARIES — utilities sourced from OpenZeppelin imports
// ============================================================================

// ============================================================================
// CONTRACT
// ============================================================================

/**
 * @title  LandRegistry (hybrid-governance v7)
 * @author LandLedger FYP Team
 *
 * @notice Production-grade Pakistani housing-society allotment registry.
 *         Hybrid architecture: ERC-721 NFTs anchor land IDENTITY on-chain
 *         while ownership, inheritance, subdivision and occupancy are
 *         governed by a mixture of on-chain consensus (shareholders' votes)
 *         and off-chain legal authority (court orders pinned to IPFS,
 *         role-gated arbiter overrides).
 *
 * @dev    HYBRID GOVERNANCE RATIONALE
 *         -----------------------------------------------------------------
 *         Pakistani land governance cannot be fully automated on-chain:
 *
 *           1. Ownership depends on government databases (NADRA / developer
 *              allotment registries / revenue records) that the chain
 *              cannot recreate.
 *           2. Inheritance depends on Islamic / civil family law plus
 *              probate courts — a contract cannot decide who is an heir.
 *           3. Disputes routinely require judicial intervention.
 *           4. Physical subdivision needs surveys, planning approval, and a
 *              court order — a contract cannot create physical plots, only
 *              record them.
 *
 *         v7 therefore implements an explicit HYBRID model:
 *
 *           • Backend ROLES (MINTER, INHERITANCE_ORACLE, SUBDIVISION_ORACLE)
 *             PROPOSE actions based on off-chain authority. They cannot
 *             unilaterally finalise them.
 *           • ALL affected on-chain stakeholders (proposed owners, heirs,
 *             current shareholders) must CONSENT for the action to take
 *             effect.
 *           • DISPUTE_ARBITER_ROLE is a court-anchored escape hatch.
 *             When unanimous consent stalls, the arbiter resolves WITH a
 *             court-order CID pinned on IPFS — every override is publicly
 *             auditable.
 *           • IPFS anchors every off-chain artefact (deeds, listing
 *             metadata, court orders, occupancy agreements). On-chain
 *             stores only the CID — small, immutable, tamper-evident.
 *
 *         TWO-LAYER ARCHITECTURE (canonical)
 *         -----------------------------------------------------------------
 *         The contract is organised as two ORTHOGONAL layers. Every state
 *         variable and every external function belongs to exactly one of
 *         them. Audit comprehension begins here.
 *
 *           ┌──────────────────────────────────────────────────────────┐
 *           │ LAYER 1 — LAND IDENTITY                                   │
 *           │ ──────────────────────────                               │
 *           │ ERC-721 NFTs that represent the EXISTENCE of a parcel.   │
 *           │ One NFT per parcel for the lifetime of the parcel.       │
 *           │ Permanent and stable. Self-custodial — minted to         │
 *           │ `address(this)`; the `_update` override rejects every     │
 *           │ external transfer attempt. The NFT carries:               │
 *           │   • a deterministic tokenId   (keccak256(landId))         │
 *           │   • a stable tokenURI         (ipfs://<metadata-CID>)    │
 *           │   • a lifecycle status        (PENDING_VERIFICATION,      │
 *           │                                ACTIVE, PENDING_*,         │
 *           │                                LOCKED_*, SUBDIVIDED)      │
 *           │ Identity is created ONLY by `_finalizeImport` after every │
 *           │ proposed owner has verified. Identity is destroyed ONLY  │
 *           │ by `_executeSubdivision` (court-anchored, parent NFT      │
 *           │ burns, child NFTs mint).                                  │
 *           │                                                           │
 *           │ Layer-1 state:   _landRecords, _landExists,               │
 *           │                  _tokenIdToLandId, _allLandIds            │
 *           │ Layer-1 reads:   tokenURI, getLandRecord,                 │
 *           │                  getLandIdentity, ownerOf                 │
 *           │ Layer-1 writes:  proposeLandImport,                       │
 *           │                  _finalizeImport (mint),                  │
 *           │                  _executeSubdivision (burn + mint)        │
 *           ├──────────────────────────────────────────────────────────┤
 *           │ LAYER 2 — OWNERSHIP LEDGER                                │
 *           │ ──────────────────────────                               │
 *           │ Basis-point share accounting for every active land. The  │
 *           │ legally-relevant "who owns this parcel" record. Multiple │
 *           │ co-owners per land are first-class; one parcel can have  │
 *           │ up to MAX_SHAREHOLDERS distinct holders summing to       │
 *           │ TOTAL_SHARES (10,000). Layer-2 operations never mint,    │
 *           │ never burn, and never modify the NFT — they only update  │
 *           │ the share ledger.                                         │
 *           │                                                           │
 *           │ Layer-2 state:   _shareholders, _shareBps,                │
 *           │                  _shareholderIndex, _ownerToLands,        │
 *           │                  _ownerLandIndex, _ownershipHistory,      │
 *           │                  _listings, _inheritanceRequests,         │
 *           │                  _pendingWithdrawals                      │
 *           │ Layer-2 reads:   getShareholders, getShareholdersWithBps, │
 *           │                  getShareBps, getTotalShares,             │
 *           │                  getOwnershipSnapshot,                    │
 *           │                  getOwnershipHistory                      │
 *           │ Layer-2 writes:  transferShare, buyShare,                 │
 *           │                  initiateInheritance + approve/dispute,   │
 *           │                  _executeInheritance, withdrawProceeds    │
 *           └──────────────────────────────────────────────────────────┘
 *
 *         WHY ERC-721 ALONE IS INSUFFICIENT FOR LAND
 *         -----------------------------------------------------------------
 *         ERC-721's data model is "one owner per tokenId". For digital
 *         collectibles that's fine. For real-world land it is wrong:
 *
 *           • Real parcels routinely have multiple legal co-owners
 *             (spouses, siblings, business partners). ERC-721 cannot
 *             express this without minting a separate NFT per fraction
 *             (which destroys identity continuity) or piping every
 *             transfer through a wrapper contract (which still squeezes
 *             multi-owner state through a single-owner interface).
 *           • Inheritance creates new owners WITHOUT physical
 *             subdivision. ERC-721 has no native way to redistribute
 *             ownership while keeping the tokenId stable.
 *           • Partial sales of an ownership stake (e.g., selling 30%
 *             of a plot) are common in real markets and impossible to
 *             express in plain ERC-721 without minting fractional
 *             children.
 *           • The "who legally owns this parcel" answer is in many
 *             jurisdictions a list with shares, not a single address.
 *
 *         v7 therefore uses ERC-721 ONLY for layer-1 identity and keeps
 *         layer-2 ownership in a purpose-built basis-point share ledger.
 *
 *         WHY OWNERSHIP REDISTRIBUTION DIFFERS FROM SUBDIVISION
 *         -----------------------------------------------------------------
 *         Ownership redistribution (`transferShare`, `buyShare`,
 *         `_executeInheritance`) is a LAYER-2 operation. The NFT does
 *         not move, the tokenId does not change, the IPFS metadata does
 *         not change. Only the entries in the share ledger change. A
 *         buyer can acquire 30% of a plot from one of five co-owners
 *         and the plot remains physically one piece of land.
 *
 *         Subdivision (`proposeSubdivision` → `_executeSubdivision`) is
 *         a LAYER-1 operation. It MODELS the legal/physical creation of
 *         NEW PARCELS where one used to be. The parent NFT is BURNED
 *         (status → SUBDIVIDED, terminal) and N fresh NFTs are MINTED
 *         with brand-new tokenIds, IPFS metadata, and share ledgers.
 *         This must be authorised by a court order (`courtOrderCid`
 *         required at proposal) because in the real world only a court
 *         + survey + planning approval can create new land parcels.
 *
 *         CRITICAL DISTINCTIONS (audit comprehension, continued)
 *         -----------------------------------------------------------------
 *         (A) NFT identity vs. legal ownership.
 *             The ERC-721 NFT for each land is IDENTITY ONLY. The NFT is
 *             self-custodial (minted to `address(this)`, never moves except
 *             at burn during subdivision). Legally-relevant ownership lives
 *             in the basis-point share ledger (`_shareBps[landId][holder]`),
 *             NOT in `ownerOf(tokenId)`. Treat these as orthogonal:
 *             - `ownerOf` = "which contract holds the identity token"
 *             - `_shareBps` = "what fraction of legal rights each address has"
 *
 *         (B) Ownership shares vs. physical subdivision.
 *             Changing a shareholder's bps is a LEDGER operation — it does
 *             not divide the physical parcel. To actually split a parcel
 *             into N new parcels, the separate `proposeSubdivision` flow
 *             must be executed with a court order. That flow:
 *               - burns the parent NFT
 *               - marks the parent SUBDIVIDED (terminal)
 *               - mints N new NFTs, each with its own share ledger
 *
 *         (C) Ownership shares vs. occupancy.
 *             Owning bps grants legal ownership of a fractional interest.
 *             An occupancy agreement grants a TIME-BOUND right of use to
 *             a (typically non-owner) occupant — tenancy, lease, farming
 *             right — without transferring any ownership. Occupancy is a
 *             separate ledger (`_occupancyAgreements`) and never touches
 *             the share ledger.
 *
 *         WHY OWNER CONSENSUS IS NECESSARY (v7 verification system)
 *         -----------------------------------------------------------------
 *         A naive design would let the backend (developer's transfer
 *         office) mint land NFTs unilaterally on the strength of off-chain
 *         records alone. That replicates the same single-point-of-trust
 *         that on-chain land registries are supposed to eliminate: a
 *         corrupt or merely mistaken backend operator could mint a land
 *         NFT to the wrong wallets, and the on-chain "record of truth"
 *         would inherit the off-chain error.
 *
 *         v7 instead requires unanimous on-chain consent from the proposed
 *         co-owner set BEFORE the NFT is minted. Any one of the proposed
 *         owners can refuse a wrong import (`disputeLandImport`) or simply
 *         let the verification window expire (`expireLandImport`). The
 *         NFT mints atomically with the last verification — there is no
 *         intermediate state where some owners have agreed and some
 *         haven't but the NFT already exists.
 *
 *         WHY BACKEND AUTHORITY IS INTENTIONALLY LIMITED
 *         -----------------------------------------------------------------
 *         `MINTER_ROLE` can ONLY:
 *           • propose imports (filing the record from the off-chain registry)
 *           • cancel its own proposals while still PENDING_VERIFICATION
 *         It CANNOT:
 *           • finalise a mint without all proposed owners verifying
 *           • override a dispute (only DISPUTE_ARBITER_ROLE can, and only
 *             with a court-order CID)
 *           • move shares, list, buy, initiate inheritance, or initiate
 *             subdivision
 *         A leaked MINTER key cannot steal land — at worst it spam-creates
 *         proposals that all expire after the verification window without
 *         anyone consenting.
 *
 *         WHY MINTING ONLY AFTER VERIFICATION
 *         -----------------------------------------------------------------
 *         If the NFT were minted at proposal time with some "tentative"
 *         flag, downstream systems (indexers, frontends, marketplaces)
 *         would have to filter by that flag everywhere. By keeping the
 *         NFT non-existent until verification completes, every existing
 *         ERC-721 read (`ownerOf`, `tokenURI`, OpenSea metadata fetch)
 *         only ever sees lands whose ownership has reached consensus.
 *         There is no "fake" NFT to filter out.
 *
 *         VERIFICATION DEADLINE (v7 anti-griefing)
 *         -----------------------------------------------------------------
 *         Without a deadline a single non-responding proposed owner could
 *         permanently park a landId in PENDING_VERIFICATION, blocking
 *         future re-imports of the same parcel. `VERIFICATION_DURATION`
 *         (90 days) caps how long an import may sit pending. After the
 *         deadline anyone may call `expireLandImport` to delete the
 *         shell and free the landId for a fresh proposal. The backend
 *         can also cancel earlier via `cancelLandImport`.
 *
 *         EIGHT-STATE LIFECYCLE
 *         -----------------------------------------------------------------
 *             PENDING_VERIFICATION ─ import filed; awaiting all-owner verify
 *                ├── all verify ────────────────────────────── ACTIVE
 *                ├── any dispute ─────────────────── LOCKED_IMPORT_DISPUTE
 *                │                ├── arbiter force-approve ─── ACTIVE
 *                │                └── arbiter cancel ────── (record deleted)
 *                ├── minter cancel ────────────────────────── (record deleted)
 *                └── verification deadline elapsed
 *                          (anyone may call expireLandImport) ── (record deleted)
 *
 *             ACTIVE ─────────────── routine ops permitted
 *                ├── initiateInheritance ─────────── PENDING_INHERITANCE
 *                │     ├── all heirs approve ─────────────── ACTIVE (shares
 *                │     │                                    redistributed)
 *                │     └── any heir disputes ── LOCKED_INHERITANCE_DISPUTE
 *                │           ├── arbiter force-execute ───── ACTIVE
 *                │           └── arbiter cancel ──────────── ACTIVE
 *                │
 *                └── proposeSubdivision ─────────── PENDING_SUBDIVISION
 *                      ├── all shareholders approve ── SUBDIVIDED (terminal;
 *                      │                              child NFTs created
 *                      │                              ACTIVE)
 *                      └── any shareholder disputes ─ LOCKED_SUBDIVISION_
 *                                                     DISPUTE
 *                            ├── arbiter force ──── SUBDIVIDED
 *                            └── arbiter cancel ─── ACTIVE
 *
 *         SECURITY POSTURE (v5–v6 hardening retained)
 *         -----------------------------------------------------------------
 *         AccessControl with role separation, Pausable, ReentrancyGuard on
 *         every state-mutating external touching NFTs or ETH, pull-payment
 *         escrow with `_totalPendingWithdrawals` accounting, MAX_STRING_LENGTH
 *         bounds, custom errors throughout, `Address.sendValue` for ETH,
 *         maxPrice front-running guard on buys, decrease-only price updates,
 *         per-proposal nonce scoping for vote state.
 */
contract LandRegistry is ERC721, AccessControl, Pausable, ReentrancyGuard {
    using Address for address payable;

    // ========================================================================
    // 7. TYPE DECLARATIONS
    // ========================================================================

    enum LandType {
        RESIDENTIAL,
        AGRICULTURAL,
        COMMERCIAL
    }

    /// @notice Land lifecycle.
    ///
    /// @dev    `PENDING_VERIFICATION` is the entry state of every imported
    ///         land. The NFT does NOT exist yet and the share ledger has
    ///         NOT been populated. The land only transitions to `ACTIVE`
    ///         when EVERY proposed co-owner has called `verifyLandImport`
    ///         within the verification window — see contract preamble
    ///         "WHY OWNER CONSENSUS IS NECESSARY" for full rationale.
    enum LandStatus {
        PENDING_VERIFICATION, // import filed; awaiting all-owner verify within VERIFICATION_DURATION
        ACTIVE,
        PENDING_INHERITANCE,
        PENDING_SUBDIVISION,
        LOCKED_IMPORT_DISPUTE,
        LOCKED_INHERITANCE_DISPUTE,
        LOCKED_SUBDIVISION_DISPUTE,
        SUBDIVIDED // terminal
    }

    /// @notice Canonical on-chain record per land.
    /// @dev    `cnic` and `currentOwner` (present in pre-v6 designs) are
    ///         absent — they are no longer meaningful under multi-owner.
    ///         Look up shareholders via `getShareholdersWithBps`.
    struct LandRecord {
        string landId;
        string ipfsHash; // ERC-721 metadata JSON CID
        LandType landType;
        LandStatus status;
        uint64 proposedAt; // set at proposeLandImport
        uint64 verifiedAt; // set at _finalizeImport (when last owner verifies)
    }

    struct UserProfile {
        string name;
        string cnic;
        bool isRegistered;
    }

    /// @notice Pending land import. Until every proposed co-owner has
    ///         verified, the NFT has NOT been minted and the share ledger
    ///         has NOT been populated.
    ///
    /// @dev    `verificationDeadline` is `proposedAt + VERIFICATION_DURATION`.
    ///         After this timestamp, `verifyLandImport` reverts and
    ///         anyone may call `expireLandImport` to delete the shell and
    ///         free the landId for a re-import.
    struct ImportProposal {
        address proposer;
        address[] proposedOwners;
        uint16[] proposedShares; // must sum to TOTAL_SHARES (10,000)
        uint256 verificationCount;
        string courtOrderCid; // optional — non-empty only for court-anchored imports
        uint256 proposalNonce;
        uint64 verificationDeadline;
        bool isCancelled;
    }

    /// @notice Per (landId, seller) marketplace listing.
    struct Listing {
        uint16 shareBpsForSale;
        uint256 price;
        address seller;
        bool isActive;
        uint64 deadline;
        string metadataHash;
    }

    /// @notice One row per shareholder change. The full audit log.
    struct OwnershipChange {
        address from; // address(0) for mint
        address to;
        uint16 shareBps;
        uint64 timestamp;
        uint256 price; // 0 for non-sale events
    }

    /// @notice Heir-initiated appeal — the legal trigger that asks the
    ///         off-chain backend / court to begin processing a succession.
    ///         Filing an appeal does NOT change land status; it only logs
    ///         the legal request on-chain so the audit trail is complete.
    ///
    /// @dev    The off-chain flow is:
    ///           heir → files appeal w/ court order CID → backend reads
    ///           the event → backend verifies the court order off-chain
    ///           (signatures, judge identity, jurisdiction, etc.) → if
    ///           valid, the backend (INHERITANCE_ORACLE_ROLE) calls
    ///           `initiateInheritance` referencing the appeal id.
    ///         The backend can also reject the appeal off-chain — in that
    ///         case `isProcessed` simply remains `false` and the appeal
    ///         lives on-chain forever as a "filed but not actioned" record.
    struct InheritanceAppeal {
        uint256 id;
        string landId;
        address deceasedHolder;
        address filer;
        string courtOrderCid;
        uint64 filedAt;
        bool isProcessed;
    }

    /// @notice Inheritance redistributes ONE deceased shareholder's bps
    ///         across heirs. The land NFT does NOT move and other
    ///         shareholders are untouched.
    ///
    /// @dev    AUDIT-CRITICAL: `courtOrderCid` is set at PROPOSAL time
    ///         (not at force-resolve) and is locked together with
    ///         `heirs[]` and `heirShares[]` via `sharesHash =
    ///         keccak256(abi.encode(heirs, heirShares, courtOrderCid))`.
    ///         An indexer / auditor can recompute the hash and compare
    ///         against `sharesHash` to PROVE that the on-chain shares
    ///         haven't been silently swapped under the same court order.
    ///         `votingDeadline = proposedAt + INHERITANCE_VOTING_DURATION`
    ///         caps the approval window; after expiry anyone may call
    ///         `expireInheritance` to reset status to ACTIVE.
    struct InheritanceRequest {
        address deceasedHolder;
        address[] heirs;
        uint16[] heirShares; // must sum to deceased's current bps
        uint256 approvalCount;
        bool isExecuted;
        uint256 proposalNonce;
        string courtOrderCid; // REQUIRED at proposal time (v7+ inheritance)
        uint256 appealId; // 0 if not linked to a specific appeal record
        bytes32 sharesHash; // commits heirs + shares + court CID together
        uint64 votingDeadline;
    }

    /**
     * @notice Append-only record of every tier-2 legal-override action
     *         taken against an inheritance dispute. The arbiter is
     *         intentionally NOT given arbitrary power — every override
     *         must carry an updated court order CID, a legal-resolution
     *         CID, a human-readable reason, the resolver's identity, and
     *         a timestamp. The history is queryable via
     *         `getLegalOverrides(landId)`.
     *
     * @dev    The off-chain artefacts (the two CIDs) are pinned on IPFS
     *         and provide the cryptographic anchor to the legal authority
     *         that compelled the override. An auditor reviewing a forced
     *         execution can fetch both documents and verify the chain of
     *         legal reasoning that produced the on-chain result.
     */
    struct LegalOverride {
        address resolver;
        uint64 timestamp;
        bool forceExecuted; // true = forced execution of the standing plan; false = cancelled
        string updatedCourtOrderCid; // new/updated court order CID
        string legalResolutionCid; // legal-resolution document (judgment / order) CID
        string overrideReason; // human-readable rationale
    }

    /// @notice Legal subdivision plan. Burns the parent NFT and mints N
    ///         new ones. Per-new-land shareholders + shares live in
    ///         `_newLandShareholders` / `_newLandShares` keyed by
    ///         (parentLandId, proposalNonce, newLandIndex) so the
    ///         (potentially heavy) nested data lives in mappings rather
    ///         than packed into the struct.
    struct SubdivisionPlan {
        string[] newLandIds;
        string[] newIpfsHashes;
        string courtOrderCid; // REQUIRED — subdivisions need legal authority
        uint256 approvalCount;
        bool isExecuted;
        uint256 proposalNonce;
    }

    /// @notice A time-bound right of use granted by a shareholder to a
    ///         non-owner. Does not touch the share ledger.
    struct OccupancyAgreement {
        uint64 id;
        address grantor; // shareholder who granted
        address occupant;
        uint64 startTime;
        uint64 endTime;
        string termsCid; // IPFS CID for the full lease/agreement document
        bool isRevoked;
    }

    // ---- View-only structs (returned by helper getters; not stored) --------

    /// @notice Layer-1 (identity) projection of a land. Returned by
    ///         `getLandIdentity` so frontends can grab the immutable +
    ///         lifecycle fields with the deterministic `tokenId` already
    ///         derived — no separate keccak call needed.
    struct LandIdentity {
        string landId;
        string ipfsHash;
        LandType landType;
        LandStatus status;
        uint64 proposedAt;
        uint64 verifiedAt;
        uint256 tokenId;
    }

    /// @notice Layer-2 (ownership ledger) snapshot. Single-call read of the
    ///         shareholder list, their bps, the runtime sum, and the count.
    ///         For an ACTIVE land `totalShareBps` should equal TOTAL_SHARES;
    ///         exposing it as a derived field gives integrators an explicit
    ///         invariant assertion target.
    struct OwnershipSnapshot {
        address[] holders;
        uint16[] shares;
        uint16 totalShareBps;
        uint256 shareholderCount;
    }

    // ========================================================================
    // 8. STATE VARIABLES
    // ========================================================================

    // --- Roles (least privilege) --------------------------------------------
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant INHERITANCE_ORACLE_ROLE = keccak256("INHERITANCE_ORACLE_ROLE");
    bytes32 public constant SUBDIVISION_ORACLE_ROLE = keccak256("SUBDIVISION_ORACLE_ROLE");
    bytes32 public constant DISPUTE_ARBITER_ROLE = keccak256("DISPUTE_ARBITER_ROLE");
    bytes32 public constant GOVT_AUTHORITY_ROLE = keccak256("GOVT_AUTHORITY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // --- Constants -----------------------------------------------------------
    uint16 public constant TOTAL_SHARES = 10_000;
    uint64 public constant LISTING_DURATION = 7 days;
    /// @notice Maximum window in which all proposed co-owners must verify
    ///         an imported land. Chosen at 90 days because real Pakistani
    ///         allotment files often involve elderly owners, overseas
    ///         family members, and slow off-chain communication. After
    ///         expiry, anyone may call `expireLandImport` to free the
    ///         landId — no shareholder can be silently stuck.
    uint64 public constant VERIFICATION_DURATION = 90 days;
    /// @notice Window in which all heirs must vote on an inheritance
    ///         proposal. Shorter than the import window because by the
    ///         time the court has issued an order, the heirs are already
    ///         identified and aware. After this deadline anyone may call
    ///         `expireInheritance` and the proposal returns to ACTIVE.
    uint64 public constant INHERITANCE_VOTING_DURATION = 30 days;
    uint256 public constant MAX_HEIRS = 50;
    uint256 public constant MAX_SHAREHOLDERS = 100;
    uint256 public constant MAX_SUBDIVISIONS_PER_PROPOSAL = 20;
    uint256 public constant MAX_STRING_LENGTH = 256;

    // --- Identity -----------------------------------------------------------
    mapping(address => UserProfile) private _users;
    mapping(string => address) private _cnicToAddress;

    // --- Land core ----------------------------------------------------------
    mapping(string => LandRecord) private _landRecords;
    mapping(string => bool) private _landExists;
    mapping(uint256 => string) private _tokenIdToLandId;
    string[] private _allLandIds; // populated only at finalization

    // --- Share ledger (v6 fractional ownership) ------------------------------
    mapping(string => address[]) private _shareholders;
    mapping(string => mapping(address => uint16)) private _shareBps;
    mapping(string => mapping(address => uint256)) private _shareholderIndex;

    // --- Reverse index: holder → list of lands ------------------------------
    mapping(address => string[]) private _ownerToLands;
    mapping(address => mapping(string => uint256)) private _ownerLandIndex;

    // --- Ownership history --------------------------------------------------
    mapping(string => OwnershipChange[]) private _ownershipHistory;

    // --- Marketplace --------------------------------------------------------
    mapping(string => mapping(address => Listing)) private _listings;

    // --- Land import phase (v7) ---------------------------------------------
    mapping(string => ImportProposal) private _importProposals;
    // landId => nonce => owner => verified?
    mapping(string => mapping(uint256 => mapping(address => bool))) private _importVerified;
    // landId => nonce => candidate => is-proposed-owner-for-this-round?
    mapping(string => mapping(uint256 => mapping(address => bool))) private _isProposedOwner;

    // --- Inheritance --------------------------------------------------------
    mapping(string => InheritanceRequest) private _inheritanceRequests;
    mapping(string => mapping(uint256 => mapping(address => bool))) private _heirApproved;
    mapping(string => mapping(uint256 => mapping(address => bool))) private _isHeirFor;

    // --- Inheritance appeals (heir-initiated; v7+ inheritance workflow) -----
    //
    // SECURITY: appeals are public information events filed by anyone
    // (typically a known heir or their lawyer). They DO NOT change land
    // status. Only the off-chain backend, after legal-authenticity
    // checks, may act on an appeal by calling `initiateInheritance`.
    // This separation prevents random callers from putting a land into
    // PENDING_INHERITANCE.
    mapping(uint256 => InheritanceAppeal) private _inheritanceAppeals;
    mapping(string => uint256[]) private _appealsByLand;
    uint256 private _nextAppealId;

    // --- Tier-2 legal-override audit log -----------------------------------
    //
    // Append-only record of every arbiter action (force-execute OR cancel)
    // against an inheritance dispute. A land may accumulate multiple entries
    // over time if it's gone through more than one dispute cycle. Anyone
    // can read the history via `getLegalOverrides`.
    mapping(string => LegalOverride[]) private _legalOverrides;

    // --- Subdivision (v7) ---------------------------------------------------
    mapping(string => SubdivisionPlan) private _subdivisionPlans;
    // (parentLandId, proposalNonce, newLandIndex) → shareholders + shares
    mapping(string => mapping(uint256 => mapping(uint256 => address[]))) private _newLandShareholders;
    mapping(string => mapping(uint256 => mapping(uint256 => uint16[]))) private _newLandShares;
    mapping(string => mapping(uint256 => mapping(address => bool))) private _subdivisionApproved;

    // --- Occupancy (v7) -----------------------------------------------------
    mapping(string => OccupancyAgreement[]) private _occupancyAgreements;

    // --- Pull-payment escrow ------------------------------------------------
    mapping(address => uint256) private _pendingWithdrawals;
    uint256 private _totalPendingWithdrawals;

    // ========================================================================
    // 9. EVENTS
    // ========================================================================

    // Identity ---------------------------------------------------------------
    event UserRegistered(address indexed user, string name, string cnic);

    // Land import (v7) -------------------------------------------------------
    event LandImportProposed(
        string indexed landId,
        address indexed proposer,
        uint256 ownerCount,
        string courtOrderCid,
        uint256 proposalNonce,
        uint64 verificationDeadline
    );
    event LandImportVerified(
        string indexed landId,
        address indexed owner,
        uint256 proposalNonce,
        uint256 verificationCount,
        uint256 ownersTotal
    );
    event LandImportDisputed(string indexed landId, address indexed disputer, uint256 proposalNonce);
    event LandImportCancelled(string indexed landId);
    event LandImportExpired(string indexed landId, uint256 proposalNonce, uint64 deadline);
    event LandImportResolved(string indexed landId, bool forceApproved, string courtOrderCid);
    event LandImportFinalized(string indexed landId, uint256 proposalNonce);

    // NFT mint (emitted at finalization, NOT at proposal) --------------------
    event LandMinted(string indexed landId, LandType lType, uint256 tokenId);

    // Share ledger -----------------------------------------------------------
    event ShareholderAdded(string indexed landId, address indexed holder, uint16 shareBps);
    event ShareholderRemoved(string indexed landId, address indexed holder);
    event ShareTransferred(
        string indexed landId,
        address indexed from,
        address indexed to,
        uint16 shareBps,
        uint256 price
    );

    // Marketplace ------------------------------------------------------------
    event ShareListed(
        string indexed landId,
        address indexed seller,
        uint16 shareBpsForSale,
        uint256 price,
        string metadataHash
    );
    event ListingPriceUpdated(string indexed landId, address indexed seller, uint256 oldPrice, uint256 newPrice);
    event ListingCancelled(string indexed landId, address indexed seller);
    event ShareSold(
        string indexed landId,
        address indexed buyer,
        address indexed seller,
        uint16 shareBps,
        uint256 price
    );

    // Pull-payment -----------------------------------------------------------
    event ProceedsCredited(address indexed seller, uint256 amount);
    event ProceedsWithdrawn(address indexed seller, uint256 amount);

    // Inheritance ------------------------------------------------------------
    event InheritanceAppealFiled(
        uint256 indexed appealId,
        string indexed landId,
        address indexed filer,
        address deceasedHolder,
        string courtOrderCid
    );
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
    event HeirApproved(string indexed landId, address indexed heir, uint256 proposalNonce);
    event InheritanceDisputed(string indexed landId, address indexed heir, uint256 proposalNonce);
    event InheritanceFinalized(string indexed landId, uint256 proposalNonce);
    event InheritanceExpired(string indexed landId, uint256 proposalNonce, uint64 deadline);
    event InheritanceFrozenForReview(
        string indexed landId,
        address indexed resolver,
        string reason,
        uint64 timestamp
    );
    event LegalOverrideExecuted(
        string indexed landId,
        address indexed resolver,
        uint256 overrideIndex,
        bool forceExecuted,
        string updatedCourtOrderCid,
        string legalResolutionCid,
        string overrideReason,
        uint64 timestamp
    );

    // Subdivision (v7) -------------------------------------------------------
    event SubdivisionProposed(
        string indexed parentLandId,
        uint256 newLandCount,
        string courtOrderCid,
        uint256 proposalNonce
    );
    event SubdivisionApproved(string indexed parentLandId, address indexed shareholder, uint256 proposalNonce);
    event SubdivisionDisputed(string indexed parentLandId, address indexed shareholder, uint256 proposalNonce);
    event SubdivisionFinalized(string indexed parentLandId, uint256 newLandCount, uint256 proposalNonce);
    event SubdivisionDisputeResolved(string indexed parentLandId, bool forceExecuted, string courtOrderCid);

    // Occupancy (v7) ---------------------------------------------------------
    event OccupancyGranted(
        string indexed landId,
        uint64 indexed agreementId,
        address indexed grantor,
        address occupant,
        uint64 startTime,
        uint64 endTime,
        string termsCid
    );
    event OccupancyRevoked(string indexed landId, uint64 indexed agreementId, address indexed grantor);

    // Other ------------------------------------------------------------------
    event LandStatusChanged(string indexed landId, LandStatus status);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    // ========================================================================
    // 10. MODIFIERS
    // ========================================================================

    modifier landMustExist(string calldata landId) {
        if (!_landExists[landId]) revert LandRegistry__LandNotFound(landId);
        _;
    }

    modifier onlyActive(string calldata landId) {
        if (_landRecords[landId].status != LandStatus.ACTIVE) revert LandRegistry__LandNotActive(landId);
        _;
    }

    modifier boundedString(string calldata s) {
        uint256 len = bytes(s).length;
        if (len == 0 || len > MAX_STRING_LENGTH) revert LandRegistry__InvalidStringLength();
        _;
    }

    // ========================================================================
    // 11. CONSTRUCTOR
    // ========================================================================

    /**
     * @param backend Address granted ALL four backend roles by default
     *                (MINTER, INHERITANCE_ORACLE, SUBDIVISION_ORACLE,
     *                DISPUTE_ARBITER). Production deployments should
     *                revoke whichever roles each operator doesn't need
     *                so a leaked key compromises the narrowest authority.
     *                Deployer becomes DEFAULT_ADMIN_ROLE + PAUSER_ROLE.
     */
    constructor(address backend) ERC721("PakLandRegistry", "PLR") {
        if (backend == address(0)) revert LandRegistry__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        _grantRole(MINTER_ROLE, backend);
        _grantRole(INHERITANCE_ORACLE_ROLE, backend);
        _grantRole(SUBDIVISION_ORACLE_ROLE, backend);
        _grantRole(DISPUTE_ARBITER_ROLE, backend);
    }

    // ========================================================================
    // 12. EXTERNAL / PUBLIC FUNCTIONS
    // ========================================================================

    // ------------------------------------------------------------------------
    // 12.a Admin
    // ------------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setGovtAuthority(address wallet, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (wallet == address(0)) revert LandRegistry__ZeroAddress();
        if (status) {
            _grantRole(GOVT_AUTHORITY_ROLE, wallet);
        } else {
            _revokeRole(GOVT_AUTHORITY_ROLE, wallet);
        }
    }

    /// @notice Sweeps STRAY ETH only — never seller escrow.
    function emergencyWithdraw(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert LandRegistry__ZeroAddress();
        uint256 bal = address(this).balance;
        uint256 stray = bal > _totalPendingWithdrawals ? bal - _totalPendingWithdrawals : 0;
        if (stray == 0) revert LandRegistry__NoStrayBalance();

        to.sendValue(stray);
        emit EmergencyWithdrawal(to, stray);
    }

    // ------------------------------------------------------------------------
    // 12.b Identity
    // ------------------------------------------------------------------------

    function registerUser(
        string calldata name,
        string calldata cnic
    ) external whenNotPaused boundedString(name) boundedString(cnic) {
        if (_users[msg.sender].isRegistered) revert LandRegistry__AlreadyRegistered(msg.sender);
        if (_cnicToAddress[cnic] != address(0)) revert LandRegistry__CnicAlreadyLinked(cnic);

        _users[msg.sender] = UserProfile({name: name, cnic: cnic, isRegistered: true});
        _cnicToAddress[cnic] = msg.sender;

        emit UserRegistered(msg.sender, name, cnic);
    }

    // ------------------------------------------------------------------------
    // 12.c Land import (hybrid governance — v7 core)
    // ------------------------------------------------------------------------

    /**
     * @notice Backend imports a land record from the developer / govt
     *         allotment registry. The NFT is NOT minted yet; the share
     *         ledger is NOT populated yet. The proposed owners must
     *         each call `verifyLandImport` before the import finalises.
     *
     * @dev    WHY THIS DESIGN
     *         --------------------------------------------------------
     *         Pre-v7, the backend minted unilaterally — a corrupt or
     *         erroneous backend could mint a land record to the wrong
     *         owner without on-chain pushback. v7 requires unanimous
     *         consent from the proposed co-owner set BEFORE the NFT is
     *         minted, so any owner can refuse a wrong import. The
     *         arbiter can still force-resolve a dispute (with court
     *         CID), but the override is publicly auditable.
     */
    function proposeLandImport(
        string calldata landId,
        string calldata ipfsHash,
        LandType lType,
        address[] calldata proposedOwners,
        uint16[] calldata proposedShares,
        string calldata courtOrderCid
    )
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
        boundedString(landId)
        boundedString(ipfsHash)
    {
        if (_landExists[landId]) revert LandRegistry__LandAlreadyExists(landId);
        _validateOwnerShares(proposedOwners, proposedShares);

        ImportProposal storage proposal = _importProposals[landId];
        uint256 nonce = proposal.proposalNonce + 1;
        uint64 deadline = uint64(block.timestamp) + VERIFICATION_DURATION;

        proposal.proposer = msg.sender;
        proposal.proposedOwners = proposedOwners;
        proposal.proposedShares = proposedShares;
        proposal.verificationCount = 0;
        proposal.courtOrderCid = courtOrderCid;
        proposal.proposalNonce = nonce;
        proposal.verificationDeadline = deadline;
        proposal.isCancelled = false;

        _landRecords[landId] = LandRecord({
            landId: landId,
            ipfsHash: ipfsHash,
            landType: lType,
            status: LandStatus.PENDING_VERIFICATION,
            proposedAt: uint64(block.timestamp),
            verifiedAt: 0
        });
        _landExists[landId] = true;

        uint256 n = proposedOwners.length;
        for (uint256 i = 0; i < n; ) {
            _isProposedOwner[landId][nonce][proposedOwners[i]] = true;
            unchecked {
                ++i;
            }
        }

        emit LandImportProposed(landId, msg.sender, n, courtOrderCid, nonce, deadline);
        emit LandStatusChanged(landId, LandStatus.PENDING_VERIFICATION);
    }

    /**
     * @notice A proposed co-owner verifies the imported record. When the
     *         LAST proposed owner verifies, the import is finalised:
     *         NFT minted, share ledger populated, status → ACTIVE.
     *
     * @dev    SECURITY / GOVERNANCE
     *         --------------------------------------------------------
     *         Three checks scoped to the current `proposalNonce` make
     *         the verification ledger immutable and auditable:
     *
     *           1. `_isProposedOwner[landId][nonce][msg.sender]` —
     *              caller MUST have been named at proposal time. A
     *              wallet that wasn't in the proposal cannot inject a
     *              verification.
     *           2. `!_importVerified[landId][nonce][msg.sender]` —
     *              every verification is one-shot. A re-imported
     *              proposal (new nonce) gets fresh verification state.
     *           3. `block.timestamp <= verificationDeadline` — stale
     *              proposals cannot be finalised after the window. This
     *              forces fresh consent if the off-chain situation has
     *              changed (an owner died, sold off-chain, etc.).
     *
     *         The mint + ledger population in `_finalizeImport` is
     *         atomic with this verification: there is no intermediate
     *         state where the NFT exists but consensus is incomplete.
     *
     *         `nonReentrant` because `_finalizeImport` calls `_mint`
     *         which can invoke ERC-721 receiver hooks on the receiving
     *         contract (here `address(this)`).
     */
    function verifyLandImport(string calldata landId) external whenNotPaused nonReentrant {
        LandRecord storage record = _landRecords[landId];
        if (!_landExists[landId]) revert LandRegistry__LandNotFound(landId);
        if (record.status != LandStatus.PENDING_VERIFICATION) revert LandRegistry__NotInImportPhase(landId);

        ImportProposal storage proposal = _importProposals[landId];
        uint256 nonce = proposal.proposalNonce;

        if (block.timestamp > proposal.verificationDeadline) {
            revert LandRegistry__VerificationExpired(landId, proposal.verificationDeadline);
        }
        if (!_isProposedOwner[landId][nonce][msg.sender]) revert LandRegistry__NotAProposedOwner(msg.sender);
        if (_importVerified[landId][nonce][msg.sender]) revert LandRegistry__AlreadyVerified();

        _importVerified[landId][nonce][msg.sender] = true;
        uint256 newCount = proposal.verificationCount + 1;
        proposal.verificationCount = newCount;
        uint256 ownersTotal = proposal.proposedOwners.length;

        emit LandImportVerified(landId, msg.sender, nonce, newCount, ownersTotal);

        if (newCount == ownersTotal) {
            _finalizeImport(landId);
        }
    }

    /**
     * @notice After the verification deadline has elapsed, ANYONE may
     *         delete the import shell so the landId is freed for a
     *         fresh proposal. The proposalNonce is preserved so re-
     *         imports continue incrementing it (defense against any
     *         residual scoped state).
     *
     * @dev    Open to all callers because it's a public utility — the
     *         caller pays gas but the action is bounded by an
     *         on-chain timestamp that already expired. There is no
     *         attacker-controlled variant.
     */
    function expireLandImport(string calldata landId) external whenNotPaused {
        LandRecord storage record = _landRecords[landId];
        if (record.status != LandStatus.PENDING_VERIFICATION) revert LandRegistry__NotInImportPhase(landId);

        ImportProposal storage proposal = _importProposals[landId];
        uint64 deadline = proposal.verificationDeadline;
        if (block.timestamp <= deadline) {
            revert LandRegistry__VerificationNotExpired(landId, deadline);
        }

        uint256 nonce = proposal.proposalNonce;
        _deleteLandShell(landId);
        emit LandImportExpired(landId, nonce, deadline);
    }

    /// @notice Any proposed owner can dispute, locking the import.
    function disputeLandImport(string calldata landId) external whenNotPaused {
        LandRecord storage record = _landRecords[landId];
        if (record.status != LandStatus.PENDING_VERIFICATION) revert LandRegistry__NotInImportPhase(landId);

        ImportProposal storage proposal = _importProposals[landId];
        if (!_isProposedOwner[landId][proposal.proposalNonce][msg.sender]) {
            revert LandRegistry__NotAProposedOwner(msg.sender);
        }

        record.status = LandStatus.LOCKED_IMPORT_DISPUTE;
        emit LandImportDisputed(landId, msg.sender, proposal.proposalNonce);
        emit LandStatusChanged(landId, LandStatus.LOCKED_IMPORT_DISPUTE);
    }

    /// @notice The proposing backend can cancel its own proposal before
    ///         it finalises (status PROPOSED).
    function cancelLandImport(string calldata landId) external onlyRole(MINTER_ROLE) whenNotPaused {
        LandRecord storage record = _landRecords[landId];
        if (record.status != LandStatus.PENDING_VERIFICATION) revert LandRegistry__NotInImportPhase(landId);

        _importProposals[landId].isCancelled = true;
        _deleteLandShell(landId);
        emit LandImportCancelled(landId);
    }

    /**
     * @notice Arbiter resolves a disputed import — either force-approve
     *         (with court-order CID anchoring the legal authority) or
     *         cancel.
     */
    function resolveLandImportDispute(
        string calldata landId,
        bool forceApprove,
        string calldata courtOrderCid
    ) external onlyRole(DISPUTE_ARBITER_ROLE) whenNotPaused nonReentrant boundedString(courtOrderCid) {
        LandRecord storage record = _landRecords[landId];
        if (record.status != LandStatus.LOCKED_IMPORT_DISPUTE) revert LandRegistry__ImportNotDisputed(landId);

        if (forceApprove) {
            _importProposals[landId].courtOrderCid = courtOrderCid;
            _finalizeImport(landId);
        } else {
            _deleteLandShell(landId);
            emit LandImportCancelled(landId);
        }
        emit LandImportResolved(landId, forceApprove, courtOrderCid);
    }

    // ------------------------------------------------------------------------
    // 12.d Share transfer
    // ------------------------------------------------------------------------

    /**
     * @notice **LAYER-2 OP** — transfer `shareBps` of caller's share on
     *         `landId` to `recipient`. To transfer 100% pass `shareBps = 10000`.
     *
     * @dev    Only the ownership ledger changes. The NFT is untouched —
     *         same tokenId, same custody (still held by this contract),
     *         same IPFS metadata. This is the textbook example of why
     *         layer-2 operations exist: a buyer can acquire 30% of a
     *         five-owner parcel without any NFT-level event firing.
     */
    function transferShare(
        string calldata landId,
        address recipient,
        uint16 shareBps,
        uint256 salePrice
    ) external whenNotPaused nonReentrant landMustExist(landId) onlyActive(landId) {
        if (recipient == address(0)) revert LandRegistry__ZeroAddress();
        if (recipient == msg.sender) revert LandRegistry__SelfTransfer();
        if (shareBps == 0) revert LandRegistry__InvalidShare();
        if (!_isAuthorizedHolder(recipient)) revert LandRegistry__NotAuthorizedHolder(recipient);

        uint16 callerShare = _shareBps[landId][msg.sender];
        if (callerShare < shareBps) revert LandRegistry__InsufficientShare(msg.sender, callerShare, shareBps);

        _decreaseShare(landId, msg.sender, shareBps);
        _increaseShare(landId, recipient, shareBps);

        _ownershipHistory[landId].push(
            OwnershipChange({
                from: msg.sender,
                to: recipient,
                shareBps: shareBps,
                timestamp: uint64(block.timestamp),
                price: salePrice
            })
        );

        emit ShareTransferred(landId, msg.sender, recipient, shareBps, salePrice);
    }

    // ------------------------------------------------------------------------
    // 12.e Marketplace (per-share, per-seller)
    // ------------------------------------------------------------------------

    function listShareForSale(
        string calldata landId,
        uint16 shareBpsForSale,
        uint256 price,
        string calldata metadataHash
    )
        external
        whenNotPaused
        landMustExist(landId)
        onlyActive(landId)
        boundedString(metadataHash)
    {
        if (shareBpsForSale == 0) revert LandRegistry__InvalidShare();
        if (price == 0) revert LandRegistry__InvalidPrice();

        uint16 callerShare = _shareBps[landId][msg.sender];
        if (callerShare < shareBpsForSale) {
            revert LandRegistry__InsufficientShare(msg.sender, callerShare, shareBpsForSale);
        }

        _listings[landId][msg.sender] = Listing({
            shareBpsForSale: shareBpsForSale,
            price: price,
            seller: msg.sender,
            isActive: true,
            deadline: uint64(block.timestamp) + LISTING_DURATION,
            metadataHash: metadataHash
        });

        emit ShareListed(landId, msg.sender, shareBpsForSale, price, metadataHash);
    }

    /// @notice Lower price only — raises require cancel + relist.
    function updateListingPrice(string calldata landId, uint256 newPrice) external whenNotPaused {
        if (newPrice == 0) revert LandRegistry__InvalidPrice();

        Listing storage listing = _listings[landId][msg.sender];
        if (!listing.isActive) revert LandRegistry__ListingNotActive(landId, msg.sender);
        if (newPrice >= listing.price) revert LandRegistry__PriceMustDecrease(listing.price, newPrice);

        uint256 oldPrice = listing.price;
        listing.price = newPrice;
        emit ListingPriceUpdated(landId, msg.sender, oldPrice, newPrice);
    }

    function cancelListing(string calldata landId) external whenNotPaused {
        if (!_listings[landId][msg.sender].isActive) revert LandRegistry__ListingNotActive(landId, msg.sender);
        delete _listings[landId][msg.sender];
        emit ListingCancelled(landId, msg.sender);
    }

    /**
     * @notice **LAYER-2 OP** — atomic purchase of `seller`'s listed share.
     *         `maxPrice` protects the buyer from seller-side front-running.
     *         Proceeds are credited to seller's pull-payment balance.
     *
     * @dev    Like `transferShare`, this is a layer-2-only operation: the
     *         NFT does not move, the tokenId does not change. Only the
     *         share ledger entries for `seller` and `msg.sender` are
     *         updated, and `_pendingWithdrawals[seller]` is credited.
     */
    function buyShare(
        string calldata landId,
        address seller,
        uint256 maxPrice
    ) external payable whenNotPaused nonReentrant landMustExist(landId) onlyActive(landId) {
        if (!_isAuthorizedHolder(msg.sender)) revert LandRegistry__NotAuthorizedHolder(msg.sender);
        if (msg.sender == seller) revert LandRegistry__SellerCannotBuy();

        Listing memory listing = _listings[landId][seller];
        if (!listing.isActive) revert LandRegistry__ListingNotActive(landId, seller);
        if (block.timestamp > listing.deadline) revert LandRegistry__ListingExpired(landId, seller);

        uint256 price = listing.price;
        if (price > maxPrice) revert LandRegistry__PriceExceedsMax(price, maxPrice);
        if (msg.value < price) revert LandRegistry__InsufficientPayment(msg.value, price);

        uint16 shareBps = listing.shareBpsForSale;
        uint16 sellerShare = _shareBps[landId][seller];
        if (sellerShare < shareBps) revert LandRegistry__InsufficientShare(seller, sellerShare, shareBps);

        // --- Effects (CEI) ---
        delete _listings[landId][seller];
        _decreaseShare(landId, seller, shareBps);
        _increaseShare(landId, msg.sender, shareBps);

        _pendingWithdrawals[seller] += price;
        _totalPendingWithdrawals += price;
        emit ProceedsCredited(seller, price);

        _ownershipHistory[landId].push(
            OwnershipChange({
                from: seller,
                to: msg.sender,
                shareBps: shareBps,
                timestamp: uint64(block.timestamp),
                price: price
            })
        );

        // --- Interactions ---
        uint256 excess = msg.value - price;
        if (excess > 0) {
            payable(msg.sender).sendValue(excess);
        }

        emit ShareSold(landId, msg.sender, seller, shareBps, price);
    }

    /// @notice Withdraw accumulated sale proceeds. Intentionally NOT
    ///         `whenNotPaused` — pause must not trap user funds.
    function withdrawProceeds() external nonReentrant {
        uint256 amount = _pendingWithdrawals[msg.sender];
        if (amount == 0) revert LandRegistry__NoBalance();

        _pendingWithdrawals[msg.sender] = 0;
        _totalPendingWithdrawals -= amount;

        payable(msg.sender).sendValue(amount);
        emit ProceedsWithdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------------
    // 12.f Inheritance (heir-initiated appeal → oracle-filed proposal →
    //                    heir approve/dispute → execute / arbiter override)
    //
    // WHY INHERITANCE CANNOT REALISTICALLY BE FULLY DECENTRALISED
    // -----------------------------------------------------------------
    // Pakistani inheritance is governed by a layered legal framework
    // (the Muslim Family Laws Ordinance 1961, the Succession Act 1925
    // for non-Muslims, plus customary law applied by family courts).
    // The share each heir receives depends on:
    //   • which legal regime applies (religion of the deceased)
    //   • family tree facts (does the deceased have surviving parents?
    //     spouse? children of what gender? grandchildren via predeceased
    //     children?)
    //   • whether there is a registered will and whether it is valid
    //   • whether any heir disclaims, dies during proceedings, etc.
    // None of these can be computed on-chain without enshrining a
    // specific legal interpretation into the contract code — which is
    // both legally inappropriate (a contract is not a court) and
    // technically fragile (every law change breaks the contract).
    //
    // WHY COURTS CALCULATE SHARES OFF-CHAIN
    // -----------------------------------------------------------------
    // Family / civil courts compute the heirShares array off-chain and
    // issue a signed succession order. The order is pinned to IPFS;
    // its CID is the legal-authority anchor that the on-chain contract
    // commits to. The on-chain logic then ENFORCES the redistribution
    // exactly as ordered — no more, no less.
    //
    // WHY HEIRS ONLY APPROVE OR DISPUTE
    // -----------------------------------------------------------------
    // Heirs cannot edit the heirShares array. If they could, a majority
    // could collude to silently rewrite the court-ordered split before
    // execution. Their only on-chain power is to:
    //   • approve the proposal as filed (drives toward execution), or
    //   • dispute it (freezes the proposal until the arbiter resolves).
    // This forces any disagreement back into the legal system, which
    // is the appropriate venue for it.
    //
    // WHY IMMUTABLE PROPOSALS IMPROVE SECURITY
    // -----------------------------------------------------------------
    // Once `initiateInheritance` files a proposal, the heirs[],
    // heirShares[], courtOrderCid, and resulting `sharesHash` are
    // immutable for that proposalNonce. The backend cannot
    // re-edit them in place. To change anything, the backend must let
    // the proposal expire (or all heirs reject by deadline) and file a
    // FRESH proposal with a new nonce — and the new proposal must
    // again survive the unanimous-vote window. Replay protection is
    // built in: vote state is scoped to (landId, proposalNonce, heir),
    // so the new proposal sees fresh vote slots.
    //
    // ╔══════════════════════════════════════════════════════════════════╗
    // ║ TWO-TIER INHERITANCE DISPUTE RESOLUTION (v8 hardening)             ║
    // ╚══════════════════════════════════════════════════════════════════╝
    //
    // WHY UNANIMOUS APPROVAL FOREVER IS UNREALISTIC
    // -----------------------------------------------------------------
    // A naive "all heirs must approve or the inheritance is stuck" rule
    // is mathematically simple but operationally fragile:
    //   • A single inactive heir (overseas, ill, missing, deceased
    //     mid-process) freezes the parcel forever.
    //   • A single malicious heir can extort the others by withholding
    //     their approval until paid off — a textbook holdout attack.
    //   • The contract has no on-chain way to verify "this heir cannot
    //     reasonably be expected to vote" — only a court does.
    // Pure on-chain consensus therefore needs an escape valve.
    //
    // WHY LEGAL ENFORCEABILITY EXISTS
    // -----------------------------------------------------------------
    // Real-world succession is enforceable BECAUSE a judge can issue an
    // executable order that binds parties whether they cooperate or
    // not. v8 brings that same property on-chain via a TIER-2 legal
    // override: when consensus stalls, the dispute escalates into
    // formal legal review (`freezeInheritanceForReview` or
    // heir-`disputeSuccessionPlan`), and the arbiter — backed by an
    // updated court order and a legal resolution document, both pinned
    // to IPFS — can compel execution OR cancel the standing plan.
    //
    // WHY THE HYBRID OVERRIDE MODEL IS NECESSARY
    // -----------------------------------------------------------------
    // Granting the arbiter unilateral authority would defeat the
    // purpose of decentralisation. Granting it none would reproduce
    // the pure-consensus stall problem. v8's hybrid model splits the
    // difference: the arbiter can act, but every action is bound to
    // four pieces of evidence written into the on-chain audit trail:
    //   1. an UPDATED COURT ORDER CID
    //   2. a LEGAL RESOLUTION DOCUMENT CID
    //   3. a human-readable OVERRIDE REASON
    //   4. the resolver's own address + on-chain timestamp
    // The arbiter cannot move shares "because they say so" — they must
    // commit cryptographic anchors to the off-chain legal reasoning,
    // which any auditor can fetch from IPFS and review.
    //
    // TIER-1 (voluntary) and TIER-2 (legal override) state flow:
    //
    //   PENDING_INHERITANCE
    //     │
    //     ├── all heirs approve voluntarily ─────────────▶ ACTIVE (executed)
    //     │   ── tier 1, no override needed
    //     │
    //     ├── any heir disputes ─────────┐
    //     │                              │
    //     ├── arbiter calls freeze ──────┤
    //     │  ForReview                   ▼
    //     │                LOCKED_INHERITANCE_DISPUTE
    //     │                              │
    //     │                              ├── resolveInheritanceDispute(
    //     │                              │     forceExecute=true,
    //     │                              │     courtCid, resolutionCid, reason)
    //     │                              │   ──▶ ACTIVE (executed; tier-2 audit row appended)
    //     │                              │
    //     │                              └── resolveInheritanceDispute(
    //     │                                    forceExecute=false,
    //     │                                    courtCid, resolutionCid, reason)
    //     │                                  ──▶ ACTIVE (cancelled; tier-2 audit row appended)
    //     │
    //     └── deadline elapses without consensus ─────▶ ACTIVE
    //         (expireInheritance — backend re-proposes with new nonce)
    // ------------------------------------------------------------------------

    /**
     * @notice Heir-initiated step. Files a public-record appeal that an
     *         inheritance is in progress for `landId` over `deceasedHolder`'s
     *         share, citing the court-order CID. Anyone REGISTERED may
     *         file — typically a known heir or their lawyer.
     *
     * @dev    Filing an appeal does NOT change land status. It only logs
     *         the request on-chain so the audit trail is complete. The
     *         off-chain backend reads the `InheritanceAppealFiled` event,
     *         verifies the court order's legal authenticity off-chain
     *         (signatures, jurisdiction, judge identity), and — if
     *         valid — calls `initiateInheritance` referencing the
     *         returned `appealId`.
     *
     *         Anti-spam: caller must be a registered citizen. Frivolous
     *         appeals carry no on-chain effect; they're discarded by the
     *         backend.
     */
    function fileInheritanceAppeal(
        string calldata landId,
        address deceasedHolder,
        string calldata courtOrderCid
    )
        external
        whenNotPaused
        boundedString(courtOrderCid)
        landMustExist(landId)
        onlyActive(landId)
        returns (uint256 appealId)
    {
        if (!_users[msg.sender].isRegistered) revert LandRegistry__NotAuthorizedHolder(msg.sender);
        if (deceasedHolder == address(0)) revert LandRegistry__ZeroAddress();
        if (_shareBps[landId][deceasedHolder] == 0) {
            revert LandRegistry__DeceasedHasNoShares(deceasedHolder, landId);
        }

        unchecked {
            ++_nextAppealId;
        }
        appealId = _nextAppealId;

        _inheritanceAppeals[appealId] = InheritanceAppeal({
            id: appealId,
            landId: landId,
            deceasedHolder: deceasedHolder,
            filer: msg.sender,
            courtOrderCid: courtOrderCid,
            filedAt: uint64(block.timestamp),
            isProcessed: false
        });
        _appealsByLand[landId].push(appealId);

        emit InheritanceAppealFiled(appealId, landId, msg.sender, deceasedHolder, courtOrderCid);
    }

    /**
     * @notice **LAYER-2 OP** — backend files an immutable inheritance
     *         proposal after off-chain court-order verification.
     *         Redistributes the deceased's basis points across heirs.
     *         **No NFT mint, no NFT burn, no tokenId change.** Heirs
     *         become co-owners of the SAME parcel; the off-chain physical
     *         land does not subdivide. For deliberate physical subdivision
     *         use `proposeSubdivision`.
     *
     * @param  courtOrderCid REQUIRED at proposal time. Pinned IPFS CID of
     *                       the signed court order that authorises this
     *                       redistribution. Committed into `sharesHash`
     *                       so any silent edit to heirs/shares while the
     *                       same CID is reused is provably detectable.
     * @param  appealId      Optional reference to the heir-filed appeal
     *                       that triggered this proposal (`0` if none).
     *                       Marking the appeal as processed closes the
     *                       audit loop from appeal → proposal.
     *
     * @dev    IMMUTABILITY: once this call returns, `heirs`, `heirShares`,
     *         `courtOrderCid`, `sharesHash`, and `votingDeadline` cannot
     *         be edited under the current `proposalNonce`. A new proposal
     *         requires bumping the nonce — which gives fresh per-heir
     *         vote slots and a fresh deadline.
     */
    function initiateInheritance(
        string calldata landId,
        address deceasedHolder,
        address[] calldata heirs,
        uint16[] calldata heirShares,
        string calldata courtOrderCid,
        uint256 appealId
    )
        external
        onlyRole(INHERITANCE_ORACLE_ROLE)
        whenNotPaused
        boundedString(courtOrderCid)
        landMustExist(landId)
        onlyActive(landId)
    {
        _validateInheritanceInputs(landId, deceasedHolder, heirs, heirShares);

        if (appealId != 0) {
            InheritanceAppeal storage appeal = _inheritanceAppeals[appealId];
            if (bytes(appeal.landId).length == 0) revert LandRegistry__InvalidAppealId(appealId);
            if (keccak256(bytes(appeal.landId)) != keccak256(bytes(landId))) {
                revert LandRegistry__AppealLandMismatch(appealId, appeal.landId, landId);
            }
            if (appeal.isProcessed) revert LandRegistry__AppealAlreadyProcessed(appealId);
            appeal.isProcessed = true;
        }

        InheritanceRequest storage req = _inheritanceRequests[landId];
        uint256 nonce = req.proposalNonce + 1;
        uint64 deadline = uint64(block.timestamp) + INHERITANCE_VOTING_DURATION;
        bytes32 sharesHash = keccak256(abi.encode(heirs, heirShares, courtOrderCid));

        req.deceasedHolder = deceasedHolder;
        req.heirs = heirs;
        req.heirShares = heirShares;
        req.approvalCount = 0;
        req.isExecuted = false;
        req.proposalNonce = nonce;
        req.courtOrderCid = courtOrderCid;
        req.appealId = appealId;
        req.sharesHash = sharesHash;
        req.votingDeadline = deadline;

        uint256 n = heirs.length;
        for (uint256 i = 0; i < n; ) {
            _isHeirFor[landId][nonce][heirs[i]] = true;
            unchecked {
                ++i;
            }
        }

        _landRecords[landId].status = LandStatus.PENDING_INHERITANCE;
        emit InheritanceInitiated(
            landId,
            deceasedHolder,
            n,
            _shareBps[landId][deceasedHolder],
            nonce,
            courtOrderCid,
            appealId,
            sharesHash,
            deadline
        );
        emit LandStatusChanged(landId, LandStatus.PENDING_INHERITANCE);
    }

    /**
     * @notice Heir votes yes on the standing proposal. The vote is
     *         scoped to (landId, proposalNonce, heir) so a single vote
     *         per heir per proposal is enforced — replay-safe across
     *         re-issued proposals.
     *
     * @dev    SECURITY:
     *         - `nonReentrant`: the last vote triggers
     *           `_executeInheritance` which mutates share state and could
     *           hit ERC-721 receiver hooks.
     *         - Deadline check: votes are rejected after
     *           `votingDeadline`. After expiry anyone may call
     *           `expireInheritance` to reset status to ACTIVE.
     */
    function approveSuccessionPlan(string calldata landId) external whenNotPaused nonReentrant {
        InheritanceRequest storage req = _inheritanceRequests[landId];
        if (_landRecords[landId].status != LandStatus.PENDING_INHERITANCE) {
            revert LandRegistry__NoPendingPlan(landId);
        }
        if (req.isExecuted) revert LandRegistry__PlanAlreadyExecuted(landId);
        if (block.timestamp > req.votingDeadline) {
            revert LandRegistry__InheritanceVotingExpired(landId, req.votingDeadline);
        }

        uint256 nonce = req.proposalNonce;
        if (!_isHeirFor[landId][nonce][msg.sender]) revert LandRegistry__NotAnHeir(msg.sender);
        if (_heirApproved[landId][nonce][msg.sender]) revert LandRegistry__AlreadyVoted();

        _heirApproved[landId][nonce][msg.sender] = true;
        uint256 newCount = req.approvalCount + 1;
        req.approvalCount = newCount;
        emit HeirApproved(landId, msg.sender, nonce);

        if (newCount == req.heirs.length) {
            _executeInheritance(landId);
        }
    }

    /// @notice Single-heir veto — freezes the proposal until the arbiter
    ///         resolves via `resolveInheritanceDispute` (with court CID).
    function disputeSuccessionPlan(string calldata landId) external whenNotPaused {
        InheritanceRequest storage req = _inheritanceRequests[landId];
        if (_landRecords[landId].status != LandStatus.PENDING_INHERITANCE) {
            revert LandRegistry__NoPendingPlan(landId);
        }
        if (!_isHeirFor[landId][req.proposalNonce][msg.sender]) revert LandRegistry__NotAnHeir(msg.sender);

        _landRecords[landId].status = LandStatus.LOCKED_INHERITANCE_DISPUTE;
        emit InheritanceDisputed(landId, msg.sender, req.proposalNonce);
        emit LandStatusChanged(landId, LandStatus.LOCKED_INHERITANCE_DISPUTE);
    }

    /**
     * @notice After the voting deadline has elapsed without unanimous
     *         approval (and without dispute), anyone may reset the land
     *         to ACTIVE so the backend can file a fresh proposal.
     *
     * @dev    Bounded by an on-chain timestamp; no role required. The
     *         proposalNonce is preserved on the struct so the next
     *         `initiateInheritance` increments it, giving fresh vote
     *         state. Does NOT touch share state.
     */
    function expireInheritance(string calldata landId) external whenNotPaused {
        LandRecord storage record = _landRecords[landId];
        if (record.status != LandStatus.PENDING_INHERITANCE) {
            revert LandRegistry__NoPendingPlan(landId);
        }
        InheritanceRequest storage req = _inheritanceRequests[landId];
        if (block.timestamp <= req.votingDeadline) {
            revert LandRegistry__InheritanceVotingNotExpired(landId, req.votingDeadline);
        }

        record.status = LandStatus.ACTIVE;
        emit InheritanceExpired(landId, req.proposalNonce, req.votingDeadline);
        emit LandStatusChanged(landId, LandStatus.ACTIVE);
    }

    /**
     * @notice **TIER-2 ESCALATION — court-anchored freeze.** Arbiter
     *         transitions a `PENDING_INHERITANCE` proposal directly to
     *         `LOCKED_INHERITANCE_DISPUTE` for formal legal review, even
     *         when no heir has yet voted to dispute. Useful when an
     *         external authority (court, prosecutor, regulator) requests
     *         a stay independently of heir action.
     *
     * @dev    `reason` is REQUIRED (non-empty); it goes into the audit
     *         trail via `InheritanceFrozenForReview`. The actual override
     *         action (force-execute or cancel) still happens through
     *         `resolveInheritanceDispute` with full metadata.
     */
    function freezeInheritanceForReview(
        string calldata landId,
        string calldata reason
    ) external onlyRole(DISPUTE_ARBITER_ROLE) whenNotPaused boundedString(reason) {
        if (_landRecords[landId].status != LandStatus.PENDING_INHERITANCE) {
            revert LandRegistry__NoPendingPlan(landId);
        }

        _landRecords[landId].status = LandStatus.LOCKED_INHERITANCE_DISPUTE;
        emit InheritanceFrozenForReview(landId, msg.sender, reason, uint64(block.timestamp));
        emit LandStatusChanged(landId, LandStatus.LOCKED_INHERITANCE_DISPUTE);
    }

    /**
     * @notice **TIER-2 ESCALATION — legal-override resolution.** Arbiter
     *         resolves a disputed (or formally-frozen) inheritance proposal.
     *         Force-executing the standing plan OR cancelling it BOTH
     *         require the same full audit metadata: updated court order
     *         CID, legal-resolution CID, human-readable reason. Every
     *         call appends an immutable row to `_legalOverrides[landId]`.
     *
     * @dev    WHY THIS METADATA IS REQUIRED
     *         --------------------------------------------------------
     *         The arbiter is intentionally NOT given arbitrary power.
     *         A pre-v8 design that let the arbiter force-execute on the
     *         strength of role alone would replicate the same "trusted
     *         operator" failure mode the contract is trying to avoid.
     *         v8 attaches every override decision to:
     *           • the COURT ORDER (`updatedCourtOrderCid`) that re-
     *             authorises the standing share split, possibly amended
     *             from the original;
     *           • the LEGAL RESOLUTION document (`legalResolutionCid`) —
     *             the judgment / written order that adjudicates the
     *             dispute itself;
     *           • a HUMAN-READABLE REASON the arbiter must commit to;
     *           • the resolver's address (msg.sender) and an on-chain
     *             timestamp.
     *         All five anchor the off-chain legal reasoning to the
     *         on-chain action; an auditor can fetch both CIDs and read
     *         the human reason to verify the chain of authority.
     *
     *         When `forceExecute = true`, the inheritance request's
     *         `courtOrderCid` is also updated to the new court order so
     *         the proposal record itself reflects the most recent legal
     *         authority — not the original court order that the heirs
     *         disputed.
     */
    function resolveInheritanceDispute(
        string calldata landId,
        bool forceExecute,
        string calldata updatedCourtOrderCid,
        string calldata legalResolutionCid,
        string calldata overrideReason
    )
        external
        onlyRole(DISPUTE_ARBITER_ROLE)
        whenNotPaused
        nonReentrant
        boundedString(updatedCourtOrderCid)
        boundedString(legalResolutionCid)
        boundedString(overrideReason)
    {
        if (_landRecords[landId].status != LandStatus.LOCKED_INHERITANCE_DISPUTE) {
            revert LandRegistry__InheritanceNotDisputed(landId);
        }

        // Log the override BEFORE executing — immutable audit trail even
        // if `_executeInheritance` later interacts with external receivers.
        LegalOverride[] storage log = _legalOverrides[landId];
        uint256 overrideIndex = log.length;
        log.push(
            LegalOverride({
                resolver: msg.sender,
                timestamp: uint64(block.timestamp),
                forceExecuted: forceExecute,
                updatedCourtOrderCid: updatedCourtOrderCid,
                legalResolutionCid: legalResolutionCid,
                overrideReason: overrideReason
            })
        );

        if (forceExecute) {
            _inheritanceRequests[landId].courtOrderCid = updatedCourtOrderCid;
            _executeInheritance(landId);
        } else {
            _landRecords[landId].status = LandStatus.ACTIVE;
            emit LandStatusChanged(landId, LandStatus.ACTIVE);
        }

        emit LegalOverrideExecuted(
            landId,
            msg.sender,
            overrideIndex,
            forceExecute,
            updatedCourtOrderCid,
            legalResolutionCid,
            overrideReason,
            uint64(block.timestamp)
        );
    }

    // ------------------------------------------------------------------------
    // 12.g Legal subdivision (v7 — court-anchored)
    // ------------------------------------------------------------------------

    /**
     * @notice **LAYER-1 OP** — open a legal-subdivision proposal that
     *         BURNS the parent NFT and MINTS N new NFTs, each with its
     *         own fresh share ledger. The ONLY operation in the contract
     *         that creates new land NFTs after initial import.
     *
     * @dev    SECURITY / GOVERNANCE
     *         --------------------------------------------------------
     *         Subdivision physically alters the land identity, so it
     *         requires:
     *           1. SUBDIVISION_ORACLE_ROLE to propose (the legal /
     *              survey operator).
     *           2. A non-empty `courtOrderCid` — the legal authority
     *              for the split.
     *           3. UNANIMOUS approval from all current shareholders of
     *              the parent (or arbiter override).
     *
     *         Nested calldata arrays carry per-new-land shareholder /
     *         share allocations. Each new land's allocations must sum
     *         to TOTAL_SHARES (validated by `_validateOwnerShares`).
     */
    function proposeSubdivision(
        string calldata parentLandId,
        string[] calldata newLandIds,
        string[] calldata newIpfsHashes,
        address[][] calldata newLandShareholders,
        uint16[][] calldata newLandShares,
        string calldata courtOrderCid
    )
        external
        onlyRole(SUBDIVISION_ORACLE_ROLE)
        whenNotPaused
        landMustExist(parentLandId)
        onlyActive(parentLandId)
        boundedString(courtOrderCid)
    {
        _validateSubdivisionInputs(newLandIds, newIpfsHashes, newLandShareholders, newLandShares);

        SubdivisionPlan storage plan = _subdivisionPlans[parentLandId];
        uint256 nonce = plan.proposalNonce + 1;

        plan.newLandIds = newLandIds;
        plan.newIpfsHashes = newIpfsHashes;
        plan.courtOrderCid = courtOrderCid;
        plan.approvalCount = 0;
        plan.isExecuted = false;
        plan.proposalNonce = nonce;

        uint256 m = newLandIds.length;
        for (uint256 i = 0; i < m; ) {
            _newLandShareholders[parentLandId][nonce][i] = newLandShareholders[i];
            _newLandShares[parentLandId][nonce][i] = newLandShares[i];
            unchecked {
                ++i;
            }
        }

        _landRecords[parentLandId].status = LandStatus.PENDING_SUBDIVISION;
        emit SubdivisionProposed(parentLandId, m, courtOrderCid, nonce);
        emit LandStatusChanged(parentLandId, LandStatus.PENDING_SUBDIVISION);
    }

    /// @notice Current shareholder approves the open subdivision plan.
    ///         Auto-executes at unanimous quorum.
    function approveSubdivision(string calldata parentLandId) external whenNotPaused nonReentrant {
        if (_landRecords[parentLandId].status != LandStatus.PENDING_SUBDIVISION) {
            revert LandRegistry__NoPendingSubdivision(parentLandId);
        }

        SubdivisionPlan storage plan = _subdivisionPlans[parentLandId];
        uint256 nonce = plan.proposalNonce;

        if (_shareBps[parentLandId][msg.sender] == 0) revert LandRegistry__NotAShareholder(msg.sender);
        if (_subdivisionApproved[parentLandId][nonce][msg.sender]) revert LandRegistry__AlreadyVoted();

        _subdivisionApproved[parentLandId][nonce][msg.sender] = true;
        uint256 newCount = plan.approvalCount + 1;
        plan.approvalCount = newCount;
        emit SubdivisionApproved(parentLandId, msg.sender, nonce);

        if (newCount == _shareholders[parentLandId].length) {
            _executeSubdivision(parentLandId);
        }
    }

    function disputeSubdivision(string calldata parentLandId) external whenNotPaused {
        if (_landRecords[parentLandId].status != LandStatus.PENDING_SUBDIVISION) {
            revert LandRegistry__NoPendingSubdivision(parentLandId);
        }
        if (_shareBps[parentLandId][msg.sender] == 0) revert LandRegistry__NotAShareholder(msg.sender);

        _landRecords[parentLandId].status = LandStatus.LOCKED_SUBDIVISION_DISPUTE;
        emit SubdivisionDisputed(parentLandId, msg.sender, _subdivisionPlans[parentLandId].proposalNonce);
        emit LandStatusChanged(parentLandId, LandStatus.LOCKED_SUBDIVISION_DISPUTE);
    }

    function resolveSubdivisionDispute(
        string calldata parentLandId,
        bool forceExecute,
        string calldata courtOrderCid
    ) external onlyRole(DISPUTE_ARBITER_ROLE) whenNotPaused nonReentrant boundedString(courtOrderCid) {
        if (_landRecords[parentLandId].status != LandStatus.LOCKED_SUBDIVISION_DISPUTE) {
            revert LandRegistry__SubdivisionNotDisputed(parentLandId);
        }

        if (forceExecute) {
            _subdivisionPlans[parentLandId].courtOrderCid = courtOrderCid;
            _executeSubdivision(parentLandId);
        } else {
            _landRecords[parentLandId].status = LandStatus.ACTIVE;
            emit LandStatusChanged(parentLandId, LandStatus.ACTIVE);
        }
        emit SubdivisionDisputeResolved(parentLandId, forceExecute, courtOrderCid);
    }

    // ------------------------------------------------------------------------
    // 12.h Occupancy / use-right (v7)
    // ------------------------------------------------------------------------

    /**
     * @notice Any shareholder may grant a time-bound right of use to an
     *         occupant. Occupancy does NOT affect the share ledger.
     *
     * @dev    SIMPLIFIED MODEL: any single shareholder can grant
     *         unilaterally — matches Pakistani practice where one
     *         co-owner typically manages tenancy. Multiple concurrent
     *         agreements by different shareholders are allowed; real-
     *         world conflicts among co-owners are resolved off-chain.
     *         A future v8 could require unanimous-consent grant — out
     *         of scope here.
     */
    function grantOccupancy(
        string calldata landId,
        address occupant,
        uint64 startTime,
        uint64 endTime,
        string calldata termsCid
    ) external whenNotPaused landMustExist(landId) onlyActive(landId) boundedString(termsCid) returns (uint64 agreementId) {
        if (occupant == address(0)) revert LandRegistry__ZeroAddress();
        if (_shareBps[landId][msg.sender] == 0) revert LandRegistry__NotAShareholder(msg.sender);
        if (startTime >= endTime || endTime <= block.timestamp) revert LandRegistry__InvalidOccupancyPeriod();

        agreementId = uint64(_occupancyAgreements[landId].length);
        _occupancyAgreements[landId].push(
            OccupancyAgreement({
                id: agreementId,
                grantor: msg.sender,
                occupant: occupant,
                startTime: startTime,
                endTime: endTime,
                termsCid: termsCid,
                isRevoked: false
            })
        );

        emit OccupancyGranted(landId, agreementId, msg.sender, occupant, startTime, endTime, termsCid);
    }

    function revokeOccupancy(string calldata landId, uint64 agreementId) external whenNotPaused {
        OccupancyAgreement[] storage agreements = _occupancyAgreements[landId];
        if (agreementId >= agreements.length) revert LandRegistry__OccupancyNotFound(agreementId);

        OccupancyAgreement storage ag = agreements[agreementId];
        if (ag.grantor != msg.sender) revert LandRegistry__NotOccupancyGrantor(msg.sender);
        if (ag.isRevoked) revert LandRegistry__OccupancyAlreadyRevoked();

        ag.isRevoked = true;
        emit OccupancyRevoked(landId, agreementId, msg.sender);
    }

    // ========================================================================
    // 13. INTERNAL / PRIVATE FUNCTIONS
    // ========================================================================

    /**
     * @dev OZ-5 transfer hook. Land NFTs are self-custodial: minted to
     *      `address(this)` and burned only during subdivision. The
     *      override allows:
     *        - mint (from == 0, to == address(this))
     *        - burn (to == 0, called only from `_executeSubdivision`)
     *      and rejects any external transfer attempt.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = super._update(to, tokenId, auth);
        // Allow mints and burns; reject post-mint movements between addresses.
        if (from != address(0) && to != address(0) && to != address(this)) {
            revert LandRegistry__NftNonTransferable();
        }
        return from;
    }

    // ---- Land import finalisation ------------------------------------------

    /// @dev Finalise an import — mint the NFT, populate the share ledger,
    ///      seed the ownership history. Status → ACTIVE.
    function _finalizeImport(string calldata landId) private {
        ImportProposal storage proposal = _importProposals[landId];
        LandRecord storage record = _landRecords[landId];

        // Push to the master list only on finalisation (not at propose) so
        // pagination over `_allLandIds` exposes only active/terminal lands.
        _allLandIds.push(landId);

        uint256 tokenId = getTokenIdFromLandId(landId);
        _tokenIdToLandId[tokenId] = landId;
        _mint(address(this), tokenId);

        address[] memory owners = proposal.proposedOwners;
        uint16[] memory shares = proposal.proposedShares;
        uint256 n = owners.length;

        for (uint256 i = 0; i < n; ) {
            _increaseShare(landId, owners[i], shares[i]);
            _ownershipHistory[landId].push(
                OwnershipChange({
                    from: address(0),
                    to: owners[i],
                    shareBps: shares[i],
                    timestamp: uint64(block.timestamp),
                    price: 0
                })
            );
            unchecked {
                ++i;
            }
        }

        record.status = LandStatus.ACTIVE;
        record.verifiedAt = uint64(block.timestamp);

        emit LandMinted(landId, record.landType, tokenId);
        emit LandImportFinalized(landId, proposal.proposalNonce);
        emit LandStatusChanged(landId, LandStatus.ACTIVE);
    }

    /// @dev Roll back a never-finalised import. Called by cancel /
    ///      reject paths. The proposalNonce is preserved so re-imports
    ///      of the same landId continue incrementing it.
    function _deleteLandShell(string calldata landId) private {
        delete _landRecords[landId];
        _landExists[landId] = false;
        // Note: the ImportProposal struct keeps its nonce field; only the
        // payload is no longer relevant. A re-import will overwrite.
    }

    // ---- Inheritance execution --------------------------------------------

    function _executeInheritance(string calldata landId) private {
        InheritanceRequest storage req = _inheritanceRequests[landId];
        req.isExecuted = true;

        address deceased = req.deceasedHolder;
        uint16 deceasedShare = _shareBps[landId][deceased];

        // 1. Remove deceased's full share.
        _decreaseShare(landId, deceased, deceasedShare);

        // 2. Distribute to heirs (the same NFT — no mint/burn).
        uint256 n = req.heirs.length;
        for (uint256 i = 0; i < n; ) {
            address heir = req.heirs[i];
            uint16 share = req.heirShares[i];
            _increaseShare(landId, heir, share);
            _ownershipHistory[landId].push(
                OwnershipChange({
                    from: deceased,
                    to: heir,
                    shareBps: share,
                    timestamp: uint64(block.timestamp),
                    price: 0
                })
            );
            unchecked {
                ++i;
            }
        }

        // 3. Land returns to ACTIVE — it never had to leave existence.
        _landRecords[landId].status = LandStatus.ACTIVE;
        emit InheritanceFinalized(landId, req.proposalNonce);
        emit LandStatusChanged(landId, LandStatus.ACTIVE);
    }

    // ---- Subdivision execution --------------------------------------------

    /// @dev Burns parent, mints children. Parent → SUBDIVIDED (terminal).
    function _executeSubdivision(string calldata parentLandId) private {
        SubdivisionPlan storage plan = _subdivisionPlans[parentLandId];
        plan.isExecuted = true;

        uint256 nonce = plan.proposalNonce;
        LandRecord storage parentRecord = _landRecords[parentLandId];
        LandType parentType = parentRecord.landType;

        // 1. Clear parent share ledger fully (terminal; no further ops).
        address[] memory parentHolders = _shareholders[parentLandId];
        uint256 holderCount = parentHolders.length;
        for (uint256 i = 0; i < holderCount; ) {
            address h = parentHolders[i];
            delete _shareBps[parentLandId][h];
            delete _shareholderIndex[parentLandId][h];
            _removeFromOwnerList(h, parentLandId);
            emit ShareholderRemoved(parentLandId, h);
            unchecked {
                ++i;
            }
        }
        delete _shareholders[parentLandId];

        // 2. Burn parent NFT (the `_update` override permits to == 0).
        uint256 parentTokenId = getTokenIdFromLandId(parentLandId);
        delete _tokenIdToLandId[parentTokenId];
        _burn(parentTokenId);

        // 3. Mark parent terminal.
        parentRecord.status = LandStatus.SUBDIVIDED;
        emit LandStatusChanged(parentLandId, LandStatus.SUBDIVIDED);

        // 4. Mint each child NFT and seed its share ledger.
        uint256 m = plan.newLandIds.length;
        for (uint256 i = 0; i < m; ) {
            _createSubdividedChild(
                plan.newLandIds[i],
                plan.newIpfsHashes[i],
                parentType,
                _newLandShareholders[parentLandId][nonce][i],
                _newLandShares[parentLandId][nonce][i]
            );
            unchecked {
                ++i;
            }
        }

        emit SubdivisionFinalized(parentLandId, m, nonce);
    }

    function _createSubdividedChild(
        string memory childLandId,
        string memory ipfsHash,
        LandType lType,
        address[] storage holders,
        uint16[] storage shares
    ) private {
        _landRecords[childLandId] = LandRecord({
            landId: childLandId,
            ipfsHash: ipfsHash,
            landType: lType,
            status: LandStatus.ACTIVE,
            proposedAt: uint64(block.timestamp),
            verifiedAt: uint64(block.timestamp)
        });
        _landExists[childLandId] = true;
        _allLandIds.push(childLandId);

        uint256 tokenId = getTokenIdFromLandId(childLandId);
        _tokenIdToLandId[tokenId] = childLandId;
        _mint(address(this), tokenId);

        uint256 n = holders.length;
        for (uint256 i = 0; i < n; ) {
            address h = holders[i];
            uint16 s = shares[i];
            _increaseShare(childLandId, h, s);
            _ownershipHistory[childLandId].push(
                OwnershipChange({
                    from: address(0),
                    to: h,
                    shareBps: s,
                    timestamp: uint64(block.timestamp),
                    price: 0
                })
            );
            unchecked {
                ++i;
            }
        }

        emit LandMinted(childLandId, lType, tokenId);
        emit LandStatusChanged(childLandId, LandStatus.ACTIVE);
    }

    // ---- Share-ledger helpers ---------------------------------------------

    /**
     * @dev Increase `holder`'s bps. If they had zero share, append them
     *      to `_shareholders[landId]`. Maintains invariants I2–I5.
     */
    function _increaseShare(string memory landId, address holder, uint16 deltaBps) private {
        uint16 currentBps = _shareBps[landId][holder];
        _shareBps[landId][holder] = currentBps + deltaBps;

        if (currentBps == 0) {
            uint256 count = _shareholders[landId].length;
            if (count >= MAX_SHAREHOLDERS) revert LandRegistry__TooManyShareholders(count, MAX_SHAREHOLDERS);

            _shareholderIndex[landId][holder] = count;
            _shareholders[landId].push(holder);
            _addToOwnerList(holder, landId);
            emit ShareholderAdded(landId, holder, deltaBps);
        }
    }

    /**
     * @dev Decrease `holder`'s bps. Removes them from the shareholder list
     *      if their remaining bps drops to zero (swap-and-pop).
     */
    function _decreaseShare(string memory landId, address holder, uint16 deltaBps) private {
        uint16 currentBps = _shareBps[landId][holder];
        if (currentBps < deltaBps) revert LandRegistry__InsufficientShare(holder, currentBps, deltaBps);

        uint16 newBps;
        unchecked {
            newBps = currentBps - deltaBps;
        }
        _shareBps[landId][holder] = newBps;

        if (newBps == 0) {
            _removeShareholder(landId, holder);
            _removeFromOwnerList(holder, landId);
            emit ShareholderRemoved(landId, holder);
        }
    }

    function _removeShareholder(string memory landId, address holder) private {
        address[] storage list = _shareholders[landId];
        uint256 idx = _shareholderIndex[landId][holder];
        uint256 lastIdx = list.length - 1;
        if (idx != lastIdx) {
            address lastHolder = list[lastIdx];
            list[idx] = lastHolder;
            _shareholderIndex[landId][lastHolder] = idx;
        }
        list.pop();
        delete _shareholderIndex[landId][holder];
    }

    function _addToOwnerList(address owner, string memory landId) private {
        _ownerToLands[owner].push(landId);
        _ownerLandIndex[owner][landId] = _ownerToLands[owner].length - 1;
    }

    function _removeFromOwnerList(address owner, string memory landId) private {
        uint256 len = _ownerToLands[owner].length;
        if (len == 0) return;
        uint256 idx = _ownerLandIndex[owner][landId];
        if (idx >= len || keccak256(bytes(_ownerToLands[owner][idx])) != keccak256(bytes(landId))) return;

        if (idx != len - 1) {
            string memory lastId = _ownerToLands[owner][len - 1];
            _ownerToLands[owner][idx] = lastId;
            _ownerLandIndex[owner][lastId] = idx;
        }
        _ownerToLands[owner].pop();
        delete _ownerLandIndex[owner][landId];
    }

    // ---- Authorisation -----------------------------------------------------

    function _isAuthorizedHolder(address account) private view returns (bool) {
        return _users[account].isRegistered || hasRole(GOVT_AUTHORITY_ROLE, account);
    }

    // ---- Input validation helpers -----------------------------------------

    /**
     * @dev Shared owner/share-array validator used by both
     *      `proposeLandImport` and the per-child-land allocations of
     *      `proposeSubdivision`. Enforces:
     *        - non-empty, capped at MAX_SHAREHOLDERS
     *        - parallel arrays equal length
     *        - no zero addresses, no zero shares, no duplicates
     *        - every owner is an authorised holder
     *        - shares sum exactly to TOTAL_SHARES (preserves invariant I1)
     */
    function _validateOwnerShares(address[] calldata owners, uint16[] calldata shares) private view {
        uint256 n = owners.length;
        if (n == 0) revert LandRegistry__NoOwners();
        if (n > MAX_SHAREHOLDERS) revert LandRegistry__TooManyShareholders(n, MAX_SHAREHOLDERS);
        if (shares.length != n) revert LandRegistry__ArrayLengthMismatch();

        uint256 sum = 0;
        for (uint256 i = 0; i < n; ) {
            address o = owners[i];
            uint16 s = shares[i];
            if (o == address(0)) revert LandRegistry__ZeroAddress();
            if (s == 0) revert LandRegistry__InvalidShare();
            if (!_isAuthorizedHolder(o)) revert LandRegistry__NotAuthorizedHolder(o);

            for (uint256 j = i + 1; j < n; ) {
                if (owners[j] == o) revert LandRegistry__DuplicateOwner(o);
                unchecked {
                    ++j;
                }
            }
            sum += s;
            unchecked {
                ++i;
            }
        }
        if (sum != TOTAL_SHARES) revert LandRegistry__ShareTotalMismatch(uint16(sum), TOTAL_SHARES);
    }

    function _validateInheritanceInputs(
        string calldata landId,
        address deceasedHolder,
        address[] calldata heirs,
        uint16[] calldata heirShares
    ) private view {
        if (deceasedHolder == address(0)) revert LandRegistry__ZeroAddress();
        uint16 deceasedShare = _shareBps[landId][deceasedHolder];
        if (deceasedShare == 0) revert LandRegistry__DeceasedHasNoShares(deceasedHolder, landId);

        uint256 n = heirs.length;
        if (n == 0) revert LandRegistry__NoHeirs();
        if (n > MAX_HEIRS) revert LandRegistry__TooManyHeirs(n, MAX_HEIRS);
        if (heirShares.length != n) revert LandRegistry__InheritanceArrayMismatch();

        uint256 currentHolders = _shareholders[landId].length;
        if (currentHolders + n > MAX_SHAREHOLDERS + 1) {
            revert LandRegistry__TooManyShareholders(currentHolders + n - 1, MAX_SHAREHOLDERS);
        }

        uint256 sum = 0;
        for (uint256 i = 0; i < n; ) {
            address heir = heirs[i];
            uint16 share = heirShares[i];

            if (heir == address(0)) revert LandRegistry__ZeroAddress();
            if (heir == deceasedHolder) revert LandRegistry__HeirIsDeceased(heir);
            if (share == 0) revert LandRegistry__InvalidShare();
            if (!_isAuthorizedHolder(heir)) revert LandRegistry__NotAuthorizedHolder(heir);

            for (uint256 j = i + 1; j < n; ) {
                if (heirs[j] == heir) revert LandRegistry__DuplicateHeir(heir);
                unchecked {
                    ++j;
                }
            }
            sum += share;
            unchecked {
                ++i;
            }
        }
        if (sum != uint256(deceasedShare)) {
            revert LandRegistry__ShareTotalMismatch(uint16(sum), deceasedShare);
        }
    }

    function _validateSubdivisionInputs(
        string[] calldata newLandIds,
        string[] calldata newIpfsHashes,
        address[][] calldata newLandShareholders,
        uint16[][] calldata newLandShares
    ) private view {
        uint256 m = newLandIds.length;
        if (m == 0 || m > MAX_SUBDIVISIONS_PER_PROPOSAL) revert LandRegistry__InvalidSubdivisionCount();
        if (
            newIpfsHashes.length != m ||
            newLandShareholders.length != m ||
            newLandShares.length != m
        ) revert LandRegistry__ArrayLengthMismatch();

        for (uint256 i = 0; i < m; ) {
            uint256 idLen = bytes(newLandIds[i]).length;
            uint256 hashLen = bytes(newIpfsHashes[i]).length;
            if (idLen == 0 || idLen > MAX_STRING_LENGTH || hashLen == 0 || hashLen > MAX_STRING_LENGTH) {
                revert LandRegistry__InvalidStringLength();
            }
            if (_landExists[newLandIds[i]]) revert LandRegistry__LandAlreadyExists(newLandIds[i]);

            for (uint256 j = i + 1; j < m; ) {
                if (keccak256(bytes(newLandIds[j])) == keccak256(bytes(newLandIds[i]))) {
                    revert LandRegistry__DuplicateNewLandId(newLandIds[i]);
                }
                unchecked {
                    ++j;
                }
            }

            // Per-child owner/share validation reuses the shared validator.
            _validateOwnerShares(newLandShareholders[i], newLandShares[i]);
            unchecked {
                ++i;
            }
        }
    }

    // ========================================================================
    // 14. VIEW / PURE FUNCTIONS
    // ========================================================================

    function getTokenIdFromLandId(string memory landId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(landId)));
    }

    /// @inheritdoc ERC721
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory landId = _tokenIdToLandId[tokenId];
        return string(abi.encodePacked("ipfs://", _landRecords[landId].ipfsHash));
    }

    // === LAYER 1 (identity) + LAYER 2 (ownership) — combined / legacy views ==
    // Land + share views -----------------------------------------------------
    function getLandRecord(string calldata landId) external view returns (LandRecord memory) {
        return _landRecords[landId];
    }

    function getUser(address account) external view returns (UserProfile memory) {
        return _users[account];
    }

    function getShareholders(string calldata landId) external view returns (address[] memory) {
        return _shareholders[landId];
    }

    function getShareholdersWithBps(
        string calldata landId
    ) external view returns (address[] memory holders, uint16[] memory shares) {
        holders = _shareholders[landId];
        uint256 n = holders.length;
        shares = new uint16[](n);
        for (uint256 i = 0; i < n; ) {
            shares[i] = _shareBps[landId][holders[i]];
            unchecked {
                ++i;
            }
        }
    }

    function getShareBps(string calldata landId, address holder) external view returns (uint16) {
        return _shareBps[landId][holder];
    }

    function getTotalShares(string calldata landId) external view returns (uint16 total) {
        address[] memory holders = _shareholders[landId];
        uint256 n = holders.length;
        for (uint256 i = 0; i < n; ) {
            total += _shareBps[landId][holders[i]];
            unchecked {
                ++i;
            }
        }
    }

    // === LAYER 1 — import / verification phase views ========================
    // Import views -----------------------------------------------------------
    function getImportProposal(
        string calldata landId
    )
        external
        view
        returns (
            address proposer,
            address[] memory proposedOwners,
            uint16[] memory proposedShares,
            uint256 verificationCount,
            string memory courtOrderCid,
            uint256 proposalNonce,
            uint64 verificationDeadline,
            bool isCancelled
        )
    {
        ImportProposal storage p = _importProposals[landId];
        return (
            p.proposer,
            p.proposedOwners,
            p.proposedShares,
            p.verificationCount,
            p.courtOrderCid,
            p.proposalNonce,
            p.verificationDeadline,
            p.isCancelled
        );
    }

    /// @notice Has `owner` verified the CURRENT proposal for `landId`?
    function isImportVerified(string calldata landId, address owner) external view returns (bool) {
        return _importVerified[landId][_importProposals[landId].proposalNonce][owner];
    }

    /// @notice Addresses that are proposed owners on the current import
    ///         proposal but have NOT yet verified. Use this on the
    ///         "Pending verifications" dashboard to nudge the right
    ///         wallets. Returns an empty array when status != PENDING_VERIFICATION.
    function getPendingVerifiers(string calldata landId) external view returns (address[] memory pending) {
        if (_landRecords[landId].status != LandStatus.PENDING_VERIFICATION) {
            return new address[](0);
        }
        ImportProposal storage p = _importProposals[landId];
        uint256 nonce = p.proposalNonce;
        address[] memory all = p.proposedOwners;
        uint256 n = all.length;

        uint256 pendingCount;
        for (uint256 i = 0; i < n; ) {
            if (!_importVerified[landId][nonce][all[i]]) {
                unchecked {
                    ++pendingCount;
                }
            }
            unchecked {
                ++i;
            }
        }

        pending = new address[](pendingCount);
        uint256 j;
        for (uint256 i = 0; i < n; ) {
            if (!_importVerified[landId][nonce][all[i]]) {
                pending[j] = all[i];
                unchecked {
                    ++j;
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Aggregated read for the "verification status" panel.
    ///         Returns the current vs total count, the deadline, and a
    ///         flag indicating whether the window has already elapsed.
    function getVerificationStatus(
        string calldata landId
    )
        external
        view
        returns (
            LandStatus status,
            uint256 verifiedCount,
            uint256 ownersTotal,
            uint64 verificationDeadline,
            bool isExpired
        )
    {
        LandRecord storage r = _landRecords[landId];
        ImportProposal storage p = _importProposals[landId];
        status = r.status;
        verifiedCount = p.verificationCount;
        ownersTotal = p.proposedOwners.length;
        verificationDeadline = p.verificationDeadline;
        isExpired = (p.verificationDeadline != 0 && block.timestamp > p.verificationDeadline);
    }

    // === LAYER 2 — marketplace + history views ==============================
    // Marketplace views ------------------------------------------------------
    function getListing(string calldata landId, address seller) external view returns (Listing memory) {
        return _listings[landId][seller];
    }

    // History view -----------------------------------------------------------
    function getOwnershipHistory(string calldata landId) external view returns (OwnershipChange[] memory) {
        return _ownershipHistory[landId];
    }

    // === LAYER 2 — inheritance views (redistributes shares, no NFT change) ===
    // Inheritance views ------------------------------------------------------
    function getInheritanceRequest(
        string calldata landId
    )
        external
        view
        returns (
            address deceasedHolder,
            address[] memory heirs,
            uint16[] memory heirShares,
            uint256 approvalCount,
            bool isExecuted,
            uint256 proposalNonce,
            string memory courtOrderCid,
            uint256 appealId,
            bytes32 sharesHash,
            uint64 votingDeadline
        )
    {
        InheritanceRequest storage r = _inheritanceRequests[landId];
        return (
            r.deceasedHolder,
            r.heirs,
            r.heirShares,
            r.approvalCount,
            r.isExecuted,
            r.proposalNonce,
            r.courtOrderCid,
            r.appealId,
            r.sharesHash,
            r.votingDeadline
        );
    }

    function hasHeirApproved(string calldata landId, address heir) external view returns (bool) {
        return _heirApproved[landId][_inheritanceRequests[landId].proposalNonce][heir];
    }

    /// @notice All appeals filed against `landId` (chronological).
    function getInheritanceAppealsForLand(string calldata landId) external view returns (uint256[] memory) {
        return _appealsByLand[landId];
    }

    /// @notice Full record of a single appeal by id.
    function getInheritanceAppeal(uint256 appealId) external view returns (InheritanceAppeal memory) {
        return _inheritanceAppeals[appealId];
    }

    /// @notice Total number of appeals ever filed (monotonic).
    function totalInheritanceAppeals() external view returns (uint256) {
        return _nextAppealId;
    }

    /// @notice Recompute the `sharesHash` for an off-chain heirs/shares/CID
    ///         tuple. Auditors / indexers compare this against the on-chain
    ///         `sharesHash` in the standing proposal to PROVE the backend
    ///         hasn't silently swapped heir shares under the same court
    ///         order. Pure — free to call.
    function computeSharesHash(
        address[] calldata heirs,
        uint16[] calldata heirShares,
        string calldata courtOrderCid
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(heirs, heirShares, courtOrderCid));
    }

    /// @notice Full tier-2 override audit log for `landId` (chronological).
    function getLegalOverrides(string calldata landId) external view returns (LegalOverride[] memory) {
        return _legalOverrides[landId];
    }

    /// @notice One override entry by index.
    function getLegalOverride(
        string calldata landId,
        uint256 index
    ) external view returns (LegalOverride memory) {
        return _legalOverrides[landId][index];
    }

    /// @notice Number of tier-2 overrides recorded against this land.
    function totalLegalOverrides(string calldata landId) external view returns (uint256) {
        return _legalOverrides[landId].length;
    }

    // === LAYER 1 — subdivision views (burns parent NFT, mints children) =====
    // Subdivision views ------------------------------------------------------
    function getSubdivisionPlan(
        string calldata parentLandId
    )
        external
        view
        returns (
            string[] memory newLandIds,
            string[] memory newIpfsHashes,
            string memory courtOrderCid,
            uint256 approvalCount,
            bool isExecuted,
            uint256 proposalNonce
        )
    {
        SubdivisionPlan storage p = _subdivisionPlans[parentLandId];
        return (
            p.newLandIds,
            p.newIpfsHashes,
            p.courtOrderCid,
            p.approvalCount,
            p.isExecuted,
            p.proposalNonce
        );
    }

    function getSubdivisionPart(
        string calldata parentLandId,
        uint256 newLandIndex
    ) external view returns (address[] memory holders, uint16[] memory shares) {
        uint256 nonce = _subdivisionPlans[parentLandId].proposalNonce;
        holders = _newLandShareholders[parentLandId][nonce][newLandIndex];
        shares = _newLandShares[parentLandId][nonce][newLandIndex];
    }

    function hasShareholderApprovedSubdivision(
        string calldata parentLandId,
        address shareholder
    ) external view returns (bool) {
        return _subdivisionApproved[parentLandId][_subdivisionPlans[parentLandId].proposalNonce][shareholder];
    }

    // === SEPARATE LEDGER — occupancy / use-right (NOT layer-2 ownership) ====
    // Occupancy views --------------------------------------------------------
    function getOccupancyAgreements(string calldata landId) external view returns (OccupancyAgreement[] memory) {
        return _occupancyAgreements[landId];
    }

    function getOccupancyAgreement(
        string calldata landId,
        uint64 agreementId
    ) external view returns (OccupancyAgreement memory) {
        OccupancyAgreement[] storage agreements = _occupancyAgreements[landId];
        if (agreementId >= agreements.length) revert LandRegistry__OccupancyNotFound(agreementId);
        return agreements[agreementId];
    }

    // Misc views -------------------------------------------------------------
    function isGovtAuthority(address account) external view returns (bool) {
        return hasRole(GOVT_AUTHORITY_ROLE, account);
    }

    function cnicToAddress(string calldata cnic) external view returns (address) {
        return _cnicToAddress[cnic];
    }

    function getLandsByCnic(string calldata cnic) external view returns (string[] memory) {
        return _ownerToLands[_cnicToAddress[cnic]];
    }

    function getLandsByOwner(address account) external view returns (string[] memory) {
        return _ownerToLands[account];
    }

    function totalLandRecords() external view returns (uint256) {
        return _allLandIds.length;
    }

    function pendingProceeds(address account) external view returns (uint256) {
        return _pendingWithdrawals[account];
    }

    function totalPendingWithdrawals() external view returns (uint256) {
        return _totalPendingWithdrawals;
    }

    function getAllLandRecordsPaginated(
        uint256 cursor,
        uint256 resultsPerPage
    ) external view returns (LandRecord[] memory results, uint256 nextCursor) {
        uint256 length = _allLandIds.length;
        if (cursor >= length) {
            return (new LandRecord[](0), length);
        }
        uint256 remaining = length - cursor;
        uint256 size = remaining < resultsPerPage ? remaining : resultsPerPage;

        results = new LandRecord[](size);
        for (uint256 i = 0; i < size; ) {
            results[i] = _landRecords[_allLandIds[cursor + i]];
            unchecked {
                ++i;
            }
        }
        return (results, cursor + size);
    }

    // ---- Two-layer projection views ----------------------------------------

    /**
     * @notice LAYER-1 projection: pure land-identity fields plus the
     *         deterministic ERC-721 tokenId. Returns the immutable
     *         identity (landId, ipfsHash, landType, proposedAt) together
     *         with the current lifecycle status — but NO ownership-ledger
     *         data. Pair with `getOwnershipSnapshot` for the layer-2 view.
     */
    function getLandIdentity(string calldata landId) external view returns (LandIdentity memory) {
        LandRecord storage r = _landRecords[landId];
        return
            LandIdentity({
                landId: r.landId,
                ipfsHash: r.ipfsHash,
                landType: r.landType,
                status: r.status,
                proposedAt: r.proposedAt,
                verifiedAt: r.verifiedAt,
                tokenId: getTokenIdFromLandId(landId)
            });
    }

    /**
     * @notice LAYER-2 projection: a one-shot read of the ownership ledger
     *         for `landId`. Returns the shareholder list, parallel bps
     *         array, the runtime sum (should be TOTAL_SHARES for an
     *         ACTIVE land), and the count. Indexers and dashboards use
     *         this instead of three separate calls.
     */
    function getOwnershipSnapshot(
        string calldata landId
    ) external view returns (OwnershipSnapshot memory snap) {
        address[] memory holders = _shareholders[landId];
        uint256 n = holders.length;
        uint16[] memory shares = new uint16[](n);
        uint16 total;
        for (uint256 i = 0; i < n; ) {
            uint16 s = _shareBps[landId][holders[i]];
            shares[i] = s;
            total += s;
            unchecked {
                ++i;
            }
        }
        snap = OwnershipSnapshot({
            holders: holders,
            shares: shares,
            totalShareBps: total,
            shareholderCount: n
        });
    }

    /**
     * @notice Combined view returning BOTH layers in a single RPC. Useful
     *         for the land-detail page which needs identity + ownership
     *         together. Equivalent to calling `getLandIdentity` and
     *         `getOwnershipSnapshot` separately, but cheaper for the caller.
     */
    function getLandFullView(
        string calldata landId
    ) external view returns (LandIdentity memory identity, OwnershipSnapshot memory ownership) {
        LandRecord storage r = _landRecords[landId];
        identity = LandIdentity({
            landId: r.landId,
            ipfsHash: r.ipfsHash,
            landType: r.landType,
            status: r.status,
            proposedAt: r.proposedAt,
            verifiedAt: r.verifiedAt,
            tokenId: getTokenIdFromLandId(landId)
        });

        address[] memory holders = _shareholders[landId];
        uint256 n = holders.length;
        uint16[] memory shares = new uint16[](n);
        uint16 total;
        for (uint256 i = 0; i < n; ) {
            uint16 s = _shareBps[landId][holders[i]];
            shares[i] = s;
            total += s;
            unchecked {
                ++i;
            }
        }
        ownership = OwnershipSnapshot({
            holders: holders,
            shares: shares,
            totalShareBps: total,
            shareholderCount: n
        });
    }

    /// @dev Required override when combining ERC721 + AccessControl.
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
