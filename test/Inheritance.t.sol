// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {DiamondFixture} from "./helpers/DiamondFixture.sol";
import {
    LandStatus, InheritanceAppeal, INHERITANCE_VOTING_DURATION, MAX_HEIRS
} from "../contracts/diamond/AppStorage.sol";
import "../contracts/diamond/Errors.sol";

contract InheritanceTest is DiamondFixture {
    string internal constant LAND = "DHA-P9-PLOT-11";

    function _heirsPair() internal view returns (address[] memory heirs, uint16[] memory shares) {
        heirs = new address[](2);
        heirs[0] = bob;
        heirs[1] = carol;
        shares = new uint16[](2);
        shares[0] = 6000;
        shares[1] = 4000;
    }

    /// Mint to alice (sole owner) and open a succession plan: alice → bob 6000 / carol 4000.
    function _openPlan() internal {
        _mintSole(LAND, alice);
        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        vm.prank(backend);
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, 0);
    }

    // -------------------------------------------------------------------------
    // fileInheritanceAppeal
    // -------------------------------------------------------------------------

    function test_appeal_storesRecordAndIncrementsId() public {
        _mintSole(LAND, alice);

        vm.prank(bob);
        uint256 id = inherit.fileInheritanceAppeal(LAND, alice, COURT_CID);
        assertEq(id, 1);
        assertEq(inherit.totalInheritanceAppeals(), 1);

        InheritanceAppeal memory a = inherit.getInheritanceAppeal(id);
        assertEq(a.landId, LAND);
        assertEq(a.deceasedHolder, alice);
        assertEq(a.filer, bob);
        assertFalse(a.isProcessed);

        uint256[] memory byLand = inherit.getInheritanceAppealsForLand(LAND);
        assertEq(byLand.length, 1);
        assertEq(byLand[0], id);
    }

    function test_appeal_revertsForUnregisteredFiler() public {
        _mintSole(LAND, alice);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAuthorizedHolder.selector, mallory));
        inherit.fileInheritanceAppeal(LAND, alice, COURT_CID);
    }

    function test_appeal_revertsIfDeceasedHasNoShares() public {
        _mintSole(LAND, alice);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__DeceasedHasNoShares.selector, dave, LAND));
        inherit.fileInheritanceAppeal(LAND, dave, COURT_CID);
    }

    // -------------------------------------------------------------------------
    // initiateInheritance — validation
    // -------------------------------------------------------------------------

    function test_initiate_onlyRegistrar() public {
        _mintSole(LAND, alice);
        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, 0);
    }

    function test_initiate_revertsIfDeceasedHasNoShares() public {
        _mintSole(LAND, alice);
        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__DeceasedHasNoShares.selector, dave, LAND));
        inherit.initiateInheritance(LAND, dave, heirs, shares, COURT_CID, 0);
    }

    function test_initiate_revertsOnNoHeirs() public {
        _mintSole(LAND, alice);
        vm.prank(backend);
        vm.expectRevert(LandRegistry__NoHeirs.selector);
        inherit.initiateInheritance(LAND, alice, new address[](0), new uint16[](0), COURT_CID, 0);
    }

    function test_initiate_revertsOnTooManyHeirs() public {
        _mintSole(LAND, alice);
        address[] memory heirs = new address[](MAX_HEIRS + 1);
        for (uint256 i = 0; i < heirs.length; i++) {
            heirs[i] = address(uint160(i + 1));
        }
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__TooManyHeirs.selector, MAX_HEIRS + 1, MAX_HEIRS));
        inherit.initiateInheritance(LAND, alice, heirs, new uint16[](0), COURT_CID, 0);
    }

    function test_initiate_revertsIfHeirIsDeceased() public {
        _mintSole(LAND, alice);
        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        heirs[0] = alice;
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__HeirIsDeceased.selector, alice));
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, 0);
    }

    function test_initiate_revertsOnDuplicateHeir() public {
        _mintSole(LAND, alice);
        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        heirs[1] = bob;
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__DuplicateHeir.selector, bob));
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, 0);
    }

    function test_initiate_revertsOnUnregisteredHeir() public {
        _mintSole(LAND, alice);
        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        heirs[1] = mallory;
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAuthorizedHolder.selector, mallory));
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, 0);
    }

    function test_initiate_revertsIfSharesDontMatchDeceasedHolding() public {
        // Alice holds only 6000 bps — heir shares of 10,000 must revert
        _mintPair(LAND, alice, 6000, dave, 4000);
        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__ShareTotalMismatch.selector, 10_000, 6000));
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, 0);
    }

    function test_initiate_revertsOnInvalidAppealId() public {
        _mintSole(LAND, alice);
        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__InvalidAppealId.selector, 99));
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, 99);
    }

    function test_initiate_revertsOnAppealLandMismatch() public {
        _mintSole(LAND, alice);
        _mintSole("OTHER-LAND", alice);
        vm.prank(bob);
        uint256 appealId = inherit.fileInheritanceAppeal("OTHER-LAND", alice, COURT_CID);

        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        vm.prank(backend);
        vm.expectRevert(
            abi.encodeWithSelector(LandRegistry__AppealLandMismatch.selector, appealId, "OTHER-LAND", LAND)
        );
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, appealId);
    }

    function test_initiate_consumesAppealExactlyOnce() public {
        _mintSole(LAND, alice);
        vm.prank(bob);
        uint256 appealId = inherit.fileInheritanceAppeal(LAND, alice, COURT_CID);

        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        vm.prank(backend);
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, appealId);
        assertTrue(inherit.getInheritanceAppeal(appealId).isProcessed);
        _assertStatus(LAND, LandStatus.PENDING_INHERITANCE);

        // Reset to ACTIVE via expiry, then attempt to reuse the appeal
        vm.warp(block.timestamp + INHERITANCE_VOTING_DURATION + 1);
        inherit.expireInheritance(LAND);

        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__AppealAlreadyProcessed.selector, appealId));
        inherit.initiateInheritance(LAND, alice, heirs, shares, COURT_CID, appealId);
    }

    function test_initiate_locksLand() public {
        _openPlan();
        _assertStatus(LAND, LandStatus.PENDING_INHERITANCE);

        // Locked land cannot be transferred or listed
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandNotActive.selector, LAND));
        importF.transferShare(LAND, bob, 1000, 0);
    }

    // -------------------------------------------------------------------------
    // approveSuccessionPlan — unanimous execution
    // -------------------------------------------------------------------------

    function test_approve_revertsWithoutPlan() public {
        _mintSole(LAND, alice);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NoPendingPlan.selector, LAND));
        inherit.approveSuccessionPlan(LAND);
    }

    function test_approve_revertsForNonHeir() public {
        _openPlan();
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAnHeir.selector, dave));
        inherit.approveSuccessionPlan(LAND);
    }

    function test_approve_revertsOnDoubleVote() public {
        _openPlan();
        vm.prank(bob);
        inherit.approveSuccessionPlan(LAND);
        vm.prank(bob);
        vm.expectRevert(LandRegistry__AlreadyVoted.selector);
        inherit.approveSuccessionPlan(LAND);
    }

    function test_approve_revertsAfterVotingDeadline() public {
        _openPlan();
        vm.warp(block.timestamp + INHERITANCE_VOTING_DURATION + 1);
        vm.prank(bob);
        vm.expectRevert();
        inherit.approveSuccessionPlan(LAND);
    }

    function test_approve_partialKeepsPlanPending() public {
        _openPlan();
        vm.prank(bob);
        inherit.approveSuccessionPlan(LAND);

        assertTrue(inherit.hasHeirApproved(LAND, bob));
        assertFalse(inherit.hasHeirApproved(LAND, carol));
        _assertStatus(LAND, LandStatus.PENDING_INHERITANCE);
        (, , , uint256 approvals, bool executed, , , , , ) = inherit.getInheritanceRequest(LAND);
        assertEq(approvals, 1);
        assertFalse(executed);
    }

    function test_approve_unanimousRedistributesShares() public {
        _openPlan();
        vm.prank(bob);
        inherit.approveSuccessionPlan(LAND);
        vm.prank(carol);
        inherit.approveSuccessionPlan(LAND);

        // Deceased removed; heirs credited; invariant holds; land unlocked
        assertEq(core.getShareBps(LAND, alice), 0);
        assertEq(core.getShareBps(LAND, bob), 6000);
        assertEq(core.getShareBps(LAND, carol), 4000);
        _assertSharesTotal(LAND);
        _assertStatus(LAND, LandStatus.ACTIVE);

        (, , , , bool executed, , , , , ) = inherit.getInheritanceRequest(LAND);
        assertTrue(executed);

        // The original token is preserved — inheritance is share redistribution
        assertEq(core.ownerOf(core.getTokenIdFromLandId(LAND)), diamondAddr);
    }

    // -------------------------------------------------------------------------
    // dispute / expire / freeze / resolve
    // -------------------------------------------------------------------------

    function test_dispute_revertsForNonHeir() public {
        _openPlan();
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAnHeir.selector, dave));
        inherit.disputeSuccessionPlan(LAND);
    }

    function test_dispute_locksLand() public {
        _openPlan();
        vm.prank(carol);
        inherit.disputeSuccessionPlan(LAND);
        _assertStatus(LAND, LandStatus.LOCKED_INHERITANCE_DISPUTE);

        // Voting is blocked while locked
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NoPendingPlan.selector, LAND));
        inherit.approveSuccessionPlan(LAND);
    }

    function test_expire_revertsBeforeDeadline() public {
        _openPlan();
        vm.expectRevert();
        inherit.expireInheritance(LAND);
    }

    function test_expire_unlocksLandAfterDeadline() public {
        _openPlan();
        vm.warp(block.timestamp + INHERITANCE_VOTING_DURATION + 1);
        inherit.expireInheritance(LAND); // anyone may call

        _assertStatus(LAND, LandStatus.ACTIVE);
        assertEq(core.getShareBps(LAND, alice), 10_000); // untouched
    }

    function test_freeze_onlyResolver() public {
        _openPlan();
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        inherit.freezeInheritanceForReview(LAND, "court injunction");
    }

    function test_freeze_locksWithoutHeirDispute() public {
        _openPlan();
        vm.prank(backend);
        inherit.freezeInheritanceForReview(LAND, "court injunction");
        _assertStatus(LAND, LandStatus.LOCKED_INHERITANCE_DISPUTE);
    }

    function test_resolve_onlyResolver() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        inherit.resolveInheritanceDispute(LAND, true, COURT_CID, "QmLegal", "why");
    }

    function test_resolve_revertsIfNotDisputed() public {
        _openPlan();
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__InheritanceNotDisputed.selector, LAND));
        inherit.resolveInheritanceDispute(LAND, true, COURT_CID, "QmLegal", "why");
    }

    function test_resolve_forceExecutesPlan() public {
        _openPlan();
        vm.prank(carol);
        inherit.disputeSuccessionPlan(LAND);

        vm.prank(backend);
        inherit.resolveInheritanceDispute(LAND, true, "QmUpdatedCourt", "QmLegal", "mediation concluded");

        assertEq(core.getShareBps(LAND, bob), 6000);
        assertEq(core.getShareBps(LAND, carol), 4000);
        _assertSharesTotal(LAND);
        _assertStatus(LAND, LandStatus.ACTIVE);
        (, , , , , , string memory cid, , , ) = inherit.getInheritanceRequest(LAND);
        assertEq(cid, "QmUpdatedCourt");
    }

    function test_resolve_revertPathRestoresActive() public {
        _openPlan();
        vm.prank(carol);
        inherit.disputeSuccessionPlan(LAND);

        vm.prank(backend);
        inherit.resolveInheritanceDispute(LAND, false, COURT_CID, "QmLegal", "plan rejected");

        _assertStatus(LAND, LandStatus.ACTIVE);
        assertEq(core.getShareBps(LAND, alice), 10_000); // shares untouched
    }

    // -------------------------------------------------------------------------
    // computeSharesHash
    // -------------------------------------------------------------------------

    function test_computeSharesHash_matchesOnChainCommitment() public {
        _openPlan();
        (address[] memory heirs, uint16[] memory shares) = _heirsPair();
        bytes32 expected = inherit.computeSharesHash(heirs, shares, COURT_CID);
        (, , , , , , , , bytes32 stored, ) = inherit.getInheritanceRequest(LAND);
        assertEq(stored, expected);
    }
}
