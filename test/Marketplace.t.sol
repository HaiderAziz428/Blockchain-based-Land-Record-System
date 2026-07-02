// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {DiamondFixture} from "./helpers/DiamondFixture.sol";
import {IdentityFacet} from "../contracts/diamond/facets/IdentityFacet.sol";
import {MarketplaceFacet} from "../contracts/diamond/facets/MarketplaceFacet.sol";
import {Listing, MarketplaceTrade, LISTING_DURATION} from "../contracts/diamond/AppStorage.sol";
import "../contracts/diamond/Errors.sol";

/// Seller contract whose receive() re-enters withdrawProceeds while the guard is armed.
contract ReentrantWithdrawer {
    MarketplaceFacet internal immutable market;
    IdentityFacet internal immutable identity;
    bool public attack;

    constructor(address diamond_) {
        market = MarketplaceFacet(diamond_);
        identity = IdentityFacet(diamond_);
    }

    function register(string calldata name_, string calldata cnic) external {
        identity.registerUser(name_, cnic);
    }

    function list(string calldata landId, uint16 bps, uint256 price) external {
        market.listShareForSale(landId, bps, price, "QmListing");
    }

    function setAttack(bool v) external {
        attack = v;
    }

    function withdraw() external {
        market.withdrawProceeds();
    }

    receive() external payable {
        if (attack) {
            market.withdrawProceeds(); // re-entry attempt
        }
    }
}

/// Buyer contract whose receive() re-enters buyShare during the excess refund.
contract ReentrantBuyer {
    MarketplaceFacet internal immutable market;
    IdentityFacet internal immutable identity;
    string internal landId;
    address internal seller;
    bool public attack;

    constructor(address diamond_) {
        market = MarketplaceFacet(diamond_);
        identity = IdentityFacet(diamond_);
    }

    function register(string calldata name_, string calldata cnic) external {
        identity.registerUser(name_, cnic);
    }

    function buy(string calldata landId_, address seller_, uint256 maxPrice) external payable {
        landId = landId_;
        seller = seller_;
        market.buyShare{value: msg.value}(landId_, seller_, maxPrice);
    }

    function setAttack(bool v) external {
        attack = v;
    }

    receive() external payable {
        if (attack) {
            market.buyShare{value: msg.value}(landId, seller, type(uint256).max); // re-entry attempt
        }
    }
}

