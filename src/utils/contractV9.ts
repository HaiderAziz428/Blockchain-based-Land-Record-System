// src/utils/contractV9.ts
//
// v10 contract ABI -- hybrid governance architecture (LandRegistry v9)
// Auto-generated from contract.sol compilation.
//
// Architecture: ERC-721 identity (Layer 1) + basis-point ownership ledger (Layer 2)
// Features: multi-owner co-ownership, import verification, fractional marketplace,
//           inheritance as share redistribution, legal subdivision, occupancy agreements,
//           role-based governance (ADMIN/REGISTRAR/RESOLVER/PAUSER)

export const CONTRACT_V9_ADDRESS = "0x1d08E371447c0a923B8b935Ffe83A146f9fe457A" as const;

export const CONTRACT_V9_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "backend",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AccessControlBadConfirmation",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "neededRole",
        "type": "bytes32"
      }
    ],
    "name": "AccessControlUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "ERC721IncorrectOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "operator",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ERC721InsufficientApproval",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "approver",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidApprover",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "operator",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidOperator",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidReceiver",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidSender",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ERC721NonexistentToken",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "EnforcedPause",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ExpectedPause",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FailedCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "balance",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "needed",
        "type": "uint256"
      }
    ],
    "name": "InsufficientBalance",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "LandRegistry__AlreadyRegistered",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__AlreadyVerified",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__AlreadyVoted",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "appealId",
        "type": "uint256"
      }
    ],
    "name": "LandRegistry__AppealAlreadyProcessed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "appealId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "expected",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "got",
        "type": "string"
      }
    ],
    "name": "LandRegistry__AppealLandMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__ArrayLengthMismatch",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "cnic",
        "type": "string"
      }
    ],
    "name": "LandRegistry__CnicAlreadyLinked",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "deceased",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__DeceasedHasNoShares",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "heir",
        "type": "address"
      }
    ],
    "name": "LandRegistry__DuplicateHeir",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__DuplicateNewLandId",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "LandRegistry__DuplicateOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "heir",
        "type": "address"
      }
    ],
    "name": "LandRegistry__HeirIsDeceased",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__ImportNotDisputed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__InheritanceArrayMismatch",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__InheritanceNotDisputed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "LandRegistry__InheritanceVotingExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "LandRegistry__InheritanceVotingNotExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "sent",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "required",
        "type": "uint256"
      }
    ],
    "name": "LandRegistry__InsufficientPayment",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "holder",
        "type": "address"
      },
      {
        "internalType": "uint16",
        "name": "held",
        "type": "uint16"
      },
      {
        "internalType": "uint16",
        "name": "required",
        "type": "uint16"
      }
    ],
    "name": "LandRegistry__InsufficientShare",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "appealId",
        "type": "uint256"
      }
    ],
    "name": "LandRegistry__InvalidAppealId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__InvalidOccupancyPeriod",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__InvalidPrice",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__InvalidShare",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__InvalidStringLength",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__InvalidSubdivisionCount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__LandAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__LandNotActive",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__LandNotFound",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "seller",
        "type": "address"
      }
    ],
    "name": "LandRegistry__ListingExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "seller",
        "type": "address"
      }
    ],
    "name": "LandRegistry__ListingNotActive",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__NftNonTransferable",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__NoBalance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__NoHeirs",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__NoOwners",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__NoPendingPlan",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__NoPendingSubdivision",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__NoStrayBalance",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "caller",
        "type": "address"
      }
    ],
    "name": "LandRegistry__NotAProposedOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "LandRegistry__NotAShareholder",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "caller",
        "type": "address"
      }
    ],
    "name": "LandRegistry__NotAnHeir",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "LandRegistry__NotAuthorizedHolder",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__NotInImportPhase",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "caller",
        "type": "address"
      }
    ],
    "name": "LandRegistry__NotOccupancyGrantor",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__OccupancyAlreadyRevoked",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "agreementId",
        "type": "uint64"
      }
    ],
    "name": "LandRegistry__OccupancyNotFound",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__PlanAlreadyExecuted",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "actualPrice",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxPrice",
        "type": "uint256"
      }
    ],
    "name": "LandRegistry__PriceExceedsMax",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "currentPrice",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "attempted",
        "type": "uint256"
      }
    ],
    "name": "LandRegistry__PriceMustDecrease",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__SelfTransfer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__SellerCannotBuy",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "provided",
        "type": "uint16"
      },
      {
        "internalType": "uint16",
        "name": "expected",
        "type": "uint16"
      }
    ],
    "name": "LandRegistry__ShareTotalMismatch",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandRegistry__SubdivisionNotDisputed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "provided",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "max",
        "type": "uint256"
      }
    ],
    "name": "LandRegistry__TooManyHeirs",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "current",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "max",
        "type": "uint256"
      }
    ],
    "name": "LandRegistry__TooManyShareholders",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "LandRegistry__VerificationExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "LandRegistry__VerificationNotExpired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LandRegistry__ZeroAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "approved",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "Approval",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "operator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "approved",
        "type": "bool"
      }
    ],
    "name": "ApprovalForAll",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "string",
        "name": "childLandId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "generation",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ChildLandCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "EmergencyWithdrawal",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "heir",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "name": "HeirApproved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "appealId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "filer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "deceasedHolder",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      }
    ],
    "name": "InheritanceAppealFiled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "heir",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "name": "InheritanceDisputed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "InheritanceExpired",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "name": "InheritanceFinalized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "resolver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "reason",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "InheritanceFrozenForReview",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "deceasedHolder",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "totalHeirs",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "deceasedShareBps",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "appealId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "sharesHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "votingDeadline",
        "type": "uint64"
      }
    ],
    "name": "InheritanceInitiated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "LandImportCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "disputer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "name": "LandImportDisputed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "LandImportExpired",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "name": "LandImportFinalized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "proposer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "ownerCount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "verificationDeadline",
        "type": "uint64"
      }
    ],
    "name": "LandImportProposed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "forceApproved",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      }
    ],
    "name": "LandImportResolved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "verificationCount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "ownersTotal",
        "type": "uint256"
      }
    ],
    "name": "LandImportVerified",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "enum LandRegistry.LandType",
        "name": "lType",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "LandMinted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "enum LandRegistry.LandStatus",
        "name": "status",
        "type": "uint8"
      }
    ],
    "name": "LandStatusChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "resolver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "overrideIndex",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "forceExecuted",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "updatedCourtOrderCid",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "legalResolutionCid",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "overrideReason",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "LegalOverrideExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      }
    ],
    "name": "ListingCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldPrice",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newPrice",
        "type": "uint256"
      }
    ],
    "name": "ListingPriceUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "uint64",
        "name": "agreementId",
        "type": "uint64"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "grantor",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "enum LandRegistry.OccupancyCategory",
        "name": "category",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "occupant",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "startTime",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "endTime",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "termsCid",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "descriptionCid",
        "type": "string"
      }
    ],
    "name": "OccupancyGranted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "uint64",
        "name": "agreementId",
        "type": "uint64"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "grantor",
        "type": "address"
      }
    ],
    "name": "OccupancyRevoked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Paused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "ProceedsCredited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "ProceedsWithdrawn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "previousAdminRole",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "newAdminRole",
        "type": "bytes32"
      }
    ],
    "name": "RoleAdminChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "RoleGranted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "RoleRevoked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "shareBpsForSale",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "metadataHash",
        "type": "string"
      }
    ],
    "name": "ShareListed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "shareBps",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      }
    ],
    "name": "ShareSold",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "shareBps",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      }
    ],
    "name": "ShareTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "holder",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "shareBps",
        "type": "uint16"
      }
    ],
    "name": "ShareholderAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "holder",
        "type": "address"
      }
    ],
    "name": "ShareholderRemoved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "shareholder",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "name": "SubdivisionApproved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "shareholder",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "name": "SubdivisionDisputed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newLandCount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "name": "SubdivisionFinalized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "resolver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "reason",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "SubdivisionFrozenForReview",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "resolver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "overrideIndex",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "forceExecuted",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "updatedCourtOrderCid",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "legalResolutionCid",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "overrideReason",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "SubdivisionLegalOverrideExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newLandCount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "surveyMetadataCid",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "name": "SubdivisionProposed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "Transfer",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Unpaused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "cnic",
        "type": "string"
      }
    ],
    "name": "UserRegistered",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "ADMIN_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DEFAULT_ADMIN_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "GOVT_AUTHORITY_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "INHERITANCE_VOTING_DURATION",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "LISTING_DURATION",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_HEIRS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_SHAREHOLDERS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_STRING_LENGTH",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_SUBDIVISIONS_PER_PROPOSAL",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "PAUSER_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "REGISTRAR_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "RESOLVER_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "TOTAL_SHARES",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "VERIFICATION_DURATION",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      }
    ],
    "name": "approveSubdivision",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "approveSuccessionPlan",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "maxPrice",
        "type": "uint256"
      }
    ],
    "name": "buyShare",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "cancelLandImport",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "cancelListing",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "cnic",
        "type": "string"
      }
    ],
    "name": "cnicToAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "heirs",
        "type": "address[]"
      },
      {
        "internalType": "uint16[]",
        "name": "heirShares",
        "type": "uint16[]"
      },
      {
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      }
    ],
    "name": "computeSharesHash",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "disputeLandImport",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      }
    ],
    "name": "disputeSubdivision",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "disputeSuccessionPlan",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address payable",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "emergencyWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "expireInheritance",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "expireLandImport",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "deceasedHolder",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      }
    ],
    "name": "fileInheritanceAppeal",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "appealId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "reason",
        "type": "string"
      }
    ],
    "name": "freezeInheritanceForReview",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "reason",
        "type": "string"
      }
    ],
    "name": "freezeSubdivisionForReview",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getActiveOccupancyAgreements",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint64",
            "name": "id",
            "type": "uint64"
          },
          {
            "internalType": "enum LandRegistry.OccupancyCategory",
            "name": "category",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "grantor",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "occupant",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "startTime",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "endTime",
            "type": "uint64"
          },
          {
            "internalType": "string",
            "name": "termsCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "descriptionCid",
            "type": "string"
          },
          {
            "internalType": "bool",
            "name": "isRevoked",
            "type": "bool"
          }
        ],
        "internalType": "struct LandRegistry.OccupancyAgreement[]",
        "name": "active",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "cursor",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "resultsPerPage",
        "type": "uint256"
      }
    ],
    "name": "getAllLandRecordsPaginated",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "landId",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "ipfsHash",
            "type": "string"
          },
          {
            "internalType": "enum LandRegistry.LandType",
            "name": "landType",
            "type": "uint8"
          },
          {
            "internalType": "enum LandRegistry.LandStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "proposedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "verifiedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct LandRegistry.LandRecord[]",
        "name": "results",
        "type": "tuple[]"
      },
      {
        "internalType": "uint256",
        "name": "nextCursor",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "getApproved",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getChildLands",
    "outputs": [
      {
        "internalType": "string[]",
        "name": "",
        "type": "string[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getImportProposal",
    "outputs": [
      {
        "internalType": "address",
        "name": "proposer",
        "type": "address"
      },
      {
        "internalType": "address[]",
        "name": "proposedOwners",
        "type": "address[]"
      },
      {
        "internalType": "uint16[]",
        "name": "proposedShares",
        "type": "uint16[]"
      },
      {
        "internalType": "uint256",
        "name": "verificationCount",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "verificationDeadline",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "isCancelled",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "appealId",
        "type": "uint256"
      }
    ],
    "name": "getInheritanceAppeal",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "landId",
            "type": "string"
          },
          {
            "internalType": "address",
            "name": "deceasedHolder",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "filer",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "courtOrderCid",
            "type": "string"
          },
          {
            "internalType": "uint64",
            "name": "filedAt",
            "type": "uint64"
          },
          {
            "internalType": "bool",
            "name": "isProcessed",
            "type": "bool"
          }
        ],
        "internalType": "struct LandRegistry.InheritanceAppeal",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getInheritanceAppealsForLand",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getInheritanceRequest",
    "outputs": [
      {
        "internalType": "address",
        "name": "deceasedHolder",
        "type": "address"
      },
      {
        "internalType": "address[]",
        "name": "heirs",
        "type": "address[]"
      },
      {
        "internalType": "uint16[]",
        "name": "heirShares",
        "type": "uint16[]"
      },
      {
        "internalType": "uint256",
        "name": "approvalCount",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isExecuted",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "appealId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "sharesHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "votingDeadline",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getLandFullView",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "landId",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "ipfsHash",
            "type": "string"
          },
          {
            "internalType": "enum LandRegistry.LandType",
            "name": "landType",
            "type": "uint8"
          },
          {
            "internalType": "enum LandRegistry.LandStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "proposedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "verifiedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint256",
            "name": "tokenId",
            "type": "uint256"
          }
        ],
        "internalType": "struct LandRegistry.LandIdentity",
        "name": "identity",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "address[]",
            "name": "holders",
            "type": "address[]"
          },
          {
            "internalType": "uint16[]",
            "name": "shares",
            "type": "uint16[]"
          },
          {
            "internalType": "uint16",
            "name": "totalShareBps",
            "type": "uint16"
          },
          {
            "internalType": "uint256",
            "name": "shareholderCount",
            "type": "uint256"
          }
        ],
        "internalType": "struct LandRegistry.OwnershipSnapshot",
        "name": "ownership",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getLandIdentity",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "landId",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "ipfsHash",
            "type": "string"
          },
          {
            "internalType": "enum LandRegistry.LandType",
            "name": "landType",
            "type": "uint8"
          },
          {
            "internalType": "enum LandRegistry.LandStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "proposedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "verifiedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint256",
            "name": "tokenId",
            "type": "uint256"
          }
        ],
        "internalType": "struct LandRegistry.LandIdentity",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getLandRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "landId",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "ipfsHash",
            "type": "string"
          },
          {
            "internalType": "enum LandRegistry.LandType",
            "name": "landType",
            "type": "uint8"
          },
          {
            "internalType": "enum LandRegistry.LandStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "proposedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "verifiedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct LandRegistry.LandRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "cnic",
        "type": "string"
      }
    ],
    "name": "getLandsByCnic",
    "outputs": [
      {
        "internalType": "string[]",
        "name": "",
        "type": "string[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "getLandsByOwner",
    "outputs": [
      {
        "internalType": "string[]",
        "name": "",
        "type": "string[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "getLegalOverride",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "resolver",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          },
          {
            "internalType": "bool",
            "name": "forceExecuted",
            "type": "bool"
          },
          {
            "internalType": "string",
            "name": "updatedCourtOrderCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "legalResolutionCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "overrideReason",
            "type": "string"
          }
        ],
        "internalType": "struct LandRegistry.LegalOverride",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getLegalOverrides",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "resolver",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          },
          {
            "internalType": "bool",
            "name": "forceExecuted",
            "type": "bool"
          },
          {
            "internalType": "string",
            "name": "updatedCourtOrderCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "legalResolutionCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "overrideReason",
            "type": "string"
          }
        ],
        "internalType": "struct LandRegistry.LegalOverride[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "seller",
        "type": "address"
      }
    ],
    "name": "getListing",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint16",
            "name": "shareBpsForSale",
            "type": "uint16"
          },
          {
            "internalType": "uint256",
            "name": "price",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "seller",
            "type": "address"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          },
          {
            "internalType": "uint64",
            "name": "deadline",
            "type": "uint64"
          },
          {
            "internalType": "string",
            "name": "metadataHash",
            "type": "string"
          }
        ],
        "internalType": "struct LandRegistry.Listing",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getMarketplaceHistory",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "seller",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "buyer",
            "type": "address"
          },
          {
            "internalType": "uint16",
            "name": "shareBps",
            "type": "uint16"
          },
          {
            "internalType": "uint256",
            "name": "price",
            "type": "uint256"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          }
        ],
        "internalType": "struct LandRegistry.MarketplaceTrade[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "getMarketplaceTrade",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "seller",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "buyer",
            "type": "address"
          },
          {
            "internalType": "uint16",
            "name": "shareBps",
            "type": "uint16"
          },
          {
            "internalType": "uint256",
            "name": "price",
            "type": "uint256"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          }
        ],
        "internalType": "struct LandRegistry.MarketplaceTrade",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint64",
        "name": "agreementId",
        "type": "uint64"
      }
    ],
    "name": "getOccupancyAgreement",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint64",
            "name": "id",
            "type": "uint64"
          },
          {
            "internalType": "enum LandRegistry.OccupancyCategory",
            "name": "category",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "grantor",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "occupant",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "startTime",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "endTime",
            "type": "uint64"
          },
          {
            "internalType": "string",
            "name": "termsCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "descriptionCid",
            "type": "string"
          },
          {
            "internalType": "bool",
            "name": "isRevoked",
            "type": "bool"
          }
        ],
        "internalType": "struct LandRegistry.OccupancyAgreement",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getOccupancyAgreements",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint64",
            "name": "id",
            "type": "uint64"
          },
          {
            "internalType": "enum LandRegistry.OccupancyCategory",
            "name": "category",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "grantor",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "occupant",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "startTime",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "endTime",
            "type": "uint64"
          },
          {
            "internalType": "string",
            "name": "termsCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "descriptionCid",
            "type": "string"
          },
          {
            "internalType": "bool",
            "name": "isRevoked",
            "type": "bool"
          }
        ],
        "internalType": "struct LandRegistry.OccupancyAgreement[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getOwnershipHistory",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "from",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint16",
            "name": "shareBps",
            "type": "uint16"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          },
          {
            "internalType": "uint256",
            "name": "price",
            "type": "uint256"
          }
        ],
        "internalType": "struct LandRegistry.OwnershipChange[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getOwnershipSnapshot",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address[]",
            "name": "holders",
            "type": "address[]"
          },
          {
            "internalType": "uint16[]",
            "name": "shares",
            "type": "uint16[]"
          },
          {
            "internalType": "uint16",
            "name": "totalShareBps",
            "type": "uint16"
          },
          {
            "internalType": "uint256",
            "name": "shareholderCount",
            "type": "uint256"
          }
        ],
        "internalType": "struct LandRegistry.OwnershipSnapshot",
        "name": "snap",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getParentLand",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getPendingVerifiers",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "pending",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      }
    ],
    "name": "getRoleAdmin",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "holder",
        "type": "address"
      }
    ],
    "name": "getShareBps",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getShareholders",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getShareholdersWithBps",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "holders",
        "type": "address[]"
      },
      {
        "internalType": "uint16[]",
        "name": "shares",
        "type": "uint16[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getSubdivisionGeneration",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "getSubdivisionLegalOverride",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "resolver",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          },
          {
            "internalType": "bool",
            "name": "forceExecuted",
            "type": "bool"
          },
          {
            "internalType": "string",
            "name": "updatedCourtOrderCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "legalResolutionCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "overrideReason",
            "type": "string"
          }
        ],
        "internalType": "struct LandRegistry.LegalOverride",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      }
    ],
    "name": "getSubdivisionLegalOverrides",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "resolver",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          },
          {
            "internalType": "bool",
            "name": "forceExecuted",
            "type": "bool"
          },
          {
            "internalType": "string",
            "name": "updatedCourtOrderCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "legalResolutionCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "overrideReason",
            "type": "string"
          }
        ],
        "internalType": "struct LandRegistry.LegalOverride[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getSubdivisionLineage",
    "outputs": [
      {
        "internalType": "string[]",
        "name": "",
        "type": "string[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "newLandIndex",
        "type": "uint256"
      }
    ],
    "name": "getSubdivisionPart",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "holders",
        "type": "address[]"
      },
      {
        "internalType": "uint16[]",
        "name": "shares",
        "type": "uint16[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      }
    ],
    "name": "getSubdivisionPlan",
    "outputs": [
      {
        "internalType": "string[]",
        "name": "newLandIds",
        "type": "string[]"
      },
      {
        "internalType": "string[]",
        "name": "newIpfsHashes",
        "type": "string[]"
      },
      {
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "surveyMetadataCid",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "approvalCount",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isExecuted",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "proposalNonce",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getTokenIdFromLandId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getTotalShares",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "total",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "getUser",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "cnic",
            "type": "string"
          },
          {
            "internalType": "bool",
            "name": "isRegistered",
            "type": "bool"
          }
        ],
        "internalType": "struct LandRegistry.UserProfile",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "getVerificationStatus",
    "outputs": [
      {
        "internalType": "enum LandRegistry.LandStatus",
        "name": "status",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "verifiedCount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "ownersTotal",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "verificationDeadline",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "isExpired",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "enum LandRegistry.OccupancyCategory",
        "name": "category",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "occupant",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "startTime",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "endTime",
        "type": "uint64"
      },
      {
        "internalType": "string",
        "name": "termsCid",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "descriptionCid",
        "type": "string"
      }
    ],
    "name": "grantOccupancy",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "agreementId",
        "type": "uint64"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "grantRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "heir",
        "type": "address"
      }
    ],
    "name": "hasHeirApproved",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "hasRole",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "shareholder",
        "type": "address"
      }
    ],
    "name": "hasShareholderApprovedSubdivision",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "deceasedHolder",
        "type": "address"
      },
      {
        "internalType": "address[]",
        "name": "heirs",
        "type": "address[]"
      },
      {
        "internalType": "uint16[]",
        "name": "heirShares",
        "type": "uint16[]"
      },
      {
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "appealId",
        "type": "uint256"
      }
    ],
    "name": "initiateInheritance",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "operator",
        "type": "address"
      }
    ],
    "name": "isApprovedForAll",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "isGovtAuthority",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "isImportVerified",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint16",
        "name": "shareBpsForSale",
        "type": "uint16"
      },
      {
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "metadataHash",
        "type": "string"
      }
    ],
    "name": "listShareForSale",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ownerOf",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "pendingProceeds",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "ipfsHash",
        "type": "string"
      },
      {
        "internalType": "enum LandRegistry.LandType",
        "name": "lType",
        "type": "uint8"
      },
      {
        "internalType": "address[]",
        "name": "proposedOwners",
        "type": "address[]"
      },
      {
        "internalType": "uint16[]",
        "name": "proposedShares",
        "type": "uint16[]"
      },
      {
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      }
    ],
    "name": "proposeLandImport",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "components": [
          {
            "internalType": "string[]",
            "name": "newLandIds",
            "type": "string[]"
          },
          {
            "internalType": "string[]",
            "name": "newIpfsHashes",
            "type": "string[]"
          },
          {
            "internalType": "address[][]",
            "name": "newLandShareholders",
            "type": "address[][]"
          },
          {
            "internalType": "uint16[][]",
            "name": "newLandShares",
            "type": "uint16[][]"
          },
          {
            "internalType": "string",
            "name": "courtOrderCid",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "surveyMetadataCid",
            "type": "string"
          }
        ],
        "internalType": "struct LandRegistry.SubdivisionProposalInput",
        "name": "input",
        "type": "tuple"
      }
    ],
    "name": "proposeSubdivision",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "cnic",
        "type": "string"
      }
    ],
    "name": "registerUser",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "callerConfirmation",
        "type": "address"
      }
    ],
    "name": "renounceRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "bool",
        "name": "forceExecute",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "updatedCourtOrderCid",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "legalResolutionCid",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "overrideReason",
        "type": "string"
      }
    ],
    "name": "resolveInheritanceDispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "bool",
        "name": "forceApprove",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "courtOrderCid",
        "type": "string"
      }
    ],
    "name": "resolveLandImportDispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      },
      {
        "internalType": "bool",
        "name": "forceExecute",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "updatedCourtOrderCid",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "legalResolutionCid",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "overrideReason",
        "type": "string"
      }
    ],
    "name": "resolveSubdivisionDispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint64",
        "name": "agreementId",
        "type": "uint64"
      }
    ],
    "name": "revokeOccupancy",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "revokeRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "operator",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "approved",
        "type": "bool"
      }
    ],
    "name": "setApprovalForAll",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "setGovtAuthority",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "interfaceId",
        "type": "bytes4"
      }
    ],
    "name": "supportsInterface",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "tokenURI",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalInheritanceAppeals",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalLandRecords",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "totalLegalOverrides",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "totalMarketplaceTrades",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalPendingWithdrawals",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "parentLandId",
        "type": "string"
      }
    ],
    "name": "totalSubdivisionLegalOverrides",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "transferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint16",
        "name": "shareBps",
        "type": "uint16"
      },
      {
        "internalType": "uint256",
        "name": "salePrice",
        "type": "uint256"
      }
    ],
    "name": "transferShare",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "newPrice",
        "type": "uint256"
      }
    ],
    "name": "updateListingPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "landId",
        "type": "string"
      }
    ],
    "name": "verifyLandImport",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdrawProceeds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// ============================================================================
