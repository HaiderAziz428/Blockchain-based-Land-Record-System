// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ============================================================================
// IMPORTS
// ----------------------------------------------------------------------------
// Battle-tested OpenZeppelin primitives only. No custom access-control,
// no custom pause logic, no hand-rolled reentrancy guard.
// ============================================================================

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ============================================================================
// CUSTOM ERRORS
// ----------------------------------------------------------------------------
// Custom errors save ~50 gas per revert vs. string reasons and give callers
// machine-parseable failure modes. Prefixed with the contract name to avoid
// collision when surfaced through tooling (Etherscan, Tenderly, etc.).
// ============================================================================

error LandRegistry__ZeroAddress();
error LandRegistry__EmptyString();
error LandRegistry__AlreadyRegistered(address account);
error LandRegistry__CnicAlreadyLinked(string cnic);
error LandRegistry__NotAuthorizedHolder(address account);
error LandRegistry__LandAlreadyExists(string landId);
error LandRegistry__LandNotFound(string landId);
error LandRegistry__LandNotActive(string landId);
error LandRegistry__NotLandOwner(address caller, string landId);
error LandRegistry__SelfTransfer();
error LandRegistry__InvalidPrice();
error LandRegistry__InvalidMetadata();
error LandRegistry__ListingNotActive(string landId);
error LandRegistry__ListingExpired(string landId);
error LandRegistry__InsufficientPayment(uint256 sent, uint256 required);
error LandRegistry__SellerCannotBuy();
error LandRegistry__InheritanceArrayMismatch();
error LandRegistry__NoHeirs();
error LandRegistry__TooManyHeirs(uint256 provided, uint256 max);
error LandRegistry__DuplicateHeir(address heir);
error LandRegistry__DuplicateNewLandId(string landId);
error LandRegistry__NoPendingPlan(string landId);
error LandRegistry__PlanAlreadyExecuted(string landId);
error LandRegistry__AlreadyVoted();
error LandRegistry__NotAnHeir(address caller);
error LandRegistry__LandNotDisputed(string landId);
error LandRegistry__EthTransferFailed();
error LandRegistry__NoBalance();

// ============================================================================
// INTERFACES
// ----------------------------------------------------------------------------
// None required externally — the contract exposes its API directly.
// Kept as a placeholder so the layout order is explicit.
// ============================================================================

// ============================================================================
// LIBRARIES
// ----------------------------------------------------------------------------
// None — keccak256 and the OZ primitives cover every utility we need.
// ============================================================================

// ============================================================================
// CONTRACT
// ============================================================================

/**
 * @title  LandRegistry
 * @author LandLedger FYP Team
 * @notice On-chain allotment registry for new Pakistani housing societies
 *         (DHA / Bahria / CDA / LDA / private). Each plot is a unique
 *         ERC-721; ownership transfers, marketplace sales, and multi-heir
 *         inheritance are all enforced by this contract. Off-chain documents
 *         (deed scans, listing photos, ERC-721 metadata JSON) are stored on
 *         IPFS and referenced by CID — only the CID lives on-chain.
 *
 * @dev    Architectural decisions:
 *
 *         1. **AccessControl over Ownable.** Three rotatable roles
 *            (DEFAULT_ADMIN, BACKEND, GOVT_AUTHORITY, PAUSER) replace the
 *            immutable `verificationBackend`. If the backend key is leaked
 *            the admin can rotate it without redeployment.
 *
 *         2. **Pausable + ReentrancyGuard.** Every user-facing write is
 *            `whenNotPaused`; the ETH-handling `buyLand` is also
 *            `nonReentrant`. The admin can pause in case of an active
 *            exploit while preserving read access.
 *
 *         3. **State machine.** `LandStatus` is a strict 4-state machine:
 *            ACTIVE ⇄ PENDING_INHERITANCE ⇄ LOCKED_DISPUTE → INHERITED
 *            (terminal). All transfer / list / buy functions are gated on
 *            ACTIVE via the `onlyActive` modifier.
 *
 *         4. **Inheritance proposal nonce.** Each `initiateInheritance` for
 *            a given landId increments a per-land `proposalNonce`. Heir
 *            membership and votes are scoped to that nonce, so a corrected
 *            proposal after a dispute reset gets fresh voting state.
 *
 *         5. **Listing auto-clear on transfer.** `_update` is overridden so
 *            any active listing is wiped automatically when the underlying
 *            NFT moves — eliminating the "stale listing after direct
 *            transfer" foot-gun.
 *
 *         6. **Excess-payment refund.** `buyLand` accepts `msg.value >=
 *            listing.price` and refunds the excess so over-payments are
 *            never stuck in the contract.
 *
 *         7. **Owner-list cleanup on inheritance.** `_executeInheritance`
 *            now removes the burned land from the deceased's owner index,
 *            so per-wallet portfolio reads stay consistent.
 *
 *         8. **Pre-validation of inheritance inputs.** Duplicate heirs,
 *            duplicate new-landIds, collisions with existing landIds, and
 *            unregistered heirs are rejected at `initiate` time — so the
 *            final vote can never DoS the proposal.
 *
 *         9. **CNIC privacy caveat.** CNICs are stored as plaintext strings.
 *            On a public chain that is by definition globally readable;
 *            a production deployment should use a hash commitment or a
 *            zero-knowledge proof. Documented, not fixed at this layer.
 */
