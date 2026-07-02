import { NextResponse } from 'next/server';
import { createWalletClient, http, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';
import { getAdminKey } from '@/src/utils/adminKey';
import { encryptJSON } from '@/src/utils/encryption';

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
 * POST /api/verify  — self-service land mint (supports multi-owner co-verification)
 *
 * Body: { userAddress: string, landId: string }
 *
 * Flow:
 *  1. Read user CNIC from chain (must be registered)
 *  2. Confirm this CNIC is listed in land_co_owners for this land
 *  3. Confirm land not already proposed/minted on-chain
 *  4. Mark this co-owner's row as verified (verified_at = NOW())
 *  5. Fetch ALL co-owner rows from land_co_owners for this land_id
 *  6a. If any co-owner has NOT yet verified → return pending status (no on-chain tx)
 *  6b. If ALL co-owners verified → resolve addresses, generate IPFS metadata,
 *      call proposeLandImport with all owners and equal bps shares
 */
export async function POST(request: Request) {
  let adminPrivateKey: `0x${string}`;
  try {
    adminPrivateKey = getAdminKey();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server misconfigured' }, { status: 500 });
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

    const db = createClient(supabaseUrl, supabaseKey);

    // 2. Confirm this CNIC is a listed co-owner of this land
    const { data: myCoOwnerRow, error: myCoErr } = await db
      .from('land_co_owners')
      .select('owner_cnic, verified_at')
      .eq('land_id', landId)
      .eq('owner_cnic', userProfile.cnic)
      .single();

    if (myCoErr || !myCoOwnerRow) {
      return NextResponse.json(
        { error: 'You are not listed as a co-owner of this land in the govt registry.' },
        { status: 403 }
      );
    }

    // 3. Confirm land not already proposed / minted on-chain
    const onChain = (await publicClient.readContract({
      address: CONTRACT_V9_ADDRESS,
      abi: CONTRACT_V9_ABI,
      functionName: 'getLandRecord',
      args: [landId],
    })) as { landId: string };

    if (onChain.landId && onChain.landId !== '') {
      return NextResponse.json({ error: 'Land already proposed or minted on-chain.' }, { status: 409 });
    }

    // 4. Mark this co-owner as verified
    const { error: verifyErr } = await db
      .from('land_co_owners')
      .update({ verified_at: new Date().toISOString() })
      .eq('land_id', landId)
      .eq('owner_cnic', userProfile.cnic);

    if (verifyErr) {
      return NextResponse.json({ error: `DB update failed: ${verifyErr.message}` }, { status: 500 });
    }

    // 5. Fetch ALL co-owner rows for this land to check quorum
    const { data: allCoOwners, error: allErr } = await db
      .from('land_co_owners')
      .select('owner_cnic, verified_at')
      .eq('land_id', landId);

    if (allErr || !allCoOwners) {
      return NextResponse.json({ error: `DB read failed: ${allErr?.message}` }, { status: 500 });
    }

    const totalOwners = allCoOwners.length;
    const verifiedOwners = allCoOwners.filter((r) => r.verified_at !== null).length;

    // 6a. Not all co-owners have verified yet — return pending status
    if (verifiedOwners < totalOwners) {
      return NextResponse.json({
        pending: true,
        message: `Your verification is recorded. Waiting for ${totalOwners - verifiedOwners} more co-owner(s) to verify.`,
        verifiedCount: verifiedOwners,
        totalCount: totalOwners,
      });
    }

    // 6b. All co-owners verified — resolve each CNIC → wallet address on-chain
    const ownerAddresses: `0x${string}`[] = [];
    for (const row of allCoOwners) {
      const addr = (await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'cnicToAddress',
        args: [row.owner_cnic],
      })) as `0x${string}`;

      if (!addr || addr === '0x0000000000000000000000000000000000000000') {
        return NextResponse.json(
          { error: `Co-owner with CNIC ${row.owner_cnic} has not registered a wallet yet.` },
          { status: 403 }
        );
      }
      ownerAddresses.push(addr);
    }

    // Equal share split (10 000 bps total). Rounding remainder goes to first owner.
    const baseShare = Math.floor(10000 / totalOwners);
    const remainder = 10000 - baseShare * totalOwners;
    const shareBps = allCoOwners.map((_, i) => (i === 0 ? baseShare + remainder : baseShare));

    // Fetch land metadata from govt_land_records (single row, unique land_id)
    const { data: govtRecord, error: govtErr } = await db
      .from('govt_land_records')
      .select('land_type, location, area_sq_yards, ipfs_hash')
      .eq('land_id', landId)
      .single();

    if (govtErr || !govtRecord) {
      return NextResponse.json({ error: 'Land metadata not found in govt registry.' }, { status: 404 });
    }

    // Get or generate IPFS metadata
    let ipfsHash: string = govtRecord.ipfs_hash ?? '';

    if (!ipfsHash) {
      const metadata = {
        name: `LandLedger Plot — ${landId}`,
        description: `On-chain land record for plot ${landId}, digitised from the govt allotment registry.`,
        attributes: [
          { trait_type: 'Land ID',         value: landId },
          { trait_type: 'Land Type',       value: govtRecord.land_type ?? 'RESIDENTIAL' },
          { trait_type: 'Location',        value: govtRecord.location ?? '' },
          { trait_type: 'Area (sq yards)', value: govtRecord.area_sq_yards ?? 0 },
          { trait_type: 'Owners',          value: allCoOwners.map((r) => r.owner_cnic).join(', ') },
        ],
      };

      // The metadata contains owner CNICs, so it is encrypted before pinning.
      // The CID stored on-chain stays a real IPFS address (tokenURI keeps
      // working); only the content it points to is sealed. The AES key lives
      // in Supabase and never goes on-chain or to the browser.
      const { payload: encryptedPayload, keyHex } = encryptJSON(metadata);

      ipfsHash = await pinJsonToPinata(encryptedPayload, `LandLedger-${landId}`);

      const { error: updateErr } = await db
        .from('govt_land_records')
        .update({ ipfs_hash: ipfsHash, enc_key: keyHex })
        .eq('land_id', landId);

      if (updateErr) {
        // Without the persisted key the pinned content is permanently
        // undecryptable — abort rather than mint an unreadable record.
        return NextResponse.json(
          {
            error:
              `Failed to persist encryption key (${updateErr.message}). ` +
              `Ensure govt_land_records has TEXT columns "ipfs_hash" and "enc_key".`,
          },
          { status: 500 }
        );
      }

      console.log(`Encrypted metadata pinned for ${landId}: ${ipfsHash}`);
    }

    const landType = LAND_TYPE_MAP[(govtRecord.land_type ?? 'RESIDENTIAL').toUpperCase()] ?? 0;

    const account = privateKeyToAccount(adminPrivateKey);
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

    const { request: txRequest } = await publicClient.simulateContract({
      account,
      address: CONTRACT_V9_ADDRESS,
      abi: CONTRACT_V9_ABI,
      functionName: 'proposeLandImport',
      args: [landId, ipfsHash, landType, ownerAddresses, shareBps, ''],
    });

    const txHash = await walletClient.writeContract(txRequest);
    console.log(`proposeLandImport tx for ${landId} (${totalOwners} owner(s)): ${txHash}`);

    return NextResponse.json({ success: true, txHash, totalOwners, verifiedOwners: totalOwners });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('API /api/verify error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
