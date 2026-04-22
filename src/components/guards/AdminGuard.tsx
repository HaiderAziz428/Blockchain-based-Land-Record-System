'use client';

import { useAccount, useReadContract, useChainId } from 'wagmi';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import { ShieldAlert, Loader2, Globe, AlertTriangle } from 'lucide-react';
import { sepolia } from 'wagmi/chains';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const [mounted, setMounted] = useState(false);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setMounted(true); }, []);

    // 2. Read the Owner from the Smart Contract
    const { data: contractOwner, error, isLoading } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'owner',
        query: {
            // Only try to read if we are mounted, connected, and on the right network
            enabled: mounted && isConnected && chainId === sepolia.id,
        }
    });

    // --- PRE-FLIGHT CHECKS ---

    if (!mounted) return null;

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0b1e] text-white p-6 text-center">
                <ShieldAlert size={64} className="text-gray-500 mb-4" />
                <h2 className="text-2xl font-bold mb-2">Wallet Not Connected</h2>
                <p className="text-gray-400 mb-6">Please connect your MetaMask wallet to access the Admin Portal.</p>
                <Link href="/" className="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl font-bold transition-all">
                    Go to Home
                </Link>
            </div>
        );
    }

    if (chainId !== sepolia.id) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0b1e] text-white p-6 text-center">
                <Globe size={64} className="text-yellow-500 mb-4" />
                <h2 className="text-2xl font-bold mb-2">Wrong Network</h2>
                <p className="text-gray-400 mb-6">Please switch your MetaMask to the <strong>Sepolia Testnet</strong>.</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0b1e] text-white">
                <Loader2 className="animate-spin text-indigo-400 mb-4" size={48} />
                <p className="text-gray-400">Verifying Admin Credentials on Blockchain...</p>
            </div>
        );
    }

    // 3. THE "0x" ERROR HANDLER (Contract Not Found)
    if (error || !contractOwner) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#0a0b1e] text-center p-6">
                <div className="glass-card p-10 rounded-3xl border-orange-500/30 max-w-lg">
                    <AlertTriangle size={64} className="text-orange-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Contract Not Found</h2>
                    <p className="text-gray-400 text-sm mb-4">
                        The website cannot find your Smart Contract on Sepolia. It returned &quot;0x&quot; (empty data).
                    </p>
                    <div className="text-left bg-black/40 p-4 rounded-xl space-y-2 mb-6 font-mono text-xs">
                        <p className="text-purple-400">Target Address:</p>
                        <p className="text-white break-all">{CONTRACT_ADDRESS}</p>
                    </div>
                    <p className="text-sm text-gray-300 mb-6 font-semibold">
                        Fix: Redeploy in Remix and update <code className="text-indigo-400">CONTRACT_ADDRESS</code> in your code.
                    </p>
                    <Link href="/" className="bg-white/10 hover:bg-white/20 w-full block py-3 rounded-xl font-bold transition-all">
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    // 4. AUTHORIZATION CHECK
    const userAddress = address?.toLowerCase();
    const ownerAddress = (contractOwner as string).toLowerCase();
    const isAuthorized = userAddress === ownerAddress;

    if (!isAuthorized) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#0a0b1e] text-center p-6">
                <div className="glass-card p-10 rounded-3xl border-red-500/20 max-w-lg shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                    <ShieldAlert size={64} className="text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>

                    <div className="text-left bg-black/40 p-4 rounded-xl space-y-3 my-6 font-mono text-xs">
                        <div>
                            <p className="text-blue-400 mb-1">Your Wallet:</p>
                            <p className="text-white break-all">{address}</p>
                        </div>
                        <div>
                            <p className="text-green-400 mb-1">Required Admin Wallet:</p>
                            <p className="text-white break-all">{contractOwner as string}</p>
                        </div>
                    </div>

                    <p className="text-gray-400 mb-6 text-sm">
                        Only the specific wallet that deployed the smart contract is authorized to view the Admin Portal.
                    </p>

                    <Link href="/" className="bg-indigo-600 hover:bg-indigo-500 w-full block py-3 rounded-xl font-bold transition-all text-white">
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    // 5. IF ALL CHECKS PASS, RENDER THE ADMIN PAGE
    return <>{children}</>;
}