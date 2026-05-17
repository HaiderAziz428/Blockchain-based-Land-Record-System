import { NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';

const RPC_URL = 'https://ethereum-sepolia.publicnode.com';

/**
 * POST /api/subdivision
 *
 * REGISTRAR proposes a subdivision of a parent land into child parcels.
 *
 * Body: {
 *   parentLandId: string,
 *   courtOrderCid: string,
 *   surveyMetadataCid: string,
 *   children: {
 *     landId: string;
 *     ipfsHash: string;
 *     owners: { address: string; shareBps: number }[];
 *   }[]
 * }
 *
 * Each child's owners' shareBps must sum to 10000.
 * The struct matches SubdivisionProposalInput on-chain.
 */
export async function POST(request: Request) {
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    return NextResponse.json(
      { error: 'Server misconfigured: missing ADMIN_PRIVATE_KEY' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { parentLandId, courtOrderCid, surveyMetadataCid, children } = body as {
      parentLandId: string;
      courtOrderCid: string;
      surveyMetadataCid: string;
      children: {
        landId: string;
        ipfsHash: string;
        owners: { address: string; shareBps: number }[];
      }[];
    };

    if (!parentLandId || !Array.isArray(children) || children.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: parentLandId, children' },
        { status: 400 }
      );
    }

    // Validate each child
    for (const child of children) {
      const total = child.owners.reduce((a, o) => a + o.shareBps, 0);
      if (total !== 10000) {
        return NextResponse.json(
          {
            error: `Child ${child.landId} share total is ${total} bps, must be 10000.`,
          },
          { status: 400 }
        );
      }
    }

    const account = privateKeyToAccount(adminPrivateKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });
    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

    const newLandIds = children.map((c) => c.landId);
    const newIpfsHashes = children.map((c) => c.ipfsHash);
    const newLandShareholders = children.map((c) =>
      c.owners.map((o) => o.address as `0x${string}`)
    );
    const newLandShares = children.map((c) => c.owners.map((o) => o.shareBps));

    const input = {
      newLandIds,
      newIpfsHashes,
      newLandShareholders,
      newLandShares,
      courtOrderCid: courtOrderCid || '',
      surveyMetadataCid: surveyMetadataCid || '',
    };

    console.log(`API /api/subdivision: proposeSubdivision ${parentLandId} children=${children.length}`);

    const { request: txRequest } = await publicClient.simulateContract({
      account,
      address: CONTRACT_V9_ADDRESS,
      abi: CONTRACT_V9_ABI,
      functionName: 'proposeSubdivision',
      args: [parentLandId, input],
    });

    const txHash = await walletClient.writeContract(txRequest);
    console.log(`  proposeSubdivision tx: ${txHash}`);

    return NextResponse.json({ success: true, txHash });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('API /api/subdivision error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
