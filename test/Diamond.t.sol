// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {DiamondFixture} from "./helpers/DiamondFixture.sol";
import {Diamond} from "../contracts/diamond/Diamond.sol";
import {DiamondCutFacet} from "../contracts/diamond/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet, Facet} from "../contracts/diamond/facets/DiamondLoupeFacet.sol";
import {IdentityFacet} from "../contracts/diamond/facets/IdentityFacet.sol";
import {MarketplaceFacet} from "../contracts/diamond/facets/MarketplaceFacet.sol";
import {FacetCut, FacetCutAction} from "../contracts/diamond/LibDiamond.sol";

contract DiamondTest is DiamondFixture {
    string internal constant LAND = "DHA-P9-PLOT-99";

    // -------------------------------------------------------------------------
    // Constructor guards
    // -------------------------------------------------------------------------

    function test_constructor_rejectsZeroOwnerOrBackend() public {
        vm.expectRevert(bytes("Diamond: zero owner"));
        new Diamond(address(0), address(cutFacetImpl), backend);

        vm.expectRevert(bytes("Diamond: zero backend"));
        new Diamond(admin, address(cutFacetImpl), address(0));
    }

    // -------------------------------------------------------------------------
    // Loupe introspection
    // -------------------------------------------------------------------------

    function test_loupe_reportsNineFacets() public view {
        // 9 facets total: cut + loupe + the 7 specialised business facets
        assertEq(loupe.facetAddresses().length, 9);
        assertEq(loupe.facets().length, 9);
    }

    function test_loupe_selectorRouting() public view {
        assertEq(loupe.facetAddress(IdentityFacet.registerUser.selector), address(identityFacetImpl));
        assertEq(loupe.facetAddress(MarketplaceFacet.buyShare.selector), address(marketFacetImpl));
        assertEq(loupe.facetAddress(bytes4(0xdeadbeef)), address(0));
        assertEq(loupe.facetFunctionSelectors(address(marketFacetImpl)).length, 8);
    }

    function test_unknownSelectorReverts() public {
        (bool ok, bytes memory ret) = diamondAddr.call(abi.encodeWithSelector(bytes4(0xdeadbeef)));
        assertFalse(ok);
        assertEq(_revertMessage(ret), "Diamond: Function does not exist");
    }

    // -------------------------------------------------------------------------
    // diamondCut — the upgrade path and its governance
    // -------------------------------------------------------------------------

    function test_cut_onlyContractOwner() public {
        FacetCut[] memory cuts = new FacetCut[](1);
        bytes4[] memory sels = new bytes4[](1);
        sels[0] = MarketplaceFacet.totalMarketplaceTrades.selector;
        cuts[0] = FacetCut(address(marketFacetImpl), FacetCutAction.Add, sels);

        vm.prank(mallory);
        vm.expectRevert(bytes("LibDiamond: Must be contract owner"));
        cutter.diamondCut(cuts, address(0), "");
    }

    /// The deploy script leaves totalMarketplaceTrades unwired; the owner can
    /// add it later without redeploying or migrating state — the EIP-2535
    /// upgrade path working as designed.
    function test_cut_ownerCanAddSelectorLater() public {
        bytes4 sel = MarketplaceFacet.totalMarketplaceTrades.selector;

        (bool okBefore, ) = diamondAddr.call(abi.encodeWithSelector(sel, LAND));
        assertFalse(okBefore, "selector must start unwired");

        FacetCut[] memory cuts = new FacetCut[](1);
        bytes4[] memory sels = new bytes4[](1);
        sels[0] = sel;
        cuts[0] = FacetCut(address(marketFacetImpl), FacetCutAction.Add, sels);
        vm.prank(admin);
        cutter.diamondCut(cuts, address(0), "");

        // Callable now — and live against existing state
        _mintSole(LAND, alice);
        vm.prank(alice);
        market.listShareForSale(LAND, 1000, 1 ether, "Qm");
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        market.buyShare{value: 1 ether}(LAND, alice, 1 ether);

        assertEq(MarketplaceFacet(diamondAddr).totalMarketplaceTrades(LAND), 1);
    }

    function test_cut_removeSelectorDisablesFunction() public {
        // Wire it in, then remove it again (remove requires facetAddress == 0)
        bytes4 sel = MarketplaceFacet.totalMarketplaceTrades.selector;
        bytes4[] memory sels = new bytes4[](1);
        sels[0] = sel;

        FacetCut[] memory addCut = new FacetCut[](1);
        addCut[0] = FacetCut(address(marketFacetImpl), FacetCutAction.Add, sels);
        vm.prank(admin);
        cutter.diamondCut(addCut, address(0), "");

        FacetCut[] memory removeCut = new FacetCut[](1);
        removeCut[0] = FacetCut(address(0), FacetCutAction.Remove, sels);
        vm.prank(admin);
        cutter.diamondCut(removeCut, address(0), "");

        (bool ok, bytes memory ret) = diamondAddr.call(abi.encodeWithSelector(sel, LAND));
        assertFalse(ok);
        assertEq(_revertMessage(ret), "Diamond: Function does not exist");
    }

    // -------------------------------------------------------------------------
    // receive()
    // -------------------------------------------------------------------------

    function test_receive_acceptsPlainEth() public {
        vm.deal(address(this), 1 ether);
        (bool ok, ) = diamondAddr.call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(diamondAddr.balance, 1 ether);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _revertMessage(bytes memory ret) internal pure returns (string memory) {
        // Error(string) selector + ABI-encoded string
        if (ret.length < 68) return "";
        assembly {
            ret := add(ret, 0x04)
        }
        return abi.decode(ret, (string));
    }
}
