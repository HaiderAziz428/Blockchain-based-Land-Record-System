/**
 * GET /api/metadata?landId=<id>
 *
 * Fetches the plain JSON metadata from IPFS for the given land ID.
 * Looks up the CID from Supabase and proxies the IPFS content.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

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
      .select('ipfs_hash')
      .eq('land_id', landId)
      .limit(1);

    if (dbErr) {
      return NextResponse.json({ error: `Database error: ${dbErr.message}` }, { status: 500 });
    }
    if (!records || records.length === 0 || !records[0].ipfs_hash) {
      return NextResponse.json({ error: 'No IPFS record found for this land ID.' }, { status: 404 });
    }

    const cid = records[0].ipfs_hash;
    const ipfsRes = await fetch(`${IPFS_GATEWAY}/${cid}`, { next: { revalidate: 3600 } });
    if (!ipfsRes.ok) {
      return NextResponse.json({ error: `IPFS fetch failed: HTTP ${ipfsRes.status}` }, { status: 502 });
    }

    const metadata = await ipfsRes.json();
    return NextResponse.json({ metadata });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/metadata] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
