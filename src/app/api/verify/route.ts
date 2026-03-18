import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWalletClient, http, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';

export async function POST(request: Request) {
  console.log("🚀 API: Verification Process Started");

  // ---------------------------------------------------------
  // 1. SAFETY CHECK: Environment Variables
  // ---------------------------------------------------------
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;

  // Log status to Terminal (Not Browser)
  console.log("   - Supabase URL:", supabaseUrl ? "✅ Loaded" : "❌ MISSING");
  console.log("   - Supabase Key:", supabaseKey ? "✅ Loaded" : "❌ MISSING");
  console.log("   - Admin Private Key:", adminPrivateKey ? "✅ Loaded" : "❌ MISSING");

  if (!supabaseUrl || !supabaseKey || !adminPrivateKey) {
    return NextResponse.json({ 
      error: "Server Error: Missing Environment Variables. Check your .env.local file." 
    }, { status: 500 });
  }

  // ---------------------------------------------------------
  // 2. INITIALIZE CLIENTS
  // ---------------------------------------------------------
  const supabase = createClient(supabaseUrl, supabaseKey);
  const account = privateKeyToAccount(adminPrivateKey as `0x${string}`);

  const rpcUrl = "https://ethereum-sepolia.publicnode.com";
  
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl)
  });

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl)
  });

  try {
    // ---------------------------------------------------------
    // 3. PARSE REQUEST
    // ---------------------------------------------------------
    const { userAddress, landId } = await request.json();
    
    if (!userAddress || !landId) {
      return NextResponse.json({ error: "Missing parameters: userAddress or landId" }, { status: 400 });
    }

    console.log(`   - Processing: ${landId} for ${userAddress}`);

    // ---------------------------------------------------------
    // 4. READ USER IDENTITY FROM BLOCKCHAIN
    // Function: users(address) -> [name, cnic, isRegistered]
    // ---------------------------------------------------------
    const userProfile = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'users',
      args: [userAddress]
    }) as [string, string, boolean];

    const userCnic = userProfile[1];

    if (!userCnic) {
      return NextResponse.json({ error: "User is not registered on the Blockchain." }, { status: 400 });
    }
    console.log(`   - Identity Verified: ${userCnic}`);

    // ---------------------------------------------------------
    // 5. CROSS-MATCH WITH MOCK GOVT DATABASE
    // ---------------------------------------------------------
    const { data: govtRecord, error: dbError } = await supabase
      .from('govt_land_records')
      .select('*')
      .eq('land_id', landId)
      .eq('owner_cnic', userCnic)
      .single();

    if (dbError || !govtRecord) {
      console.log("   - DB Match Failed:", dbError?.message);
      return NextResponse.json({ error: "Verification Failed: This Land ID is not linked to your CNIC in Govt Records." }, { status: 403 });
    }
    console.log("   - Government Record Found ✅");

    // ---------------------------------------------------------
    // 6. CHECK IF ALREADY MINTED (Prevent Double Spend)
    // ---------------------------------------------------------
    const landRecord = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'getLandRecord',
      args: [landId]
    }) as { currentOwner: string };

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    if (landRecord.currentOwner !== ZERO_ADDRESS) {
      return NextResponse.json({ error: "This Land is already digitized on the Blockchain." }, { status: 400 });
    }

    // ---------------------------------------------------------
    // 7. EXECUTE MINTING (Admin pays Gas)
    // ---------------------------------------------------------
    const ipfsHash = "ipfs://verified_" + landId;
    const landType = 0; // 0 = Residential

    console.log("\\n=======================================================");
    console.log("🚀 MINTING TRANSACTION DETAILS (ADMIN WALLET)");
    console.log("=======================================================");
    console.log(`➡️ Admin Wallet Action: ${account.address}`);
    console.log(`➡️ Target SC Address: ${CONTRACT_ADDRESS}`);
    console.log(`➡️ Target User Wallet: ${userAddress}`);
    console.log(`➡️ Land ID Minting: ${landId}`);
    console.log(`➡️ IPFS Metadata: ${ipfsHash}`);
    console.log("-------------------------------------------------------");
    console.log("   ⏳ Simulating Transaction (Gas estimation & Access Checks)...");
    const { request: txRequest } = await publicClient.simulateContract({
      account,
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'storeVerifiedLandRecord', // Matches your Smart Contract
      args: [userAddress, landId, ipfsHash, landType]
    });

    console.log("   ✅ Simulation Passed. NO Reverts detected.");
    console.log("   📡 Broadcasting to Sepolia Testnet...");
    
    // Execute the transaction
    const txHash = await walletClient.writeContract(txRequest);

    console.log("-------------------------------------------------------");
    console.log(`   🎉 Transaction Sent Successfully!`);
    console.log(`   🔗 Explorer Link: https://sepolia.etherscan.io/tx/${txHash}`);
    console.log(`   📝 Tx Hash: ${txHash}`);
    console.log("=======================================================\\n");

    return NextResponse.json({ success: true, txHash });

  } catch (error: any) {
    console.error("❌ API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}