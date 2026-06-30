import { NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';
import { getAdminKey } from '@/src/utils/adminKey';

const RPC_URL = 'https://ethereum-sepolia.publicnode.com';

/**
 * POST /api/dispute
 *
 * RESOLVER resolves an inheritance or import dispute.
 *
 * Body: {
 *   landId: string,
 *   disputeType: 'inheritance' | 'import',
 *   forceExecute: boolean,
 *   updatedCourtOrderCid: string,
 *   legalResolutionCid: string,
 *   overrideReason: string
 * }
 */
export async function POST(request: Request) {
  let adminPrivateKey: `0x${string}`;
  try {
    adminPrivateKey = getAdminKey();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server misconfigured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const {
      landId,
      disputeType,
      forceExecute,
      updatedCourtOrderCid,
      legalResolutionCid,
      overrideReason,
    } = body as {
      landId: string;
      disputeType?: 'inheritance' | 'import';
      forceExecute: boolean;
      updatedCourtOrderCid: string;
      legalResolutionCid: string;
      overrideReason: string;
    };

    if (!landId) {
      return NextResponse.json({ error: 'Missing landId' }, { status: 400 });
    }

    const account = privateKeyToAccount(adminPrivateKey);
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });
    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

    let txHash: `0x${string}`;

    if (disputeType === 'import') {
      // resolveLandImportDispute(landId, forceApprove, courtOrderCid)
      console.log(`API /api/dispute: resolveLandImportDispute ${landId} force=${forceExecute}`);
      const { request: txRequest } = await publicClient.simulateContract({
        account,
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'resolveLandImportDispute',
        args: [landId, Boolean(forceExecute), updatedCourtOrderCid || ''],
      });
      txHash = await walletClient.writeContract(txRequest);
    } else {
      // resolveInheritanceDispute(landId, forceExecute, updatedCourtOrderCid, legalResolutionCid, overrideReason)
      console.log(`API /api/dispute: resolveInheritanceDispute ${landId} force=${forceExecute}`);
      const { request: txRequest } = await publicClient.simulateContract({
        account,
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'resolveInheritanceDispute',
        args: [
          landId,
          Boolean(forceExecute),
          updatedCourtOrderCid || '',
          legalResolutionCid || '',
          overrideReason || '',
        ],
      });
      txHash = await walletClient.writeContract(txRequest);
    }

    console.log(`  dispute resolved tx: ${txHash}`);
    return NextResponse.json({ success: true, txHash });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('API /api/dispute error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