contract LandRegistry is ERC721, AccessControl, Pausable, ReentrancyGuard {
    // ========================================================================
    // 7. TYPE DECLARATIONS
    // ========================================================================

    /// @notice Coarse-grained plot category. Fine-grained subtypes live in
    ///         the off-chain ERC-721 metadata JSON.
    enum LandType {
        RESIDENTIAL,
        AGRICULTURAL,
        COMMERCIAL
    }

    /// @notice On-chain lifecycle of a plot. `INHERITED` is terminal —
    ///         the landId persists for history but the NFT is burned.
    enum LandStatus {
        ACTIVE,
        PENDING_INHERITANCE,
        LOCKED_DISPUTE,
        INHERITED
    }

    /// @notice Canonical ownership record. `cnic` is denormalised onto the
    ///         record so verification reads (the hot path) don't have to
    ///         re-traverse `users[currentOwner]`.
    struct LandRecord {
        address currentOwner;
        string cnic;
        string landId;
        string ipfsHash; // ERC-721 metadata JSON CID
        LandType landType;
        LandStatus status;
        uint64 verifiedAt;
    }

    /// @notice Real-world identity bound to a wallet.
    struct UserProfile {
        string name;
        string cnic;
        bool isRegistered;
    }

    /// @notice Time-locked marketplace listing. `metadataHash` is the
    ///         IPFS CID of the listing JSON (photos, description, contact).
    struct Listing {
        uint256 price;
        address seller;
        bool isActive;
        uint64 deadline;
        string metadataHash;
    }

    /// @notice Append-only entry in the per-land transfer log. `price = 0`
    ///         denotes a non-sale event (initial mint, inheritance, gift).
    struct OwnershipHistory {
        address owner;
        uint64 timestamp;
        uint256 price;
    }

    /// @notice Open succession proposal. The internal vote and heir-membership
    ///         maps are stored externally (keyed by `proposalNonce`) so a
    ///         re-issued proposal after a dispute reset gets fresh state.
    struct InheritanceRequest {
        address[] heirs;
        string[] newLandIds;
        string[] newIpfsHashes;
        uint256 approvalCount;
        bool isExecuted;
        uint256 proposalNonce;
    }

    // ========================================================================
    // 8. STATE VARIABLES
    // ========================================================================

    // --- Roles ---------------------------------------------------------------
    /// @notice The verification backend (developer's transfer office). Can
    ///         mint, initiate inheritance, and resolve disputes.
    bytes32 public constant BACKEND_ROLE = keccak256("BACKEND_ROLE");
    /// @notice Whitelisted institutional wallets (developer entities, govt
    ///         authorities). Can hold land without a personal CNIC.
    bytes32 public constant GOVT_AUTHORITY_ROLE = keccak256("GOVT_AUTHORITY_ROLE");
    /// @notice Holders of this role may pause/unpause all user-facing writes.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // --- Constants -----------------------------------------------------------
    /// @notice Marketplace listings auto-expire after this window.
    uint64 public constant LISTING_DURATION = 7 days;
    /// @notice Hard cap on heirs per proposal — bounds the O(n²) duplicate
    ///         check at initiate time and the O(n) mint loop at execute time.
    uint256 public constant MAX_HEIRS = 50;

    // --- Identity module -----------------------------------------------------
    mapping(address => UserProfile) private _users;
    mapping(string => address) private _cnicToAddress; // reverse lookup

    // --- Land data module ----------------------------------------------------
    mapping(string => LandRecord) private _landRecords;
    mapping(string => OwnershipHistory[]) private _ownershipHistory;
    mapping(string => bool) private _landExists;

    // --- NFT optimisation module --------------------------------------------
    mapping(uint256 => string) private _tokenIdToLandId;

    // --- Indexing module -----------------------------------------------------
    string[] private _allLandIds;
    mapping(address => string[]) private _ownerToLands;
    mapping(address => mapping(string => uint256)) private _ownerLandIndex;

    // --- Marketplace module --------------------------------------------------
    mapping(string => Listing) private _landListings;

    // --- Inheritance module --------------------------------------------------
    mapping(string => InheritanceRequest) private _inheritanceRequests;
    // landId => proposalNonce => heir => true   (vote ledger)
    mapping(string => mapping(uint256 => mapping(address => bool))) private _heirApproved;
    // landId => proposalNonce => heir => true   (membership ledger — replaces
    // the per-vote O(n) linear scan in the original implementation)
    mapping(string => mapping(uint256 => mapping(address => bool))) private _isHeirFor;

    // ========================================================================
    // 9. EVENTS
    // ========================================================================

    event UserRegistered(address indexed user, string name, string cnic);
    event LandMinted(address indexed owner, string indexed landId, LandType lType, uint256 tokenId);
    event LandTransferred(string indexed landId, address indexed from, address indexed to, uint256 price);
    event LandListed(string indexed landId, uint256 price, address indexed seller, string metadataHash);
    event ListingPriceUpdated(string indexed landId, uint256 oldPrice, uint256 newPrice);
    event ListingCancelled(string indexed landId);
    event LandSold(string indexed landId, address indexed buyer, address indexed seller, uint256 price);
    event InheritanceInitiated(string indexed oldLandId, uint256 totalHeirs, uint256 proposalNonce);
    event HeirApproved(string indexed oldLandId, address indexed heir, uint256 proposalNonce);
    event InheritanceDisputed(string indexed oldLandId, address indexed heir, uint256 proposalNonce);
    event InheritanceFinalized(string indexed oldLandId, uint256 proposalNonce);
    event DisputeResolved(string indexed oldLandId, bool forceExecuted);
    event LandStatusChanged(string indexed landId, LandStatus status);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    // ========================================================================
    // 10. MODIFIERS
    // ========================================================================

    /// @dev Reverts if the land has never been minted.
    modifier landMustExist(string calldata landId) {
        if (!_landExists[landId]) revert LandRegistry__LandNotFound(landId);
        _;
    }

    /// @dev Reverts unless the land is in the `ACTIVE` lifecycle state.
    ///      Used on every state-changing user action (transfer, list, buy).
    modifier onlyActive(string calldata landId) {
        if (_landRecords[landId].status != LandStatus.ACTIVE) revert LandRegistry__LandNotActive(landId);
        _;
    }

    /// @dev Rejects empty calldata strings.
    modifier nonEmptyString(string calldata s) {
        if (bytes(s).length == 0) revert LandRegistry__EmptyString();
        _;
    }

    // ========================================================================
    // 11. CONSTRUCTOR
    // ========================================================================

    /**
     * @param backend Address that will be granted `BACKEND_ROLE` — the
     *                wallet the off-chain verification server signs with.
     *                Deployer (`msg.sender`) becomes the default admin and
     *                initial pauser. Both roles are rotatable post-deploy.
     */
    constructor(address backend) ERC721("PakLandRegistry", "PLR") {
        if (backend == address(0)) revert LandRegistry__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(BACKEND_ROLE, backend);
    }

    // ========================================================================
    // 12. EXTERNAL / PUBLIC FUNCTIONS
    // ========================================================================

    // ------------------------------------------------------------------------
    // 12.a Admin — pause / role / emergency
    // ------------------------------------------------------------------------

    /// @notice Pause every user-facing write. Reads remain available.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resume normal operation after a pause.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Grant or revoke the institutional `GOVT_AUTHORITY_ROLE`.
     *         Authority wallets can receive and transfer land without a
     *         personal CNIC (CDA/DHA/private-developer entity wallets).
     */
    function setGovtAuthority(address wallet, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (wallet == address(0)) revert LandRegistry__ZeroAddress();
        if (status) {
            _grantRole(GOVT_AUTHORITY_ROLE, wallet);
        } else {
            _revokeRole(GOVT_AUTHORITY_ROLE, wallet);
        }
        // AccessControl emits RoleGranted / RoleRevoked — no extra event needed.
    }

    /**
     * @notice Sweep any stray ETH that lands in the contract. Should never
     *         be required in normal operation — `buyLand` refunds overpays
     *         and forwards the price to the seller. Present as a strict
     *         safety net.
     */
    function emergencyWithdraw(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert LandRegistry__ZeroAddress();
        uint256 balance = address(this).balance;
        if (balance == 0) revert LandRegistry__NoBalance();

        (bool ok, ) = to.call{value: balance}("");
        if (!ok) revert LandRegistry__EthTransferFailed();

        emit EmergencyWithdrawal(to, balance);
    }

    // ------------------------------------------------------------------------
    // 12.b Identity
    // ------------------------------------------------------------------------

    /**
     * @notice Bind the caller's wallet to a real-world identity.
     * @param  name Full legal name as it appears on the CNIC.
     * @param  cnic National ID number — globally unique inside this contract.
     */
    function registerUser(
        string calldata name,
        string calldata cnic
    ) external whenNotPaused nonEmptyString(name) nonEmptyString(cnic) {
        if (_users[msg.sender].isRegistered) revert LandRegistry__AlreadyRegistered(msg.sender);
        if (_cnicToAddress[cnic] != address(0)) revert LandRegistry__CnicAlreadyLinked(cnic);

        _users[msg.sender] = UserProfile({name: name, cnic: cnic, isRegistered: true});
        _cnicToAddress[cnic] = msg.sender;

        emit UserRegistered(msg.sender, name, cnic);
    }

    // ------------------------------------------------------------------------
    // 12.c Backend — minting
    // ------------------------------------------------------------------------

    /**
     * @notice Mint a fresh land NFT for a verified citizen or govt authority.
     *         Off-chain the backend has already cross-checked the developer's
     *         allotment registry against the recipient's CNIC. On-chain we
     *         only enforce uniqueness and authorisation.
     */
    function storeVerifiedLandRecord(
        address owner,
        string calldata landId,
        string calldata ipfsHash,
        LandType lType
    )
        external
        onlyRole(BACKEND_ROLE)
        whenNotPaused
        nonEmptyString(landId)
        nonEmptyString(ipfsHash)
    {
        if (owner == address(0)) revert LandRegistry__ZeroAddress();
        if (!_isAuthorizedHolder(owner)) revert LandRegistry__NotAuthorizedHolder(owner);
        if (_landExists[landId]) revert LandRegistry__LandAlreadyExists(landId);

        _mintLand(owner, landId, ipfsHash, lType);
    }

    // ------------------------------------------------------------------------
    // 12.d Direct transfer (off-marketplace)
    // ------------------------------------------------------------------------

    /**
     * @notice Peer-to-peer transfer with an on-chain sale-price log. Used
     *         for off-marketplace deals (gifts, family transfers, OTC
     *         settlements) so the audit trail remains complete.
     */
    function transferLandOwnership(
        string calldata landId,
        address newOwner,
        uint256 salePrice
    ) external whenNotPaused landMustExist(landId) onlyActive(landId) {
        if (newOwner == address(0)) revert LandRegistry__ZeroAddress();
        if (newOwner == msg.sender) revert LandRegistry__SelfTransfer();

        uint256 tokenId = getTokenIdFromLandId(landId);
        if (ownerOf(tokenId) != msg.sender) revert LandRegistry__NotLandOwner(msg.sender, landId);
        if (!_isAuthorizedHolder(newOwner)) revert LandRegistry__NotAuthorizedHolder(newOwner);

        // --- Effects -------------------------------------------------------
        LandRecord storage record = _landRecords[landId];
        record.currentOwner = newOwner;
        record.cnic = _cnicFor(newOwner);

        _removeFromOwnerList(msg.sender, landId);
        _addToOwnerList(newOwner, landId);
        _ownershipHistory[landId].push(
            OwnershipHistory({owner: newOwner, timestamp: uint64(block.timestamp), price: salePrice})
        );

        // --- Interaction (NFT move) ---------------------------------------
        // `_update` override below auto-clears any stale listing.
        _safeTransfer(msg.sender, newOwner, tokenId, "");

        emit LandTransferred(landId, msg.sender, newOwner, salePrice);
    }

    // ------------------------------------------------------------------------
    // 12.e Marketplace
    // ------------------------------------------------------------------------

    /**
     * @notice List a plot for sale. Resets the 7-day deadline. Overwrites
     *         any existing listing by the current owner.
     */
    function listLandForSale(
        string calldata landId,
        uint256 price,
        string calldata metadataHash
    ) external whenNotPaused landMustExist(landId) onlyActive(landId) nonEmptyString(metadataHash) {
        if (price == 0) revert LandRegistry__InvalidPrice();

        uint256 tokenId = getTokenIdFromLandId(landId);
        if (ownerOf(tokenId) != msg.sender) revert LandRegistry__NotLandOwner(msg.sender, landId);

        _landListings[landId] = Listing({
            price: price,
            seller: msg.sender,
            isActive: true,
            deadline: uint64(block.timestamp) + LISTING_DURATION,
            metadataHash: metadataHash
        });

        emit LandListed(landId, price, msg.sender, metadataHash);
    }

    /**
     * @notice Adjust price of an active listing without resetting its
     *         7-day deadline. Caller must be the current seller.
     */
    function updateListingPrice(string calldata landId, uint256 newPrice) external whenNotPaused {
        if (newPrice == 0) revert LandRegistry__InvalidPrice();

        Listing storage listing = _landListings[landId];
        if (!listing.isActive) revert LandRegistry__ListingNotActive(landId);
        if (listing.seller != msg.sender) revert LandRegistry__NotLandOwner(msg.sender, landId);

        uint256 oldPrice = listing.price;
        listing.price = newPrice;

        emit ListingPriceUpdated(landId, oldPrice, newPrice);
    }

    /**
     * @notice Purchase a listed plot. Buyer must be a registered citizen or
     *         a govt-authority wallet (institutional buyers — corporates,
     *         trusts — can buy through the marketplace, unlike the original
     *         implementation which excluded them).
     *
     * @dev    Strict CEI:
     *         1. Read listing into memory.
     *         2. Validate.
     *         3. Clear listing + update records (effects).
     *         4. Transfer NFT, forward funds, refund excess (interactions).
     *         `nonReentrant` is belt-and-suspenders — the storage is already
     *         cleared before any external call.
     */
    function buyLand(
        string calldata landId
    ) external payable whenNotPaused nonReentrant landMustExist(landId) onlyActive(landId) {
        if (!_isAuthorizedHolder(msg.sender)) revert LandRegistry__NotAuthorizedHolder(msg.sender);

        Listing memory listing = _landListings[landId];
        if (!listing.isActive) revert LandRegistry__ListingNotActive(landId);
        if (block.timestamp > listing.deadline) revert LandRegistry__ListingExpired(landId);
        if (msg.value < listing.price) revert LandRegistry__InsufficientPayment(msg.value, listing.price);
        if (msg.sender == listing.seller) revert LandRegistry__SellerCannotBuy();

        uint256 tokenId = getTokenIdFromLandId(landId);
        address seller = listing.seller;
        uint256 price = listing.price;

        // --- Effects (CEI) -------------------------------------------------
        delete _landListings[landId];

        LandRecord storage record = _landRecords[landId];
        record.currentOwner = msg.sender;
        record.cnic = _cnicFor(msg.sender);

        _removeFromOwnerList(seller, landId);
        _addToOwnerList(msg.sender, landId);
        _ownershipHistory[landId].push(
            OwnershipHistory({owner: msg.sender, timestamp: uint64(block.timestamp), price: price})
        );

        // --- Interactions --------------------------------------------------
        // `_update` override sees the listing already cleared → no-op.
        _safeTransfer(seller, msg.sender, tokenId, "");

        (bool paid, ) = payable(seller).call{value: price}("");
        if (!paid) revert LandRegistry__EthTransferFailed();

        uint256 excess = msg.value - price;
        if (excess > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            if (!refunded) revert LandRegistry__EthTransferFailed();
        }

        emit LandSold(landId, msg.sender, seller, price);
    }

    /// @notice Cancel an active listing. Caller must be the current NFT owner.
    function cancelListing(string calldata landId) external whenNotPaused {
        uint256 tokenId = getTokenIdFromLandId(landId);
        if (ownerOf(tokenId) != msg.sender) revert LandRegistry__NotLandOwner(msg.sender, landId);
        if (!_landListings[landId].isActive) revert LandRegistry__ListingNotActive(landId);

        delete _landListings[landId];
        emit ListingCancelled(landId);
    }

    // ------------------------------------------------------------------------
    // 12.f Inheritance
    // ------------------------------------------------------------------------

    /**
     * @notice Open a succession proposal. The plot is locked into
     *         `PENDING_INHERITANCE` until every named heir approves (auto-
     *         executes on the final vote) or any heir disputes (locks into
     *         `LOCKED_DISPUTE` for backend resolution).
     *
     * @dev    Inputs are *fully* pre-validated here so the last vote can
     *         never DoS the proposal:
     *           - arrays are equal length and non-empty (≤ MAX_HEIRS)
     *           - no zero-address, no duplicate, no unauthorized heirs
     *           - every newLandId is non-empty, unique within the batch,
     *             and does not collide with any existing land
     *           - every newIpfsHash is non-empty
     *         A `proposalNonce` is bumped on each call so re-issued plans
     *         (after a dispute reset) get fresh per-heir vote state.
     */
    function initiateInheritance(
        string calldata oldLandId,
        address[] calldata heirs,
        string[] calldata newLandIds,
        string[] calldata newIpfsHashes
    ) external onlyRole(BACKEND_ROLE) whenNotPaused landMustExist(oldLandId) onlyActive(oldLandId) {
        _validateInheritanceInputs(heirs, newLandIds, newIpfsHashes);

        InheritanceRequest storage req = _inheritanceRequests[oldLandId];
        uint256 nonce = req.proposalNonce + 1;

        req.heirs = heirs;
        req.newLandIds = newLandIds;
        req.newIpfsHashes = newIpfsHashes;
        req.approvalCount = 0;
        req.isExecuted = false;
        req.proposalNonce = nonce;

        uint256 n = heirs.length;
        for (uint256 i = 0; i < n; ) {
            _isHeirFor[oldLandId][nonce][heirs[i]] = true;
            unchecked {
                ++i;
            }
        }

        _landRecords[oldLandId].status = LandStatus.PENDING_INHERITANCE;

        emit InheritanceInitiated(oldLandId, n, nonce);
        emit LandStatusChanged(oldLandId, LandStatus.PENDING_INHERITANCE);
    }

    /**
     * @notice Cast a yes-vote on the open proposal for `oldLandId`.
     *         When `approvalCount == heirs.length`, execution fires inline.
     */
    function approveSuccessionPlan(string calldata oldLandId) external whenNotPaused {
        InheritanceRequest storage req = _inheritanceRequests[oldLandId];
        if (_landRecords[oldLandId].status != LandStatus.PENDING_INHERITANCE) {
            revert LandRegistry__NoPendingPlan(oldLandId);
        }
        if (req.isExecuted) revert LandRegistry__PlanAlreadyExecuted(oldLandId);

        uint256 nonce = req.proposalNonce;
        if (!_isHeirFor[oldLandId][nonce][msg.sender]) revert LandRegistry__NotAnHeir(msg.sender);
        if (_heirApproved[oldLandId][nonce][msg.sender]) revert LandRegistry__AlreadyVoted();

        _heirApproved[oldLandId][nonce][msg.sender] = true;
        uint256 newCount = req.approvalCount + 1;
        req.approvalCount = newCount;

        emit HeirApproved(oldLandId, msg.sender, nonce);

        if (newCount == req.heirs.length) {
            _executeInheritance(oldLandId);
        }
    }

    /**
     * @notice A single heir's dispute permanently locks the plot into
     *         `LOCKED_DISPUTE` until backend `resolveDispute` is called.
     */
    function disputeSuccessionPlan(string calldata oldLandId) external whenNotPaused {
        InheritanceRequest storage req = _inheritanceRequests[oldLandId];
        if (_landRecords[oldLandId].status != LandStatus.PENDING_INHERITANCE) {
            revert LandRegistry__NoPendingPlan(oldLandId);
        }

        if (!_isHeirFor[oldLandId][req.proposalNonce][msg.sender]) revert LandRegistry__NotAnHeir(msg.sender);

        _landRecords[oldLandId].status = LandStatus.LOCKED_DISPUTE;

        emit InheritanceDisputed(oldLandId, msg.sender, req.proposalNonce);
        emit LandStatusChanged(oldLandId, LandStatus.LOCKED_DISPUTE);
    }

    /**
     * @notice Backend escape hatch for a locked dispute. Either force-
     *         executes the standing plan (after off-chain legal mediation)
     *         or reverts the plot to `ACTIVE` so a corrected plan can be
     *         filed via a fresh `initiateInheritance` call.
     */
    function resolveDispute(
        string calldata oldLandId,
        bool forceExecute
    ) external onlyRole(BACKEND_ROLE) whenNotPaused {
        if (_landRecords[oldLandId].status != LandStatus.LOCKED_DISPUTE) {
            revert LandRegistry__LandNotDisputed(oldLandId);
        }

        if (forceExecute) {
            _executeInheritance(oldLandId);
        } else {
            _landRecords[oldLandId].status = LandStatus.ACTIVE;
            emit LandStatusChanged(oldLandId, LandStatus.ACTIVE);
        }

        emit DisputeResolved(oldLandId, forceExecute);
    }

    // ========================================================================
    // 13. INTERNAL / PRIVATE FUNCTIONS
    // ========================================================================

    /**
     * @dev OZ-5 transfer hook. Runs on every NFT movement (mint, burn,
     *      transfer). We use it to wipe any active marketplace listing the
     *      moment the underlying NFT moves — closing the "Alice listed, then
     *      transferred to Bob, then Eve bought from Alice's stale listing"
     *      foot-gun.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        // Only react to transfers/burns; mints (from == 0) have no listing.
        if (from != address(0)) {
            string memory landId = _tokenIdToLandId[tokenId];
            if (bytes(landId).length != 0 && _landListings[landId].isActive) {
                delete _landListings[landId];
                emit ListingCancelled(landId);
            }
        }
        return from;
    }

    /// @dev Executes the standing inheritance plan: burns old NFT, marks
    ///      the old land `INHERITED`, mints fresh NFTs for each heir.
    function _executeInheritance(string calldata oldLandId) private {
        InheritanceRequest storage req = _inheritanceRequests[oldLandId];
        req.isExecuted = true;

        LandRecord storage oldRecord = _landRecords[oldLandId];
        LandType lType = oldRecord.landType;
        address oldOwner = oldRecord.currentOwner;

        // 1. Burn old NFT
        uint256 oldTokenId = getTokenIdFromLandId(oldLandId);
        _burn(oldTokenId);
        delete _tokenIdToLandId[oldTokenId];

        // 2. Clean up the deceased's owner index (bug-fix vs. original)
        _removeFromOwnerList(oldOwner, oldLandId);

        // 3. Mark old land as terminal
        oldRecord.currentOwner = address(0);
        oldRecord.status = LandStatus.INHERITED;

        // 4. Mint fresh land for each heir
        uint256 n = req.heirs.length;
        for (uint256 i = 0; i < n; ) {
            _mintLand(req.heirs[i], req.newLandIds[i], req.newIpfsHashes[i], lType);
            unchecked {
                ++i;
            }
        }

        emit InheritanceFinalized(oldLandId, req.proposalNonce);
        emit LandStatusChanged(oldLandId, LandStatus.INHERITED);
    }

    /// @dev Shared mint path. Used by both `storeVerifiedLandRecord` and
    ///      `_executeInheritance` so all minted land takes the same code
    ///      path through indexing, history seeding, and NFT issuance.
    function _mintLand(address owner, string memory landId, string memory ipfsHash, LandType lType) private {
        if (_landExists[landId]) revert LandRegistry__LandAlreadyExists(landId);

        _landRecords[landId] = LandRecord({
            currentOwner: owner,
            cnic: _cnicFor(owner),
            landId: landId,
            ipfsHash: ipfsHash,
            landType: lType,
            status: LandStatus.ACTIVE,
            verifiedAt: uint64(block.timestamp)
        });
        _landExists[landId] = true;
        _allLandIds.push(landId);
        _addToOwnerList(owner, landId);
        _ownershipHistory[landId].push(
            OwnershipHistory({owner: owner, timestamp: uint64(block.timestamp), price: 0})
        );

        uint256 tokenId = getTokenIdFromLandId(landId);
        _tokenIdToLandId[tokenId] = landId;
        _safeMint(owner, tokenId);

        emit LandMinted(owner, landId, lType, tokenId);
    }

    /// @dev Pre-flight validation for `initiateInheritance`. O(n²) duplicate
    ///      check is fine because `n <= MAX_HEIRS == 50`.
    function _validateInheritanceInputs(
        address[] calldata heirs,
        string[] calldata newLandIds,
        string[] calldata newIpfsHashes
    ) private view {
        uint256 n = heirs.length;
        if (n == 0) revert LandRegistry__NoHeirs();
        if (n > MAX_HEIRS) revert LandRegistry__TooManyHeirs(n, MAX_HEIRS);
        if (newLandIds.length != n || newIpfsHashes.length != n) revert LandRegistry__InheritanceArrayMismatch();

        for (uint256 i = 0; i < n; ) {
            address heir = heirs[i];
            if (heir == address(0)) revert LandRegistry__ZeroAddress();
            if (!_isAuthorizedHolder(heir)) revert LandRegistry__NotAuthorizedHolder(heir);
            if (bytes(newLandIds[i]).length == 0 || bytes(newIpfsHashes[i]).length == 0) {
                revert LandRegistry__EmptyString();
            }
            if (_landExists[newLandIds[i]]) revert LandRegistry__LandAlreadyExists(newLandIds[i]);

            for (uint256 j = i + 1; j < n; ) {
                if (heirs[j] == heir) revert LandRegistry__DuplicateHeir(heir);
                if (keccak256(bytes(newLandIds[j])) == keccak256(bytes(newLandIds[i]))) {
                    revert LandRegistry__DuplicateNewLandId(newLandIds[i]);
                }
                unchecked {
                    ++j;
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    /// @dev O(1) append to per-owner index.
    function _addToOwnerList(address owner, string memory landId) private {
        _ownerToLands[owner].push(landId);
        _ownerLandIndex[owner][landId] = _ownerToLands[owner].length - 1;
    }

    /// @dev O(1) swap-and-pop removal from per-owner index. Defensive: a
    ///      no-op if the owner doesn't actually hold the land (guards
    ///      against accidental misuse during inheritance / re-org edge
    ///      cases).
    function _removeFromOwnerList(address owner, string memory landId) private {
        uint256 len = _ownerToLands[owner].length;
        if (len == 0) return;

        uint256 idx = _ownerLandIndex[owner][landId];
        // Defensive guard: index 0 could be a default value rather than a
        // genuine entry. Cross-check by hash.
        if (idx >= len || keccak256(bytes(_ownerToLands[owner][idx])) != keccak256(bytes(landId))) return;

        if (idx != len - 1) {
            string memory lastId = _ownerToLands[owner][len - 1];
            _ownerToLands[owner][idx] = lastId;
            _ownerLandIndex[owner][lastId] = idx;
        }
        _ownerToLands[owner].pop();
        delete _ownerLandIndex[owner][landId];
    }

    /// @dev True if the address is a registered citizen or holds the
    ///      institutional `GOVT_AUTHORITY_ROLE`.
    function _isAuthorizedHolder(address account) private view returns (bool) {
        return _users[account].isRegistered || hasRole(GOVT_AUTHORITY_ROLE, account);
    }

    /// @dev CNIC string to denormalise onto a land record. Returns the
    ///      sentinel `"GOVT"` for institutional holders.
    function _cnicFor(address account) private view returns (string memory) {
        return _users[account].isRegistered ? _users[account].cnic : "GOVT";
    }

    // ========================================================================
    // 14. VIEW / PURE FUNCTIONS
    // ========================================================================

    /// @notice Deterministic token-id derivation. Pure → free to call.
    function getTokenIdFromLandId(string memory landId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(landId)));
    }

    /// @inheritdoc ERC721
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory landId = _tokenIdToLandId[tokenId];
        return string(abi.encodePacked("ipfs://", _landRecords[landId].ipfsHash));
    }

    /// @notice Full on-chain record for a land.
    function getLandRecord(string calldata landId) external view returns (LandRecord memory) {
        return _landRecords[landId];
    }

    /// @notice User profile for a wallet.
    function getUser(address account) external view returns (UserProfile memory) {
        return _users[account];
    }

    /// @notice Marketplace listing for a land.
    function getListing(string calldata landId) external view returns (Listing memory) {
        return _landListings[landId];
    }

    /// @notice Full ownership timeline for a land.
    function getOwnershipHistory(string calldata landId) external view returns (OwnershipHistory[] memory) {
        return _ownershipHistory[landId];
    }

    /// @notice Open inheritance proposal for a land (returns parallel arrays
    ///         rather than the struct because the struct itself is private).
    function getInheritanceRequest(
        string calldata oldLandId
    )
        external
        view
        returns (
            address[] memory heirs,
            string[] memory newLandIds,
            string[] memory newIpfsHashes,
            uint256 approvalCount,
            bool isExecuted,
            uint256 proposalNonce
        )
    {
        InheritanceRequest storage req = _inheritanceRequests[oldLandId];
        return (req.heirs, req.newLandIds, req.newIpfsHashes, req.approvalCount, req.isExecuted, req.proposalNonce);
    }

    /// @notice Has `heir` voted yes on the current proposal for `oldLandId`?
    function hasHeirApproved(string calldata oldLandId, address heir) external view returns (bool) {
        return _heirApproved[oldLandId][_inheritanceRequests[oldLandId].proposalNonce][heir];
    }

    /// @notice True if the address holds the `GOVT_AUTHORITY_ROLE`.
    function isGovtAuthority(address account) external view returns (bool) {
        return hasRole(GOVT_AUTHORITY_ROLE, account);
    }

    /// @notice Resolve a wallet from its CNIC.
    function cnicToAddress(string calldata cnic) external view returns (address) {
        return _cnicToAddress[cnic];
    }

    /// @notice All lands currently held by the wallet bound to `cnic`.
    function getLandsByCnic(string calldata cnic) external view returns (string[] memory) {
        return _ownerToLands[_cnicToAddress[cnic]];
    }

    /// @notice All lands currently held by `account` (more direct than via CNIC).
    function getLandsByOwner(address account) external view returns (string[] memory) {
        return _ownerToLands[account];
    }

    /// @notice Total land records ever minted (live or terminal).
    function totalLandRecords() external view returns (uint256) {
        return _allLandIds.length;
    }

    /// @notice Cursor-paginated read over every land record ever minted.
    ///         Bounded by `resultsPerPage` so a single call stays under
    ///         block-gas limits regardless of registry size.
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
