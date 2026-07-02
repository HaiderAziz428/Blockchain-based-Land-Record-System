// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Diamond} from "../../contracts/diamond/Diamond.sol";
import {DiamondCutFacet} from "../../contracts/diamond/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../../contracts/diamond/facets/DiamondLoupeFacet.sol";
import {IdentityFacet} from "../../contracts/diamond/facets/IdentityFacet.sol";
import {LandCoreFacet} from "../../contracts/diamond/facets/LandCoreFacet.sol";
import {ImportFacet} from "../../contracts/diamond/facets/ImportFacet.sol";
import {MarketplaceFacet} from "../../contracts/diamond/facets/MarketplaceFacet.sol";
import {InheritanceFacet} from "../../contracts/diamond/facets/InheritanceFacet.sol";
import {SubdivisionFacet} from "../../contracts/diamond/facets/SubdivisionFacet.sol";
import {OccupancyFacet} from "../../contracts/diamond/facets/OccupancyFacet.sol";
import {FacetCut, FacetCutAction} from "../../contracts/diamond/LibDiamond.sol";
import {LandType, LandStatus} from "../../contracts/diamond/AppStorage.sol";

/**
 * Deploys the diamond exactly as script/DeployDiamond.s.sol does — same facets,
 * same selector wiring — and registers a standing cast of test actors.
 * Every *.t.sol suite inherits from this fixture.
 */