contract MarketplaceTest is DiamondFixture {
    string internal constant LAND = "DHA-P9-PLOT-7";

    function _mintAndList(uint16 bps, uint256 price) internal {
        _mintSole(LAND, alice);
        vm.prank(alice);
        market.listShareForSale(LAND, bps, price, "QmListing");
    }

    // -------------------------------------------------------------------------
    // listShareForSale
    // -------------------------------------------------------------------------

    function test_list_storesListing() public {
        _mintAndList(2500, 1 ether);

        Listing memory l = market.getListing(LAND, alice);
        assertTrue(l.isActive);
        assertEq(l.shareBpsForSale, 2500);
        assertEq(l.price, 1 ether);
        assertEq(l.seller, alice);
        assertEq(l.deadline, uint64(block.timestamp) + LISTING_DURATION);
        assertEq(l.metadataHash, "QmListing");
    }

    function test_list_revertsOnZeroShare() public {
        _mintSole(LAND, alice);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__InvalidShare.selector);
        market.listShareForSale(LAND, 0, 1 ether, "Qm");
    }

    function test_list_revertsOnZeroPrice() public {
        _mintSole(LAND, alice);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__InvalidPrice.selector);
        market.listShareForSale(LAND, 1000, 0, "Qm");
    }

    function test_list_revertsOnInsufficientShare() public {
        _mintPair(LAND, alice, 6000, bob, 4000);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__InsufficientShare.selector, bob, 4000, 5000));
        market.listShareForSale(LAND, 5000, 1 ether, "Qm");
    }

    function test_list_revertsOnUnknownLand() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandNotFound.selector, "NOPE"));
        market.listShareForSale("NOPE", 1000, 1 ether, "Qm");
    }

    function test_list_revertsWhileNotActive() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandNotActive.selector, LAND));
        market.listShareForSale(LAND, 1000, 1 ether, "Qm");
    }

    // -------------------------------------------------------------------------
    // updateListingPrice / cancelListing
    // -------------------------------------------------------------------------

    function test_updatePrice_lowersOnly() public {
        _mintAndList(2500, 1 ether);

        vm.prank(alice);
        market.updateListingPrice(LAND, 0.5 ether);
        assertEq(market.getListing(LAND, alice).price, 0.5 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__PriceMustDecrease.selector, 0.5 ether, 0.5 ether));
        market.updateListingPrice(LAND, 0.5 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__PriceMustDecrease.selector, 0.5 ether, 2 ether));
        market.updateListingPrice(LAND, 2 ether);
    }

    function test_updatePrice_revertsWithoutListing() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__ListingNotActive.selector, LAND, alice));
        market.updateListingPrice(LAND, 1 ether);
    }

    function test_updatePrice_revertsOnZero() public {
        _mintAndList(2500, 1 ether);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__InvalidPrice.selector);
        market.updateListingPrice(LAND, 0);
    }

    function test_cancelListing() public {
        _mintAndList(2500, 1 ether);
        vm.prank(alice);
        market.cancelListing(LAND);
        assertFalse(market.getListing(LAND, alice).isActive);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__ListingNotActive.selector, LAND, alice));
        market.cancelListing(LAND);
    }

    // -------------------------------------------------------------------------
    // buyShare
    // -------------------------------------------------------------------------

    function test_buy_movesSharesAndEscrowsProceeds() public {
        _mintAndList(2500, 1 ether);
        vm.deal(bob, 2 ether);

        vm.prank(bob);
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);

        assertEq(core.getShareBps(LAND, alice), 7500);
        assertEq(core.getShareBps(LAND, bob), 2500);
        _assertSharesTotal(LAND);
        assertFalse(market.getListing(LAND, alice).isActive);

        // Pull-payment: no ETH pushed to seller — credited to escrow instead
        assertEq(alice.balance, 0);
        assertEq(core.pendingProceeds(alice), 1 ether);
        assertEq(core.totalPendingWithdrawals(), 1 ether);

        MarketplaceTrade[] memory trades = market.getMarketplaceHistory(LAND);
        assertEq(trades.length, 1);
        assertEq(trades[0].buyer, bob);
        assertEq(trades[0].price, 1 ether);
        assertEq(market.getMarketplaceTrade(LAND, 0).seller, alice);
    }

    function test_buy_refundsExcessPayment() public {
        _mintAndList(2500, 1 ether);
        vm.deal(bob, 3 ether);

        vm.prank(bob);
        market.buyShare{value: 2.5 ether}(LAND, alice, 1 ether);

        assertEq(bob.balance, 2 ether); // paid exactly 1 ETH
    }

    function test_buy_revertsForUnregisteredBuyer() public {
        _mintAndList(2500, 1 ether);
        vm.deal(mallory, 2 ether);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAuthorizedHolder.selector, mallory));
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);
    }

    function test_buy_revertsForSellerBuyingOwnListing() public {
        _mintAndList(2500, 1 ether);
        vm.deal(alice, 2 ether);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__SellerCannotBuy.selector);
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);
    }

    function test_buy_revertsWithoutActiveListing() public {
        _mintSole(LAND, alice);
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__ListingNotActive.selector, LAND, alice));
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);
    }

    function test_buy_revertsAfterListingExpiry() public {
        _mintAndList(2500, 1 ether);
        vm.warp(block.timestamp + LISTING_DURATION + 1);

        vm.deal(bob, 2 ether);
        vm.prank(bob);
        vm.expectRevert();
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);
    }

    function test_buy_maxPriceGuardsAgainstRepricing() public {
        _mintAndList(2500, 1 ether);
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__PriceExceedsMax.selector, 1 ether, 0.9 ether));
        market.buyShare{value: 1 ether}(LAND, alice, 0.9 ether);
    }

    function test_buy_revertsOnInsufficientPayment() public {
        _mintAndList(2500, 1 ether);
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__InsufficientPayment.selector, 0.5 ether, 1 ether));
        market.buyShare{value: 0.5 ether}(LAND, alice, 1 ether);
    }

    function test_buy_revertsIfSellerShareDroppedBelowListing() public {
        _mintAndList(6000, 1 ether);
        // Seller moves shares away after listing — stale listing must not fill
        vm.prank(alice);
        importF.transferShare(LAND, carol, 5000, 0);

        vm.deal(bob, 2 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__InsufficientShare.selector, alice, 5000, 6000));
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);
    }

    // -------------------------------------------------------------------------
    // withdrawProceeds
    // -------------------------------------------------------------------------

    function test_withdraw_revertsOnZeroBalance() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__NoBalance.selector);
        market.withdrawProceeds();
    }

    function test_withdraw_paysSellerAndZeroesBalance() public {
        _mintAndList(2500, 1 ether);
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);

        vm.prank(alice);
        market.withdrawProceeds();

        assertEq(alice.balance, 1 ether);
        assertEq(core.pendingProceeds(alice), 0);
        assertEq(core.totalPendingWithdrawals(), 0);
    }

    /// Pause must never trap user funds: withdraw works while paused.
    function test_withdraw_worksWhilePaused() public {
        _mintAndList(2500, 1 ether);
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);

        vm.prank(admin);
        core.pause();

        vm.prank(alice);
        market.withdrawProceeds();
        assertEq(alice.balance, 1 ether);
    }

    // -------------------------------------------------------------------------
    // Reentrancy defense
    // -------------------------------------------------------------------------

    function test_reentrancy_withdrawProceedsIsGuarded() public {
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(diamondAddr);
        attacker.register("Attacker", "35202-6666666-6");

        _mintSole(LAND, alice);
        vm.prank(alice);
        importF.transferShare(LAND, address(attacker), 5000, 0);

        attacker.list(LAND, 2000, 1 ether);
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        market.buyShare{value: 1 ether}(LAND, address(attacker), 1 ether);

        // Re-entering withdrawal reverts the entire call — funds stay escrowed
        attacker.setAttack(true);
        vm.expectRevert();
        attacker.withdraw();
        assertEq(core.pendingProceeds(address(attacker)), 1 ether);

        // Honest withdrawal succeeds
        attacker.setAttack(false);
        attacker.withdraw();
        assertEq(address(attacker).balance, 1 ether);
    }

    function test_reentrancy_buyShareRefundIsGuarded() public {
        ReentrantBuyer attacker = new ReentrantBuyer(diamondAddr);
        attacker.register("AttackerB", "35202-7777777-7");

        _mintAndList(2500, 1 ether);

        vm.deal(address(this), 3 ether);
        attacker.setAttack(true);
        // Overpayment triggers a refund → attacker re-enters buyShare → guard trips
        vm.expectRevert();
        attacker.buy{value: 2 ether}(LAND, alice, 2 ether);

        // State unchanged: listing still live, no shares moved
        assertTrue(market.getListing(LAND, alice).isActive);
        assertEq(core.getShareBps(LAND, address(attacker)), 0);

        attacker.setAttack(false);
        attacker.buy{value: 1 ether}(LAND, alice, 1 ether);
        assertEq(core.getShareBps(LAND, address(attacker)), 2500);
    }
}
