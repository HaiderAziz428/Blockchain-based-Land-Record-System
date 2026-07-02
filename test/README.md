# Smart-Contract Test Suite

Foundry test suite for the LandRegistry EIP-2535 Diamond (`contracts/diamond/`).
**173 tests across 8 suites — every wired external function of every facet is
exercised, including revert paths, pause behaviour, and adversarial reentrancy.**

## Running

```bash
# one-time: vendored libs are not committed (see .gitignore)
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-commit

forge test                                                      # run all 173 tests
forge coverage --ir-minimum \
  --no-match-coverage "(script|lib|contracts/LandRegistry)"     # measure coverage
```

Measured at last run: **91% line coverage** of the diamond contracts overall,
**~97% across the nine facets** (the gap is mostly rarely-hit LibDiamond
cut/replace branches).

## Layout

| File | Covers |
|------|--------|
| `helpers/DiamondFixture.sol` | Deploys the diamond with the same facet/selector wiring as `script/DeployDiamond.s.sol`; registers the standing test actors |
| `Identity.t.sol` | `registerUser`, CNIC uniqueness, role grant/revoke/renounce, govt-authority whitelist |
| `Import.t.sol` | Two-phase mint (`proposeLandImport` → `verifyLandImport`), expiry, dispute, cancel, resolve, `transferShare` |
| `LandCore.t.sol` | ERC-721 surface (soulbound behaviour), pause, `emergencyWithdraw` escrow protection, views + pagination |
| `Marketplace.t.sol` | Listing lifecycle, `buyShare` (CEI, refunds, maxPrice guard), pull-payment `withdrawProceeds`, **reentrancy attackers** |
| `Inheritance.t.sol` | Appeals, proposal validation, unanimous share redistribution, dispute/freeze/resolve, voting expiry |
| `Subdivision.t.sol` | Plan validation, unanimous execution (parent burn + child mints), lineage, legal-override log |
| `Occupancy.t.sol` | Grant/revoke agreements, time-window filtering |
| `Diamond.t.sol` | Loupe introspection, cut authorization, add/remove selector upgrade path, `receive()` |

## Bug found by this suite

The original deploy script wired `cnicToAddress(string)` under the **ImportFacet**
cut. ImportFacet has no function with that selector, so every `cnicToAddress`
call through the diamond reverts — confirmed live on both Sepolia deployments
(`0xbA6b…26e8` and `0x1d08…457A`), which breaks the co-owner CNIC→wallet
resolution step in `/api/verify`.

The wiring is fixed in `script/DeployDiamond.s.sol` for future deployments, and
`script/FixCnicSelectorCut.s.sol` repairs an existing deployment in place with a
single `diamondCut` transaction (run it as the diamond owner).

## Foundry + via-IR gotcha

With `via_ir = true`, a local variable holding `uint64(block.timestamp)` can be
rematerialized as a fresh `TIMESTAMP` read after `vm.warp`, silently changing its
value mid-test. Derive post-warp arguments from `block.timestamp` at use time
(see `Occupancy.t.sol`).
