// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DiamondCutFacet} from "../contracts/diamond/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../contracts/diamond/facets/DiamondLoupeFacet.sol";
import {IdentityFacet} from "../contracts/diamond/facets/IdentityFacet.sol";
import {FacetCut, FacetCutAction} from "../contracts/diamond/LibDiamond.sol";

/**
 * REPAIR CUT — cnicToAddress(string) selector routing.
 *
 * The original deploy script wired IdentityFacet.cnicToAddress under the
 * ImportFacet cut. ImportFacet has no function with that selector, so every
 * cnicToAddress call through the diamond reverts with empty data — which
 * breaks the co-owner CNIC→wallet resolution step in /api/verify.
 *
 * This script removes the broken route and re-adds the selector pointing at
 * the diamond's real IdentityFacet (discovered via the loupe). Run once per
 * affected deployment:
 *
 *   DIAMOND_ADDRESS=0x... PRIVATE_KEY=0x... \
 *   forge script script/FixCnicSelectorCut.s.sol --rpc-url sepolia --broadcast
 *
 * PRIVATE_KEY must be the diamond contract owner (the deployer account).
 */
contract FixCnicSelectorCut is Script {
    function run() external {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        address diamond = vm.envAddress("DIAMOND_ADDRESS");

        bytes4 sel = IdentityFacet.cnicToAddress.selector;
        DiamondLoupeFacet loupe = DiamondLoupeFacet(diamond);

        address currentRoute = loupe.facetAddress(sel);
        address identityFacet = loupe.facetAddress(IdentityFacet.registerUser.selector);
        console2.log("cnicToAddress currently routed to:", currentRoute);
        console2.log("IdentityFacet lives at           :", identityFacet);
        require(identityFacet != address(0), "loupe could not find IdentityFacet");
        require(currentRoute != identityFacet, "already fixed - nothing to do");

        bytes4[] memory sels = new bytes4[](1);
        sels[0] = sel;

        // Remove first if the selector is wired anywhere, then add correctly.
        uint256 n = currentRoute == address(0) ? 1 : 2;
        FacetCut[] memory cuts = new FacetCut[](n);
        uint256 i;
        if (currentRoute != address(0)) {
            cuts[i++] = FacetCut(address(0), FacetCutAction.Remove, sels);
        }
        cuts[i] = FacetCut(identityFacet, FacetCutAction.Add, sels);

        vm.startBroadcast(ownerKey);
        DiamondCutFacet(diamond).diamondCut(cuts, address(0), "");
        vm.stopBroadcast();

        console2.log("cnicToAddress now routed to:", loupe.facetAddress(sel));
    }
}
