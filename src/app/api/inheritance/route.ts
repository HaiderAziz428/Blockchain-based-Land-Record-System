import { NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';

const RPC_URL = 'https://ethereum-sepolia.publicnode.com';

/**
 * POST /api/inheritance
 *
 * REGISTRAR initiates an inheritance case for a deceased shareholder.
 *
 * Body: {
 *   landId: string,
 *   deceasedHolder: string,           // 0x… address
 *   courtOrderCid: string,
 *   appealId: number,                 // 0 if no appeal filed
 *   heirs: { address: string; shareBps: number }[]
 * }
 *
 * Heir shares must sum to exactly the deceased holder's current share balance.
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
    const { landId, deceasedHolder, courtOrderCid, appealId, heirs } = body as {
      landId: string;
      deceasedHolder: string;
      courtOrderCid: string;
      appealId: number;
      heirs: { address: string; shareBps: number }[];
    };

    if (!landId || !deceasedHolder || !Array.isArray(heirs) || heirs.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: landId, deceasedHolder, heirs' },
        { status: 400 }
      );
    }
    if (heirs.some((h) => !h.shareBps || h.shareBps <= 0)) {
      return NextResponse.json(
        { error: 'Each heir must have shareBps > 0' },
        { status: 400 }
      );
    }

    const account = privateKeyToAccount(adminPrivateKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });
    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

    const heirAddresses = heirs.map((h) => h.address as `0x${string}`);
    const heirShares = heirs.map((h) => h.shareBps);

    console.log(`API /api/inheritance: initiateInheritance ${landId} deceased=${deceasedHolder} heirs=${heirAddresses.length}`);

    const { request: txRequest } = await publicClient.simulateContract({
      account,
      address: CONTRACT_V9_ADDRESS,
      abi: CONTRACT_V9_ABI,
      functionName: 'initiateInheritance',
      args: [
        landId,
        deceasedHolder as `0x${string}`,
        heirAddresses,
        heirShares,
        courtOrderCid || 'N/A',
        BigInt(appealId ?? 0),
      ],
    });

    const txHash = await walletClient.writeContract(txRequest);
    console.log(`  initiateInheritance tx: ${txHash}`);

    return NextResponse.json({ success: true, txHash });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('API /api/inheritance error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
