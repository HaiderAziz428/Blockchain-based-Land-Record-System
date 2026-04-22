import { NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';

const RPC_URL = 'https://ethereum-sepolia.publicnode.com';

export async function POST(request: Request) {
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    return NextResponse.json({ error: 'Server misconfigured: missing ADMIN_PRIVATE_KEY' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { oldLandId, forceExecute } = body as { oldLandId: string; forceExecute: boolean };

    if (!oldLandId) {
      return NextResponse.json({ error: 'Missing oldLandId' }, { status: 400 });
    }

    const account = privateKeyToAccount(adminPrivateKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });
    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

    const { request: txRequest } = await publicClient.simulateContract({
      account,
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'resolveDispute',
      args: [oldLandId, Boolean(forceExecute)],
    });

    const txHash = await walletClient.writeContract(txRequest);
    console.log(`Dispute resolved for ${oldLandId} (forceExecute=${forceExecute}): ${txHash}`);

    return NextResponse.json({ success: true, txHash });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Dispute API Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
