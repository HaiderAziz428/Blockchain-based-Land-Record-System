/**
 * GET /api/metadata?landId=<id>
 *
 * Server-side metadata endpoint. Looks up the CID (and per-record AES key)
 * from Supabase, fetches the payload from IPFS, decrypts it server-side when
 * it is an encrypted record, and returns only the non-sensitive fields.
 * The encryption key never reaches the browser in any response.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptJSON, isEncryptedPayload } from '@/src/utils/encryption';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

const SENSITIVE_KEYS = /^(cnic|owner|owner_?cnic|owner_?name|owners)$/i;
const SENSITIVE_TRAITS = /owner|cnic/i;

/** Strip identity fields (CNIC, owner names) so the public page never sees them. */
function sanitizeMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) return {};
  const meta = { ...(raw as Record<string, unknown>) };

  for (const key of Object.keys(meta)) {
    if (SENSITIVE_KEYS.test(key)) delete meta[key];
  }

  if (Array.isArray(meta.attributes)) {
    meta.attributes = meta.attributes.filter((attr) => {
      const trait = (attr as Record<string, unknown>)?.trait_type;
      return typeof trait !== 'string' || !SENSITIVE_TRAITS.test(trait);
    });
  }

  return meta;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const landId = searchParams.get('landId');

  if (!landId) {
    return NextResponse.json({ error: 'Missing landId query param.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Server misconfigured: missing Supabase credentials.' }, { status: 500 });
  }

  try {
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
          { error: 'Encryption key missing from registry — record cannot be decrypted.' },
          { status: 500 }
        );
      }
      const decrypted = decryptJSON(ipfsData, keyHex);
      return NextResponse.json({ metadata: sanitizeMetadata(decrypted), decrypted: true });
    }

    // Legacy plain-text record (pinned before encryption was added).
    return NextResponse.json({ metadata: sanitizeMetadata(ipfsData), decrypted: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/metadata] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
