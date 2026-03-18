'use client';

import AdminGuard from '@/src/components/guards/AdminGuard';
import Navbar from '@/src/components/Navbar';
import { useAccount, useReadContract } from 'wagmi';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';

export default function AdminDashboard() {
  const { address } = useAccount();

  const { data: contractOwner, isLoading: isOwnerLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'owner',
  });

  return (
    <AdminGuard>
      <div className="min-h-screen bg-brand-dark text-white">
        <Navbar />

        <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
          <div className="mb-10">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Admin Portal
            </h1>
            <p className="mt-2 text-sm text-white/60">
              Access is restricted to the smart contract owner.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="glass-card rounded-2xl p-6">
              <div className="text-xs text-white/60">Contract</div>
              <div className="mt-2 text-sm font-semibold">Land Registry</div>
              <div className="mt-3 break-all font-mono text-[11px] text-white/70">
                {CONTRACT_ADDRESS}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <div className="text-xs text-white/60">Owner (on-chain)</div>
              <div className="mt-2 text-sm font-semibold">
                {isOwnerLoading ? 'Loading…' : 'Verified'}
              </div>
              <div className="mt-3 break-all font-mono text-[11px] text-white/70">
                {String(contractOwner || '')}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <div className="text-xs text-white/60">Connected wallet</div>
              <div className="mt-2 text-sm font-semibold">Session</div>
              <div className="mt-3 break-all font-mono text-[11px] text-white/70">
                {address || 'Not connected'}
              </div>
            </div>
          </div>

          <div className="mt-10 glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold">Automated Verification</h2>
            <p className="mt-2 text-sm text-white/70">
              Users verify ownership from their dashboard. Your API route signs the
              mint transaction using the admin private key on the server.
            </p>

            <div className="mt-4 rounded-xl bg-black/30 p-4">
              <div className="text-xs font-mono text-white/70">
                POST <span className="text-indigo-300">/api/verify</span>
              </div>
              <div className="mt-2 text-xs font-mono text-white/60">
                body: {'{ userAddress, landId }'}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}