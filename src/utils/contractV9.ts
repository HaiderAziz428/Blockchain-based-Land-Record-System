// src/utils/contractV9.ts
//
// v9 contract surface (the version in contract.sol — NOT YET DEPLOYED).
// The legacy deployed Sepolia contract at the address in `./contract.ts` is v3
// and does NOT implement these functions. Pages/components built against this
// ABI fragment must be deployed alongside a v9 contract deployment.
//
// Kept separate from `contract.ts` so existing v3 pages continue to work.

/**
 * Replace before deploying v9. The legacy v3 address in `./contract.ts`
 * does not implement the v9 surface; calling these functions there reverts.
 */
export const CONTRACT_V9_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export enum LandStatusV9 {
  PENDING_VERIFICATION = 0,
  ACTIVE = 1,
  PENDING_INHERITANCE = 2,
  PENDING_SUBDIVISION = 3,
  LOCKED_IMPORT_DISPUTE = 4,
  LOCKED_INHERITANCE_DISPUTE = 5,
  LOCKED_SUBDIVISION_DISPUTE = 6,
  SUBDIVIDED = 7,
}

export enum LandTypeV9 {
  RESIDENTIAL = 0,
  AGRICULTURAL = 1,
  COMMERCIAL = 2,
}

export enum OccupancyCategoryV9 {
  RESIDENTIAL_LEASE = 0,
  AGRICULTURAL_LEASE = 1,
  COMMERCIAL_LEASE = 2,
  USE_RIGHT = 3,
  OTHER = 4,
}

/**
 * Read + write fragment used by the v9 frontend components. Hand-curated;
 * regenerate from the final v9 build artefact before deployment.
 */
