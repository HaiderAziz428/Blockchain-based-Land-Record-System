// src/utils/contract.ts

// 1. Your Deployed Contract Address (String)
export const CONTRACT_ADDRESS = "0xce675683907eB07c1F348D43792350EA8923A9b0"; 

// 2. Your Contract ABI (Array)
// This defines the functions your frontend can call.
export const CONTRACT_ABI = [
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "_verificationBackend",
					"type": "address"
				}
			],
			"stateMutability": "nonpayable",
			"type": "constructor"
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
			"inputs": [
				{
					"internalType": "address",
					"name": "owner",
					"type": "address"
				}
			],
			"name": "OwnableInvalidOwner",
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
			"name": "OwnableUnauthorizedAccount",
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
					"indexed": false,
					"internalType": "string",
					"name": "oldLandId",
					"type": "string"
				},
				{
					"indexed": true,
					"internalType": "address",
					"name": "heir",
					"type": "address"
				}
			],
			"name": "HeirApproved",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "string",
					"name": "oldLandId",
					"type": "string"
				},
				{
					"indexed": true,
					"internalType": "address",
					"name": "heir",
					"type": "address"
				}
			],
			"name": "InheritanceDisputed",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "string",
					"name": "oldLandId",
					"type": "string"
				}
			],
			"name": "InheritanceFinalized",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "string",
					"name": "oldLandId",
					"type": "string"
				},
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "totalHeirs",
					"type": "uint256"
				}
			],
			"name": "InheritanceInitiated",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "string",
					"name": "landId",
					"type": "string"
				},
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "price",
					"type": "uint256"
				},
				{
					"indexed": false,
					"internalType": "address",
					"name": "seller",
					"type": "address"
				}
			],
			"name": "LandListed",
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
					"indexed": false,
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
					"indexed": false,
					"internalType": "string",
					"name": "landId",
					"type": "string"
				},
				{
					"indexed": false,
					"internalType": "address",
					"name": "buyer",
					"type": "address"
				},
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "price",
					"type": "uint256"
				}
			],
			"name": "LandSold",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
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
					"indexed": false,
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
					"internalType": "uint256",
					"name": "price",
					"type": "uint256"
				}
			],
			"name": "LandTransferred",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "string",
					"name": "landId",
					"type": "string"
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
					"internalType": "address",
					"name": "previousOwner",
					"type": "address"
				},
				{
					"indexed": true,
					"internalType": "address",
					"name": "newOwner",
					"type": "address"
				}
			],
			"name": "OwnershipTransferred",
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
					"name": "oldLandId",
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
				}
			],
			"name": "buyLand",
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
			"name": "cancelListing",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "string",
					"name": "oldLandId",
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
							"internalType": "address",
							"name": "currentOwner",
							"type": "address"
						},
						{
							"internalType": "string",
							"name": "cnic",
							"type": "string"
						},
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
							"internalType": "uint256",
							"name": "verifiedAt",
							"type": "uint256"
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
			"name": "getLandRecord",
			"outputs": [
				{
					"components": [
						{
							"internalType": "address",
							"name": "currentOwner",
							"type": "address"
						},
						{
							"internalType": "string",
							"name": "cnic",
							"type": "string"
						},
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
							"internalType": "uint256",
							"name": "verifiedAt",
							"type": "uint256"
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
					"name": "",
					"type": "string"
				}
			],
			"name": "inheritanceRequests",
			"outputs": [
				{
					"internalType": "uint256",
					"name": "approvalCount",
					"type": "uint256"
				},
				{
					"internalType": "bool",
					"name": "isExecuted",
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
					"name": "oldLandId",
					"type": "string"
				},
				{
					"internalType": "address[]",
					"name": "heirs",
					"type": "address[]"
				},
				{
					"internalType": "string[]",
					"name": "newLandIds",
					"type": "string[]"
				},
				{
					"internalType": "string[]",
					"name": "newIpfsHashes",
					"type": "string[]"
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
					"name": "",
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
					"name": "",
					"type": "string"
				}
			],
			"name": "landListings",
			"outputs": [
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
					"internalType": "uint256",
					"name": "deadline",
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
					"internalType": "uint256",
					"name": "price",
					"type": "uint256"
				}
			],
			"name": "listLandForSale",
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
			"inputs": [],
			"name": "owner",
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
			"inputs": [
				{
					"internalType": "string",
					"name": "_name",
					"type": "string"
				},
				{
					"internalType": "string",
					"name": "_cnic",
					"type": "string"
				}
			],
			"name": "registerUser",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "renounceOwnership",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "string",
					"name": "oldLandId",
					"type": "string"
				},
				{
					"internalType": "bool",
					"name": "forceExecute",
					"type": "bool"
				}
			],
			"name": "resolveDispute",
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
					"name": "_wallet",
					"type": "address"
				},
				{
					"internalType": "bool",
					"name": "_status",
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
					"internalType": "address",
					"name": "owner",
					"type": "address"
				},
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
				}
			],
			"name": "storeVerifiedLandRecord",
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
					"name": "newOwner",
					"type": "address"
				},
				{
					"internalType": "uint256",
					"name": "salePrice",
					"type": "uint256"
				}
			],
			"name": "transferLandOwnership",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "newOwner",
					"type": "address"
				}
			],
			"name": "transferOwnership",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "",
					"type": "address"
				}
			],
			"name": "users",
			"outputs": [
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
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "verificationBackend",
			"outputs": [
				{
					"internalType": "address",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "view",
			"type": "function"
		}
	
] as const;