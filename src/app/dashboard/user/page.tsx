'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { formatEther } from 'viem';
import Navbar from '@/src/components/Navbar';
import TxToast from '@/src/components/TxToast';
import CreateListingModal from '@/src/components/CreateListingModal';
import TransferModal from '@/src/components/TransferModal';
import { supabase } from '@/src/lib/supabase';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle,
  ExternalLink,
  Gavel,
  GitBranch,
  Home,
  Loader2,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';
import {
  CONTRACT_V9_ABI,
  CONTRACT_V9_ADDRESS,
  LandStatusV9,
  LandTypeV9,
  formatBps,
  landStatusLabel,
  landTypeLabel,
  occupancyCategoryLabel,
} from '@/src/utils/contractV9';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'lands' | 'succession' | 'subdivision' | 'occupancy' | 'withdraw';

interface GovtRecord {
  land_id: string;
  owner_cnic: string;
  location: string;
  area_sq_yards: number;
  land_type: string;
  ipfs_hash: string | null;
}

interface LandSummary {
  landId: string;
  ipfsHash: string;
  landType: number;
  status: number;
  shareBps: number;
  location?: string;
  areaSqYards?: number;
  isOnChain: boolean;
  govtIpfsHash?: string | null;
  activeListing?: { price: bigint; deadline: bigint } | null;
}

interface OccupancyAgreement {
  id: bigint;
  category: number;
  grantor: string;
  occupant: string;
  startTime: bigint;
  endTime: bigint;
  termsCid: string;
  descriptionCid: string;
  isRevoked: boolean;
}

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

