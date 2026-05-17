'use client';

import { useAccount, useReadContract, useChainId } from 'wagmi';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';
import { ADMIN_ROLE, REGISTRAR_ROLE, RESOLVER_ROLE } from '@/src/utils/roleConstants';
import { ShieldAlert, Loader2, Globe } from 'lucide-react';
import { sepolia } from 'wagmi/chains';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * AdminGuard — checks on-chain role membership instead of contract `owner()`.
 *
 * Access is granted if the connected wallet holds ANY of:
 *   ADMIN_ROLE (DEFAULT_ADMIN_ROLE / deployer)
 *   REGISTRAR_ROLE
 *   RESOLVER_ROLE
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const enabled = mounted && isConnected && chainId === sepolia.id && !!address;

  const { data: isAdmin, isLoading: l1 } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'hasRole',
    args: [ADMIN_ROLE, address!],
    query: { enabled },
  });

  const { data: isRegistrar, isLoading: l2 } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'hasRole',
    args: [REGISTRAR_ROLE, address!],
    query: { enabled },
  });

  const { data: isResolver, isLoading: l3 } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'hasRole',
    args: [RESOLVER_ROLE, address!],
    query: { enabled },
  });

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0b1e] text-white p-6 text-center">
        <ShieldAlert size={64} className="text-gray-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Wallet Not Connected</h2>
        <p className="text-gray-400 mb-6">
          Please connect your wallet to access the Admin Portal.
        </p>
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
        <p className="text-gray-400 mb-6">
          Please switch your wallet to the <strong>Sepolia Testnet</strong>.
        </p>
      </div>
    );
  }

  if (l1 || l2 || l3) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0b1e] text-white">
        <Loader2 className="animate-spin text-indigo-400 mb-4" size={48} />
        <p className="text-gray-400">Verifying role credentials on-chain…</p>
      </div>
    );
  }

  const isAuthorized = Boolean(isAdmin) || Boolean(isRegistrar) || Boolean(isResolver);

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0b1e] text-center p-6">
        <div className="glass-card p-10 rounded-3xl border-red-500/20 max-w-lg">
          <ShieldAlert size={64} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 mb-4 text-sm">
            Your wallet does not hold ADMIN, REGISTRAR, or RESOLVER role on this contract.
          </p>
          <div className="text-left bg-black/40 p-4 rounded-xl mb-6 font-mono text-xs">
            <p className="text-blue-400 mb-1">Your Wallet:</p>
            <p className="text-white break-all">{address}</p>
          </div>
          <Link
            href="/"
            className="bg-indigo-600 hover:bg-indigo-500 w-full block py-3 rounded-xl font-bold transition-all text-white"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
