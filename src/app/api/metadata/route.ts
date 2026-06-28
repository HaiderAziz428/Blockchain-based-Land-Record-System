/**
 * POST /api/metadata
 *
 * GATED server-side decryption route.
 *
 * The decrypted metadata contains the owner's CNIC + name, so it must NOT be
 * world-readable. The caller must prove — with a wallet signature — that they
 * are either the registry admin or a current shareholder of the land. Only then
 * do we fetch the encrypted blob from IPFS, decrypt it server-side, and return
 * the plaintext. The AES key never leaves the server.
 *
 * Body: { landId, address, signature, timestamp }
 *   - signature is over buildMessage(landId, address, timestamp)
 *   - timestamp guards against replay (must be within MAX_SKEW_MS)
 *
 * Authorization (on-chain, no JWT/session — matches the app's design):
 *   - admin   : address === the ADMIN_PRIVATE_KEY wallet, OR
 *   - owner   : getShareBps(landId, address) > 0
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, recoverMessageAddress, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { decryptJSON, isEncryptedPayload } from '@/src/utils/encryption';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs';
const RPC_URL = 'https://ethereum-sepolia.publicnode.com';
const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/** The exact message the client must sign. Must match the client byte-for-byte. */
export function buildMetadataAccessMessage(landId: string, address: string, timestamp: number): string {
  return `LandLedger — decrypt land metadata\nLand ID: ${landId}\nWallet: ${address}\nTimestamp: ${timestamp}`;
}

export async function POST(request: Request) {
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!adminPrivateKey || !supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Server misconfigured: missing credentials.' }, { status: 500 });
  }

  try {
    const { landId, address, signature, timestamp } = (await request.json()) as {
      landId?: string;
      address?: string;
      signature?: `0x${string}`;
      timestamp?: number;
    };

    if (!landId || !address || !signature || !timestamp) {
      return NextResponse.json(
        { error: 'Missing required fields: landId, address, signature, timestamp.' },
        { status: 400 }
      );
    }

    // 1. Replay guard — the signed timestamp must be recent.
    if (Math.abs(Date.now() - timestamp) > MAX_SKEW_MS) {
      return NextResponse.json({ error: 'Signature expired. Please try again.' }, { status: 401 });
    }

    // 2. Verify the signature: recovered signer must equal the claimed address.
    const message = buildMetadataAccessMessage(landId, address, timestamp);
    let recovered: string;
    try {
      recovered = await recoverMessageAddress({ message, signature });
    } catch {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
    }
    if (getAddress(recovered) !== getAddress(address)) {
      return NextResponse.json({ error: 'Signature does not match wallet.' }, { status: 401 });
    }

    // 3. Authorization — admin OR current shareholder of this land.
    const adminAddress = privateKeyToAccount(adminPrivateKey as `0x${string}`).address;
    const isAdmin = getAddress(address) === getAddress(adminAddress);

    let isOwner = false;
    if (!isAdmin) {
      const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
      try {
        const bps = (await publicClient.readContract({
          address: CONTRACT_V9_ADDRESS,
          abi: CONTRACT_V9_ABI,
          functionName: 'getShareBps',
          args: [landId, address as `0x${string}`],
        })) as bigint | number;
        isOwner = Number(bps) > 0;
      } catch {
        isOwner = false;
      }
    }

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: 'Not authorized. Only the land owner or registry admin can decrypt this record.' },
        { status: 403 }
      );
    }

    // 4. Look up CID + key, fetch from IPFS, decrypt.
    const db = createClient(supabaseUrl, supabaseKey);
    const { data: records, error: dbErr } = await db
      .from('govt_land_records')
      .select('ipfs_hash, enc_key')
      .eq('land_id', landId)
      .limit(1);

    if (dbErr) {
      return NextResponse.json({ error: `Database error: ${dbErr.message}` }, { status: 500 });
    }
    if (!records || records.length === 0 || !records[0].ipfs_hash) {
      return NextResponse.json({ error: 'No IPFS record found for this land ID.' }, { status: 404 });
    }

    const { ipfs_hash: cid, enc_key: keyHex } = records[0];

    const ipfsRes = await fetch(`${IPFS_GATEWAY}/${cid}`, { next: { revalidate: 3600 } });
    if (!ipfsRes.ok) {
      return NextResponse.json({ error: `IPFS fetch failed: HTTP ${ipfsRes.status}` }, { status: 502 });
    }
    const ipfsData: unknown = await ipfsRes.json();

    if (isEncryptedPayload(ipfsData)) {
      if (!keyHex) {
        return NextResponse.json(
          { error: 'Encryption key missing from registry. Record may predate encryption.' },
          { status: 500 }
        );
      }
      const decrypted = decryptJSON(ipfsData, keyHex);
      return NextResponse.json({ decrypted: true, metadata: decrypted });
    }

    // Legacy plain-text record (minted before encryption was added)
    return NextResponse.json({ decrypted: false, metadata: ipfsData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/metadata] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
