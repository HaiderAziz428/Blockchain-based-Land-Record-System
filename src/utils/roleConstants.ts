// src/utils/roleConstants.ts
//
// Hardcoded keccak256 role hashes for the v9 contract.
// These match the Solidity constants in LandRegistry.sol.
// Computed via: keccak256(toUtf8Bytes("ROLE_NAME"))

// DEFAULT_ADMIN_ROLE in OpenZeppelin AccessControl = bytes32(0)
export const ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

// keccak256("REGISTRAR_ROLE")
export const REGISTRAR_ROLE =
  "0x8b23fbe7e2d9d4cd75bcc85bfadc64f95c4644cb0e0c4e67b5555752f622d7e6" as `0x${string}`;

// keccak256("RESOLVER_ROLE")
export const RESOLVER_ROLE =
  "0x01e4ac3f1e0a363c506378bb6ebe715f0bc98f0c35481667ef8868965462a844" as `0x${string}`;

// keccak256("PAUSER_ROLE")
export const PAUSER_ROLE =
  "0x8111c0b7931d64f6e016b3fc1fbca086ac8491154a2b6864d969c6c5e6b0f059" as `0x${string}`;

// keccak256("GOVT_AUTHORITY_ROLE")
export const GOVT_AUTHORITY_ROLE =
  "0x462deda26d02d1b84ab18fb9d1577ceeab130983aafc697b0b22a1c07c0d5657" as `0x${string}`;

/**
 * Format basis points as a human-readable percentage string.
 * e.g. 5000 => "50%", 3333 => "33.33%"
 */
export function formatBps(bps: number | bigint): string {
  const n = Number(bps);
  const pct = (n / 100).toFixed(2).replace(/\.?0+$/, "");
  return `${pct}%`;
}
