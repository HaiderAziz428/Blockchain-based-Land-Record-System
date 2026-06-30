import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/inheritance-request
 *
 * Saves a user-submitted inheritance request to Supabase for admin review.
 * The user uploads the court order to IPFS client-side and sends us the CID.
 *
 * Body: { landId, requesterAddress, courtOrderCid }
 */
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const { landId, requesterAddress, courtOrderCid } = (await request.json()) as {
      landId?: string;
      requesterAddress?: string;
      courtOrderCid?: string;
    };

    if (!landId || !requesterAddress || !courtOrderCid) {
      return NextResponse.json(
        { error: 'Missing required fields: landId, requesterAddress, courtOrderCid' },
        { status: 400 }
      );
    }

    const db = createClient(supabaseUrl, supabaseKey);

    // Prevent duplicate pending requests for the same land
    const { data: existing } = await db
      .from('inheritance_requests')
      .select('id, status')
      .eq('land_id', landId)
      .eq('status', 'pending')
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'A pending inheritance request already exists for this land.' },
        { status: 409 }
      );
    }

    const { error } = await db.from('inheritance_requests').insert({
      land_id: landId,
      requester_address: requesterAddress,
      court_order_cid: courtOrderCid,
      status: 'pending',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