// TypeScript mirrors of on-chain enums (numeric values match Solidity order)
// ============================================================================

export enum LandTypeV9 {
  RESIDENTIAL = 0,
  AGRICULTURAL = 1,
  COMMERCIAL = 2,
}

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

export enum OccupancyCategoryV9 {
  RESIDENTIAL_LEASE = 0,
  AGRICULTURAL_LEASE = 1,
  COMMERCIAL_LEASE = 2,
  USE_RIGHT = 3,
  OTHER = 4,
}

// ============================================================================
// Display helpers
// ============================================================================

export function formatBps(bps: number | bigint): string {
  const n = Number(bps);
  const pct = (n / 100).toFixed(2).replace(/\.?0+$/, "");
  return `${pct}%`;
}

const _landTypeLabels: Record<LandTypeV9, string> = {
  [LandTypeV9.RESIDENTIAL]: "Residential",
  [LandTypeV9.AGRICULTURAL]: "Agricultural",
  [LandTypeV9.COMMERCIAL]: "Commercial",
};
export function landTypeLabel(t: LandTypeV9): string {
  return _landTypeLabels[t] ?? "Unknown";
}

const _landStatusLabels: Record<LandStatusV9, string> = {
  [LandStatusV9.PENDING_VERIFICATION]: "Pending Verification",
  [LandStatusV9.ACTIVE]: "Active",
  [LandStatusV9.PENDING_INHERITANCE]: "Pending Inheritance",
  [LandStatusV9.PENDING_SUBDIVISION]: "Pending Subdivision",
  [LandStatusV9.LOCKED_IMPORT_DISPUTE]: "Import Disputed",
  [LandStatusV9.LOCKED_INHERITANCE_DISPUTE]: "Inheritance Disputed",
  [LandStatusV9.LOCKED_SUBDIVISION_DISPUTE]: "Subdivision Disputed",
  [LandStatusV9.SUBDIVIDED]: "Subdivided",
};
export function landStatusLabel(s: LandStatusV9): string {
  return _landStatusLabels[s] ?? "Unknown";
}

