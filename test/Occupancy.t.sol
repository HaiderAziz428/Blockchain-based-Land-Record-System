// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {DiamondFixture} from "./helpers/DiamondFixture.sol";
import {OccupancyAgreement, OccupancyCategory, LandStatus} from "../contracts/diamond/AppStorage.sol";
import "../contracts/diamond/Errors.sol";

contract OccupancyTest is DiamondFixture {
    string internal constant LAND = "DHA-P9-PLOT-30";
    string internal constant TERMS_CID = "QmLeaseTerms";

    function _grant(address grantor, address occupant, uint64 start, uint64 end) internal returns (uint64) {
        vm.prank(grantor);
        return occup.grantOccupancy(LAND, OccupancyCategory.RESIDENTIAL_LEASE, occupant, start, end, TERMS_CID, "");
    }

    // -------------------------------------------------------------------------
    // grantOccupancy
    // -------------------------------------------------------------------------

    function test_grant_storesAgreementWithSequentialIds() public {
        _mintSole(LAND, alice);
        uint64 now_ = uint64(block.timestamp);

        uint64 id0 = _grant(alice, bob, now_, now_ + 30 days);
        uint64 id1 = _grant(alice, carol, now_, now_ + 60 days);
        assertEq(id0, 0);
        assertEq(id1, 1);

        OccupancyAgreement memory ag = occup.getOccupancyAgreement(LAND, id0);
        assertEq(ag.grantor, alice);
        assertEq(ag.occupant, bob);
        assertEq(uint8(ag.category), uint8(OccupancyCategory.RESIDENTIAL_LEASE));
        assertEq(ag.termsCid, TERMS_CID);
        assertFalse(ag.isRevoked);
        assertEq(occup.getOccupancyAgreements(LAND).length, 2);
    }

    function test_grant_revertsForNonShareholder() public {
        _mintSole(LAND, alice);
        uint64 now_ = uint64(block.timestamp);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotAShareholder.selector, bob));
        occup.grantOccupancy(LAND, OccupancyCategory.USE_RIGHT, carol, now_, now_ + 30 days, TERMS_CID, "");
    }

    function test_grant_revertsOnZeroOccupant() public {
        _mintSole(LAND, alice);
        uint64 now_ = uint64(block.timestamp);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__ZeroAddress.selector);
        occup.grantOccupancy(LAND, OccupancyCategory.USE_RIGHT, address(0), now_, now_ + 30 days, TERMS_CID, "");
    }

    function test_grant_revertsOnInvalidPeriod() public {
        _mintSole(LAND, alice);
        uint64 now_ = uint64(block.timestamp);

        // start >= end
        vm.prank(alice);
        vm.expectRevert(LandRegistry__InvalidOccupancyPeriod.selector);
        occup.grantOccupancy(LAND, OccupancyCategory.USE_RIGHT, bob, now_ + 10, now_ + 10, TERMS_CID, "");

        // end in the past (times derived from the post-warp clock — a cached
        // pre-warp timestamp can be rematerialized by the via-IR optimizer)
        vm.warp(block.timestamp + 100 days);
        uint64 pastStart = uint64(block.timestamp - 200);
        uint64 pastEnd = uint64(block.timestamp - 100);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__InvalidOccupancyPeriod.selector);
        occup.grantOccupancy(LAND, OccupancyCategory.USE_RIGHT, bob, pastStart, pastEnd, TERMS_CID, "");
    }

    function test_grant_revertsOnMissingTermsCid() public {
        _mintSole(LAND, alice);
        uint64 now_ = uint64(block.timestamp);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__InvalidStringLength.selector);
        occup.grantOccupancy(LAND, OccupancyCategory.USE_RIGHT, bob, now_, now_ + 30 days, "", "");
    }

    function test_grant_revertsOnOverlongDescriptionCid() public {
        _mintSole(LAND, alice);
        uint64 now_ = uint64(block.timestamp);
        vm.prank(alice);
        vm.expectRevert(LandRegistry__InvalidStringLength.selector);
        occup.grantOccupancy(
            LAND, OccupancyCategory.USE_RIGHT, bob, now_, now_ + 30 days, TERMS_CID, _longString()
        );
    }

    function test_grant_revertsWhileNotActive() public {
        (address[] memory owners, uint16[] memory shares) = _sole(alice);
        _propose(LAND, owners, shares);
        uint64 now_ = uint64(block.timestamp);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__LandNotActive.selector, LAND));
        occup.grantOccupancy(LAND, OccupancyCategory.USE_RIGHT, bob, now_, now_ + 30 days, TERMS_CID, "");
    }

    // -------------------------------------------------------------------------
    // revokeOccupancy
    // -------------------------------------------------------------------------

    function test_revoke_marksAgreementRevoked() public {
        _mintSole(LAND, alice);
        uint64 now_ = uint64(block.timestamp);
        uint64 id = _grant(alice, bob, now_, now_ + 30 days);

        vm.prank(alice);
        occup.revokeOccupancy(LAND, id);
        assertTrue(occup.getOccupancyAgreement(LAND, id).isRevoked);

        vm.prank(alice);
        vm.expectRevert(LandRegistry__OccupancyAlreadyRevoked.selector);
        occup.revokeOccupancy(LAND, id);
    }

    function test_revoke_onlyGrantor() public {
        _mintSole(LAND, alice);
        uint64 now_ = uint64(block.timestamp);
        uint64 id = _grant(alice, bob, now_, now_ + 30 days);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__NotOccupancyGrantor.selector, bob));
        occup.revokeOccupancy(LAND, id);
    }

    function test_revoke_revertsOnUnknownId() public {
        _mintSole(LAND, alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__OccupancyNotFound.selector, uint64(9)));
        occup.revokeOccupancy(LAND, 9);
    }

    function test_getAgreement_revertsOnUnknownId() public {
        _mintSole(LAND, alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__OccupancyNotFound.selector, uint64(0)));
        occup.getOccupancyAgreement(LAND, 0);
    }

    // -------------------------------------------------------------------------
    // getActiveOccupancyAgreements — time-window + revocation filtering
    // -------------------------------------------------------------------------

    function test_activeAgreements_filterByWindowAndRevocation() public {
        _mintSole(LAND, alice);
        uint64 now_ = uint64(block.timestamp);

        uint64 current = _grant(alice, bob, now_, now_ + 30 days); // live now
        _grant(alice, carol, now_ + 60 days, now_ + 90 days); // future
        uint64 revoked = _grant(alice, dave, now_, now_ + 30 days); // will revoke

        vm.prank(alice);
        occup.revokeOccupancy(LAND, revoked);

        OccupancyAgreement[] memory active = occup.getActiveOccupancyAgreements(LAND);
        assertEq(active.length, 1);
        assertEq(active[0].id, current);
        assertEq(active[0].occupant, bob);

        // After the lease ends nothing is active
        vm.warp(now_ + 31 days);
        assertEq(occup.getActiveOccupancyAgreements(LAND).length, 0);

        // In the future window, carol's lease becomes the active one
        vm.warp(now_ + 61 days);
        active = occup.getActiveOccupancyAgreements(LAND);
        assertEq(active.length, 1);
        assertEq(active[0].occupant, carol);
    }
}