abstract contract DiamondFixture is Test {
    Diamond internal diamond;
    address internal diamondAddr;

    // Standalone facet deployments (needed for cut addresses / loupe assertions)
    DiamondCutFacet internal cutFacetImpl;
    DiamondLoupeFacet internal loupeFacetImpl;
    IdentityFacet internal identityFacetImpl;
    LandCoreFacet internal coreFacetImpl;
    ImportFacet internal importFacetImpl;
    MarketplaceFacet internal marketFacetImpl;
    InheritanceFacet internal inheritFacetImpl;
    SubdivisionFacet internal subdivFacetImpl;
    OccupancyFacet internal occupFacetImpl;

    // Typed views onto the diamond
    DiamondCutFacet internal cutter;
    DiamondLoupeFacet internal loupe;
    IdentityFacet internal identity;
    LandCoreFacet internal core;
    ImportFacet internal importF;
    MarketplaceFacet internal market;
    InheritanceFacet internal inherit;
    SubdivisionFacet internal subdiv;
    OccupancyFacet internal occup;

    // Actors
    address internal admin = makeAddr("admin"); // contract owner, ADMIN + PAUSER
    address internal backend = makeAddr("backend"); // REGISTRAR + RESOLVER
    address internal alice = makeAddr("alice"); // registered citizen
    address internal bob = makeAddr("bob"); // registered citizen
    address internal carol = makeAddr("carol"); // registered citizen
    address internal dave = makeAddr("dave"); // registered citizen
    address internal eve = makeAddr("eve"); // registered citizen
    address internal mallory = makeAddr("mallory"); // NOT registered
    address internal govt = makeAddr("govt"); // GOVT_AUTHORITY, not registered

    string internal constant IPFS_HASH = "QmTestMetadataHash";
    string internal constant COURT_CID = "QmCourtOrderCid";

    function setUp() public virtual {
        vm.startPrank(admin);

        cutFacetImpl = new DiamondCutFacet();
        diamond = new Diamond(admin, address(cutFacetImpl), backend);
        diamondAddr = address(diamond);

        loupeFacetImpl = new DiamondLoupeFacet();
        identityFacetImpl = new IdentityFacet();
        coreFacetImpl = new LandCoreFacet();
        importFacetImpl = new ImportFacet();
        marketFacetImpl = new MarketplaceFacet();
        inheritFacetImpl = new InheritanceFacet();
        subdivFacetImpl = new SubdivisionFacet();
        occupFacetImpl = new OccupancyFacet();

        FacetCut[] memory cuts = new FacetCut[](8);
        cuts[0] = FacetCut(address(loupeFacetImpl), FacetCutAction.Add, _loupeFacetSelectors());
        cuts[1] = FacetCut(address(identityFacetImpl), FacetCutAction.Add, _identityFacetSelectors());
        cuts[2] = FacetCut(address(coreFacetImpl), FacetCutAction.Add, _coreFacetSelectors());
        cuts[3] = FacetCut(address(importFacetImpl), FacetCutAction.Add, _importFacetSelectors());
        cuts[4] = FacetCut(address(marketFacetImpl), FacetCutAction.Add, _marketFacetSelectors());
        cuts[5] = FacetCut(address(inheritFacetImpl), FacetCutAction.Add, _inheritFacetSelectors());
        cuts[6] = FacetCut(address(subdivFacetImpl), FacetCutAction.Add, _subdivFacetSelectors());
        cuts[7] = FacetCut(address(occupFacetImpl), FacetCutAction.Add, _occupFacetSelectors());

        DiamondCutFacet(diamondAddr).diamondCut(cuts, address(0), "");
        vm.stopPrank();

        cutter = DiamondCutFacet(diamondAddr);
        loupe = DiamondLoupeFacet(diamondAddr);
        identity = IdentityFacet(diamondAddr);
        core = LandCoreFacet(diamondAddr);
        importF = ImportFacet(diamondAddr);
        market = MarketplaceFacet(diamondAddr);
        inherit = InheritanceFacet(diamondAddr);
        subdiv = SubdivisionFacet(diamondAddr);
        occup = OccupancyFacet(diamondAddr);

        _register(alice, "Alice", "35202-1111111-1");
        _register(bob, "Bob", "35202-2222222-2");
        _register(carol, "Carol", "35202-3333333-3");
        _register(dave, "Dave", "35202-4444444-4");
        _register(eve, "Eve", "35202-5555555-5");

        vm.prank(admin);
        identity.setGovtAuthority(govt, true);
    }

    // -------------------------------------------------------------------------
    // Actor / flow helpers
    // -------------------------------------------------------------------------

    function _register(address who, string memory name_, string memory cnic) internal {
        vm.prank(who);
        identity.registerUser(name_, cnic);
    }

    function _sole(address owner) internal pure returns (address[] memory owners, uint16[] memory shares) {
        owners = new address[](1);
        owners[0] = owner;
        shares = new uint16[](1);
        shares[0] = 10_000;
    }

    function _pair(
        address a,
        uint16 aBps,
        address b,
        uint16 bBps
    ) internal pure returns (address[] memory owners, uint16[] memory shares) {
        owners = new address[](2);
        owners[0] = a;
        owners[1] = b;
        shares = new uint16[](2);
        shares[0] = aBps;
        shares[1] = bBps;
    }

    function _propose(string memory landId, address[] memory owners, uint16[] memory shares) internal {
        vm.prank(backend);
        importF.proposeLandImport(landId, IPFS_HASH, LandType.RESIDENTIAL, owners, shares, "");
    }

    /// Full two-phase mint for a sole owner: propose + verify → ACTIVE.
    function _mintSole(string memory landId, address owner) internal {
        (address[] memory owners, uint16[] memory shares) = _sole(owner);
        _propose(landId, owners, shares);
        vm.prank(owner);
        importF.verifyLandImport(landId);
    }

    /// Full two-phase mint for two co-owners.
    function _mintPair(string memory landId, address a, uint16 aBps, address b, uint16 bBps) internal {
        (address[] memory owners, uint16[] memory shares) = _pair(a, aBps, b, bBps);
        _propose(landId, owners, shares);
        vm.prank(a);
        importF.verifyLandImport(landId);
        vm.prank(b);
        importF.verifyLandImport(landId);
    }

    function _longString() internal pure returns (string memory) {
        return string(new bytes(257));
    }

    function _assertStatus(string memory landId, LandStatus expected) internal view {
        assertEq(uint8(core.getLandRecord(landId).status), uint8(expected), "land status mismatch");
    }

    /// Invariant I1: an ACTIVE land's shares always sum to exactly 10,000 bps.
    function _assertSharesTotal(string memory landId) internal view {
        assertEq(core.getTotalShares(landId), 10_000, "share ledger must sum to TOTAL_SHARES");
    }

    // -------------------------------------------------------------------------
    // Selector sets — identical to script/DeployDiamond.s.sol
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
        sels[i++] = bytes4(keccak256("safeTransferFrom(address,address,uint256)"));
        sels[i++] = bytes4(keccak256("safeTransferFrom(address,address,uint256,bytes)"));
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
        assembly {
            mstore(sels, i)
        }
    }

    function _importFacetSelectors() internal pure returns (bytes4[] memory sels) {
        sels = new bytes4[](13);
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
        assembly {
            mstore(sels, i)
        }
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
        assembly {
            mstore(sels, i)
        }
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
        assembly {
            mstore(sels, i)
        }
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
