'use client';
import { useState, useEffect } from 'react';
import Header from '@/src/components/Header';
import RegistrationModal from '@/src/components/RegistrationModal';
import { useAccount, useReadContract } from 'wagmi';
import { useRouter } from 'next/navigation';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';

export default function Home() {
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const router = useRouter();

  // Ensure component is mounted on client before rendering dynamic content
  useEffect(() => {
    setMounted(true);
  }, []);

  // ---------------------------------------------------------
  // 1. READ USER IDENTITY (For User Portal)
  // ---------------------------------------------------------
  const { data: userProfile, isLoading: isAuthLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'users',
    args: address ? [address] : undefined,
    query: { enabled: !!address && mounted },
  });

  // ---------------------------------------------------------
  // 2. READ CONTRACT OWNER (For Admin Portal)
  // ---------------------------------------------------------
  const { data: ownerAddress, isLoading: isOwnerLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'owner', // Standard Ownable function
    query: { enabled: mounted },
  });

  // --- HANDLER: USER PORTAL ---
  const handleUserPortal = () => {
    if (!isConnected) {
      alert("Please connect your wallet first via the top right button.");
      return;
    }

    if (isAuthLoading) return;

    // userProfile is [name, cnic, isRegistered]
    // @ts-ignore
    const isRegistered = userProfile && userProfile[2];

    if (isRegistered) {
      console.log("User Identified. Redirecting...");
      router.push('/dashboard/user');
    } else {
      console.log("Unknown Wallet. Prompting Registration...");
      setShowModal(true);
    }
  };

  // --- HANDLER: ADMIN PORTAL ---
  const handleAdminPortal = () => {
    if (!isConnected) {
      alert("Please connect your wallet first.");
      return;
    }

    if (isOwnerLoading || !ownerAddress) {
        alert("Still loading contract data... please wait.");
        return;
    }

    // COMPARE ADDRESSES (Case Insensitive)
    if (String(address).toLowerCase() === String(ownerAddress).toLowerCase()) {
      router.push('/dashboard/admin');
    } else {
      alert("ACCESS DENIED: You are not the contract owner/admin.");
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <Header />

      <main className="pt-32 pb-16 px-6 max-w-7xl mx-auto text-center md:text-left">
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
          Decentralized Land Registry
        </h1>
        <p className="text-gray-400 mb-12 text-lg max-w-2xl">
          Secure, Immutable, and Transparent Land Records on the Ethereum Blockchain.
        </p>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl">
          
          {/* USER PORTAL CARD */}
          <div className="p-8 rounded-2xl bg-[#1e293b] border border-white/10 hover:border-blue-500/50 transition-all group text-left">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mb-6 text-2xl">👤</div>
            <h3 className="text-2xl font-bold mb-2">Citizen Portal</h3>
            <p className="text-gray-400 mb-8 h-12 text-sm">
              Manage your land assets, prove ownership, and digitize records.
            </p>
            
            <button 
              onClick={handleUserPortal}
              disabled={!mounted || isAuthLoading}
              className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold transition-all shadow-lg shadow-blue-900/20"
            >
              {!mounted || isAuthLoading ? 'Checking Identity...' : 'Access User Portal →'}
            </button>
          </div>

          {/* GOVT PORTAL CARD (FIXED & ENABLED) */}
          <div className="p-8 rounded-2xl bg-[#1e293b] border border-white/10 hover:border-purple-500/50 transition-all text-left">
             <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center mb-6 text-2xl">🏛️</div>
             <h3 className="text-2xl font-bold mb-2">Govt Official</h3>
             <p className="text-gray-400 mb-8 h-12 text-sm">
               Restricted access for Land Registrars and Verification Officers.
             </p>
             
             {/* UPDATED BUTTON LOGIC */}
             <button 
                onClick={handleAdminPortal}
                disabled={!mounted || isOwnerLoading}
                className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-700 font-bold transition-all shadow-lg shadow-purple-900/20"
             >
               {!mounted || isOwnerLoading ? 'Verifying Admin...' : 'Access Admin Portal →'}
             </button>
          </div>
        </div>
      </main>

      {/* REGISTRATION MODAL */}
      <RegistrationModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
      />
    </div>
  );
}