const STATUS_TONE: Record<number, string> = {
  [LandStatusV9.PENDING_VERIFICATION]: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  [LandStatusV9.ACTIVE]:               'bg-green-500/10 text-green-400 border-green-500/20',
  [LandStatusV9.PENDING_INHERITANCE]:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
  [LandStatusV9.PENDING_SUBDIVISION]:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  [LandStatusV9.LOCKED_IMPORT_DISPUTE]:        'bg-red-500/10 text-red-400 border-red-500/20',
  [LandStatusV9.LOCKED_INHERITANCE_DISPUTE]:   'bg-red-500/10 text-red-400 border-red-500/20',
  [LandStatusV9.LOCKED_SUBDIVISION_DISPUTE]:   'bg-red-500/10 text-red-400 border-red-500/20',
  [LandStatusV9.SUBDIVIDED]:           'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

// ─── Inline registration form ─────────────────────────────────────────────────

function RegisterInlineForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [cnic, setCnic] = useState('');
  const [err, setErr] = useState('');

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => { if (isSuccess) onSuccess(); }, [isSuccess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim() || !cnic.trim()) { setErr('Name and CNIC are required.'); return; }
    if (!/^\d{5}-\d{7}-\d$/.test(cnic)) { setErr('CNIC format: 12345-1234567-1'); return; }
    writeContract({
      address: CONTRACT_V9_ADDRESS,
      abi: CONTRACT_V9_ABI,
      functionName: 'registerUser',
      args: [name.trim(), cnic.trim()],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-sm mx-auto text-left">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)}
        className="field w-full" placeholder="Full name" required />
      <input type="text" value={cnic} onChange={(e) => setCnic(e.target.value)}
        className="field w-full" placeholder="CNIC (12345-1234567-1)" required />
      {(err || writeError) && (
        <p className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">
          {err || writeError?.message?.split('\n')[0]}
        </p>
      )}
      <button type="submit" disabled={isPending || isConfirming}
        className="btn-primary w-full flex items-center justify-center gap-2">
        {(isPending || isConfirming) && <Loader2 size={14} className="animate-spin" />}
        {isPending ? 'Confirm in wallet…' : isConfirming ? 'Registering…' : 'Register'}
      </button>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UserDashboard() {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [tab, setTab] = useState<Tab>('lands');
  const [lands, setLands] = useState<LandSummary[]>([]);
  const [isLoadingLands, setIsLoadingLands] = useState(false);
  const [selectedLand, setSelectedLand] = useState<LandSummary | null>(null);
  const [isListingModalOpen, setListingModalOpen] = useState(false);
  const [isTransferModalOpen, setTransferModalOpen] = useState(false);
  const [txToast, setTxToast] = useState<{ hash: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info' | 'success'; message: string } | null>(null);

  // ── User profile ──────────────────────────────────────────────────────────
  const { data: userProfileData, isLoading: isProfileLoading, refetch: refetchProfile } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'getUser',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const profile = userProfileData as { name: string; cnic: string; isRegistered: boolean } | undefined;

  // ── Pending proceeds ──────────────────────────────────────────────────────
  const { data: pendingProceedsData, refetch: refetchProceeds } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'pendingProceeds',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const pendingProceeds = pendingProceedsData as bigint | undefined;

  // ── Withdraw proceeds ─────────────────────────────────────────────────────
  const withdrawProcessedRef = useRef(false);
  const { writeContract: writeWithdraw, data: withdrawHash, isPending: isWithdrawPending } = useWriteContract();
  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash });

  useEffect(() => {
    if (isWithdrawSuccess && withdrawHash && !withdrawProcessedRef.current) {
      withdrawProcessedRef.current = true;
      setTxToast({ hash: withdrawHash, message: 'Proceeds withdrawn!' });
      refetchProceeds();
    }
  }, [isWithdrawSuccess, withdrawHash]);

  // ── Verify & Mint ─────────────────────────────────────────────────────────
  const [verifyingLandId, setVerifyingLandId] = useState<string | null>(null);

  const handleVerifyAndMint = async (landId: string) => {
    if (!address) return;
    setVerifyingLandId(landId);
    setNotice(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: address, landId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Mint failed');
      setTxToast({ hash: data.txHash, message: 'Land proposed on-chain!' });
      setTimeout(() => { loadLands(); setVerifyingLandId(null); }, 8000);
    } catch (e) {
      setNotice({ tone: 'error', message: `Mint failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
      setVerifyingLandId(null);
    }
  };

  // ── Confirm ownership (PENDING_VERIFICATION → ACTIVE) ────────────────────
  const [confirmingLandId, setConfirmingLandId] = useState<string | null>(null);
  const confirmProcessedRef = useRef(false);
  const { writeContract: writeConfirm, data: confirmHash, isPending: isConfirmPending } = useWriteContract();
  const { isLoading: isConfirmConfirming, isSuccess: isConfirmSuccess } = useWaitForTransactionReceipt({ hash: confirmHash });

  useEffect(() => {
    if (isConfirmSuccess && confirmHash && !confirmProcessedRef.current) {
      confirmProcessedRef.current = true;
      setTxToast({ hash: confirmHash, message: 'Ownership confirmed! Land is now ACTIVE.' });
      setConfirmingLandId(null);
      loadLands();
    }
  }, [isConfirmSuccess, confirmHash]);

  // ── Cancel listing ────────────────────────────────────────────────────────
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const cancelProcessedRef = useRef(false);
  const { writeContract: writeCancel, data: cancelHash, isPending: isCancelPending } = useWriteContract();
  const { isLoading: isCancelConfirming, isSuccess: isCancelSuccess } = useWaitForTransactionReceipt({ hash: cancelHash });

  useEffect(() => {
    if (isCancelSuccess && cancelHash && !cancelProcessedRef.current) {
      cancelProcessedRef.current = true;
      setTxToast({ hash: cancelHash, message: 'Listing cancelled.' });
      setCancelingId(null);
      loadLands();
    }
  }, [isCancelSuccess, cancelHash]);

  // ── Succession voting ─────────────────────────────────────────────────────
  const [successionLandId, setSuccessionLandId] = useState('');
  const [successionPlan, setSuccessionPlan] = useState<{
    deceasedHolder: string;
    heirs: string[];
    heirShares: number[];
    approvalCount: bigint;
    isExecuted: boolean;
    courtOrderCid: string;
    votingDeadline: bigint;
  } | null>(null);
  const [isCheckingPlan, setIsCheckingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const [hasApproved, setHasApproved] = useState(false);

  const approveProcessedRef = useRef(false);
  const disputeProcessedRef = useRef(false);

  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract();
  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: writeDispute, data: disputeHash, isPending: isDisputePending } = useWriteContract();
  const { isSuccess: isDisputeSuccess } = useWaitForTransactionReceipt({ hash: disputeHash });

  useEffect(() => {
    if (isApproveSuccess && approveHash && !approveProcessedRef.current) {
      approveProcessedRef.current = true;
      setTxToast({ hash: approveHash, message: 'Succession plan approved!' });
      setHasApproved(true);
      handleCheckSuccessionPlan();
      loadLands();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproveSuccess, approveHash]);

  useEffect(() => {
    if (isDisputeSuccess && disputeHash && !disputeProcessedRef.current) {
      disputeProcessedRef.current = true;
      setTxToast({ hash: disputeHash, message: 'Succession plan disputed.' });
      handleCheckSuccessionPlan();
      loadLands();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDisputeSuccess, disputeHash]);

  const handleCheckSuccessionPlan = async () => {
    if (!successionLandId.trim() || !publicClient) return;
    setIsCheckingPlan(true);
    setPlanError('');
    setSuccessionPlan(null);
    setHasApproved(false);
    try {
      const raw = await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'getInheritanceRequest',
        args: [successionLandId.trim()],
      });
      // Viem may return a tuple (array) or a named object depending on ABI shape.
      // Normalise to a plain named object either way.
      const r = raw as unknown as Record<string, unknown>;
      const result = {
        deceasedHolder: (r.deceasedHolder ?? (raw as unknown[])[0] ?? '') as string,
        heirs:          (r.heirs          ?? (raw as unknown[])[1] ?? []) as string[],
        heirShares:     (r.heirShares     ?? (raw as unknown[])[2] ?? []) as number[],
        approvalCount:  (r.approvalCount  ?? (raw as unknown[])[3] ?? BigInt(0)) as bigint,
        isExecuted:     (r.isExecuted     ?? (raw as unknown[])[4] ?? false) as boolean,
        courtOrderCid:  (r.courtOrderCid  ?? (raw as unknown[])[6] ?? '') as string,
        votingDeadline: (r.votingDeadline ?? (raw as unknown[])[9] ?? BigInt(0)) as bigint,
      };
      const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
      if (!result.deceasedHolder || result.deceasedHolder === ZERO_ADDR) {
        setPlanError('No succession plan found for this land ID.');
      } else {
        setSuccessionPlan(result);
        // Check if the connected wallet already voted on this plan
        if (address) {
          try {
            const voted = await publicClient.readContract({
              address: CONTRACT_V9_ADDRESS,
              abi: CONTRACT_V9_ABI,
              functionName: 'hasHeirApproved',
              args: [successionLandId.trim(), address],
            }) as boolean;
            setHasApproved(voted);
          } catch {
            setHasApproved(false);
          }
        }
      }
    } catch {
      setPlanError('No succession plan found or land does not exist.');
    }
    setIsCheckingPlan(false);
  };

  // ── Subdivision voting ────────────────────────────────────────────────────
  const [subdivLandId, setSubdivLandId] = useState('');
  const [subdivPlan, setSubdivPlan] = useState<{
    newLandIds: string[];
    newIpfsHashes: string[];
    courtOrderCid: string;
    approvalCount: bigint;
    isExecuted: boolean;
  } | null>(null);
  const [isCheckingSubdiv, setIsCheckingSubdiv] = useState(false);
  const [subdivError, setSubdivError] = useState('');

  const subdivApproveProcessedRef = useRef(false);
  const subdivDisputeProcessedRef = useRef(false);

  const { writeContract: writeSubdivApprove, data: subdivApproveHash, isPending: isSubdivApprovePending } = useWriteContract();
  const { isSuccess: isSubdivApproveSuccess } = useWaitForTransactionReceipt({ hash: subdivApproveHash });

  const { writeContract: writeSubdivDispute, data: subdivDisputeHash, isPending: isSubdivDisputePending } = useWriteContract();
  const { isSuccess: isSubdivDisputeSuccess } = useWaitForTransactionReceipt({ hash: subdivDisputeHash });

  useEffect(() => {
    if (isSubdivApproveSuccess && subdivApproveHash && !subdivApproveProcessedRef.current) {
      subdivApproveProcessedRef.current = true;
      setTxToast({ hash: subdivApproveHash, message: 'Subdivision approved!' });
    }
  }, [isSubdivApproveSuccess, subdivApproveHash]);

  useEffect(() => {
    if (isSubdivDisputeSuccess && subdivDisputeHash && !subdivDisputeProcessedRef.current) {
      subdivDisputeProcessedRef.current = true;
      setTxToast({ hash: subdivDisputeHash, message: 'Subdivision disputed.' });
    }
  }, [isSubdivDisputeSuccess, subdivDisputeHash]);

  const handleCheckSubdivision = async () => {
    if (!subdivLandId.trim() || !publicClient) return;
    setIsCheckingSubdiv(true);
    setSubdivError('');
    setSubdivPlan(null);
    try {
      const result = await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'getSubdivisionPlan',
        args: [subdivLandId.trim()],
      }) as unknown as {
        newLandIds: string[];
        newIpfsHashes: string[];
        courtOrderCid: string;
        approvalCount: bigint;
        isExecuted: boolean;
      };
      setSubdivPlan(result);
    } catch {
      setSubdivError('No subdivision plan found or land does not exist.');
    }
    setIsCheckingSubdiv(false);
  };

  // ── Occupancy ─────────────────────────────────────────────────────────────
  const [occLandId, setOccLandId] = useState('');
  const [occupancyAgreements, setOccupancyAgreements] = useState<OccupancyAgreement[]>([]);
  const [isLoadingOcc, setIsLoadingOcc] = useState(false);
  const [occError, setOccError] = useState('');

  const loadOccupancy = async (landId: string) => {
    if (!publicClient || !landId) return;
    setIsLoadingOcc(true);
    setOccError('');
    try {
      const agreements = (await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'getActiveOccupancyAgreements',
        args: [landId],
      })) as OccupancyAgreement[];
      setOccupancyAgreements(agreements);
    } catch {
      setOccError('Failed to load occupancy agreements.');
    }
    setIsLoadingOcc(false);
  };

  // ── Load lands (chain-first) ──────────────────────────────────────────────
  const loadLands = async () => {
    if (!address || !publicClient || !profile?.cnic) return;
    setIsLoadingLands(true);
    try {
      // Step 1: chain first — get all lands this wallet holds shares in
      const onChainLandIds = (await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'getLandsByOwner',
        args: [address],
      })) as string[];

      const onChainSet = new Set(onChainLandIds);

      // Step 2: Supabase only for unminted allotments (not yet on-chain)
      const { data: govtRecords } = await supabase
        .from('govt_land_records')
        .select('*')
        .eq('owner_cnic', profile.cnic);

      const allGovtRecords: GovtRecord[] = govtRecords ?? [];
      const unmintedRecords = allGovtRecords.filter((r) => !onChainSet.has(r.land_id));

      // Step 3: resolve on-chain lands
      const onChainSummaries = await Promise.all(
        onChainLandIds.map(async (landId): Promise<LandSummary> => {
          const [onChainRecord, shareBps] = await Promise.all([
            publicClient.readContract({
              address: CONTRACT_V9_ADDRESS,
              abi: CONTRACT_V9_ABI,
              functionName: 'getLandRecord',
              args: [landId],
            }) as Promise<{ landId: string; ipfsHash: string; landType: number; status: number }>,
            publicClient.readContract({
              address: CONTRACT_V9_ADDRESS,
              abi: CONTRACT_V9_ABI,
              functionName: 'getShareBps',
              args: [landId, address],
            }) as Promise<number>,
          ]);

          let activeListing: { price: bigint; deadline: bigint } | null = null;
          if (onChainRecord.status === LandStatusV9.ACTIVE) {
            try {
              const listing = (await publicClient.readContract({
                address: CONTRACT_V9_ADDRESS,
                abi: CONTRACT_V9_ABI,
                functionName: 'getListing',
                args: [landId, address],
              })) as { isActive: boolean; price: bigint; deadline: bigint };
              if (listing.isActive) activeListing = { price: listing.price, deadline: listing.deadline };
            } catch { /* no listing */ }
          }

          const gr = allGovtRecords.find((r) => r.land_id === landId);
          return {
            landId,
            ipfsHash: onChainRecord.ipfsHash,
            landType: onChainRecord.landType,
            status: onChainRecord.status,
            shareBps: Number(shareBps),
            location: gr?.location,
            areaSqYards: gr?.area_sq_yards,
            isOnChain: true,
            govtIpfsHash: gr?.ipfs_hash ?? null,
            activeListing,
          };
        })
      );

      // Step 4: unminted allotments from Supabase
      const unmintedSummaries: LandSummary[] = unmintedRecords.map((gr) => ({
        landId: gr.land_id,
        ipfsHash: gr.ipfs_hash ?? '',
        landType: 0,
        status: -1,
        shareBps: 0,
        location: gr.location,
        areaSqYards: gr.area_sq_yards,
        isOnChain: false,
        govtIpfsHash: gr.ipfs_hash,
      }));

      setLands([...onChainSummaries, ...unmintedSummaries]);
    } catch (e) {
      console.error('loadLands error:', e);
      setNotice({ tone: 'error', message: 'Failed to load your lands. Check your connection.' });
    }
    setIsLoadingLands(false);
  };

  useEffect(() => {
    if (mounted && profile?.isRegistered && profile?.cnic) loadLands();
  }, [mounted, profile?.isRegistered, profile?.cnic, address]);

  // ─── Tab button helper ────────────────────────────────────────────────────
  const tabBtn = (t: Tab, label: string, Icon: React.ElementType) => (
    <button
      onClick={() => setTab(t)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
        tab === t
          ? 'bg-indigo-600 text-white'
          : 'bg-white/[0.04] text-white/50 hover:text-white hover:bg-white/[0.08]'
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      {txToast && (
        <TxToast txHash={txToast.hash} message={txToast.message} onDismiss={() => setTxToast(null)} />
      )}

      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold">User Portal</h1>
          {profile?.isRegistered && (
            <p className="text-white/40 text-sm mt-1 font-mono">
              {profile.name} · CNIC {profile.cnic}
            </p>
          )}
        </div>

        {/* ── Not connected ────────────────────────────────────────────────── */}
        {!address && (
          <div className="glass-card p-8 rounded-2xl text-center text-white/40">
            Connect your wallet to access the User Portal.
          </div>
        )}

        {/* ── Connected but not registered ─────────────────────────────────── */}
        {address && !isProfileLoading && !profile?.isRegistered && (
          <div className="glass-card p-8 rounded-2xl text-center space-y-4">
            <p className="text-white/60 text-sm">Register your wallet to get started.</p>
            <RegisterInlineForm onSuccess={() => refetchProfile()} />
          </div>
        )}

        {/* ── Registered user content ───────────────────────────────────────── */}
        {address && profile?.isRegistered && (
          <>
            {notice && (
              <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
                notice.tone === 'error'   ? 'bg-red-500/10 border-red-500/20 text-red-300'
                : notice.tone === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-300'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
              }`}>
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{notice.message}</span>
                <button onClick={() => setNotice(null)} className="ml-auto text-white/40 hover:text-white">×</button>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex flex-wrap gap-2">
              {tabBtn('lands', 'My Lands', Home)}
              {tabBtn('succession', 'Succession Voting', Gavel)}
              {tabBtn('subdivision', 'Subdivision Voting', GitBranch)}
              {tabBtn('occupancy', 'Occupancy', Users)}
              {tabBtn('withdraw', 'Withdraw', Wallet)}
            </div>

            {/* ── Tab: My Lands ─────────────────────────────────────────────── */}
            {tab === 'lands' && (
              <section className="space-y-4">
                {isLoadingLands ? (
                  <div className="flex items-center gap-2 text-white/40">
                    <Loader2 size={18} className="animate-spin" /> Loading your lands…
                  </div>
                ) : lands.length === 0 ? (
                  <div className="surface p-8 rounded-2xl text-center text-white/40">
                    No land records found for your CNIC in the govt registry.
                  </div>
                ) : (
                  lands.map((land) => (
                    <div key={land.landId} className="surface p-5 rounded-2xl space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm text-indigo-400">{land.landId}</p>
                          <p className="text-xs text-white/40 mt-0.5">
                            {land.isOnChain ? landTypeLabel(land.landType as LandTypeV9) : (land.location ?? 'Not on-chain yet')}
                          </p>
                          {land.areaSqYards && (
                            <p className="text-xs text-white/30">{land.areaSqYards} sq yards</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          {land.isOnChain ? (
                            <>
                              <span className={`pill border text-xs ${STATUS_TONE[land.status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                {landStatusLabel(land.status as LandStatusV9)}
                              </span>
                              {land.shareBps > 0 && (
                                <span className="pill border text-xs bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                                  {formatBps(land.shareBps)} ({land.shareBps} bps)
                                </span>
                              )}
                              {land.activeListing && (
                                <span className="pill border text-xs bg-purple-500/10 text-purple-400 border-purple-500/20">
                                  Listed · {formatEther(land.activeListing.price)} ETH
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="pill border text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                              Not On-Chain
                            </span>
                          )}
                        </div>
                      </div>

                      {land.isOnChain && land.ipfsHash && (
                        <a href={`${IPFS_GATEWAY}/${land.ipfsHash}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-white/40 hover:text-indigo-400">
                          <ExternalLink size={11} /> IPFS metadata
                        </a>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {/* Not on-chain: Verify & Mint */}
                        {!land.isOnChain && (
                          <button
                            disabled={verifyingLandId === land.landId}
                            onClick={() => handleVerifyAndMint(land.landId)}
                            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                          >
                            {verifyingLandId === land.landId
                              ? <><Loader2 size={12} className="animate-spin" /> Minting…</>
                              : <><CheckCircle size={12} /> Verify & Mint</>}
                          </button>
                        )}

                        {/* PENDING_VERIFICATION: confirm ownership */}
                        {land.isOnChain && land.status === LandStatusV9.PENDING_VERIFICATION && (
                          <button
                            disabled={isConfirmPending || isConfirmConfirming}
                            onClick={() => {
                              confirmProcessedRef.current = false;
                              setConfirmingLandId(land.landId);
                              writeConfirm({
                                address: CONTRACT_V9_ADDRESS,
                                abi: CONTRACT_V9_ABI,
                                functionName: 'verifyLandImport',
                                args: [land.landId],
                              });
                            }}
                            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                          >
                            {confirmingLandId === land.landId && (isConfirmPending || isConfirmConfirming)
                              ? <><Loader2 size={12} className="animate-spin" /> Confirming…</>
                              : <><CheckCircle size={12} /> Confirm Ownership</>}
                          </button>
                        )}

                        {/* ACTIVE: list / cancel / transfer / occupancy */}
                        {land.isOnChain && land.status === LandStatusV9.ACTIVE && (
                          <>
                            {land.activeListing ? (
                              <button
                                disabled={cancelingId === land.landId && (isCancelPending || isCancelConfirming)}
                                onClick={() => {
                                  cancelProcessedRef.current = false;
                                  setCancelingId(land.landId);
                                  writeCancel({
                                    address: CONTRACT_V9_ADDRESS,
                                    abi: CONTRACT_V9_ABI,
                                    functionName: 'cancelListing',
                                    args: [land.landId],
                                  });
                                }}
                                className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1 text-red-400 hover:text-red-300"
                              >
                                {cancelingId === land.landId && (isCancelPending || isCancelConfirming)
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : <Tag size={12} />}
                                Cancel Listing
                              </button>
                            ) : (
                              <button
                                onClick={() => { setSelectedLand(land); setListingModalOpen(true); }}
                                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                              >
                                <Tag size={12} /> List for Sale
                              </button>
                            )}
                            <button
                              onClick={() => { setSelectedLand(land); setTransferModalOpen(true); }}
                              className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1"
                            >
                              <ArrowRightLeft size={12} /> Transfer Share
                            </button>
                            <button
                              onClick={() => { setOccLandId(land.landId); setTab('occupancy'); loadOccupancy(land.landId); }}
                              className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1"
                            >
                              <Users size={12} /> Occupancy
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}

            {/* ── Tab: Succession Voting ────────────────────────────────────── */}
            {tab === 'succession' && (
              <section className="space-y-5">
                <div className="glass-card p-5 rounded-2xl space-y-4">
                  <h2 className="font-semibold text-white">Check Succession Plan</h2>
                  <p className="text-xs text-white/40">
                    Enter the <span className="text-white/60">deceased owner&apos;s land ID</span> to view and vote on the succession plan.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={successionLandId}
                      onChange={(e) => setSuccessionLandId(e.target.value)}
                      className="field flex-1"
                      placeholder="Land ID (e.g. DHA-P9-042)"
                    />
                    <button
                      onClick={handleCheckSuccessionPlan}
                      disabled={isCheckingPlan || !successionLandId}
                      className="btn-primary px-4"
                    >
                      {isCheckingPlan ? <Loader2 size={16} className="animate-spin" /> : 'Check'}
                    </button>
                  </div>

                  {planError && (
                    <p className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">{planError}</p>
                  )}

                  {successionPlan && (
                    <div className="space-y-3 pt-2">
                      <div className="surface p-4 rounded-xl space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-white/40">Status</span>
                          <span className={successionPlan.isExecuted ? 'text-green-400' : 'text-yellow-400'}>
                            {successionPlan.isExecuted ? 'Executed' : 'Pending Votes'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/40">Approvals</span>
                          <span className="font-mono">{String(successionPlan.approvalCount)} / {successionPlan.heirs?.length ?? 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/40">Heirs</span>
                          <span className="font-mono">{successionPlan.heirs?.length ?? 0}</span>
                        </div>
                        {successionPlan.votingDeadline > BigInt(0) && (
                          <div className="flex justify-between">
                            <span className="text-white/40">Deadline</span>
                            <span className="text-xs">{new Date(Number(successionPlan.votingDeadline) * 1000).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      {!successionPlan.isExecuted && (
                        hasApproved ? (
                          <div className="text-center py-3 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl">
                            You have already voted on this plan
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <button
                              onClick={() => {
                                approveProcessedRef.current = false;
                                writeApprove({
                                  address: CONTRACT_V9_ADDRESS,
                                  abi: CONTRACT_V9_ABI,
                                  functionName: 'approveSuccessionPlan',
                                  args: [successionLandId.trim()],
                                });
                              }}
                              disabled={isApprovePending}
                              className="btn-primary flex-1 flex items-center justify-center gap-2"
                            >
                              {isApprovePending && <Loader2 size={14} className="animate-spin" />}
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                disputeProcessedRef.current = false;
                                writeDispute({
                                  address: CONTRACT_V9_ADDRESS,
                                  abi: CONTRACT_V9_ABI,
                                  functionName: 'disputeSuccessionPlan',
                                  args: [successionLandId.trim()],
                                });
                              }}
                              disabled={isDisputePending}
                              className="btn-ghost flex-1 flex items-center justify-center gap-2 text-red-400 hover:text-red-300"
                            >
                              {isDisputePending && <Loader2 size={14} className="animate-spin" />}
                              Dispute
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Tab: Subdivision Voting ───────────────────────────────────── */}
            {tab === 'subdivision' && (
              <section className="space-y-5">
                <div className="glass-card p-5 rounded-2xl space-y-4">
                  <h2 className="font-semibold text-white">Check Subdivision Plan</h2>
                  <p className="text-xs text-white/40">
                    Enter a land ID to view and vote on a pending subdivision.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={subdivLandId}
                      onChange={(e) => setSubdivLandId(e.target.value)}
                      className="field flex-1"
                      placeholder="Land ID (e.g. DHA-P9-042)"
                    />
                    <button
                      onClick={handleCheckSubdivision}
                      disabled={isCheckingSubdiv || !subdivLandId}
                      className="btn-primary px-4"
                    >
                      {isCheckingSubdiv ? <Loader2 size={16} className="animate-spin" /> : 'Check'}
                    </button>
                  </div>

                  {subdivError && (
                    <p className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">{subdivError}</p>
                  )}

                  {subdivPlan && (
                    <div className="space-y-3 pt-2">
                      <div className="surface p-4 rounded-xl space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-white/40">Status</span>
                          <span className={subdivPlan.isExecuted ? 'text-green-400' : 'text-yellow-400'}>
                            {subdivPlan.isExecuted ? 'Executed' : 'Pending Votes'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/40">Approvals</span>
                          <span className="font-mono">{String(subdivPlan.approvalCount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/40">New plots</span>
                          <span className="font-mono">{subdivPlan.newLandIds.length}</span>
                        </div>
                        {subdivPlan.newLandIds.length > 0 && (
                          <div className="pt-1 space-y-1">
                            {subdivPlan.newLandIds.map((id) => (
                              <p key={id} className="font-mono text-xs text-indigo-400">{id}</p>
                            ))}
                          </div>
                        )}
                      </div>

                      {!subdivPlan.isExecuted && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              subdivApproveProcessedRef.current = false;
                              writeSubdivApprove({
                                address: CONTRACT_V9_ADDRESS,
                                abi: CONTRACT_V9_ABI,
                                functionName: 'approveSubdivision',
                                args: [subdivLandId.trim()],
                              });
                            }}
                            disabled={isSubdivApprovePending}
                            className="btn-primary flex-1 flex items-center justify-center gap-2"
                          >
                            {isSubdivApprovePending && <Loader2 size={14} className="animate-spin" />}
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              subdivDisputeProcessedRef.current = false;
                              writeSubdivDispute({
                                address: CONTRACT_V9_ADDRESS,
                                abi: CONTRACT_V9_ABI,
                                functionName: 'disputeSubdivision',
                                args: [subdivLandId.trim()],
                              });
                            }}
                            disabled={isSubdivDisputePending}
                            className="btn-ghost flex-1 flex items-center justify-center gap-2 text-red-400 hover:text-red-300"
                          >
                            {isSubdivDisputePending && <Loader2 size={14} className="animate-spin" />}
                            Dispute
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Tab: Occupancy ────────────────────────────────────────────── */}
            {tab === 'occupancy' && (
              <section className="space-y-5">
                <div className="glass-card p-5 rounded-2xl space-y-4">
                  <h2 className="font-semibold text-white">Occupancy Agreements</h2>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={occLandId}
                      onChange={(e) => setOccLandId(e.target.value)}
                      className="field flex-1"
                      placeholder="Land ID"
                    />
                    <button
                      onClick={() => loadOccupancy(occLandId)}
                      disabled={isLoadingOcc || !occLandId}
                      className="btn-primary px-4"
                    >
                      {isLoadingOcc ? <Loader2 size={16} className="animate-spin" /> : 'Load'}
                    </button>
                  </div>

                  {occError && (
                    <p className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">{occError}</p>
                  )}

                  {occupancyAgreements.length > 0 ? (
                    <div className="space-y-3">
                      {occupancyAgreements.map((a, i) => (
                        <div key={i} className="surface p-4 rounded-xl text-sm space-y-2">
                          <div className="flex justify-between">
                            <span className="text-white/40">Category</span>
                            <span>{occupancyCategoryLabel(a.category as never)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/40">Occupant</span>
                            <span className="font-mono text-xs">{a.occupant.slice(0, 8)}…{a.occupant.slice(-6)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/40">Expires</span>
                            <span className="text-xs">{new Date(Number(a.endTime) * 1000).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : occLandId && !isLoadingOcc && !occError ? (
                    <p className="text-white/40 text-sm text-center py-4">No active occupancy agreements.</p>
                  ) : null}
                </div>
              </section>
            )}

            {/* ── Tab: Withdraw ─────────────────────────────────────────────── */}
            {tab === 'withdraw' && (
              <section>
                <div className="glass-card p-6 rounded-2xl space-y-4 max-w-md">
                  <h2 className="font-semibold text-white">Pending Sale Proceeds</h2>
                  <p className="text-3xl font-bold text-indigo-400">
                    {pendingProceeds !== undefined
                      ? `${formatEther(pendingProceeds)} ETH`
                      : '—'}
                  </p>
                  <p className="text-xs text-white/40">
                    ETH from marketplace sales is held in the contract until you withdraw.
                  </p>
                  <button
                    disabled={!pendingProceeds || pendingProceeds === BigInt(0) || isWithdrawPending || isWithdrawConfirming}
                    onClick={() => {
                      withdrawProcessedRef.current = false;
                      writeWithdraw({
                        address: CONTRACT_V9_ADDRESS,
                        abi: CONTRACT_V9_ABI,
                        functionName: 'withdrawProceeds',
                        args: [],
                      });
                    }}
                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {(isWithdrawPending || isWithdrawConfirming) && <Loader2 size={14} className="animate-spin" />}
                    {isWithdrawPending ? 'Confirm in wallet…' : isWithdrawConfirming ? 'Withdrawing…' : 'Withdraw ETH'}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {selectedLand && (
        <CreateListingModal
          isOpen={isListingModalOpen}
          onClose={() => setListingModalOpen(false)}
          land={{
            land_id: selectedLand.landId,
            location: selectedLand.location,
            area_sq_yards: selectedLand.areaSqYards,
            currentShareBps: selectedLand.shareBps,
          }}
          sellerAddress={address as string}
          onSuccess={(txHash) => {
            setTxToast({ hash: txHash, message: `${selectedLand.landId} listed on marketplace!` });
            setListingModalOpen(false);
            loadLands();
          }}
        />
      )}
      {selectedLand && (
        <TransferModal
          isOpen={isTransferModalOpen}
          onClose={() => setTransferModalOpen(false)}
          landId={selectedLand.landId}
          currentShareBps={selectedLand.shareBps}
          onSuccess={(txHash) => {
            setTxToast({ hash: txHash, message: 'Share transferred on-chain!' });
            setTransferModalOpen(false);
            loadLands();
          }}
        />
      )}
    </main>
  );
}
