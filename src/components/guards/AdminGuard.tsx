'use client';

import { useAccount, useReadContract, useChainId } from 'wagmi';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';
import { ADMIN_ROLE, REGISTRAR_ROLE, RESOLVER_ROLE } from '@/src/utils/roleConstants';
import { ShieldAlert, Loader2, Globe } from 'lucide-react';
import { sepolia } from 'wagmi/chains';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const enabled = mounted && isConnected && chainId === sepolia.id && !!address;

  const { data: isAdmin,     isLoading: l1 } = useReadContract({ address: CONTRACT_V9_ADDRESS, abi: CONTRACT_V9_ABI, functionName: 'hasRole', args: [ADMIN_ROLE,     address!], query: { enabled } });
  const { data: isRegistrar, isLoading: l2 } = useReadContract({ address: CONTRACT_V9_ADDRESS, abi: CONTRACT_V9_ABI, functionName: 'hasRole', args: [REGISTRAR_ROLE, address!], query: { enabled } });
  const { data: isResolver,  isLoading: l3 } = useReadContract({ address: CONTRACT_V9_ADDRESS, abi: CONTRACT_V9_ABI, functionName: 'hasRole', args: [RESOLVER_ROLE,  address!], query: { enabled } });

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6 text-center">
        <ShieldAlert size={56} className="text-muted mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Wallet Not Connected</h2>
        <p className="text-muted text-sm mb-6">
          Please connect your wallet to access the Admin Portal.
        </p>
        <Link href="/" className="btn-primary px-6 py-2.5 rounded-lg">
          Go to Home
        </Link>
      </div>
    );
  }

  if (chainId !== sepolia.id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6 text-center">
        <Globe size={56} className="text-warning mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Wrong Network</h2>
        <p className="text-muted text-sm">
          Please switch your wallet to the <strong className="text-foreground">Sepolia Testnet</strong>.
        </p>
      </div>
    );
  }

  if (l1 || l2 || l3) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
        <Loader2 className="animate-spin text-accent mb-4" size={40} />
        <p className="text-muted text-sm">Verifying role credentials on-chain…</p>
      </div>
    );
  }

  const isAuthorized = Boolean(isAdmin) || Boolean(isRegistrar) || Boolean(isResolver);

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-6">
        <div className="glass-card p-10 rounded-2xl border-danger/20 max-w-lg w-full text-center">
          <ShieldAlert size={56} className="text-danger mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted text-sm mb-4">
            Your wallet does not hold ADMIN, REGISTRAR, or RESOLVER role on this contract.
          </p>
          <div className="text-left bg-surface p-4 rounded-xl mb-6 font-mono text-xs border border-border">
            <p className="text-accent mb-1">Your Wallet:</p>
            <p className="text-foreground break-all">{address}</p>
          </div>
          <Link href="/" className="btn-primary w-full block py-2.5 rounded-lg">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