const _occupancyCategoryLabels: Record<OccupancyCategoryV9, string> = {
  [OccupancyCategoryV9.RESIDENTIAL_LEASE]: "Residential Lease",
  [OccupancyCategoryV9.AGRICULTURAL_LEASE]: "Agricultural Lease",
  [OccupancyCategoryV9.COMMERCIAL_LEASE]: "Commercial Lease",
  [OccupancyCategoryV9.USE_RIGHT]: "Use Right",
  [OccupancyCategoryV9.OTHER]: "Other",
};
export function occupancyCategoryLabel(c: OccupancyCategoryV9): string {
  return _occupancyCategoryLabels[c] ?? "Other";
}

const _occupancyCategoryIcons: Record<OccupancyCategoryV9, string> = {
  [OccupancyCategoryV9.RESIDENTIAL_LEASE]: "🏠",
  [OccupancyCategoryV9.AGRICULTURAL_LEASE]: "🌾",
  [OccupancyCategoryV9.COMMERCIAL_LEASE]: "🏢",
  [OccupancyCategoryV9.USE_RIGHT]: "📋",
  [OccupancyCategoryV9.OTHER]: "📄",
};
export function occupancyCategoryIcon(c: OccupancyCategoryV9): string {
  return _occupancyCategoryIcons[c] ?? "📄";
}
