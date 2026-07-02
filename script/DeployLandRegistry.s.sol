// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {LandRegistry} from "../contracts/LandRegistryDeploy.sol";

/**
 * @title  DeployLandRegistry
 * @notice Foundry deploy script for LandRegistry (hybrid governance v9).
 *
 * @dev    Usage:
 *
 *         1. Dry-run (no broadcast, estimates gas only):
 *            forge script script/DeployLandRegistry.s.sol \
 *              --rpc-url sepolia \
 *              -vvvv
 *
 *         2. Broadcast + verify on Sepolia:
 *            forge script script/DeployLandRegistry.s.sol \
 *              --rpc-url sepolia \
 *              --broadcast \
 *              --verify \
 *              -vvvv
 *
 *         Required env vars (set in .env or shell):
 *           PRIVATE_KEY         — deployer wallet private key (0x...)
 *           BACKEND_ADDRESS     — wallet that gets REGISTRAR_ROLE + RESOLVER_ROLE
 *           SEPOLIA_RPC_URL     — Sepolia JSON-RPC endpoint
 *           ETHERSCAN_API_KEY   — for --verify flag
 */
contract DeployLandRegistry is Script {
    function run() external {
        // Read env
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address backend = vm.envAddress("BACKEND_ADDRESS");

        address deployer = vm.addr(deployerKey);
        console.log("Deployer:", deployer);
        console.log("Backend (REGISTRAR + RESOLVER):", backend);

        vm.startBroadcast(deployerKey);

        LandRegistry registry = new LandRegistry(backend);

        vm.stopBroadcast();

        console.log("LandRegistry deployed at:", address(registry));
        console.log("TOTAL_SHARES:", registry.TOTAL_SHARES());
        console.log("VERIFICATION_DURATION (s):", registry.VERIFICATION_DURATION());
        console.log("INHERITANCE_VOTING_DURATION (s):", registry.INHERITANCE_VOTING_DURATION());
    }
}
