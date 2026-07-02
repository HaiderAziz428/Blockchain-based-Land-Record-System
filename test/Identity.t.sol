// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {DiamondFixture} from "./helpers/DiamondFixture.sol";
import {
    ADMIN_ROLE, REGISTRAR_ROLE, RESOLVER_ROLE, PAUSER_ROLE, GOVT_AUTHORITY_ROLE, UserProfile
} from "../contracts/diamond/AppStorage.sol";
import "../contracts/diamond/Errors.sol";

contract IdentityTest is DiamondFixture {
    // -------------------------------------------------------------------------
    // registerUser
    // -------------------------------------------------------------------------

    function test_registerUser_storesProfileAndCnicLink() public {
        vm.prank(mallory);
        identity.registerUser("Mallory", "35202-9999999-9");

        UserProfile memory p = identity.getUser(mallory);
        assertEq(p.name, "Mallory");
        assertEq(p.cnic, "35202-9999999-9");
        assertTrue(p.isRegistered);
        assertEq(identity.cnicToAddress("35202-9999999-9"), mallory);
    }

    function test_registerUser_revertsIfWalletAlreadyRegistered() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__AlreadyRegistered.selector, alice));
        identity.registerUser("Alice2", "35202-8888888-8");
    }

    function test_registerUser_revertsIfCnicAlreadyLinked() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(LandRegistry__CnicAlreadyLinked.selector, "35202-1111111-1"));
        identity.registerUser("Fake Alice", "35202-1111111-1");
    }

    function test_registerUser_revertsOnEmptyName() public {
        vm.prank(mallory);
        vm.expectRevert(LandRegistry__InvalidStringLength.selector);
        identity.registerUser("", "35202-9999999-9");
    }

    function test_registerUser_revertsOnOverlongCnic() public {
        vm.prank(mallory);
        vm.expectRevert(LandRegistry__InvalidStringLength.selector);
        identity.registerUser("Mallory", _longString());
    }

    function test_registerUser_revertsWhenPaused() public {
        vm.prank(admin);
        core.pause();

        vm.prank(mallory);
        vm.expectRevert(LandRegistry__Paused.selector);
        identity.registerUser("Mallory", "35202-9999999-9");
    }

    // -------------------------------------------------------------------------
    // setGovtAuthority
    // -------------------------------------------------------------------------

    function test_setGovtAuthority_grantAndRevoke() public {
        address inst = makeAddr("institution");
        assertFalse(identity.isGovtAuthority(inst));

        vm.prank(admin);
        identity.setGovtAuthority(inst, true);
        assertTrue(identity.isGovtAuthority(inst));
        assertTrue(identity.hasRole(GOVT_AUTHORITY_ROLE, inst));

        vm.prank(admin);
        identity.setGovtAuthority(inst, false);
        assertFalse(identity.isGovtAuthority(inst));
    }

    function test_setGovtAuthority_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        identity.setGovtAuthority(alice, true);
    }

    function test_setGovtAuthority_revertsOnZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(LandRegistry__ZeroAddress.selector);
        identity.setGovtAuthority(address(0), true);
    }

    // -------------------------------------------------------------------------
    // Role administration
    // -------------------------------------------------------------------------

    function test_constructorRoleWiring() public view {
        assertTrue(identity.hasRole(ADMIN_ROLE, admin));
        assertTrue(identity.hasRole(PAUSER_ROLE, admin));
        assertTrue(identity.hasRole(REGISTRAR_ROLE, backend));
        assertTrue(identity.hasRole(RESOLVER_ROLE, backend));
        assertEq(identity.getRoleAdmin(REGISTRAR_ROLE), ADMIN_ROLE);
        assertEq(identity.getRoleAdmin(RESOLVER_ROLE), ADMIN_ROLE);
        assertEq(identity.getRoleAdmin(PAUSER_ROLE), ADMIN_ROLE);
    }

    function test_grantRole_byAdmin() public {
        vm.prank(admin);
        identity.grantRole(REGISTRAR_ROLE, eve);
        assertTrue(identity.hasRole(REGISTRAR_ROLE, eve));
    }

    function test_grantRole_deniedForNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        identity.grantRole(REGISTRAR_ROLE, alice);
    }

    function test_revokeRole_byAdmin() public {
        vm.prank(admin);
        identity.revokeRole(REGISTRAR_ROLE, backend);
        assertFalse(identity.hasRole(REGISTRAR_ROLE, backend));
    }

    function test_revokeRole_deniedForNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        identity.revokeRole(REGISTRAR_ROLE, backend);
    }

    function test_renounceRole_selfOnly() public {
        vm.prank(backend);
        identity.renounceRole(REGISTRAR_ROLE, backend);
        assertFalse(identity.hasRole(REGISTRAR_ROLE, backend));
    }

    function test_renounceRole_revertsForOtherAccount() public {
        vm.prank(alice);
        vm.expectRevert(LandRegistry__AccessDenied.selector);
        identity.renounceRole(REGISTRAR_ROLE, backend);
    }
}
