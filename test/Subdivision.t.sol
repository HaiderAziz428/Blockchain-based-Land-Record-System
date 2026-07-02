// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {DiamondFixture} from "./helpers/DiamondFixture.sol";
import {
    LandStatus, SubdivisionProposalInput, LegalOverride, MAX_SUBDIVISIONS_PER_PROPOSAL
} from "../contracts/diamond/AppStorage.sol";
import "../contracts/diamond/Errors.sol";

contract SubdivisionTest is DiamondFixture {
    string internal constant PARENT = "DHA-P9-BLOCK-A";
    string internal constant CHILD1 = "DHA-P9-BLOCK-A-1";
    string internal constant CHILD2 = "DHA-P9-BLOCK-A-2";
    string internal constant SURVEY_CID = "QmSurveyCid";

    /// Two children, each sole-owned: child1 → alice, child2 → bob.
    function _twoChildInput() internal view returns (SubdivisionProposalInput memory input) {
        input.newLandIds = new string[](2);
        input.newLandIds[0] = CHILD1;
        input.newLandIds[1] = CHILD2;
        input.newIpfsHashes = new string[](2);
        input.newIpfsHashes[0] = "QmChild1";
        input.newIpfsHashes[1] = "QmChild2";
        input.newLandShareholders = new address[][](2);
        input.newLandShares = new uint16[][](2);
        (input.newLandShareholders[0], input.newLandShares[0]) = _sole(alice);
        (input.newLandShareholders[1], input.newLandShares[1]) = _sole(bob);
        input.courtOrderCid = COURT_CID;
        input.surveyMetadataCid = SURVEY_CID;
    }

    function _openPlan() internal {
        _mintPair(PARENT, alice, 6000, bob, 4000);
        vm.prank(backend);
        subdiv.proposeSubdivision(PARENT, _twoChildInput());
    }

    function _execute() internal {
        _openPlan();
        vm.prank(alice);
        subdiv.approveSubdivision(PARENT);
        vm.prank(bob);
        subdiv.approveSubdivision(PARENT);
    }

    // -------------------------------------------------------------------------
    // proposeSubdivision — validation
    // -------------------------------------------------------------------------

    function test_propose_onlyRegistrar() public {
        _mintPair(PARENT, alice, 6000, bob, 4000);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        subdiv.proposeSubdivision(PARENT, _twoChildInput());
    }

    function test_propose_requiresCourtAndSurveyCids() public {
        _mintPair(PARENT, alice, 6000, bob, 4000);

        SubdivisionProposalInput memory input = _twoChildInput();
        input.courtOrderCid = "";
        vm.prank(backend);
        vm.expectRevert(LandRegistry__InvalidStringLength.selector);
        subdiv.proposeSubdivision(PARENT, input);

        input = _twoChildInput();
        input.surveyMetadataCid = "";
        vm.prank(backend);
        vm.expectRevert(LandRegistry__InvalidStringLength.selector);
        subdiv.proposeSubdivision(PARENT, input);
    }

    function test_propose_revertsOnZeroChildren() public {
        _mintPair(PARENT, alice, 6000, bob, 4000);
        SubdivisionProposalInput memory input = _twoChildInput();
        input.newLandIds = new string[](0);
        input.newIpfsHashes = new string[](0);
        input.newLandShareholders = new address[][](0);
        input.newLandShares = new uint16[][](0);

        vm.prank(backend);
        vm.expectRevert(LandRegistry__InvalidSubdivisionCount.selector);
        subdiv.proposeSubdivision(PARENT, input);
    }

    function test_propose_revertsAboveMaxChildren() public {
        _mintPair(PARENT, alice, 6000, bob, 4000);
        SubdivisionProposalInput memory input = _twoChildInput();
        input.newLandIds = new string[](MAX_SUBDIVISIONS_PER_PROPOSAL + 1);

        vm.prank(backend);
        vm.expectRevert(LandRegistry__InvalidSubdivisionCount.selector);
        subdiv.proposeSubdivision(PARENT, input);
    }

    function test_propose_revertsOnDuplicateChildIds() public {
        _mintPair(PARENT, alice, 6000, bob, 4000);
        SubdivisionProposalInput memory input = _twoChildInput();
        input.newLandIds[1] = CHILD1;

        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__DuplicateNewLandId.selector, CHILD1));
        subdiv.proposeSubdivision(PARENT, input);
    }

    function test_propose_revertsIfChildIdAlreadyExists() public {
        _mintSole(CHILD1, carol);
        _mintPair(PARENT, alice, 6000, bob, 4000);

        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandAlreadyExists.selector, CHILD1));
        subdiv.proposeSubdivision(PARENT, _twoChildInput());
    }

    function test_propose_revertsOnInvalidChildShares() public {
        _mintPair(PARENT, alice, 6000, bob, 4000);
        SubdivisionProposalInput memory input = _twoChildInput();
        input.newLandShares[0][0] = 9999; // child ledger must sum to 10,000

        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__ShareTotalMismatch.selector, 9999, 10_000));
        subdiv.proposeSubdivision(PARENT, input);
    }

    function test_propose_revertsWhileNotActive() public {
        _openPlan(); // parent now PENDING_SUBDIVISION
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandNotActive.selector, PARENT));
        subdiv.proposeSubdivision(PARENT, _twoChildInput());
    }

    function test_propose_locksParentAndStoresPlan() public {
        _openPlan();
        _assertStatus(PARENT, LandStatus.PENDING_SUBDIVISION);

        (
            string[] memory newLandIds,
            ,
            string memory courtCid,
            string memory surveyCid,
            uint256 approvals,
            bool executed,
            uint256 nonce
        ) = subdiv.getSubdivisionPlan(PARENT);
        assertEq(newLandIds.length, 2);
        assertEq(courtCid, COURT_CID);
        assertEq(surveyCid, SURVEY_CID);
        assertEq(approvals, 0);
        assertFalse(executed);
        assertEq(nonce, 1);

        (address[] memory holders, uint16[] memory shares) = subdiv.getSubdivisionPart(PARENT, 0);
        assertEq(holders[0], alice);
        assertEq(shares[0], 10_000);
    }

    // -------------------------------------------------------------------------
    // approveSubdivision — unanimous execution
    // -------------------------------------------------------------------------

    function test_approve_revertsWithoutPlan() public {
        _mintPair(PARENT, alice, 6000, bob, 4000);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NoPendingSubdivision.selector, PARENT));
        subdiv.approveSubdivision(PARENT);
    }

    function test_approve_revertsForNonShareholder() public {
        _openPlan();
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAShareholder.selector, carol));
        subdiv.approveSubdivision(PARENT);
    }

    function test_approve_revertsOnDoubleVote() public {
        _openPlan();
        vm.prank(alice);
        subdiv.approveSubdivision(PARENT);
        assertTrue(subdiv.hasShareholderApprovedSubdivision(PARENT, alice));

        vm.prank(alice);
        vm.expectRevert(LandRegistry__AlreadyVoted.selector);
        subdiv.approveSubdivision(PARENT);
    }

    function test_approve_unanimousExecutesSubdivision() public {
        _execute();

        // Parent: terminal state, NFT burned, ledger cleared
        _assertStatus(PARENT, LandStatus.SUBDIVIDED);
        assertEq(core.getShareholders(PARENT).length, 0);
        uint256 parentTokenId = core.getTokenIdFromLandId(PARENT);
        vm.expectRevert(bytes("LandCore: nonexistent token"));
        core.ownerOf(parentTokenId);

        // Children: ACTIVE, minted, seeded ledgers
        _assertStatus(CHILD1, LandStatus.ACTIVE);
        _assertStatus(CHILD2, LandStatus.ACTIVE);
        assertEq(core.getShareBps(CHILD1, alice), 10_000);
        assertEq(core.getShareBps(CHILD2, bob), 10_000);
        _assertSharesTotal(CHILD1);
        _assertSharesTotal(CHILD2);
        assertEq(core.ownerOf(core.getTokenIdFromLandId(CHILD1)), diamondAddr);

        // Lineage
        assertEq(subdiv.getParentLand(CHILD1), PARENT);
        assertEq(subdiv.getChildLands(PARENT).length, 2);
        assertEq(subdiv.getSubdivisionGeneration(CHILD1), 1);

        string[] memory lineage = subdiv.getSubdivisionLineage(CHILD1);
        assertEq(lineage.length, 2);
        assertEq(lineage[0], PARENT);
        assertEq(lineage[1], CHILD1);

        // Owner reverse-index moved from parent to child
        assertEq(core.getLandsByOwner(alice).length, 1);
        assertEq(core.getLandsByOwner(alice)[0], CHILD1);
    }

    function test_secondGenerationLineage() public {
        _execute();

        // Subdivide CHILD1 (sole owner alice) again
        SubdivisionProposalInput memory input;
        input.newLandIds = new string[](1);
        input.newLandIds[0] = "DHA-P9-BLOCK-A-1-X";
        input.newIpfsHashes = new string[](1);
        input.newIpfsHashes[0] = "QmGrandchild";
        input.newLandShareholders = new address[][](1);
        input.newLandShares = new uint16[][](1);
        (input.newLandShareholders[0], input.newLandShares[0]) = _sole(alice);
        input.courtOrderCid = COURT_CID;
        input.surveyMetadataCid = SURVEY_CID;

        vm.prank(backend);
        subdiv.proposeSubdivision(CHILD1, input);
        vm.prank(alice);
        subdiv.approveSubdivision(CHILD1);

        assertEq(subdiv.getSubdivisionGeneration("DHA-P9-BLOCK-A-1-X"), 2);
        string[] memory lineage = subdiv.getSubdivisionLineage("DHA-P9-BLOCK-A-1-X");
        assertEq(lineage.length, 3);
        assertEq(lineage[0], PARENT);
        assertEq(lineage[1], CHILD1);
        assertEq(lineage[2], "DHA-P9-BLOCK-A-1-X");
    }

    // -------------------------------------------------------------------------
    // dispute / freeze / resolve
    // -------------------------------------------------------------------------

    function test_dispute_revertsForNonShareholder() public {
        _openPlan();
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAShareholder.selector, carol));
        subdiv.disputeSubdivision(PARENT);
    }

    function test_dispute_locksParent() public {
        _openPlan();
        vm.prank(bob);
        subdiv.disputeSubdivision(PARENT);
        _assertStatus(PARENT, LandStatus.LOCKED_SUBDIVISION_DISPUTE);
    }

    function test_freeze_onlyResolver() public {
        _openPlan();
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        subdiv.freezeSubdivisionForReview(PARENT, "review");
    }

    function test_freeze_locksPendingPlan() public {
        _openPlan();
        vm.prank(backend);
        subdiv.freezeSubdivisionForReview(PARENT, "boundary review");
        _assertStatus(PARENT, LandStatus.LOCKED_SUBDIVISION_DISPUTE);
    }

    function test_resolve_onlyResolver() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        subdiv.resolveSubdivisionDispute(PARENT, true, COURT_CID, "QmLegal", "why");
    }

    function test_resolve_revertsIfNotDisputed() public {
        _openPlan();
        vm.prank(backend);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__SubdivisionNotDisputed.selector, PARENT));
        subdiv.resolveSubdivisionDispute(PARENT, true, COURT_CID, "QmLegal", "why");
    }

    function test_resolve_forceExecutesAndLogsOverride() public {
        _openPlan();
        vm.prank(bob);
        subdiv.disputeSubdivision(PARENT);

        vm.prank(backend);
        subdiv.resolveSubdivisionDispute(PARENT, true, "QmUpdatedCourt", "QmLegal", "mediation concluded");

        _assertStatus(PARENT, LandStatus.SUBDIVIDED);
        _assertStatus(CHILD1, LandStatus.ACTIVE);

        assertEq(subdiv.totalSubdivisionLegalOverrides(PARENT), 1);
        LegalOverride memory ov = subdiv.getSubdivisionLegalOverride(PARENT, 0);
        assertEq(ov.resolver, backend);
        assertTrue(ov.forceExecuted);
        assertEq(ov.legalResolutionCid, "QmLegal");
        assertEq(subdiv.getSubdivisionLegalOverrides(PARENT).length, 1);
    }

    function test_resolve_revertPathRestoresActive() public {
        _openPlan();
        vm.prank(bob);
        subdiv.disputeSubdivision(PARENT);

        vm.prank(backend);
        subdiv.resolveSubdivisionDispute(PARENT, false, COURT_CID, "QmLegal", "plan rejected");

        _assertStatus(PARENT, LandStatus.ACTIVE);
        assertEq(core.getShareBps(PARENT, alice), 6000); // ledger untouched
        LegalOverride memory ov = subdiv.getSubdivisionLegalOverride(PARENT, 0);
        assertFalse(ov.forceExecuted);
    }
}
