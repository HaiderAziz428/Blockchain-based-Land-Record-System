// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {DiamondFixture} from "./helpers/DiamondFixture.sol";
import {ImportFacet} from "../contracts/diamond/facets/ImportFacet.sol";
import {
    LandType, LandStatus, LandRecord, OwnershipChange,
    VERIFICATION_DURATION, MAX_SHAREHOLDERS
} from "../contracts/diamond/AppStorage.sol";
import "../contracts/diamond/Errors.sol";

contract ImportTest is DiamondFixture {
    string internal constant LAND = "DHA-P9-PLOT-42";

    // -------------------------------------------------------------------------
    // proposeLandImport — validation
    // -------------------------------------------------------------------------

    function test_propose_onlyRegistrar() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnDuplicateLandId() public {
        _mintSole(LAND, alice);
        (address[] memory owners, uint16[] memory shares) = _sole(bob);
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandAlreadyExists.selector, LAND));
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnEmptyLandId() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        vm.prank(backend);
        vm.expectRevert(LandRegistry__InvalidStringLength.selector);
        importF.proposeLandImport("", IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnNoOwners() public {
        address[] memory owners = new address[](0);
        uint16[] memory shares = new uint16[](0);
        vm.prank(backend);
        vm.expectRevert(LandRegistry__NoOwners.selector);
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnTooManyOwners() public {
        address[] memory owners = new address[](MAX_SHAREHOLDERS + 1);
        for (uint256 i = 0; i < owners.length; i++) {
            owners[i] = address(uint160(i + 1));
        }
        uint16[] memory shares = new uint16[](0);
        vm.prank(backend);
        vm.expectRevert(
            abi.encodeWithSelector(LandRegistry__TooManyShareholders.selector, MAX_SHAREHOLDERS + 1, MAX_SHAREHOLDERS)
        );
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnArrayLengthMismatch() public {
        (address[] memory owners, ) = _pair(alice, 5000, bob, 5000);
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10_000;
        vm.prank(backend);
        vm.expectRevert(LandRegistry__ArrayLengthMismatch.selector);
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnShareSumMismatch() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 5000, bob, 4000);
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__ShareTotalMismatch.selector, 9000, 10_000));
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnZeroShare() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 10_000, bob, 0);
        vm.prank(backend);
        vm.expectRevert(LandRegistry__InvalidShare.selector);
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnZeroAddressOwner() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 5000, address(0), 5000);
        vm.prank(backend);
        vm.expectRevert(LandRegistry__ZeroAddress.selector);
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnUnregisteredOwner() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 5000, mallory, 5000);
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAuthorizedHolder.selector, mallory));
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_revertsOnDuplicateOwner() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 5000, alice, 5000);
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__DuplicateOwner.selector, alice));
        importF.proposeLandImport(LAND, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    function test_propose_allowsGovtAuthorityWithoutCnic() public {
        (address[] memory owners, uint16[] memory shares) = _sole(govt);
        _propose(LAND, owners, shares);
        _assertStatus(LAND, LandStatus.PENDING_VERIFICATION);
    }

    function test_propose_setsPendingStateAndProposal() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 6000, bob, 4000);
        _propose(LAND, owners, shares);

        _assertStatus(LAND, LandStatus.PENDING_VERIFICATION);
        (
            address proposer,
            address[] memory pOwners,
            uint16[] memory pShares,
            uint256 verificationCount,
            ,
            uint256 nonce,
            uint64 deadline,
            bool isCancelled
        ) = importF.getImportProposal(LAND);

        assertEq(proposer, backend);
        assertEq(pOwners.length, 2);
        assertEq(pOwners[0], alice);
        assertEq(pShares[1], 4000);
        assertEq(verificationCount, 0);
        assertEq(nonce, 1);
        assertEq(deadline, uint64(block.timestamp) + VERIFICATION_DURATION);
        assertFalse(isCancelled);
    }

    // -------------------------------------------------------------------------
    // verifyLandImport — two-phase mint
    // -------------------------------------------------------------------------

    function test_verify_revertsOnUnknownLand() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandNotFound.selector, "NOPE"));
        importF.verifyLandImport("NOPE");
    }

    function test_verify_revertsForNonProposedOwner() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAProposedOwner.selector, bob));
        importF.verifyLandImport(LAND);
    }

    function test_verify_revertsOnDoubleVerification() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 5000, bob, 5000);
        _propose(LAND, owners, shares);

        vm.prank(alice);
        importF.verifyLandImport(LAND);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AlreadyVerified.selector);
        importF.verifyLandImport(LAND);
    }

    function test_verify_revertsAfterDeadline() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);
        uint64 deadline = uint64(block.timestamp) + VERIFICATION_DURATION;

        vm.warp(block.timestamp + VERIFICATION_DURATION + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__VerificationExpired.selector, LAND, deadline));
        importF.verifyLandImport(LAND);
    }

    function test_verify_partialDoesNotActivate() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 5000, bob, 5000);
        _propose(LAND, owners, shares);

        vm.prank(alice);
        importF.verifyLandImport(LAND);

        _assertStatus(LAND, LandStatus.PENDING_VERIFICATION);
        assertTrue(importF.isImportVerified(LAND, alice));
        assertFalse(importF.isImportVerified(LAND, bob));

        address[] memory pending = importF.getPendingVerifiers(LAND);
        assertEq(pending.length, 1);
        assertEq(pending[0], bob);
    }

    function test_verify_lastOwnerFinalizesMint() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 6000, bob, 4000);
        _propose(LAND, owners, shares);

        vm.prank(alice);
        importF.verifyLandImport(LAND);
        vm.prank(bob);
        importF.verifyLandImport(LAND);

        // Status + share ledger
        _assertStatus(LAND, LandStatus.ACTIVE);
        assertEq(core.getShareBps(LAND, alice), 6000);
        assertEq(core.getShareBps(LAND, bob), 4000);
        _assertSharesTotal(LAND);

        // NFT is minted to the diamond itself — plot identity, self-custodial
        uint256 tokenId = core.getTokenIdFromLandId(LAND);
        assertEq(core.ownerOf(tokenId), diamondAddr);
        assertEq(core.tokenURI(tokenId), string(abi.encodePacked("ipfs://", IPFS_HASH)));

        // Genesis history entries (one per owner, from address(0))
        OwnershipChange[] memory hist = importF.getOwnershipHistory(LAND);
        assertEq(hist.length, 2);
        assertEq(hist[0].from, address(0));
        assertEq(hist[0].to, alice);
        assertEq(hist[0].shareBps, 6000);

        // Reverse indexes
        assertEq(core.getLandsByOwner(alice).length, 1);
        assertEq(core.getLandsByCnic("35202-1111111-1")[0], LAND);
        assertEq(core.totalLandRecords(), 1);
    }

    function test_verificationStatus_reportsExpiry() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);

        (, , uint256 total, , bool isExpiredBefore) = importF.getVerificationStatus(LAND);
        assertEq(total, 1);
        assertFalse(isExpiredBefore);

        vm.warp(block.timestamp + VERIFICATION_DURATION + 1);
        (, , , , bool isExpiredAfter) = importF.getVerificationStatus(LAND);
        assertTrue(isExpiredAfter);
    }

    // -------------------------------------------------------------------------
    // expireLandImport / cancelLandImport
    // -------------------------------------------------------------------------

    function test_expire_revertsBeforeDeadline() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);
        uint64 deadline = uint64(block.timestamp) + VERIFICATION_DURATION;

        vm.expectRevert(abi.encodeWithSelector(LandRegistry__VerificationNotExpired.selector, LAND, deadline));
        importF.expireLandImport(LAND);
    }

    function test_expire_freesLandIdForReproposal() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);

        vm.warp(block.timestamp + VERIFICATION_DURATION + 1);
        importF.expireLandImport(LAND); // anyone may call

        // landId is free again — a fresh proposal succeeds
        _propose(LAND, owners, shares);
        _assertStatus(LAND, LandStatus.PENDING_VERIFICATION);
        (, , , , , uint256 nonce, , ) = importF.getImportProposal(LAND);
        assertEq(nonce, 2);
    }

    function test_cancel_onlyRegistrar() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);

        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        importF.cancelLandImport(LAND);
    }

    function test_cancel_deletesShell() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);

        vm.prank(backend);
        importF.cancelLandImport(LAND);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandNotFound.selector, LAND));
        importF.verifyLandImport(LAND);
    }

    // -------------------------------------------------------------------------
    // disputeLandImport / resolveLandImportDispute
    // -------------------------------------------------------------------------

    function test_dispute_onlyProposedOwner() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAProposedOwner.selector, bob));
        importF.disputeLandImport(LAND);
    }

    function test_dispute_locksImportAndBlocksVerify() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 5000, bob, 5000);
        _propose(LAND, owners, shares);

        vm.prank(alice);
        importF.disputeLandImport(LAND);
        _assertStatus(LAND, LandStatus.LOCKED_IMPORT_DISPUTE);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotInImportPhase.selector, LAND));
        importF.verifyLandImport(LAND);
    }

    function test_resolveDispute_onlyResolver() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        importF.resolveLandImportDispute(LAND, true, COURT_CID);
    }

    function test_resolveDispute_revertsIfNotDisputed() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);

        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__ImportNotDisputed.selector, LAND));
        importF.resolveLandImportDispute(LAND, true, COURT_CID);
    }

    function test_resolveDispute_forceApproveFinalizes() public {
        (address[] memory owners, uint16[] memory shares) = _pair(alice, 5000, bob, 5000);
        _propose(LAND, owners, shares);
        vm.prank(alice);
        importF.disputeLandImport(LAND);

        vm.prank(backend);
        importF.resolveLandImportDispute(LAND, true, COURT_CID);

        _assertStatus(LAND, LandStatus.ACTIVE);
        _assertSharesTotal(LAND);
        (, , , , string memory cid, , , ) = importF.getImportProposal(LAND);
        assertEq(cid, COURT_CID);
    }

    function test_resolveDispute_rejectDeletesShell() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);
        vm.prank(alice);
        importF.disputeLandImport(LAND);

        vm.prank(backend);
        importF.resolveLandImportDispute(LAND, false, COURT_CID);

        // shell gone — land can be proposed afresh
        _propose(LAND, owners, shares);
        _assertStatus(LAND, LandStatus.PENDING_VERIFICATION);
    }

    // -------------------------------------------------------------------------
    // transferShare
    // -------------------------------------------------------------------------

    function test_transferShare_movesBpsAndLogsHistory() public {
        _mintSole(LAND, alice);

        vm.prank(alice);
        importF.transferShare(LAND, bob, 2500, 1 ether);

        assertEq(core.getShareBps(LAND, alice), 7500);
        assertEq(core.getShareBps(LAND, bob), 2500);
        _assertSharesTotal(LAND);

        OwnershipChange[] memory hist = importF.getOwnershipHistory(LAND);
        assertEq(hist.length, 2); // genesis + transfer
        assertEq(hist[1].from, alice);
        assertEq(hist[1].to, bob);
        assertEq(hist[1].price, 1 ether);
    }

    function test_transferShare_fullBalanceRemovesSeller() public {
        _mintSole(LAND, alice);

        vm.prank(alice);
        importF.transferShare(LAND, bob, 10_000, 0);

        assertEq(core.getShareBps(LAND, alice), 0);
        assertEq(core.getShareholders(LAND).length, 1);
        assertEq(core.getShareholders(LAND)[0], bob);
        assertEq(core.getLandsByOwner(alice).length, 0);
        _assertSharesTotal(LAND);
    }

    function test_transferShare_revertsOnSelfTransfer() public {
        _mintSole(LAND, alice);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__SelfTransfer.selector);
        importF.transferShare(LAND, alice, 1000, 0);
    }

    function test_transferShare_revertsOnZeroRecipient() public {
        _mintSole(LAND, alice);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__ZeroAddress.selector);
        importF.transferShare(LAND, address(0), 1000, 0);
    }

    function test_transferShare_revertsOnZeroShare() public {
        _mintSole(LAND, alice);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__InvalidShare.selector);
        importF.transferShare(LAND, bob, 0, 0);
    }

    function test_transferShare_revertsOnUnregisteredRecipient() public {
        _mintSole(LAND, alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAuthorizedHolder.selector, mallory));
        importF.transferShare(LAND, mallory, 1000, 0);
    }

    function test_transferShare_revertsOnInsufficientShare() public {
        _mintPair(LAND, alice, 6000, bob, 4000);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__InsufficientShare.selector, bob, 4000, 5000));
        importF.transferShare(LAND, carol, 5000, 0);
    }

    function test_transferShare_revertsWhileNotActive() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandNotActive.selector, LAND));
        importF.transferShare(LAND, bob, 1000, 0);
    }

    function test_transferShare_toGovtAuthorityAllowed() public {
        _mintSole(LAND, alice);
        vm.prank(alice);
        importF.transferShare(LAND, govt, 1000, 0);
        assertEq(core.getShareBps(LAND, govt), 1000);
    }
}
