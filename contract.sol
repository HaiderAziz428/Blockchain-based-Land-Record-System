// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ============================================================================
// IMPORTS
// ----------------------------------------------------------------------------
// Only battle-tested OpenZeppelin primitives. No custom access-control, no
// custom pause logic, no hand-rolled reentrancy guard, no hand-rolled ETH
// transfer helper. Every primitive below has been audited multiple times.
// ============================================================================

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

// ============================================================================
// CUSTOM ERRORS
// ----------------------------------------------------------------------------
// Custom errors save ~50 gas per revert vs. string reasons and give callers a
// machine-parseable failure mode. Every revert in this contract uses one of
// these — no `require(..., "string")` anywhere.
// ============================================================================

error LandRegistry__ZeroAddress();
error LandRegistry__InvalidStringLength();
error LandRegistry__AlreadyRegistered(address account);
error LandRegistry__CnicAlreadyLinked(string cnic);
error LandRegistry__NotAuthorizedHolder(address account);
error LandRegistry__LandAlreadyExists(string landId);
error LandRegistry__LandNotFound(string landId);
error LandRegistry__LandNotActive(string landId);
error LandRegistry__NotLandOwner(address caller, string landId);
error LandRegistry__SelfTransfer();
error LandRegistry__InvalidPrice();
error LandRegistry__PriceMustDecrease(uint256 currentPrice, uint256 attempted);
error LandRegistry__PriceExceedsMax(uint256 actualPrice, uint256 maxPrice);
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
error LandRegistry__HeirIsCurrentOwner(address heir);
error LandRegistry__NoPendingPlan(string landId);
error LandRegistry__PlanAlreadyExecuted(string landId);
error LandRegistry__AlreadyVoted();
error LandRegistry__NotAnHeir(address caller);
error LandRegistry__LandNotDisputed(string landId);
error LandRegistry__NoBalance();
error LandRegistry__NoStrayBalance();

// ============================================================================
// INTERFACES
// ----------------------------------------------------------------------------
// None required externally.
// ============================================================================

// ============================================================================
// LIBRARIES
// ----------------------------------------------------------------------------
// All utilities come from OpenZeppelin imports above.
// ============================================================================

// ============================================================================
// CONTRACT
// ============================================================================

