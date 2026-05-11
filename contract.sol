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

error LandRegistry__ZeroAddress();
error LandRegistry__InvalidStringLength();
error LandRegistry__AlreadyRegistered(address account);
error LandRegistry__CnicAlreadyLinked(string cnic);
error LandRegistry__NotAuthorizedHolder(address account);
error LandRegistry__LandAlreadyExists(string landId);
error LandRegistry__LandNotFound(string landId);
error LandRegistry__LandNotActive(string landId);
error LandRegistry__SelfTransfer();
error LandRegistry__InvalidPrice();
error LandRegistry__InvalidShare();
error LandRegistry__InsufficientShare(address holder, uint16 held, uint16 required);
error LandRegistry__ShareTotalMismatch(uint16 provided, uint16 expected);
error LandRegistry__PriceMustDecrease(uint256 currentPrice, uint256 attempted);
error LandRegistry__PriceExceedsMax(uint256 actualPrice, uint256 maxPrice);
error LandRegistry__ListingNotActive(string landId, address seller);
error LandRegistry__ListingExpired(string landId, address seller);
error LandRegistry__InsufficientPayment(uint256 sent, uint256 required);
error LandRegistry__SellerCannotBuy();
error LandRegistry__InheritanceArrayMismatch();
error LandRegistry__NoHeirs();
error LandRegistry__TooManyHeirs(uint256 provided, uint256 max);
error LandRegistry__TooManyShareholders(uint256 current, uint256 max);
error LandRegistry__DuplicateHeir(address heir);
error LandRegistry__HeirIsDeceased(address heir);
error LandRegistry__DeceasedHasNoShares(address deceased, string landId);
error LandRegistry__NoPendingPlan(string landId);
error LandRegistry__PlanAlreadyExecuted(string landId);
error LandRegistry__AlreadyVoted();
error LandRegistry__NotAnHeir(address caller);
error LandRegistry__LandNotDisputed(string landId);
error LandRegistry__NoBalance();
error LandRegistry__NoStrayBalance();
error LandRegistry__NftNonTransferable();

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
 * @title  LandRegistry (fractional-ownership v6)
 * @author LandLedger FYP Team
 *
 * @notice On-chain allotment registry. Each land is a unique ERC-721 whose
 *         tokenId persists for the lifetime of the parcel. **Ownership is
 *         fractional**: every land has 10,000 basis points (= 100%) of
 *         shares distributed among one or more holders. Direct transfers,
 *         marketplace sales, and inheritance all operate on basis-point
 *         shares of a single existing NFT — never on duplicate NFTs.
 *
 * @dev    WHY FRACTIONAL OWNERSHIP (v6 architectural rationale)
 *         --------------------------------------------------------------
 *         v5 and earlier modelled "one land = one owner" and handled
 *         inheritance by **burning the original NFT and minting a fresh
 *         NFT for each heir**. That model is conceptually wrong for at
 *         least three reasons:
 *
 *           1. **Inheritance does not physically subdivide land.** When
 *              an allottee dies leaving three children, those three
 *              children most commonly become CO-OWNERS of the same plot.
 *              They do not magically receive three new physically distinct
 *              plots. v5 forced subdivision-by-minting; v6 reflects what
 *              actually happens in DHA / Bahria / private-society
 *              succession cases.
 *
 *           2. **NFT identity continuity is lost on inheritance.** v5
 *              burned the original tokenId and assigned new IDs to heirs,
 *              breaking any external system that anchored on the original
 *              tokenId (provenance trackers, lien holders, indexers). v6
 *              keeps the same tokenId from mint to forever — heirs simply
 *              replace the deceased in the share ledger.
 *
 *           3. **The marketplace cannot express partial sales.** A holder
 *              who owns 100% of a plot but only wants to sell 30% had no
 *              way to express that in v5. v6 lists shares (in bps), so
 *              partial sales are first-class.
 *
 *         BASIS POINTS (bps) — 10,000 = 100%
 *         --------------------------------------------------------------
 *         We use uint16 basis points rather than percentages because:
 *
 *           • Solidity has no native fractional/decimal type — bps gives
 *             us 4 significant figures (0.01% resolution) using only
 *             integer math.
 *           • uint16 (max 65,535) comfortably fits TOTAL_SHARES = 10,000,
 *             so 16 bits per shareholder is enough — saves storage vs
 *             uint256 percentages.
 *           • Industry standard: every DeFi fee/share contract uses bps,
 *             so auditors and integrators recognise the pattern instantly.
 *
 *         NFT CUSTODY MODEL
 *         --------------------------------------------------------------
 *         The ERC-721 NFT for each land is **self-custodial**: it is
 *         minted to `address(this)` and never moves. `ownerOf(tokenId)`
 *         therefore returns the contract address itself. Meaningful
 *         ownership lives in the basis-point share ledger
 *         (`_shareBps[landId][holder]`), not in `ownerOf`. The `_update`
 *         override below enforces non-transferability — any attempt to
 *         move a land NFT off the registry reverts.
 *
 *         This trades external-marketplace visibility (OpenSea would see
 *         the contract as holder) for a coherent multi-owner model —
 *         appropriate for a closed governance-grade registry, which is
 *         what this contract is.
 *
 *         INVARIANTS (must hold for every ACTIVE land)
 *         --------------------------------------------------------------
 *           I1.  Σ _shareBps[landId][h] for h in _shareholders[landId]
 *                                                    == TOTAL_SHARES (10000)
 *           I2.  _shareBps[landId][h] > 0  ⇔  h ∈ _shareholders[landId]
 *           I3.  _shareholders[landId] contains no duplicates
 *           I4.  _shareholders[landId].length ≤ MAX_SHAREHOLDERS
 *           I5.  Every h ∈ _shareholders[landId] is an authorized holder
 *                (registered citizen OR govt-authority role)
 *
 *         All share-mutating helpers (`_increaseShare`, `_decreaseShare`)
 *         are written so that, applied in matched pairs (one decrease + one
 *         increase of the same amount), Σ shares is conserved. Inheritance
 *         executes its share redistribution under that same conservation
 *         rule (sum of heir shares == deceased's full share). The invariants
 *         therefore hold by construction.
 *
 *         SECURITY POSTURE (preserved from v5)
 *         --------------------------------------------------------------
 *         All of v5's hardening is retained: AccessControl with role
 *         separation (MINTER / INHERITANCE_ORACLE / DISPUTE_ARBITER),
 *         Pausable, ReentrancyGuard on every state-mutating external
 *         function that touches NFTs or ETH, pull-payment escrow with
 *         `_totalPendingWithdrawals` accounting, MAX_STRING_LENGTH input
 *         bounds, custom errors throughout, `Address.sendValue` for all
 *         outgoing transfers.
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

    /// @notice Lifecycle states.
    ///
    /// @dev    Note: v5 had a terminal `INHERITED` state because inheritance
    ///         burned the land NFT. v6 retains the land NFT through
    ///         inheritance — only the share ledger changes — so the only
    ///         lifecycle states needed are ACTIVE plus the two transient
    ///         locks. A land that has been inherited returns to ACTIVE with
    ///         a new set of shareholders.
    enum LandStatus {
        ACTIVE,
        PENDING_INHERITANCE,
        LOCKED_DISPUTE
    }

    /**
     * @notice On-chain record of a land parcel.
     *
     * @dev    v5 stored `currentOwner` and `cnic` on the record. v6 removes
     *         both — they don't have a single meaningful value once a land
     *         can have multiple co-owners with different CNICs. Look up
     *         shareholders via `getShareholders(landId)` and their CNICs
     *         via `getUser(holder).cnic` instead.
     */
    struct LandRecord {
        string landId;
        string ipfsHash; // ERC-721 metadata JSON CID
        LandType landType;
        LandStatus status;
        uint64 verifiedAt;
    }

    struct UserProfile {
        string name;
        string cnic;
        bool isRegistered;
    }

    /**
     * @notice One per (landId, seller) — a seller may list any portion of
     *         their share for sale at any time.
     *
     * @dev    `shareBpsForSale` is what the seller is offering; `price` is
     *         the total bundle price (not per-bps). Buyers pay this amount
     *         to acquire exactly that share.
     */
    struct Listing {
        uint16 shareBpsForSale;
        uint256 price;
        address seller;
        bool isActive;
        uint64 deadline;
        string metadataHash;
    }

    /**
     * @notice One row in a land's append-only ownership ledger.
     *
     * @dev    v5 logged ONE event per ownership change (a single owner
     *         replaces another). v6 logs one row per shareholder change so
     *         a single inheritance to N heirs writes N rows — every basis
     *         point of every transition is auditable.
     */
    struct OwnershipChange {
        address from; // address(0) for the initial mint
        address to;
        uint16 shareBps;
        uint64 timestamp;
        uint256 price; // 0 for non-sale events (mint, gift, inheritance)
    }

    /**
     * @notice An open succession proposal.
     *
     * @dev    v6 ENTIRELY redesigns inheritance:
     *
     *         • v5 fields `newLandIds[]` and `newIpfsHashes[]` are GONE —
     *           inheritance no longer mints new lands.
     *         • `deceasedHolder` is now explicit. The oracle identifies
     *           whose share is being redistributed (a land may have many
     *           co-owners; only one dies in a given proposal).
     *         • `heirShares[]` is parallel to `heirs[]` — basis points
     *           that MUST sum to the deceased's current share on this land.
     *           This preserves invariant I1.
     */
    struct InheritanceRequest {
        address deceasedHolder;
        address[] heirs;
        uint16[] heirShares;
        uint256 approvalCount;
        bool isExecuted;
        uint256 proposalNonce;
    }

    // ========================================================================
    // 8. STATE VARIABLES
    // ========================================================================

    // --- Roles (split for least privilege, retained from v5) -----------------
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant INHERITANCE_ORACLE_ROLE = keccak256("INHERITANCE_ORACLE_ROLE");
    bytes32 public constant DISPUTE_ARBITER_ROLE = keccak256("DISPUTE_ARBITER_ROLE");
    bytes32 public constant GOVT_AUTHORITY_ROLE = keccak256("GOVT_AUTHORITY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // --- Constants -----------------------------------------------------------

    /// @notice 100% expressed in basis points. Every land's total share
    ///         always equals this (invariant I1).
    uint16 public constant TOTAL_SHARES = 10_000;

    uint64 public constant LISTING_DURATION = 7 days;
    uint256 public constant MAX_HEIRS = 50;

    /// @notice Cap on simultaneous shareholders per land. Prevents an
    ///         attacker from chaining tiny transfers to bloat
    ///         `_shareholders[landId]` and grief subsequent enumerations.
    uint256 public constant MAX_SHAREHOLDERS = 100;

    uint256 public constant MAX_STRING_LENGTH = 256;

    // --- Identity ------------------------------------------------------------
    mapping(address => UserProfile) private _users;
    mapping(string => address) private _cnicToAddress;

    // --- Land core -----------------------------------------------------------
    mapping(string => LandRecord) private _landRecords;
    mapping(string => bool) private _landExists;
    mapping(uint256 => string) private _tokenIdToLandId;
    string[] private _allLandIds;

    // --- Share ledger (v6 core data structure) -------------------------------
    //
    // Three parallel structures:
    //   _shareholders[landId]                 ordered list (for enumeration)
    //   _shareBps[landId][holder]             O(1) share lookup
    //   _shareholderIndex[landId][holder]     O(1) position-in-list lookup
    //                                         (enables swap-and-pop removal)
    //
    // A holder is "present" on landId iff _shareBps[landId][holder] > 0
    // (invariant I2). The list and index are kept consistent with the bps
    // map by `_increaseShare` and `_decreaseShare`.
    mapping(string => address[]) private _shareholders;
    mapping(string => mapping(address => uint16)) private _shareBps;
    mapping(string => mapping(address => uint256)) private _shareholderIndex;

    // --- Reverse index: which lands does each holder have shares in? --------
    mapping(address => string[]) private _ownerToLands;
    mapping(address => mapping(string => uint256)) private _ownerLandIndex;

    // --- Ownership history --------------------------------------------------
    mapping(string => OwnershipChange[]) private _ownershipHistory;

    // --- Marketplace listings (one per (landId, seller)) ---------------------
    //
    // SECURITY: v5 keyed listings by landId alone — only one listing per land
    // was possible. With fractional ownership, multiple shareholders can each
    // list a portion of their share concurrently, so v6 keys by (landId, seller).
    mapping(string => mapping(address => Listing)) private _listings;

    // --- Inheritance --------------------------------------------------------
    mapping(string => InheritanceRequest) private _inheritanceRequests;
    mapping(string => mapping(uint256 => mapping(address => bool))) private _heirApproved;
    mapping(string => mapping(uint256 => mapping(address => bool))) private _isHeirFor;

    // --- Pull-payment escrow (retained from v5) ------------------------------
    mapping(address => uint256) private _pendingWithdrawals;
    uint256 private _totalPendingWithdrawals;

    // ========================================================================
    // 9. EVENTS
    // ========================================================================

    event UserRegistered(address indexed user, string name, string cnic);
    event LandMinted(
        address indexed initialOwner,
        string indexed landId,
        LandType lType,
        uint256 tokenId
    );

    // Share-ledger events ----------------------------------------------------
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
    event ListingPriceUpdated(
        string indexed landId,
        address indexed seller,
        uint256 oldPrice,
        uint256 newPrice
    );
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
    event InheritanceInitiated(
        string indexed landId,
        address indexed deceasedHolder,
        uint256 totalHeirs,
        uint16 deceasedShareBps,
        uint256 proposalNonce
    );
    event HeirApproved(string indexed landId, address indexed heir, uint256 proposalNonce);
    event InheritanceDisputed(string indexed landId, address indexed heir, uint256 proposalNonce);
    event InheritanceFinalized(string indexed landId, uint256 proposalNonce);
    event DisputeResolved(string indexed landId, bool forceExecuted);

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

    constructor(address backend) ERC721("PakLandRegistry", "PLR") {
        if (backend == address(0)) revert LandRegistry__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, backend);
        _grantRole(INHERITANCE_ORACLE_ROLE, backend);
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

    /// @notice Sweep stray ETH only — never seller balances.
    function emergencyWithdraw(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert LandRegistry__ZeroAddress();
        uint256 contractBalance = address(this).balance;
        uint256 stray = contractBalance > _totalPendingWithdrawals
            ? contractBalance - _totalPendingWithdrawals
            : 0;
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
    // 12.c Minter — issuance
    // ------------------------------------------------------------------------

    /**
     * @notice Mint a fresh land with a single initial owner holding 100%
     *         (TOTAL_SHARES bps). Subsequent transfers and inheritance
     *         redistribute that 100% among multiple holders without ever
     *         minting another NFT for the same parcel.
     *
     * @dev    The NFT is minted to `address(this)` (self-custody). The
     *         initial owner's 100% bps is recorded in the share ledger
     *         — that is the only meaningful ownership signal in v6.
     */
    function storeVerifiedLandRecord(
        address owner,
        string calldata landId,
        string calldata ipfsHash,
        LandType lType
    )
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
        nonReentrant
        boundedString(landId)
        boundedString(ipfsHash)
    {
        if (owner == address(0)) revert LandRegistry__ZeroAddress();
        if (!_isAuthorizedHolder(owner)) revert LandRegistry__NotAuthorizedHolder(owner);
        if (_landExists[landId]) revert LandRegistry__LandAlreadyExists(landId);

        _createLand(owner, landId, ipfsHash, lType);
    }

    // ------------------------------------------------------------------------
    // 12.d Share transfer (replaces v5's transferLandOwnership)
    // ------------------------------------------------------------------------

    /**
     * @notice Transfer `shareBps` basis points of `landId` from caller to
     *         `recipient`. Caller must hold at least `shareBps`. A holder
     *         transferring their entire share is automatically removed
     *         from the shareholder list.
     *
     * @dev    SECURITY:
     *         - `nonReentrant`: no external calls inside, but defensive in
     *           case a future change introduces one.
     *         - Pre-flight checks ensure the operation cannot half-apply
     *           (caller has enough, recipient is authorised, recipient is
     *           not the caller, recipient is non-zero).
     *         - Share conservation invariant I1 holds by construction
     *           (matched _decreaseShare + _increaseShare of equal amount).
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
    // 12.e Marketplace
    // ------------------------------------------------------------------------

    /**
     * @notice List a basis-point portion of caller's share for sale.
     *         Each (landId, seller) supports one active listing at a time;
     *         re-listing overwrites the previous one and resets the 7-day
     *         deadline.
     *
     * @dev    SECURITY:
     *         - Caller must currently hold at least `shareBpsForSale`. If
     *           the caller's share later drops below this (e.g., they
     *           transferred away after listing), `buyShare` will reject
     *           the purchase via its own share check — no payment to a
     *           seller who no longer owns the listed share.
     */
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

    /**
     * @notice Lower the price on an active listing without resetting the
     *         deadline. Raises are rejected — see security comment in v5.
     */
    function updateListingPrice(string calldata landId, uint256 newPrice) external whenNotPaused {
        if (newPrice == 0) revert LandRegistry__InvalidPrice();

        Listing storage listing = _listings[landId][msg.sender];
        if (!listing.isActive) revert LandRegistry__ListingNotActive(landId, msg.sender);
        if (newPrice >= listing.price) revert LandRegistry__PriceMustDecrease(listing.price, newPrice);

        uint256 oldPrice = listing.price;
        listing.price = newPrice;

        emit ListingPriceUpdated(landId, msg.sender, oldPrice, newPrice);
    }

    /// @notice Withdraw caller's own listing for a land.
    function cancelListing(string calldata landId) external whenNotPaused {
        if (!_listings[landId][msg.sender].isActive) revert LandRegistry__ListingNotActive(landId, msg.sender);

        delete _listings[landId][msg.sender];
        emit ListingCancelled(landId, msg.sender);
    }

    /**
     * @notice Buy the share that `seller` has listed against `landId`.
     *
     * @param  landId   Plot.
     * @param  seller   Address whose listing the buyer is purchasing.
     * @param  maxPrice Buyer's price ceiling (front-running protection).
     *
     * @dev    SECURITY:
     *         - `nonReentrant` + strict CEI: listing deleted and share
     *           ledger updated BEFORE any external interaction.
     *         - Pull-payment for seller proceeds (no push).
     *         - Excess-payment refund to buyer (push — buyer controls
     *           their own contract).
     *         - Seller's current share is re-verified at purchase time
     *           — stale listings (seller transferred away after listing)
     *           cannot result in payment for shares that don't exist.
     *         - `maxPrice` blocks seller-side front-running of price.
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
    // 12.f Inheritance — redistributes shares, never mints new lands
    // ------------------------------------------------------------------------

    /**
     * @notice Open a succession proposal that REDISTRIBUTES the deceased
     *         holder's shares across heirs. The land NFT does not move,
     *         the tokenId does not change, and the other shareholders'
     *         positions are unaffected.
     *
     * @dev    WHY THIS DESIGN
     *         --------------------------------------------------------
     *         v5's inheritance burned the original NFT and minted a fresh
     *         NFT per heir — modelling inheritance as forced subdivision.
     *         That misrepresents Pakistani succession law and most
     *         developer-society practice, which produces CO-OWNERS, not
     *         new plots. v6 reflects reality:
     *
     *           • The plot's identity (tokenId, landId, IPFS metadata)
     *             persists across inheritance — provenance trackers,
     *             liens, and indexers all keep working.
     *           • Heirs join the existing shareholder set; non-affected
     *             co-owners are completely untouched.
     *           • If heirs later want to physically subdivide, that is a
     *             separate, deliberate action — not a side-effect of death.
     *
     *         INPUT VALIDATION (DoS prevention)
     *         --------------------------------------------------------
     *         All inputs are pre-checked here so the final approving heir
     *         can never DoS the proposal at execution time:
     *           • deceasedHolder must currently own some share on landId
     *           • heirs[].length == heirShares[].length, 0 < length ≤ MAX_HEIRS
     *           • no heir is the deceased; no duplicate heirs; no zero
     *             addresses; no zero-bps heirShares
     *           • Σ heirShares == _shareBps[landId][deceasedHolder]
     *             (preserves invariant I1: total stays at 10,000)
     *           • every heir is an authorized holder
     *           • post-execution shareholder count would not exceed
     *             MAX_SHAREHOLDERS (prevents enumeration griefing)
     *
     *         The `proposalNonce` bumps on every call so a re-issued
     *         proposal (after a dispute reset) gets fresh per-heir vote
     *         and membership state.
     */
    function initiateInheritance(
        string calldata landId,
        address deceasedHolder,
        address[] calldata heirs,
        uint16[] calldata heirShares
    )
        external
        onlyRole(INHERITANCE_ORACLE_ROLE)
        whenNotPaused
        landMustExist(landId)
        onlyActive(landId)
    {
        _validateInheritanceInputs(landId, deceasedHolder, heirs, heirShares);

        InheritanceRequest storage req = _inheritanceRequests[landId];
        uint256 nonce = req.proposalNonce + 1;

        req.deceasedHolder = deceasedHolder;
        req.heirs = heirs;
        req.heirShares = heirShares;
        req.approvalCount = 0;
        req.isExecuted = false;
        req.proposalNonce = nonce;

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
            nonce
        );
        emit LandStatusChanged(landId, LandStatus.PENDING_INHERITANCE);
    }

    /// @notice Heir approves the open proposal. Auto-executes at 100% quorum.
    function approveSuccessionPlan(string calldata landId) external whenNotPaused nonReentrant {
        InheritanceRequest storage req = _inheritanceRequests[landId];
        if (_landRecords[landId].status != LandStatus.PENDING_INHERITANCE) {
            revert LandRegistry__NoPendingPlan(landId);
        }
        if (req.isExecuted) revert LandRegistry__PlanAlreadyExecuted(landId);

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

    /// @notice Single-heir veto. Permanent lock until arbiter resolves.
    function disputeSuccessionPlan(string calldata landId) external whenNotPaused {
        InheritanceRequest storage req = _inheritanceRequests[landId];
        if (_landRecords[landId].status != LandStatus.PENDING_INHERITANCE) {
            revert LandRegistry__NoPendingPlan(landId);
        }
        if (!_isHeirFor[landId][req.proposalNonce][msg.sender]) revert LandRegistry__NotAnHeir(msg.sender);

        _landRecords[landId].status = LandStatus.LOCKED_DISPUTE;
        emit InheritanceDisputed(landId, msg.sender, req.proposalNonce);
        emit LandStatusChanged(landId, LandStatus.LOCKED_DISPUTE);
    }

    /// @notice Arbiter escape hatch.
    function resolveDispute(
        string calldata landId,
        bool forceExecute
    ) external onlyRole(DISPUTE_ARBITER_ROLE) whenNotPaused nonReentrant {
        if (_landRecords[landId].status != LandStatus.LOCKED_DISPUTE) {
            revert LandRegistry__LandNotDisputed(landId);
        }

        if (forceExecute) {
            _executeInheritance(landId);
        } else {
            _landRecords[landId].status = LandStatus.ACTIVE;
            emit LandStatusChanged(landId, LandStatus.ACTIVE);
        }
        emit DisputeResolved(landId, forceExecute);
    }

    // ========================================================================
    // 13. INTERNAL / PRIVATE FUNCTIONS
    // ========================================================================

    /**
     * @dev OZ-5 transfer hook. The land NFTs in this contract are
     *      self-custodial — they are minted to `address(this)` and must
     *      never leave it (meaningful ownership lives in the share ledger).
     *      This override allows the initial mint (`from == address(0)`)
     *      and rejects every other transition.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(this)) {
            revert LandRegistry__NftNonTransferable();
        }
        return from;
    }

    /// @dev Execute the standing inheritance plan: decrement the deceased's
    ///      share to zero, distribute it across heirs. The land NFT and its
    ///      tokenId persist unchanged.
    function _executeInheritance(string calldata landId) private {
        InheritanceRequest storage req = _inheritanceRequests[landId];
        req.isExecuted = true;

        address deceased = req.deceasedHolder;
        uint16 deceasedShare = _shareBps[landId][deceased];

        // 1. Remove deceased's full share.
        _decreaseShare(landId, deceased, deceasedShare);

        // 2. Distribute to heirs.
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

        // 3. Return land to ACTIVE — it never had to leave existence.
        _landRecords[landId].status = LandStatus.ACTIVE;

        emit InheritanceFinalized(landId, req.proposalNonce);
        emit LandStatusChanged(landId, LandStatus.ACTIVE);
    }

    /// @dev Mint a new land at initial 100% ownership for `owner`.
    function _createLand(address owner, string calldata landId, string calldata ipfsHash, LandType lType) private {
        _landRecords[landId] = LandRecord({
            landId: landId,
            ipfsHash: ipfsHash,
            landType: lType,
            status: LandStatus.ACTIVE,
            verifiedAt: uint64(block.timestamp)
        });
        _landExists[landId] = true;
        _allLandIds.push(landId);

        uint256 tokenId = getTokenIdFromLandId(landId);
        _tokenIdToLandId[tokenId] = landId;

        // The NFT lives in this contract (self-custody — see _update override).
        _mint(address(this), tokenId);

        // Initial owner gets 100% of shares.
        _increaseShare(landId, owner, TOTAL_SHARES);

        _ownershipHistory[landId].push(
            OwnershipChange({
                from: address(0),
                to: owner,
                shareBps: TOTAL_SHARES,
                timestamp: uint64(block.timestamp),
                price: 0
            })
        );

        emit LandMinted(owner, landId, lType, tokenId);
    }

    /**
     * @dev Increase `holder`'s basis-point share of `landId` by `deltaBps`,
     *      maintaining the shareholder list + index mappings. If `holder`
     *      had zero share, they are appended to the shareholder list and
     *      their reverse-index entry created (preserving invariants I2-I5).
     *
     *      Caller is responsible for the matching `_decreaseShare` from
     *      another holder so that the total share invariant I1 is preserved.
     */
    function _increaseShare(string memory landId, address holder, uint16 deltaBps) private {
        uint16 currentBps = _shareBps[landId][holder];
        uint16 newBps = currentBps + deltaBps;
        _shareBps[landId][holder] = newBps;

        if (currentBps == 0) {
            // Cap shareholder enumeration to prevent griefing.
            uint256 count = _shareholders[landId].length;
            if (count >= MAX_SHAREHOLDERS) revert LandRegistry__TooManyShareholders(count, MAX_SHAREHOLDERS);

            _shareholderIndex[landId][holder] = count;
            _shareholders[landId].push(holder);
            _addToOwnerList(holder, landId);
            emit ShareholderAdded(landId, holder, deltaBps);
        }
    }

    /**
     * @dev Decrease `holder`'s basis-point share by `deltaBps`. If their
     *      remaining share drops to zero, they are removed from the
     *      shareholder list (swap-and-pop) and from the reverse owner
     *      index.
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

    /// @dev O(1) swap-and-pop removal from the per-land shareholder list.
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

    /// @dev Defensive O(1) swap-and-pop removal from the reverse owner index.
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

    /// @dev Pre-flight validation for `initiateInheritance`. O(n²) duplicate
    ///      check is fine because n ≤ MAX_HEIRS (50).
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

        // Bound the resulting shareholder count. Each heir who isn't already
        // a shareholder adds one entry; the deceased's removal subtracts one.
        // Worst case is all heirs new — count grows by (n - 1).
        uint256 currentHolders = _shareholders[landId].length;
        // Defensive upper-bound check (the actual delta may be smaller if some
        // heirs are existing shareholders).
        if (currentHolders + n > MAX_SHAREHOLDERS + 1) {
            revert LandRegistry__TooManyShareholders(currentHolders + n - 1, MAX_SHAREHOLDERS);
        }

        uint256 sumOfShares = 0;
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

            sumOfShares += share;
            unchecked {
                ++i;
            }
        }

        // Total share invariant: heir shares MUST sum to exactly the
        // deceased's current share. Anything else would break invariant I1.
        if (sumOfShares != uint256(deceasedShare)) {
            revert LandRegistry__ShareTotalMismatch(uint16(sumOfShares), deceasedShare);
        }
    }

    function _isAuthorizedHolder(address account) private view returns (bool) {
        return _users[account].isRegistered || hasRole(GOVT_AUTHORITY_ROLE, account);
    }

    // ========================================================================
    // 14. VIEW / PURE FUNCTIONS
    // ========================================================================

    /// @notice Deterministic tokenId — pure, free to call off-chain.
    function getTokenIdFromLandId(string memory landId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(landId)));
    }

    /// @inheritdoc ERC721
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory landId = _tokenIdToLandId[tokenId];
        return string(abi.encodePacked("ipfs://", _landRecords[landId].ipfsHash));
    }

    function getLandRecord(string calldata landId) external view returns (LandRecord memory) {
        return _landRecords[landId];
    }

    function getUser(address account) external view returns (UserProfile memory) {
        return _users[account];
    }

    /// @notice All current shareholders for `landId`. Order is not stable
    ///         across transfers (swap-and-pop removal may reorder).
    function getShareholders(string calldata landId) external view returns (address[] memory) {
        return _shareholders[landId];
    }

    /// @notice Combined view: shareholders and their basis-point shares,
    ///         in matching order. Convenient for frontend rendering.
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

    /// @notice O(1) share lookup for a single holder.
    function getShareBps(string calldata landId, address holder) external view returns (uint16) {
        return _shareBps[landId][holder];
    }

    /// @notice Computed sum of all shareholders' bps. For active lands
    ///         this should always equal TOTAL_SHARES (10,000) — exposed
    ///         as a sanity check / invariant assertion target.
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

    function getListing(string calldata landId, address seller) external view returns (Listing memory) {
        return _listings[landId][seller];
    }

    function getOwnershipHistory(string calldata landId) external view returns (OwnershipChange[] memory) {
        return _ownershipHistory[landId];
    }

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
            uint256 proposalNonce
        )
    {
        InheritanceRequest storage req = _inheritanceRequests[landId];
        return (
            req.deceasedHolder,
            req.heirs,
            req.heirShares,
            req.approvalCount,
            req.isExecuted,
            req.proposalNonce
        );
    }

    function hasHeirApproved(string calldata landId, address heir) external view returns (bool) {
        return _heirApproved[landId][_inheritanceRequests[landId].proposalNonce][heir];
    }

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

    /// @dev Required override when combining ERC721 with AccessControl.
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
