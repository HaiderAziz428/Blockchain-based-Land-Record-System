// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {DiamondFixture} from "./helpers/DiamondFixture.sol";
import {
    LandRecord, LandIdentity, OwnershipSnapshot, LandStatus, Listing
} from "../contracts/diamond/AppStorage.sol";
import "../contracts/diamond/Errors.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract LandCoreTest is DiamondFixture {
    string internal constant LAND = "DHA-P9-PLOT-1";

    // -------------------------------------------------------------------------
    // ERC-721 identity surface
    // -------------------------------------------------------------------------

    function test_nameAndSymbol() public view {
        assertEq(core.name(), "PakLandRegistry");
        assertEq(core.symbol(), "PLR");
    }

    function test_tokenId_isKeccakOfLandId() public view {
        assertEq(core.getTokenIdFromLandId(LAND), uint256(keccak256(abi.encodePacked(LAND))));
    }

    function test_tokenURI_pointsAtIpfsCid() public {
        _mintSole(LAND, alice);
        uint256 tokenId = core.getTokenIdFromLandId(LAND);
        assertEq(core.tokenURI(tokenId), string(abi.encodePacked("ipfs://", IPFS_HASH)));
    }

    function test_tokenURI_revertsForNonexistentToken() public {
        vm.expectRevert(bytes("LandCore: nonexistent token"));
        core.tokenURI(123);
    }

    function test_ownerOf_isDiamondItself() public {
        _mintSole(LAND, alice);
        assertEq(core.ownerOf(core.getTokenIdFromLandId(LAND)), diamondAddr);
        assertEq(core.balanceOf(diamondAddr), 1);
    }

    function test_ownerOf_revertsForNonexistentToken() public {
        vm.expectRevert(bytes("LandCore: nonexistent token"));
        core.ownerOf(123);
    }

    function test_balanceOf_revertsForZeroAddress() public {
        vm.expectRevert(bytes("LandCore: zero address"));
        core.balanceOf(address(0));
    }

    function test_nftIsNonTransferable() public {
        _mintSole(LAND, alice);
        uint256 tokenId = core.getTokenIdFromLandId(LAND);

        vm.expectRevert(LandRegistry__NftNonTransferable.selector);
        core.approve(bob, tokenId);

        vm.expectRevert(LandRegistry__NftNonTransferable.selector);
        core.setApprovalForAll(bob, true);

        vm.expectRevert(LandRegistry__NftNonTransferable.selector);
        core.transferFrom(diamondAddr, bob, tokenId);

        vm.expectRevert(LandRegistry__NftNonTransferable.selector);
        core.safeTransferFrom(diamondAddr, bob, tokenId);

        vm.expectRevert(LandRegistry__NftNonTransferable.selector);
        core.safeTransferFrom(diamondAddr, bob, tokenId, "");
    }

    function test_approvalViews() public {
        _mintSole(LAND, alice);
        uint256 tokenId = core.getTokenIdFromLandId(LAND);
        assertEq(core.getApproved(tokenId), address(0));
        assertFalse(core.isApprovedForAll(diamondAddr, bob));

        vm.expectRevert(bytes("LandCore: nonexistent token"));
        core.getApproved(999);
    }

    /// Documents deployed behavior: supportsInterface routes to the Loupe facet,
    /// whose supportedInterfaces mapping is never populated — so ERC-165
    /// introspection over the diamond returns false even for ERC-721.
    function test_supportsInterface_viaDiamondReturnsFalse() public view {
        assertFalse(loupe.supportsInterface(type(IERC721).interfaceId));
    }

    // -------------------------------------------------------------------------
    // Pause / unpause
    // -------------------------------------------------------------------------

    function test_pause_onlyPauser() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        core.pause();
    }

    function test_pause_blocksStateChangingCalls() public {
        _mintSole(LAND, alice);
        vm.prank(admin);
        core.pause();

        vm.prank(alice);
        vm.expectRevert(LandRegistry__Paused.selector);
        importF.transferShare(LAND, bob, 1000, 0);

        vm.prank(admin);
        core.unpause();
        vm.prank(alice);
        importF.transferShare(LAND, bob, 1000, 0);
        assertEq(core.getShareBps(LAND, bob), 1000);
    }

    // -------------------------------------------------------------------------
    // emergencyWithdraw — sweeps stray ETH but never escrowed proceeds
    // -------------------------------------------------------------------------

    function test_emergencyWithdraw_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        core.emergencyWithdraw(payable(alice));
    }

    function test_emergencyWithdraw_revertsOnZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(LandRegistry__ZeroAddress.selector);
        core.emergencyWithdraw(payable(address(0)));
    }

    function test_emergencyWithdraw_revertsWhenNoStrayBalance() public {
        vm.prank(admin);
        vm.expectRevert(LandRegistry__NoStrayBalance.selector);
        core.emergencyWithdraw(payable(admin));
    }

    function test_emergencyWithdraw_neverTouchesSellerEscrow() public {
        // Alice sells 1000 bps to Bob for 1 ETH → 1 ETH escrowed for Alice
        _mintSole(LAND, alice);
        vm.prank(alice);
        market.listShareForSale(LAND, 1000, 1 ether, "QmListing");
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);

        // 0.5 ETH stray lands on the diamond (direct send hits receive())
        vm.deal(address(this), 0.5 ether);
        (bool ok, ) = diamondAddr.call{value: 0.5 ether}("");
        assertTrue(ok);

        address sink = makeAddr("sink");
        vm.prank(admin);
        core.emergencyWithdraw(payable(sink));

        assertEq(sink.balance, 0.5 ether);
        assertEq(diamondAddr.balance, 1 ether); // escrow untouched
        assertEq(core.pendingProceeds(alice), 1 ether);

        vm.prank(alice);
        market.withdrawProceeds();
        assertEq(alice.balance, 1 ether);
    }

    // -------------------------------------------------------------------------
    // Land views & pagination
    // -------------------------------------------------------------------------

    function test_getLandRecord_andIdentityViews() public {
        _mintSole(LAND, alice);

        LandRecord memory rec = core.getLandRecord(LAND);
        assertEq(rec.landId, LAND);
        assertEq(rec.ipfsHash, IPFS_HASH);
        assertEq(uint8(rec.status), uint8(LandStatus.ACTIVE));
        assertGt(rec.verifiedAt, 0);

        LandIdentity memory ident = core.getLandIdentity(LAND);
        assertEq(ident.tokenId, core.getTokenIdFromLandId(LAND));

        (LandIdentity memory ident2, OwnershipSnapshot memory snap) = core.getLandFullView(LAND);
        assertEq(ident2.landId, LAND);
        assertEq(snap.shareholderCount, 1);
        assertEq(snap.totalShareBps, 10_000);
    }

    function test_shareholderViews() public {
        _mintPair(LAND, alice, 7000, bob, 3000);

        (address[] memory holders, uint16[] memory shares) = core.getShareholdersWithBps(LAND);
        assertEq(holders.length, 2);
        assertEq(shares[0] + shares[1], 10_000);

        OwnershipSnapshot memory snap = core.getOwnershipSnapshot(LAND);
        assertEq(snap.shareholderCount, 2);
        assertEq(snap.totalShareBps, 10_000);
    }

    function test_pagination_walksAllRecords() public {
        _mintSole("LND-A", alice);
        _mintSole("LND-B", bob);
        _mintSole("LND-C", carol);
        assertEq(core.totalLandRecords(), 3);

        (LandRecord[] memory page1, uint256 cursor1) = core.getAllLandRecordsPaginated(0, 2);
        assertEq(page1.length, 2);
        assertEq(cursor1, 2);

        (LandRecord[] memory page2, uint256 cursor2) = core.getAllLandRecordsPaginated(cursor1, 2);
        assertEq(page2.length, 1);
        assertEq(cursor2, 3);

        (LandRecord[] memory empty, uint256 cursor3) = core.getAllLandRecordsPaginated(99, 2);
        assertEq(empty.length, 0);
        assertEq(cursor3, 3);
    }

    function test_escrowViews() public view {
        assertEq(core.pendingProceeds(alice), 0);
        assertEq(core.totalPendingWithdrawals(), 0);
    }
}
