import { NextResponse } from 'next/server';
import { createWalletClient, http, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';

const RPC_URL = 'https://ethereum-sepolia.publicnode.com';

const LAND_TYPE_MAP: Record<string, number> = {
  RESIDENTIAL: 0,
  AGRICULTURAL: 1,
  COMMERCIAL: 2,
};

/** Pin a JSON object to Pinata and return its CID. */
async function pinJsonToPinata(json: object, name: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY;
  const apiSecret =
    process.env.NEXT_PUBLIC_PINATA_API_SECRET ?? process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;

  if (!apiKey || !apiSecret) {
    throw new Error('Pinata API keys not configured. Set NEXT_PUBLIC_PINATA_API_KEY and NEXT_PUBLIC_PINATA_API_SECRET in .env.local');
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    },
    body: JSON.stringify({
      pinataContent: json,
      pinataMetadata: { name },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata error: ${text}`);
  }

  const data = await res.json();
  return data.IpfsHash as string;
}

/**
 * POST /api/verify  — self-service land mint
 *
 * Body: { userAddress: string, landId: string }
 *
 * Flow:
 *  1. Read user CNIC from chain
 *  2. Cross-check govt_land_records (CNIC must own this land)
 *  3. Confirm land not already on-chain
 *  4. If no ipfs_hash in DB → auto-generate ERC-721 metadata from DB fields and pin to Pinata
 *  5. Sign proposeLandImport as REGISTRAR (single owner, 10 000 bps)
 */
export async function POST(request: Request) {
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    return NextResponse.json({ error: 'Server misconfigured: missing ADMIN_PRIVATE_KEY' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Server misconfigured: missing Supabase credentials' }, { status: 500 });
  }

  try {
    const { userAddress, landId } = (await request.json()) as {
      userAddress: string;
      landId: string;
    };

    if (!userAddress || !landId) {
      return NextResponse.json({ error: 'Missing required fields: userAddress, landId' }, { status: 400 });
    }

    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

    // 1. Confirm wallet is registered and get CNIC
    const userProfile = (await publicClient.readContract({
      address: CONTRACT_V9_ADDRESS,
      abi: CONTRACT_V9_ABI,
      functionName: 'getUser',
      args: [userAddress as `0x${string}`],
    })) as { name: string; cnic: string; isRegistered: boolean };

    if (!userProfile.isRegistered) {
      return NextResponse.json({ error: 'Wallet not registered. Register first.' }, { status: 403 });
    }

    // 2. Cross-check govt_land_records
    const db = createClient(supabaseUrl, supabaseKey);
    const { data: records, error: dbErr } = await db
      .from('govt_land_records')
      .select('*')
      .eq('land_id', landId)
      .eq('owner_cnic', userProfile.cnic)
      .limit(1);

    if (dbErr) {
      return NextResponse.json({ error: `Database error: ${dbErr.message}` }, { status: 500 });
    }
    if (!records || records.length === 0) {
      return NextResponse.json(
        { error: 'Land not found in govt registry for your CNIC.' },
        { status: 403 }
      );
    }

    const govtRecord = records[0];

    // 3. Confirm not already on-chain
    const onChain = (await publicClient.readContract({
      address: CONTRACT_V9_ADDRESS,
      abi: CONTRACT_V9_ABI,
      functionName: 'getLandRecord',
      args: [landId],
    })) as { landId: string };

    if (onChain.landId && onChain.landId !== '') {
      return NextResponse.json({ error: 'Land already minted on-chain.' }, { status: 409 });
    }

    // 4. Get or auto-generate IPFS metadata
    let ipfsHash: string = govtRecord.ipfs_hash ?? '';

    if (!ipfsHash) {
      // Auto-generate ERC-721 metadata from Supabase fields — no manual upload needed
      void (govtRecord.land_type ?? 'RESIDENTIAL').toUpperCase(); // consumed via attributes below
      const metadata = {
        name: `LandLedger Plot — ${landId}`,
        description: `On-chain land record for plot ${landId}, digitised from the govt allotment registry.`,
        attributes: [
          { trait_type: 'Land ID', value: landId },
          { trait_type: 'Land Type', value: govtRecord.land_type ?? 'RESIDENTIAL' },
          { trait_type: 'Location', value: govtRecord.location ?? '' },
          { trait_type: 'Area (sq yards)', value: govtRecord.area_sq_yards ?? 0 },
          { trait_type: 'Owner CNIC', value: userProfile.cnic },
          { trait_type: 'Owner Name', value: userProfile.name },
        ],
      };

      ipfsHash = await pinJsonToPinata(metadata, `LandLedger-${landId}`);

      // Store CID back in Supabase so future calls skip re-pinning
      await db
        .from('govt_land_records')
        .update({ ipfs_hash: ipfsHash })
        .eq('land_id', landId);

      console.log(`Auto-generated metadata for ${landId}: ${ipfsHash}`);
    }

    // 5. Sign proposeLandImport as REGISTRAR
    const landType = LAND_TYPE_MAP[(govtRecord.land_type ?? 'RESIDENTIAL').toUpperCase()] ?? 0;

    const account = privateKeyToAccount(adminPrivateKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

    const { request: txRequest } = await publicClient.simulateContract({
      account,
      address: CONTRACT_V9_ADDRESS,
      abi: CONTRACT_V9_ABI,
      functionName: 'proposeLandImport',
      args: [
        landId,
        ipfsHash,
        landType,
        [userAddress as `0x${string}`],
        [10000],
        '',
      ],
    });

    const txHash = await walletClient.writeContract(txRequest);
    console.log(`proposeLandImport tx for ${landId}: ${txHash}`);

    return NextResponse.json({ success: true, txHash });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('API /api/verify error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
