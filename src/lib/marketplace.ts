import { createClient } from '@supabase/supabase-js';

const marketUrl = process.env.NEXT_PUBLIC_MARKET_URL!;
const marketKey = process.env.NEXT_PUBLIC_MARKET_KEY!;

export const marketDb = createClient(marketUrl, marketKey);