export const CONTRACT_V9_ABI = [
  // ---- Land identity / ownership reads ----------------------------------
  {
    inputs: [{ name: "landId", type: "string" }],
    name: "getLandRecord",
    outputs: [{
      components: [
        { name: "landId", type: "string" },
        { name: "ipfsHash", type: "string" },
        { name: "landType", type: "uint8" },
        { name: "status", type: "uint8" },
        { name: "proposedAt", type: "uint64" },
        { name: "verifiedAt", type: "uint64" },
      ],
      name: "", type: "tuple",
    }],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [{ name: "landId", type: "string" }],
    name: "getShareholdersWithBps",
    outputs: [
      { name: "holders", type: "address[]" },
      { name: "shares", type: "uint16[]" },
    ],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [
      { name: "landId", type: "string" },
      { name: "holder", type: "address" },
    ],
    name: "getShareBps",
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [{ name: "landId", type: "string" }],
    name: "getTotalShares",
    outputs: [{ name: "total", type: "uint16" }],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "getLandsByOwner",
    outputs: [{ name: "", type: "string[]" }],
    stateMutability: "view", type: "function",
  },

  // ---- Inheritance reads ------------------------------------------------
  {
    inputs: [{ name: "landId", type: "string" }],
    name: "getInheritanceRequest",
    outputs: [
      { name: "deceasedHolder", type: "address" },
      { name: "heirs", type: "address[]" },
      { name: "heirShares", type: "uint16[]" },
      { name: "approvalCount", type: "uint256" },
      { name: "isExecuted", type: "bool" },
      { name: "proposalNonce", type: "uint256" },
      { name: "courtOrderCid", type: "string" },
      { name: "appealId", type: "uint256" },
      { name: "sharesHash", type: "bytes32" },
      { name: "votingDeadline", type: "uint64" },
    ],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [
      { name: "landId", type: "string" },
      { name: "heir", type: "address" },
    ],
    name: "hasHeirApproved",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view", type: "function",
  },
  {
    // PURE helper — the cryptographic anchor for the SharesHashVerifier.
    inputs: [
      { name: "heirs", type: "address[]" },
      { name: "heirShares", type: "uint16[]" },
      { name: "courtOrderCid", type: "string" },
    ],
    name: "computeSharesHash",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "pure", type: "function",
  },

  // ---- Occupancy reads --------------------------------------------------
  {
    inputs: [{ name: "landId", type: "string" }],
    name: "getOccupancyAgreements",
    outputs: [{
      components: [
        { name: "id", type: "uint64" },
        { name: "category", type: "uint8" },
        { name: "grantor", type: "address" },
        { name: "occupant", type: "address" },
        { name: "startTime", type: "uint64" },
        { name: "endTime", type: "uint64" },
        { name: "termsCid", type: "string" },
        { name: "descriptionCid", type: "string" },
        { name: "isRevoked", type: "bool" },
      ],
      name: "", type: "tuple[]",
    }],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [{ name: "landId", type: "string" }],
    name: "getActiveOccupancyAgreements",
    outputs: [{
      components: [
        { name: "id", type: "uint64" },
        { name: "category", type: "uint8" },
        { name: "grantor", type: "address" },
        { name: "occupant", type: "address" },
        { name: "startTime", type: "uint64" },
        { name: "endTime", type: "uint64" },
        { name: "termsCid", type: "string" },
        { name: "descriptionCid", type: "string" },
        { name: "isRevoked", type: "bool" },
      ],
      name: "active", type: "tuple[]",
    }],
    stateMutability: "view", type: "function",
  },

  // ---- Citizen writes ---------------------------------------------------
  {
    inputs: [{ name: "landId", type: "string" }],
    name: "approveSuccessionPlan",
    outputs: [],
    stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [{ name: "landId", type: "string" }],
    name: "disputeSuccessionPlan",
    outputs: [],
    stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [{ name: "landId", type: "string" }],
    name: "expireInheritance",
    outputs: [],
    stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [
      { name: "landId", type: "string" },
      { name: "deceasedHolder", type: "address" },
      { name: "courtOrderCid", type: "string" },
    ],
    name: "fileInheritanceAppeal",
    outputs: [{ name: "appealId", type: "uint256" }],
    stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [
      { name: "landId", type: "string" },
      { name: "category", type: "uint8" },
      { name: "occupant", type: "address" },
      { name: "startTime", type: "uint64" },
      { name: "endTime", type: "uint64" },
      { name: "termsCid", type: "string" },
      { name: "descriptionCid", type: "string" },
    ],
    name: "grantOccupancy",
    outputs: [{ name: "agreementId", type: "uint64" }],
    stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [
      { name: "landId", type: "string" },
      { name: "agreementId", type: "uint64" },
    ],
    name: "revokeOccupancy",
    outputs: [],
    stateMutability: "nonpayable", type: "function",
  },
] as const;

// ---- Helpers ---------------------------------------------------------------

export function formatBps(bps: number | bigint): string {
  const n = typeof bps === "bigint" ? Number(bps) : bps;
  return (n / 100).toFixed(2) + "%";
}

export function landStatusLabel(s: LandStatusV9): string {
  switch (s) {
    case LandStatusV9.PENDING_VERIFICATION: return "Pending verification";
    case LandStatusV9.ACTIVE: return "Active";
    case LandStatusV9.PENDING_INHERITANCE: return "Inheritance pending";
    case LandStatusV9.PENDING_SUBDIVISION: return "Subdivision pending";
    case LandStatusV9.LOCKED_IMPORT_DISPUTE: return "Import dispute (legal review)";
    case LandStatusV9.LOCKED_INHERITANCE_DISPUTE: return "Inheritance dispute (legal review)";
    case LandStatusV9.LOCKED_SUBDIVISION_DISPUTE: return "Subdivision dispute (legal review)";
    case LandStatusV9.SUBDIVIDED: return "Subdivided (terminal)";
    default: return "Unknown";
  }
}

export function landTypeLabel(t: LandTypeV9): string {
  return ["Residential", "Agricultural", "Commercial"][t] ?? "Unknown";
}

export function occupancyCategoryLabel(c: OccupancyCategoryV9): string {
  return [
    "Residential lease",
    "Agricultural lease",
    "Commercial lease",
    "Use right",
    "Other",
  ][c] ?? "Other";
}

export function occupancyCategoryIcon(c: OccupancyCategoryV9): string {
  return ["🏠", "🌾", "🏪", "📜", "📋"][c] ?? "📋";
}
