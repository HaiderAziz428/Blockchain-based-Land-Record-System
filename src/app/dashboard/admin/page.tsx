'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, usePublicClient } from 'wagmi'; 
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import { supabase } from '@/src/lib/supabase';
import Header from '@/src/components/Header';
import { useRouter } from 'next/navigation'; 

// Type for the data we fetch
interface DigitizedLand {
  landId: string;
  ownerWallet: string;
  ipfsHash: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  
  const [loading, setLoading] = useState(true);
  const [totalLands, setTotalLands] = useState(0);

  // ------------------------------------------------
  // 1. SECURITY CHECK (FIXED)
  // We now check 'owner' because your contract inherits 'Ownable'
  // ------------------------------------------------
  const { data: contractOwner, isLoading: isAuthLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'owner', // <--- CHANGED FROM 'verificationBackend'
  });

  useEffect(() => {
    // Wait for loading to finish
    if (!isAuthLoading && contractOwner && address) {
      // Normalize addresses to lowercase to avoid case-sensitivity bugs
      if (String(address).toLowerCase() !== String(contractOwner).toLowerCase()) {
        alert("SECURITY ALERT: You are not the Contract Owner.");
        router.push('/'); 
      }
    }
  }, [address, contractOwner, isAuthLoading, router]);

  // ------------------------------------------------
  // 2. FETCH STATS (Optional - Just to show the page works)
  // ------------------------------------------------
  useEffect(() => {
    if (address && contractOwner && String(address).toLowerCase() === String(contractOwner).toLowerCase()) {
        setLoading(false);
        // In a real app, you might fetch all events here to list all minted lands
    }
  }, [address, contractOwner]);


  // --- RENDER GATES ---

  if (!isConnected) {
    return <div className="min-h-screen flex items-center justify-center bg-[#020817] text-white">Please Connect Admin Wallet</div>;
  }

  if (isAuthLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#020817] text-white">Verifying Credentials...</div>;
  }

  // If addresses don't match, return null (Effect will redirect)
  if (String(address).toLowerCase() !== String(contractOwner).toLowerCase()) {
      return null;
  }

  // --- ACTUAL DASHBOARD UI ---

  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <Header />
      
      <main className="pt-32 px-6 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Admin Control Center</h1>
        <p className="text-gray-400 mb-8">
            Overview of the Land Registry Smart Contract.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
            {/* CARD 1: CONTRACT INFO */}
            <div className="bg-[#1e293b] border border-white/10 p-6 rounded-xl">
                <h3 className="text-gray-400 text-sm mb-1">Contract Status</h3>
                <p className="text-2xl font-bold text-green-400">Active</p>
                <p className="text-xs text-gray-500 mt-2 break-all">{CONTRACT_ADDRESS}</p>
            </div>

            {/* CARD 2: DEPLOYER */}
            <div className="bg-[#1e293b] border border-white/10 p-6 rounded-xl">
                <h3 className="text-gray-400 text-sm mb-1">Admin Wallet</h3>
                <p className="text-xl font-bold text-blue-400">Connected</p>
                <p className="text-xs text-gray-500 mt-2 break-all">{contractOwner as string}</p>
            </div>

            {/* CARD 3: SYSTEM MODE */}
            <div className="bg-[#1e293b] border border-white/10 p-6 rounded-xl">
                <h3 className="text-gray-400 text-sm mb-1">Verification Mode</h3>
                <p className="text-2xl font-bold text-purple-400">Automated Oracle</p>
                <p className="text-xs text-gray-500 mt-2">Users verify via API</p>
            </div>
        </div>

        {/* <div className="mt-12 p-8 bg-blue-900/10 border border-blue-500/20 rounded-xl">
            <h2 className="text-xl font-bold mb-4">ℹ️ Developer Note</h2>
            <p className="text-gray-300">
                Since we switched to the <strong>Automated Verification System</strong>, 
                you do not need to manually verify lands here. 
            </p>
            <p className="text-gray-400 mt-2 text-sm">
                When a user clicks "Verify" on their dashboard, your <strong>API Route</strong> 
                automatically signs the transaction using the Private Key stored in your <code>.env.local</code> file.
            </p>
        </div> */}

      </main>
    </div>
  );
}