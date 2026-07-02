// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Diamond} from "../contracts/diamond/Diamond.sol";
import {DiamondCutFacet} from "../contracts/diamond/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../contracts/diamond/facets/DiamondLoupeFacet.sol";
import {IdentityFacet} from "../contracts/diamond/facets/IdentityFacet.sol";
import {LandCoreFacet} from "../contracts/diamond/facets/LandCoreFacet.sol";
import {ImportFacet} from "../contracts/diamond/facets/ImportFacet.sol";
import {MarketplaceFacet} from "../contracts/diamond/facets/MarketplaceFacet.sol";
import {InheritanceFacet} from "../contracts/diamond/facets/InheritanceFacet.sol";
import {SubdivisionFacet} from "../contracts/diamond/facets/SubdivisionFacet.sol";
import {OccupancyFacet} from "../contracts/diamond/facets/OccupancyFacet.sol";
import {LibDiamond, FacetCut, FacetCutAction} from "../contracts/diamond/LibDiamond.sol";

// ============================================================================
// DEPLOY DIAMOND SCRIPT
// ============================================================================

contract DeployDiamond is Script {

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        // BACKEND_ADDRESS: wallet granted REGISTRAR_ROLE + RESOLVER_ROLE.
        // Defaults to deployer if not set (fine for dev/demo — separate in production).
        address backend = vm.envOr("BACKEND_ADDRESS", deployer);

        console2.log("Deployer :", deployer);
        console2.log("Backend  :", backend);

        vm.startBroadcast(deployerKey);

        // ------------------------------------------------------------------
        // 1. Deploy DiamondCutFacet first — Diamond constructor needs it
        // ------------------------------------------------------------------
        DiamondCutFacet cutFacet = new DiamondCutFacet();
        console2.log("DiamondCutFacet    :", address(cutFacet));

        // ------------------------------------------------------------------
        // 2. Deploy Diamond proxy
        // ------------------------------------------------------------------
        Diamond diamond = new Diamond(deployer, address(cutFacet), backend);
        console2.log("Diamond            :", address(diamond));

        // ------------------------------------------------------------------
        // 3. Deploy all other facets
        // ------------------------------------------------------------------
        DiamondLoupeFacet loupeFacet   = new DiamondLoupeFacet();
        IdentityFacet     identityFacet= new IdentityFacet();
        LandCoreFacet     coreFacet    = new LandCoreFacet();
        ImportFacet       importFacet  = new ImportFacet();
        MarketplaceFacet  marketFacet  = new MarketplaceFacet();
        InheritanceFacet  inheritFacet = new InheritanceFacet();
        SubdivisionFacet  subdivFacet  = new SubdivisionFacet();
        OccupancyFacet    occupFacet   = new OccupancyFacet();

        console2.log("DiamondLoupeFacet  :", address(loupeFacet));
        console2.log("IdentityFacet      :", address(identityFacet));
        console2.log("LandCoreFacet      :", address(coreFacet));
        console2.log("ImportFacet        :", address(importFacet));
        console2.log("MarketplaceFacet   :", address(marketFacet));
        console2.log("InheritanceFacet   :", address(inheritFacet));
        console2.log("SubdivisionFacet   :", address(subdivFacet));
        console2.log("OccupancyFacet     :", address(occupFacet));

        // ------------------------------------------------------------------
        // 4. Build FacetCut[] array
        // ------------------------------------------------------------------
        FacetCut[] memory cuts = new FacetCut[](8);

        // DiamondLoupeFacet
        cuts[0] = FacetCut({
            facetAddress: address(loupeFacet),
            action: FacetCutAction.Add,
            functionSelectors: _loupeFacetSelectors()
        });

        // IdentityFacet
        cuts[1] = FacetCut({
            facetAddress: address(identityFacet),
            action: FacetCutAction.Add,
            functionSelectors: _identityFacetSelectors()
        });

        // LandCoreFacet
        cuts[2] = FacetCut({
            facetAddress: address(coreFacet),
            action: FacetCutAction.Add,
            functionSelectors: _coreFacetSelectors()
        });

        // ImportFacet
        cuts[3] = FacetCut({
            facetAddress: address(importFacet),
            action: FacetCutAction.Add,
            functionSelectors: _importFacetSelectors()
        });

        // MarketplaceFacet
        cuts[4] = FacetCut({
            facetAddress: address(marketFacet),
            action: FacetCutAction.Add,
            functionSelectors: _marketFacetSelectors()
        });

        // InheritanceFacet
        cuts[5] = FacetCut({
            facetAddress: address(inheritFacet),
            action: FacetCutAction.Add,
            functionSelectors: _inheritFacetSelectors()
        });

        // SubdivisionFacet
        cuts[6] = FacetCut({
            facetAddress: address(subdivFacet),
            action: FacetCutAction.Add,
            functionSelectors: _subdivFacetSelectors()
        });

        // OccupancyFacet
        cuts[7] = FacetCut({
            facetAddress: address(occupFacet),
            action: FacetCutAction.Add,
            functionSelectors: _occupFacetSelectors()
        });

        // ------------------------------------------------------------------
        // 5. Execute diamond cut
        // ------------------------------------------------------------------
        DiamondCutFacet(address(diamond)).diamondCut(cuts, address(0), "");

        console2.log("Diamond cut complete. All facets wired.");

        vm.stopBroadcast();
    }

    // -------------------------------------------------------------------------
    // Selector helpers
    // -------------------------------------------------------------------------

    function _loupeFacetSelectors() internal pure returns (bytes4[] memory sels) {
        sels = new bytes4[](5);
        sels[0] = DiamondLoupeFacet.facets.selector;
        sels[1] = DiamondLoupeFacet.facetFunctionSelectors.selector;
        sels[2] = DiamondLoupeFacet.facetAddresses.selector;
        sels[3] = DiamondLoupeFacet.facetAddress.selector;
        sels[4] = DiamondLoupeFacet.supportsInterface.selector;
    }

    function _identityFacetSelectors() internal pure returns (bytes4[] memory sels) {
        sels = new bytes4[](10);
        sels[0] = IdentityFacet.registerUser.selector;
        sels[1] = IdentityFacet.setGovtAuthority.selector;
        sels[2] = IdentityFacet.grantRole.selector;
        sels[3] = IdentityFacet.revokeRole.selector;
        sels[4] = IdentityFacet.renounceRole.selector;
        sels[5] = IdentityFacet.getUser.selector;
        sels[6] = IdentityFacet.hasRole.selector;
        sels[7] = IdentityFacet.getRoleAdmin.selector;
        sels[8] = IdentityFacet.isGovtAuthority.selector;
        // cnicToAddress lives on IdentityFacet — wiring it to any other facet
        // makes every call revert (no matching selector at the target).
        sels[9] = IdentityFacet.cnicToAddress.selector;
    }

    function _coreFacetSelectors() internal pure returns (bytes4[] memory sels) {
        sels = new bytes4[](30);
        uint256 i;
        sels[i++] = LandCoreFacet.pause.selector;
        sels[i++] = LandCoreFacet.unpause.selector;
        sels[i++] = LandCoreFacet.emergencyWithdraw.selector;
        sels[i++] = LandCoreFacet.name.selector;
        sels[i++] = LandCoreFacet.symbol.selector;
        sels[i++] = LandCoreFacet.tokenURI.selector;
        sels[i++] = LandCoreFacet.balanceOf.selector;
        sels[i++] = LandCoreFacet.ownerOf.selector;
        sels[i++] = LandCoreFacet.approve.selector;
        sels[i++] = LandCoreFacet.getApproved.selector;
        sels[i++] = LandCoreFacet.setApprovalForAll.selector;
        sels[i++] = LandCoreFacet.isApprovedForAll.selector;
        sels[i++] = LandCoreFacet.transferFrom.selector;
        // safeTransferFrom has two overloads — use explicit sigs
        sels[i++] = bytes4(keccak256("safeTransferFrom(address,address,uint256)"));
        sels[i++] = bytes4(keccak256("safeTransferFrom(address,address,uint256,bytes)"));
        // supportsInterface is already registered under DiamondLoupeFacet — skip here
        sels[i++] = LandCoreFacet.getLandRecord.selector;
        sels[i++] = LandCoreFacet.getShareholders.selector;
        sels[i++] = LandCoreFacet.getShareholdersWithBps.selector;
        sels[i++] = LandCoreFacet.getShareBps.selector;
        sels[i++] = LandCoreFacet.getTotalShares.selector;
        sels[i++] = LandCoreFacet.getTokenIdFromLandId.selector;
        sels[i++] = LandCoreFacet.getLandsByCnic.selector;
        sels[i++] = LandCoreFacet.getLandsByOwner.selector;
        sels[i++] = LandCoreFacet.totalLandRecords.selector;
        sels[i++] = LandCoreFacet.getAllLandRecordsPaginated.selector;
        sels[i++] = LandCoreFacet.getLandIdentity.selector;
        sels[i++] = LandCoreFacet.getOwnershipSnapshot.selector;
        sels[i++] = LandCoreFacet.getLandFullView.selector;
        sels[i++] = LandCoreFacet.pendingProceeds.selector;
        sels[i++] = LandCoreFacet.totalPendingWithdrawals.selector;
        // trim to actual count
        assembly { mstore(sels, i) }
    }

    function _importFacetSelectors() internal pure returns (bytes4[] memory sels) {
        sels = new bytes4[](14);
        uint256 i;
        sels[i++] = ImportFacet.proposeLandImport.selector;
        sels[i++] = ImportFacet.verifyLandImport.selector;
        sels[i++] = ImportFacet.expireLandImport.selector;
        sels[i++] = ImportFacet.disputeLandImport.selector;
        sels[i++] = ImportFacet.cancelLandImport.selector;
        sels[i++] = ImportFacet.resolveLandImportDispute.selector;
        sels[i++] = ImportFacet.transferShare.selector;
        sels[i++] = ImportFacet.getImportProposal.selector;
        sels[i++] = ImportFacet.isImportVerified.selector;
        sels[i++] = ImportFacet.getPendingVerifiers.selector;
        sels[i++] = ImportFacet.getVerificationStatus.selector;
        sels[i++] = ImportFacet.getOwnershipHistory.selector;
        assembly { mstore(sels, i) }
    }

    function _marketFacetSelectors() internal pure returns (bytes4[] memory sels) {
        sels = new bytes4[](8);
        sels[0] = MarketplaceFacet.listShareForSale.selector;
        sels[1] = MarketplaceFacet.updateListingPrice.selector;
        sels[2] = MarketplaceFacet.cancelListing.selector;
        sels[3] = MarketplaceFacet.buyShare.selector;
        sels[4] = MarketplaceFacet.withdrawProceeds.selector;
        sels[5] = MarketplaceFacet.getListing.selector;
        sels[6] = MarketplaceFacet.getMarketplaceHistory.selector;
        sels[7] = MarketplaceFacet.getMarketplaceTrade.selector;
        // totalMarketplaceTrades omitted — add if needed
    }

    function _inheritFacetSelectors() internal pure returns (bytes4[] memory sels) {
        sels = new bytes4[](13);
        uint256 i;
        sels[i++] = InheritanceFacet.fileInheritanceAppeal.selector;
        sels[i++] = InheritanceFacet.initiateInheritance.selector;
        sels[i++] = InheritanceFacet.approveSuccessionPlan.selector;
        sels[i++] = InheritanceFacet.disputeSuccessionPlan.selector;
        sels[i++] = InheritanceFacet.expireInheritance.selector;
        sels[i++] = InheritanceFacet.freezeInheritanceForReview.selector;
        sels[i++] = InheritanceFacet.resolveInheritanceDispute.selector;
        sels[i++] = InheritanceFacet.getInheritanceRequest.selector;
        sels[i++] = InheritanceFacet.hasHeirApproved.selector;
        sels[i++] = InheritanceFacet.getInheritanceAppealsForLand.selector;
        sels[i++] = InheritanceFacet.getInheritanceAppeal.selector;
        sels[i++] = InheritanceFacet.totalInheritanceAppeals.selector;
        sels[i++] = InheritanceFacet.computeSharesHash.selector;
        assembly { mstore(sels, i) }
    }

    function _subdivFacetSelectors() internal pure returns (bytes4[] memory sels) {
        sels = new bytes4[](15);
        uint256 i;
        sels[i++] = SubdivisionFacet.proposeSubdivision.selector;
        sels[i++] = SubdivisionFacet.approveSubdivision.selector;
        sels[i++] = SubdivisionFacet.disputeSubdivision.selector;
        sels[i++] = SubdivisionFacet.freezeSubdivisionForReview.selector;
        sels[i++] = SubdivisionFacet.resolveSubdivisionDispute.selector;
        sels[i++] = SubdivisionFacet.getSubdivisionPlan.selector;
        sels[i++] = SubdivisionFacet.getSubdivisionPart.selector;
        sels[i++] = SubdivisionFacet.hasShareholderApprovedSubdivision.selector;
        sels[i++] = SubdivisionFacet.getParentLand.selector;
        sels[i++] = SubdivisionFacet.getChildLands.selector;
        sels[i++] = SubdivisionFacet.getSubdivisionGeneration.selector;
        sels[i++] = SubdivisionFacet.getSubdivisionLineage.selector;
        sels[i++] = SubdivisionFacet.getSubdivisionLegalOverrides.selector;
        sels[i++] = SubdivisionFacet.getSubdivisionLegalOverride.selector;
        sels[i++] = SubdivisionFacet.totalSubdivisionLegalOverrides.selector;
        assembly { mstore(sels, i) }
    }

    function _occupFacetSelectors() internal pure returns (bytes4[] memory sels) {
        sels = new bytes4[](5);
        sels[0] = OccupancyFacet.grantOccupancy.selector;
        sels[1] = OccupancyFacet.revokeOccupancy.selector;
        sels[2] = OccupancyFacet.getOccupancyAgreements.selector;
        sels[3] = OccupancyFacet.getOccupancyAgreement.selector;
        sels[4] = OccupancyFacet.getActiveOccupancyAgreements.selector;
    }
}