/**
 * @title  LandRegistry (security-hardened v5)
 * @author LandLedger FYP Team
 * @notice On-chain allotment registry for new Pakistani housing societies.
 *         Each plot is a unique ERC-721; ownership, marketplace sales, and
 *         multi-heir inheritance are enforced by this contract. Off-chain
 *         documents (deed scans, listing photos, ERC-721 metadata JSON)
 *         live on IPFS and are referenced by CID — only the CID is stored
 *         on-chain.
 *
 * @dev    SECURITY POSTURE (v5 vs v4):
 *
 *         1. **Role separation.** The single `BACKEND_ROLE` of v4 is split
 *            into three least-privilege roles: `MINTER_ROLE` (mint only),
 *            `INHERITANCE_ORACLE_ROLE` (initiate succession only),
 *            `DISPUTE_ARBITER_ROLE` (resolve disputes only). Compromise of
 *            one key does not expose the others.
 *
 *         2. **Pull-payment escrow.** Sale proceeds are credited to
 *            `_pendingWithdrawals[seller]` rather than pushed via `.call`.
 *            A seller pulls funds via `withdrawProceeds()`. This eliminates
 *            the entire class of "seller is a contract whose receive()
 *            reverts" griefing vectors.
 *
 *         3. **Front-running guard on buyLand.** The buyer passes
 *            `maxPrice`; the tx reverts if the seller raised the listing
 *            price between sign and confirm.
 *
 *         4. **Decrease-only price updates.** `updateListingPrice` allows
 *            lowering only; to raise, a seller must cancel + relist (which
 *            visibly resets the 7-day clock).
 *
 *         5. **Pause does not trap funds.** `withdrawProceeds` is NOT
 *            `whenNotPaused` — sellers can always pull their proceeds even
 *            during an emergency halt. The pause is for new operations.
 *
 *         6. **Emergency withdraw cannot drain user balances.**
 *            `_totalPendingWithdrawals` is tracked; `emergencyWithdraw`
 *            sweeps only `address(this).balance - _totalPendingWithdrawals`.
 *
 *         7. **String length bounds.** Every user-supplied string is
 *            capped at `MAX_STRING_LENGTH = 256` bytes to prevent gas
 *            griefing via giant strings in storage.
 *
 *         8. **nonReentrant on every state-mutating NFT path.** Not just
 *            `buyLand`. The ERC-721 `_safeMint` / `_safeTransfer` paths
 *            invoke `onERC721Received` on contract recipients — a
 *            malicious receiver could attempt to reenter. Guarded.
 *
 *         9. **Heir cannot be the current owner.** Prevents the corner
 *            case where the deceased holder is listed as their own heir
 *            (would otherwise mint a fresh land to the burnt account).
 *
 *         10. **`Address.sendValue`** for outgoing transfers — wraps
 *             `.call` with a proper revert reason and is the OZ-recommended
 *             pattern.
 *
 *         11. **CNIC plaintext caveat.** Public-chain limitation — strings
 *             are world-readable. Production requires a hash commitment or
 *             zero-knowledge CNIC proof; not fixable at this layer.
 *
 *         12. **DEFAULT_ADMIN_ROLE should be a multisig.** The contract
 *             does not enforce this, but a single-key admin defeats the
 *             role separation above. Use Safe / Gnosis in production.
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

    /// @dev `INHERITED` is terminal — the landId persists for history but
    ///      the NFT is burned. Every state-changing user action is gated
    ///      on `ACTIVE` via the `onlyActive` modifier.
    enum LandStatus {
        ACTIVE,
        PENDING_INHERITANCE,
        LOCKED_DISPUTE,
        INHERITED
    }

    struct LandRecord {
        address currentOwner;
        string cnic;
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

    struct Listing {
        uint256 price;
        address seller;
        bool isActive;
        uint64 deadline;
        string metadataHash;
    }

    struct OwnershipHistory {
        address owner;
        uint64 timestamp;
        uint256 price;
    }

    /// @dev Vote and heir-membership state live in separate mappings keyed
    ///      by `proposalNonce`; a re-issued proposal (after a dispute
    ///      reset) bumps the nonce and gets fresh state automatically.
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

    // --- Roles (split for least privilege) -----------------------------------
    //
    // SECURITY: v4 used a single `BACKEND_ROLE` for mint, inheritance, and
    // dispute resolution. A leaked key compromised all three powers at once.
    // v5 splits them so each privileged off-chain service can hold the
    // narrowest possible authority.

    /// @notice May call `storeVerifiedLandRecord` (mint).
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    /// @notice May call `initiateInheritance` (open a succession plan).
    bytes32 public constant INHERITANCE_ORACLE_ROLE = keccak256("INHERITANCE_ORACLE_ROLE");
    /// @notice May call `resolveDispute` (force-execute or reset a locked plan).
    bytes32 public constant DISPUTE_ARBITER_ROLE = keccak256("DISPUTE_ARBITER_ROLE");
    /// @notice Whitelisted institutional wallets — may hold land without a CNIC.
    bytes32 public constant GOVT_AUTHORITY_ROLE = keccak256("GOVT_AUTHORITY_ROLE");
    /// @notice May pause/unpause every user-facing write.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // --- Constants -----------------------------------------------------------
    uint64 public constant LISTING_DURATION = 7 days;
    uint256 public constant MAX_HEIRS = 50;
    /// @notice Hard cap on every user-supplied string. Prevents an attacker
    ///         from pinning the contract with 100 MB of calldata that would
    ///         then occupy storage forever.
    uint256 public constant MAX_STRING_LENGTH = 256;

    // --- Identity module -----------------------------------------------------
    mapping(address => UserProfile) private _users;
    mapping(string => address) private _cnicToAddress;

    // --- Land data module ----------------------------------------------------
    mapping(string => LandRecord) private _landRecords;
    mapping(string => OwnershipHistory[]) private _ownershipHistory;
    mapping(string => bool) private _landExists;

    // --- NFT optimisation ----------------------------------------------------
    mapping(uint256 => string) private _tokenIdToLandId;

    // --- Indexing module -----------------------------------------------------
    string[] private _allLandIds;
    mapping(address => string[]) private _ownerToLands;
    mapping(address => mapping(string => uint256)) private _ownerLandIndex;

    // --- Marketplace module --------------------------------------------------
    mapping(string => Listing) private _landListings;

    // --- Inheritance module --------------------------------------------------
    mapping(string => InheritanceRequest) private _inheritanceRequests;
    mapping(string => mapping(uint256 => mapping(address => bool))) private _heirApproved;
    mapping(string => mapping(uint256 => mapping(address => bool))) private _isHeirFor;

    // --- Pull-payment escrow -------------------------------------------------
    //
    // SECURITY: v4 pushed sale proceeds to the seller inside `buyLand` via
    // `.call{value: price}("")`. If the seller was a contract whose
    // `receive()` reverted, the entire purchase reverted — a malicious
    // seller could grief any buyer by listing then deploying a reverting
    // receiver. The pull-payment pattern below credits the seller's balance
    // synchronously, and the seller withdraws at their own convenience.
    mapping(address => uint256) private _pendingWithdrawals;
    /// @dev Sum of all credited-but-unwithdrawn balances. Tracked so the
    ///      admin's `emergencyWithdraw` can sweep STRAY ETH only and never
    ///      accidentally drain a seller's earnings.
    uint256 private _totalPendingWithdrawals;

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
    event ProceedsCredited(address indexed seller, uint256 amount);
    event ProceedsWithdrawn(address indexed seller, uint256 amount);
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

    modifier landMustExist(string calldata landId) {
        if (!_landExists[landId]) revert LandRegistry__LandNotFound(landId);
        _;
    }

    modifier onlyActive(string calldata landId) {
        if (_landRecords[landId].status != LandStatus.ACTIVE) revert LandRegistry__LandNotActive(landId);
        _;
    }

    /// @dev Rejects empty strings AND strings exceeding MAX_STRING_LENGTH.
    ///      Centralises the anti-griefing length check so we can't forget it
    ///      on a new input.
    modifier boundedString(string calldata s) {
        uint256 len = bytes(s).length;
        if (len == 0 || len > MAX_STRING_LENGTH) revert LandRegistry__InvalidStringLength();
        _;
    }

    // ========================================================================
    // 11. CONSTRUCTOR
    // ========================================================================

    /**
     * @param backend Address that receives `MINTER_ROLE`,
     *                `INHERITANCE_ORACLE_ROLE`, and `DISPUTE_ARBITER_ROLE`
     *                at deployment so v4 callers keep working unchanged.
     *                The admin can later revoke any subset to split duties.
     *
     *                Deployer (`msg.sender`) becomes `DEFAULT_ADMIN_ROLE`
     *                and `PAUSER_ROLE`. Both should be a multisig in
     *                production — a single-key admin defeats role
     *                separation.
     */
    constructor(address backend) ERC721("PakLandRegistry", "PLR") {
        if (backend == address(0)) revert LandRegistry__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        // Combined "backend" wallet initially holds all three oracle roles.
        // SECURITY: split-key operators should `revokeRole` the ones they
        //           don't need post-deploy so each off-chain service holds
        //           only the narrowest authority required.
        _grantRole(MINTER_ROLE, backend);
        _grantRole(INHERITANCE_ORACLE_ROLE, backend);
        _grantRole(DISPUTE_ARBITER_ROLE, backend);
    }

    // ========================================================================
    // 12. EXTERNAL / PUBLIC FUNCTIONS
    // ========================================================================

    // ------------------------------------------------------------------------
    // 12.a Admin — pause / role / emergency
    // ------------------------------------------------------------------------

    /// @notice Pause every user-facing write. Reads remain open. Pending-
    ///         proceeds withdrawals are intentionally NOT gated by pause —
    ///         see `withdrawProceeds`.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Grant or revoke the institutional `GOVT_AUTHORITY_ROLE`.
    ///         `AccessControl` emits `RoleGranted` / `RoleRevoked` itself —
    ///         no need for a custom event.
    function setGovtAuthority(address wallet, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (wallet == address(0)) revert LandRegistry__ZeroAddress();
        if (status) {
            _grantRole(GOVT_AUTHORITY_ROLE, wallet);
        } else {
            _revokeRole(GOVT_AUTHORITY_ROLE, wallet);
        }
    }

    /**
     * @notice Sweep STRAY ETH only (never user balances).
     *
     * @dev    SECURITY: `_totalPendingWithdrawals` is subtracted from the
     *         contract balance so this function can never accidentally
     *         drain a seller's pending proceeds — even an actively
     *         malicious admin cannot use this to steal user funds.
     */
    function emergencyWithdraw(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert LandRegistry__ZeroAddress();
        uint256 contractBalance = address(this).balance;
        uint256 stray = contractBalance > _totalPendingWithdrawals
            ? contractBalance - _totalPendingWithdrawals
            : 0;
        if (stray == 0) revert LandRegistry__NoStrayBalance();

        // `Address.sendValue` reverts with a descriptive reason if `to`
        // cannot accept the transfer (e.g., reverting receive()).
        to.sendValue(stray);
        emit EmergencyWithdrawal(to, stray);
    }

    // ------------------------------------------------------------------------
    // 12.b Identity
    // ------------------------------------------------------------------------

    /**
     * @notice Bind the caller's wallet to a real-world identity.
     *
     * @dev    SECURITY:
     *         - Both inputs are length-bounded via `boundedString` (anti-
     *           griefing on storage).
     *         - Two-way uniqueness check (wallet→profile and CNIC→wallet)
     *           guarantees the contract can never enter a state where one
     *           CNIC maps to two wallets.
     */
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
     * @notice Mint a fresh land NFT for a verified citizen or govt authority.
     *
     * @dev    SECURITY:
     *         - `MINTER_ROLE` (split out of v4's `BACKEND_ROLE`) — least
     *           privilege for the minting key.
     *         - `nonReentrant` — `_safeMint` invokes `onERC721Received`
     *           on contract recipients; a malicious recipient could attempt
     *           to reenter and trigger another mint.
     *         - String bounds on `landId` and `ipfsHash`.
     *         - Owner validated as an authorized holder (registered or
     *           govt-role) BEFORE state writes.
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

        _mintLand(owner, landId, ipfsHash, lType);
    }

    // ------------------------------------------------------------------------
    // 12.d Direct transfer (off-marketplace)
    // ------------------------------------------------------------------------

    /**
     * @notice Peer-to-peer transfer with an on-chain sale-price log.
     *
     * @dev    SECURITY:
     *         - `nonReentrant` — `_safeTransfer` invokes
     *           `onERC721Received` on contract recipients.
     *         - Effects applied BEFORE `_safeTransfer` (CEI). Combined
     *           with `nonReentrant` this is double protection.
     *         - The `_update` hook (see below) auto-clears any active
     *           listing on this NFT — eliminates the "stale listing after
     *           direct transfer" hole that existed in v3.
     */
    function transferLandOwnership(
        string calldata landId,
        address newOwner,
        uint256 salePrice
    ) external whenNotPaused nonReentrant landMustExist(landId) onlyActive(landId) {
        if (newOwner == address(0)) revert LandRegistry__ZeroAddress();
        if (newOwner == msg.sender) revert LandRegistry__SelfTransfer();

        uint256 tokenId = getTokenIdFromLandId(landId);
        if (ownerOf(tokenId) != msg.sender) revert LandRegistry__NotLandOwner(msg.sender, landId);
        if (!_isAuthorizedHolder(newOwner)) revert LandRegistry__NotAuthorizedHolder(newOwner);

        // --- Effects (state writes BEFORE the interaction) ---
        LandRecord storage record = _landRecords[landId];
        record.currentOwner = newOwner;
        record.cnic = _cnicFor(newOwner);

        _removeFromOwnerList(msg.sender, landId);
        _addToOwnerList(newOwner, landId);
        _ownershipHistory[landId].push(
            OwnershipHistory({owner: newOwner, timestamp: uint64(block.timestamp), price: salePrice})
        );

        // --- Interaction ---
        _safeTransfer(msg.sender, newOwner, tokenId, "");

        emit LandTransferred(landId, msg.sender, newOwner, salePrice);
    }

    // ------------------------------------------------------------------------
    // 12.e Marketplace
    // ------------------------------------------------------------------------

    /**
     * @notice List a plot for sale. Resets the 7-day deadline.
     *
     * @dev    SECURITY:
     *         - Length-bound the IPFS metadata CID.
     *         - Zero-price rejection via `InvalidPrice`.
     *         - Only the current NFT owner may list.
     */
    function listLandForSale(
        string calldata landId,
        uint256 price,
        string calldata metadataHash
    )
        external
        whenNotPaused
        landMustExist(landId)
        onlyActive(landId)
        boundedString(metadataHash)
    {
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
     * @notice Decrease an active listing's price WITHOUT resetting the
     *         deadline. Raises are explicitly rejected.
     *
     * @dev    SECURITY (front-running mitigation):
     *         Allowing a seller to RAISE the price in flight would let
     *         them front-run a buyer's purchase tx — buyer signs at price
     *         X, seller raises to X+ε, buyer's tx confirms at X+ε. We
     *         eliminate that vector by allowing decrease only. (A seller
     *         who wants to raise can `cancelListing` + `listLandForSale`,
     *         which visibly resets the 7-day clock and gives buyers a
     *         clear "the listing changed" signal.) Buyers further protect
     *         themselves via `maxPrice` on `buyLand`.
     */
    function updateListingPrice(string calldata landId, uint256 newPrice) external whenNotPaused {
        if (newPrice == 0) revert LandRegistry__InvalidPrice();

        Listing storage listing = _landListings[landId];
        if (!listing.isActive) revert LandRegistry__ListingNotActive(landId);
        if (listing.seller != msg.sender) revert LandRegistry__NotLandOwner(msg.sender, landId);
        if (newPrice >= listing.price) {
            revert LandRegistry__PriceMustDecrease(listing.price, newPrice);
        }

        uint256 oldPrice = listing.price;
        listing.price = newPrice;
        emit ListingPriceUpdated(landId, oldPrice, newPrice);
    }

    /**
     * @notice Purchase a listed plot.
     *
     * @param  landId   Plot to buy.
     * @param  maxPrice Maximum price the buyer is willing to pay. The tx
     *                  reverts if the listing's current price exceeds this.
     *
     * @dev    SECURITY:
     *         - `maxPrice` parameter prevents seller-side front-running
     *           (see `updateListingPrice` comment). Buyer signs with their
     *           expected price; even if the listing somehow moved between
     *           sign and confirm, the tx fails closed.
     *         - `nonReentrant` + CEI: listing is `delete`d and all state
     *           updated BEFORE any external interaction.
     *         - Pull-payment for the seller: proceeds are credited to
     *           `_pendingWithdrawals[seller]` (NOT pushed). Eliminates the
     *           "malicious-receive()" griefing vector.
     *         - Buyer overpay refund kept as push: the buyer signs the
     *           tx and controls their own contract; if their `receive()`
     *           reverts they are self-griefing.
     *         - Buyer authorisation widened from "registered citizen only"
     *           to "registered OR govt-authority" so institutional buyers
     *           can purchase on the marketplace.
     */
    function buyLand(
        string calldata landId,
        uint256 maxPrice
    ) external payable whenNotPaused nonReentrant landMustExist(landId) onlyActive(landId) {
        if (!_isAuthorizedHolder(msg.sender)) revert LandRegistry__NotAuthorizedHolder(msg.sender);

        Listing memory listing = _landListings[landId];
        if (!listing.isActive) revert LandRegistry__ListingNotActive(landId);
        if (block.timestamp > listing.deadline) revert LandRegistry__ListingExpired(landId);
        if (msg.sender == listing.seller) revert LandRegistry__SellerCannotBuy();

        uint256 price = listing.price;
        if (price > maxPrice) revert LandRegistry__PriceExceedsMax(price, maxPrice);
        if (msg.value < price) revert LandRegistry__InsufficientPayment(msg.value, price);

        uint256 tokenId = getTokenIdFromLandId(landId);
        address seller = listing.seller;

        // --- Effects (CEI) ---
        delete _landListings[landId];

        LandRecord storage record = _landRecords[landId];
        record.currentOwner = msg.sender;
        record.cnic = _cnicFor(msg.sender);

        _removeFromOwnerList(seller, landId);
        _addToOwnerList(msg.sender, landId);
        _ownershipHistory[landId].push(
            OwnershipHistory({owner: msg.sender, timestamp: uint64(block.timestamp), price: price})
        );

        // Pull-payment escrow credit (state-only — no external call).
        _pendingWithdrawals[seller] += price;
        _totalPendingWithdrawals += price;
        emit ProceedsCredited(seller, price);

        // --- Interaction (NFT move — listing already cleared above) ---
        _safeTransfer(seller, msg.sender, tokenId, "");

        // Buyer refund of any overpayment (push — buyer controls their own
        // contract; self-griefing is their problem, not the seller's).
        uint256 excess = msg.value - price;
        if (excess > 0) {
            payable(msg.sender).sendValue(excess);
        }

        emit LandSold(landId, msg.sender, seller, price);
    }

    /// @notice Withdraw any sale proceeds credited to the caller.
    ///
    /// @dev SECURITY:
    ///      - Intentionally NOT `whenNotPaused`. A pause halts new
    ///        operations but must never trap user funds.
    ///      - CEI: balance is zeroed BEFORE the external send.
    ///      - `nonReentrant` is belt-and-suspenders — the balance is
    ///        already zero by the time `sendValue` runs.
    ///      - `Address.sendValue` reverts cleanly if the recipient cannot
    ///        accept the transfer.
    function withdrawProceeds() external nonReentrant {
        uint256 amount = _pendingWithdrawals[msg.sender];
        if (amount == 0) revert LandRegistry__NoBalance();

        _pendingWithdrawals[msg.sender] = 0;
        _totalPendingWithdrawals -= amount;

        payable(msg.sender).sendValue(amount);
        emit ProceedsWithdrawn(msg.sender, amount);
    }

    /// @notice Cancel an active listing.
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
     * @notice Open a succession proposal. Plot locks into
     *         `PENDING_INHERITANCE` until 100% approval (auto-execute) or
     *         any heir disputes (→ `LOCKED_DISPUTE` for arbiter resolution).
     *
     * @dev    SECURITY:
     *         - `INHERITANCE_ORACLE_ROLE` (split out of v4's BACKEND_ROLE).
     *         - ALL inputs pre-validated here so the final voter can never
     *           DoS the proposal at execution time:
     *             • parallel arrays equal length, non-empty, ≤ MAX_HEIRS
     *             • no zero-address heirs
     *             • no duplicate heirs (would deadlock the 100%-quorum
     *               counter)
     *             • no heir equal to the current owner (sanity guard
     *               against self-inheritance — the deceased shouldn't be
     *               their own heir)
     *             • no duplicate new-landIds within the batch
     *             • no collisions with existing land
     *             • no empty IPFS hashes
     *             • each heir authorised to hold land
     *             • each new-landId and new-ipfsHash length-bounded
     *         - `proposalNonce` bumped — fresh per-heir vote/membership state.
     */
    function initiateInheritance(
        string calldata oldLandId,
        address[] calldata heirs,
        string[] calldata newLandIds,
        string[] calldata newIpfsHashes
    )
        external
        onlyRole(INHERITANCE_ORACLE_ROLE)
        whenNotPaused
        landMustExist(oldLandId)
        onlyActive(oldLandId)
    {
        _validateInheritanceInputs(oldLandId, heirs, newLandIds, newIpfsHashes);

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
     * @notice Cast a yes-vote on the open proposal.
     *
     * @dev    SECURITY:
     *         - `nonReentrant` — auto-execute may fire `_safeMint` which
     *           invokes `onERC721Received` on contract heirs.
     *         - O(1) heir-membership lookup via `_isHeirFor` — replaces
     *           v3's linear `heirs[]` scan.
     */
    function approveSuccessionPlan(string calldata oldLandId) external whenNotPaused nonReentrant {
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
     * @notice Dispute — single heir's veto, permanent until arbiter resolves.
     *
     * @dev    SECURITY:
     *         - Re-checks `proposalNonce`-scoped membership.
     *         - Idempotent at the state level: a second dispute on an
     *           already-LOCKED_DISPUTE plot reverts via the status check.
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
     * @notice Arbiter escape hatch — force-execute or reset to ACTIVE.
     *
     * @dev    SECURITY:
     *         - `DISPUTE_ARBITER_ROLE` only — separate key from the minter
     *           and the inheritance oracle.
     *         - `nonReentrant` — `_executeInheritance` mints to heirs.
     */
    function resolveDispute(
        string calldata oldLandId,
        bool forceExecute
    ) external onlyRole(DISPUTE_ARBITER_ROLE) whenNotPaused nonReentrant {
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
     * @dev OZ-5 transfer hook. Runs on every NFT movement.
     *
     *      SECURITY: auto-clears any active marketplace listing the moment
     *      the underlying NFT moves. v3 did not do this — a seller could
     *      list, then transfer the NFT to a third party, leaving an active
     *      listing pointing at the wrong seller. An unsuspecting buyer
     *      could send ETH to the ORIGINAL seller while the NEW owner lost
     *      the NFT. Fixed atomically here.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = super._update(to, tokenId, auth);
        if (from != address(0)) {
            string memory landId = _tokenIdToLandId[tokenId];
            if (bytes(landId).length != 0 && _landListings[landId].isActive) {
                delete _landListings[landId];
                emit ListingCancelled(landId);
            }
        }
        return from;
    }

    /// @dev Execute the standing inheritance plan: burn old, archive, mint heirs.
    ///
    ///      SECURITY:
    ///      - Sets `isExecuted = true` FIRST so any reentrant attempt to
    ///        re-execute fails the `!isExecuted` precondition.
    ///      - Cleans the deceased's `_ownerToLands` index (v3 leaked here).
    ///      - Marks old land as terminal `INHERITED` so it stays in history
    ///        but cannot be confused with active land.
    function _executeInheritance(string calldata oldLandId) private {
        InheritanceRequest storage req = _inheritanceRequests[oldLandId];
        req.isExecuted = true;

        LandRecord storage oldRecord = _landRecords[oldLandId];
        LandType lType = oldRecord.landType;
        address oldOwner = oldRecord.currentOwner;

        uint256 oldTokenId = getTokenIdFromLandId(oldLandId);
        _burn(oldTokenId);
        delete _tokenIdToLandId[oldTokenId];

        _removeFromOwnerList(oldOwner, oldLandId);

        oldRecord.currentOwner = address(0);
        oldRecord.status = LandStatus.INHERITED;

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

    /// @dev Shared mint path. Used by `storeVerifiedLandRecord` and
    ///      `_executeInheritance` so every new NFT takes the same code
    ///      path through indexing, history seeding, and issuance.
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

    /**
     * @dev Pre-flight validation for `initiateInheritance`. O(n²) duplicate
     *      detection is fine because `n <= MAX_HEIRS == 50` (max 2,500
     *      iterations).
     *
     *      SECURITY: every check here exists because its absence allowed a
     *      real failure mode in v3 — see the inline notes.
     */
    function _validateInheritanceInputs(
        string calldata oldLandId,
        address[] calldata heirs,
        string[] calldata newLandIds,
        string[] calldata newIpfsHashes
    ) private view {
        uint256 n = heirs.length;
        if (n == 0) revert LandRegistry__NoHeirs();
        if (n > MAX_HEIRS) revert LandRegistry__TooManyHeirs(n, MAX_HEIRS);
        if (newLandIds.length != n || newIpfsHashes.length != n) revert LandRegistry__InheritanceArrayMismatch();

        address currentOwner = _landRecords[oldLandId].currentOwner;

        for (uint256 i = 0; i < n; ) {
            address heir = heirs[i];

            // v3 didn't validate any of these — a malformed payload would
            // pass `initiate`, lock the asset, then fail the final vote.
            if (heir == address(0)) revert LandRegistry__ZeroAddress();
            if (heir == currentOwner) revert LandRegistry__HeirIsCurrentOwner(heir);
            if (!_isAuthorizedHolder(heir)) revert LandRegistry__NotAuthorizedHolder(heir);

            uint256 idLen = bytes(newLandIds[i]).length;
            uint256 hashLen = bytes(newIpfsHashes[i]).length;
            if (idLen == 0 || idLen > MAX_STRING_LENGTH || hashLen == 0 || hashLen > MAX_STRING_LENGTH) {
                revert LandRegistry__InvalidStringLength();
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

    function _addToOwnerList(address owner, string memory landId) private {
        _ownerToLands[owner].push(landId);
        _ownerLandIndex[owner][landId] = _ownerToLands[owner].length - 1;
    }

    /// @dev Defensive O(1) swap-and-pop. The hash-cross-check prevents
    ///      misuse where `landId` isn't actually in `owner`'s list (would
    ///      otherwise corrupt index 0).
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

    function _isAuthorizedHolder(address account) private view returns (bool) {
        return _users[account].isRegistered || hasRole(GOVT_AUTHORITY_ROLE, account);
    }

    function _cnicFor(address account) private view returns (string memory) {
        return _users[account].isRegistered ? _users[account].cnic : "GOVT";
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

    function getLandRecord(string calldata landId) external view returns (LandRecord memory) {
        return _landRecords[landId];
    }

    function getUser(address account) external view returns (UserProfile memory) {
        return _users[account];
    }

    function getListing(string calldata landId) external view returns (Listing memory) {
        return _landListings[landId];
    }

    function getOwnershipHistory(string calldata landId) external view returns (OwnershipHistory[] memory) {
        return _ownershipHistory[landId];
    }

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

    function hasHeirApproved(string calldata oldLandId, address heir) external view returns (bool) {
        return _heirApproved[oldLandId][_inheritanceRequests[oldLandId].proposalNonce][heir];
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

    /// @notice Pending pull-payment balance for a seller.
    function pendingProceeds(address account) external view returns (uint256) {
        return _pendingWithdrawals[account];
    }

    /// @notice Total ETH credited but not yet withdrawn. Public for
    ///         transparency — anyone can verify the contract holds enough
    ///         to honour all outstanding withdrawals.
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
