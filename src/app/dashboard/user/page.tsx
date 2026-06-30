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
  FileText,
  Gavel,
  GitBranch,
  Home,
  Loader2,
  Tag,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { uploadFileToIPFS } from '@/src/utils/pinata';
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

interface CoVerification {
  totalCount: number;
  verifiedCount: number;
  myVerified: boolean;
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
  coVerification?: CoVerification;
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

interface ActivePlan {
  landId: string;
  courtOrderCid: string;
  myShareBps: number;
  heirs: string[];
  heirShares: number[];
  approvalCount: bigint;
  hasMyApproval: boolean;
  isExecuted: boolean;
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isSuccess) onSuccess(); }, [isSuccess]); // onSuccess is a stable parent callback

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWithdrawSuccess, withdrawHash]); // refetchProceeds is stable (Wagmi hook return)

  // ── Verify & Mint ─────────────────────────────────────────────────────────
  const [verifyingLandId, setVerifyingLandId] = useState<string | null>(null);

  const handleVerifyAndMint = async (landId: string) => {
    if (!address || !publicClient) return;
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

      // Multi-owner: not all co-owners have verified yet
      if (data.pending) {
        setNotice({
          tone: 'info',
          message: `Your verification is recorded (${data.verifiedCount}/${data.totalCount} owners). The land will be proposed on-chain once all co-owners verify.`,
        });
        return;
      }

      setTxToast({ hash: data.txHash, message: 'Minting on-chain… waiting for confirmation.' });

      // Wait for the receipt before reloading — a fixed setTimeout was unreliable on Sepolia.
      await publicClient.waitForTransactionReceipt({ hash: data.txHash as `0x${string}` });

      setTxToast({ hash: data.txHash, message: 'Land proposed on-chain! Confirm ownership to activate.' });
      await loadLands();
    } catch (e) {
      setNotice({ tone: 'error', message: `Mint failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
    } finally {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmSuccess, confirmHash]); // loadLands is a stable local function

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCancelSuccess, cancelHash]); // loadLands is a stable local function

  // ── My active succession plans (where I am listed as a heir) ─────────────
  const [mySuccessionPlans, setMySuccessionPlans] = useState<ActivePlan[]>([]);
  const [isLoadingMyPlans, setIsLoadingMyPlans] = useState(false);

  const loadMySuccessionPlans = async () => {
    if (!address || !publicClient) return;
    setIsLoadingMyPlans(true);
    try {
      const { data } = await supabase
        .from('inheritance_requests')
        .select('land_id, court_order_cid, heirs_json')
        .eq('status', 'initiated');

      const plans: ActivePlan[] = [];
      for (const row of data ?? []) {
        let heirEntries: { address: string; shareBps: number }[] = [];
        try { heirEntries = JSON.parse(row.heirs_json ?? '[]'); } catch { continue; }
        const mine = heirEntries.find(
          (h) => h.address.toLowerCase() === address.toLowerCase()
        );
        if (!mine) continue;

        try {
          const raw = await publicClient.readContract({
            address: CONTRACT_V9_ADDRESS,
            abi: CONTRACT_V9_ABI,
            functionName: 'getInheritanceRequest',
            args: [row.land_id],
          });
          const r = raw as unknown as Record<string, unknown>;
          const t = raw as unknown as unknown[];
          const isExec = (r.isExecuted ?? t[4] ?? false) as boolean;
          if (isExec) continue; // already done

          const voted = await publicClient.readContract({
            address: CONTRACT_V9_ADDRESS,
            abi: CONTRACT_V9_ABI,
            functionName: 'hasHeirApproved',
            args: [row.land_id, address],
          }) as boolean;

          plans.push({
            landId: row.land_id,
            courtOrderCid: row.court_order_cid,
            myShareBps: mine.shareBps,
            heirs: (r.heirs ?? t[1] ?? []) as string[],
            heirShares: (r.heirShares ?? t[2] ?? []) as number[],
            approvalCount: (r.approvalCount ?? t[3] ?? BigInt(0)) as bigint,
            hasMyApproval: voted,
            isExecuted: isExec,
          });
        } catch { /* skip if land not yet on-chain */ }
      }
      setMySuccessionPlans(plans);
    } finally {
      setIsLoadingMyPlans(false);
    }
  };

  // Load plans whenever address becomes available
  useEffect(() => {
    if (address && publicClient) loadMySuccessionPlans();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // ── Request Inheritance ───────────────────────────────────────────────────
  const [reqLandId, setReqLandId] = useState('');
  const [reqCourtFile, setReqCourtFile] = useState<File | null>(null);
  const [isRequestingInh, setIsRequestingInh] = useState(false);
  const [reqInhResult, setReqInhResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleInheritanceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqLandId || !reqCourtFile || !address) return;
    setIsRequestingInh(true);
    setReqInhResult(null);
    try {
      const cid = await uploadFileToIPFS(reqCourtFile, `court-order-${reqLandId}`);
      if (!cid) throw new Error('IPFS upload failed — check Pinata keys');
      const res = await fetch('/api/inheritance-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landId: reqLandId, requesterAddress: address, courtOrderCid: cid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReqInhResult({ ok: true, msg: 'Request submitted. Admin will review your court order and initiate the inheritance procedure.' });
      setReqLandId('');
      setReqCourtFile(null);
    } catch (err) {
      setReqInhResult({ ok: false, msg: (err as Error).message });
    }
    setIsRequestingInh(false);
  };

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
      loadMySuccessionPlans();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproveSuccess, approveHash]);

  useEffect(() => {
    if (isDisputeSuccess && disputeHash && !disputeProcessedRef.current) {
      disputeProcessedRef.current = true;
      setTxToast({ hash: disputeHash, message: 'Succession plan disputed.' });
      handleCheckSuccessionPlan();
      loadLands();
      loadMySuccessionPlans();
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
      const t = raw as unknown as unknown[];
      const result = {
        deceasedHolder: (r.deceasedHolder ?? t[0] ?? '') as string,
        heirs:          (r.heirs          ?? t[1] ?? []) as string[],
        heirShares:     (r.heirShares     ?? t[2] ?? []) as number[],
        approvalCount:  (r.approvalCount  ?? t[3] ?? BigInt(0)) as bigint,
        isExecuted:     (r.isExecuted     ?? t[4] ?? false) as boolean,
        courtOrderCid:  (r.courtOrderCid  ?? t[6] ?? '') as string,
        votingDeadline: (r.votingDeadline ?? t[9] ?? BigInt(0)) as bigint,
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
  const [hasSubdivApproved, setHasSubdivApproved] = useState(false);

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
      setHasSubdivApproved(true);
      handleCheckSubdivision();
      loadLands();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubdivApproveSuccess, subdivApproveHash]);

  useEffect(() => {
    if (isSubdivDisputeSuccess && subdivDisputeHash && !subdivDisputeProcessedRef.current) {
      subdivDisputeProcessedRef.current = true;
      setTxToast({ hash: subdivDisputeHash, message: 'Subdivision disputed.' });
      handleCheckSubdivision();
      loadLands();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubdivDisputeSuccess, subdivDisputeHash]);

  const handleCheckSubdivision = async () => {
    if (!subdivLandId.trim() || !publicClient) return;
    setIsCheckingSubdiv(true);
    setSubdivError('');
    setSubdivPlan(null);
    setHasSubdivApproved(false);
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
      if (address) {
        try {
          const voted = await publicClient.readContract({
            address: CONTRACT_V9_ADDRESS,
            abi: CONTRACT_V9_ABI,
            functionName: 'hasShareholderApprovedSubdivision',
            args: [subdivLandId.trim(), address],
          }) as boolean;
          setHasSubdivApproved(voted);
        } catch { /* non-critical */ }
      }
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
      const now = BigInt(Math.floor(Date.now() / 1000));
      setOccupancyAgreements(agreements.filter((a) => a.endTime > now));
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

      // Step 2: Find which land_ids this CNIC is listed as a co-owner of
      //         (land_co_owners is the source of truth for co-ownership)
      const { data: coOwnerRows } = await supabase
        .from('land_co_owners')
        .select('land_id, verified_at')
        .eq('owner_cnic', profile.cnic);

      const myCoOwnerEntries: { land_id: string; verified_at: string | null }[] = coOwnerRows ?? [];
      const myLandIds = myCoOwnerEntries.map((r) => r.land_id);

      // Step 3: Fetch govt_land_records for those land_ids (metadata: location, area, type, ipfs_hash)
      const { data: govtRecords } = myLandIds.length > 0
        ? await supabase
            .from('govt_land_records')
            .select('*')
            .in('land_id', myLandIds)
        : { data: [] };

      const allGovtRecords: GovtRecord[] = govtRecords ?? [];
      const unmintedLandIds = myLandIds.filter((id) => !onChainSet.has(id));

      // Step 4: resolve on-chain lands
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

      // Step 5: For unminted lands, fetch co-verification counts from land_co_owners
      //         in one batch query, then build a map: land_id → { totalCount, verifiedCount }
      let coVerifMap: Record<string, { totalCount: number; verifiedCount: number }> = {};
      if (unmintedLandIds.length > 0) {
        const { data: coRows } = await supabase
          .from('land_co_owners')
          .select('land_id, verified_at')
          .in('land_id', unmintedLandIds);

        if (coRows) {
          for (const row of coRows) {
            const entry = coVerifMap[row.land_id] ?? { totalCount: 0, verifiedCount: 0 };
            entry.totalCount += 1;
            if (row.verified_at) entry.verifiedCount += 1;
            coVerifMap[row.land_id] = entry;
          }
        }
      }

      // Step 6: Build unminted summaries. Some unminted lands may already be
      // *proposed* on-chain (PENDING_VERIFICATION): proposeLandImport creates the
      // LandRecord but shares aren't assigned until verifyLandImport finalises it,
      // so they don't appear in getLandsByOwner yet. Surface them with
      // "Confirm Ownership" instead of re-offering "Verify & Mint".
      const unmintedSummaries: LandSummary[] = await Promise.all(
        unmintedLandIds.map(async (landId): Promise<LandSummary> => {
          const gr = allGovtRecords.find((r) => r.land_id === landId);
          const myEntry = myCoOwnerEntries.find((r) => r.land_id === landId);
          const cv = coVerifMap[landId] ?? { totalCount: 1, verifiedCount: 0 };
          const coVerification: CoVerification = {
            totalCount: cv.totalCount,
            verifiedCount: cv.verifiedCount,
            myVerified: myEntry?.verified_at !== null && myEntry?.verified_at !== undefined,
          };

          try {
            const rec = (await publicClient.readContract({
              address: CONTRACT_V9_ADDRESS,
              abi: CONTRACT_V9_ABI,
              functionName: 'getLandRecord',
              args: [landId],
            })) as { landId: string; ipfsHash: string; landType: number; status: number };

            if (rec.landId && rec.landId !== '') {
              // Proposed on-chain but not yet finalised for this wallet.
              return {
                landId,
                ipfsHash: rec.ipfsHash,
                landType: rec.landType,
                status: rec.status,
                shareBps: 0,
                location: gr?.location,
                areaSqYards: gr?.area_sq_yards,
                isOnChain: true,
                govtIpfsHash: gr?.ipfs_hash ?? null,
                coVerification,
              };
            }
          } catch { /* not on-chain yet — fall through to unminted */ }

          return {
            landId,
            ipfsHash: gr?.ipfs_hash ?? '',
            landType: 0,
            status: -1,
            shareBps: 0,
            location: gr?.location,
            areaSqYards: gr?.area_sq_yards,
            isOnChain: false,
            govtIpfsHash: gr?.ipfs_hash ?? null,
            coVerification,
          };
        })
      );

      setLands([...onChainSummaries, ...unmintedSummaries]);
    } catch (e) {
      console.error('loadLands error:', e);
      setNotice({ tone: 'error', message: 'Failed to load your lands. Check your connection.' });
    }
    setIsLoadingLands(false);
  };

  useEffect(() => {
    if (mounted && profile?.isRegistered && profile?.cnic) loadLands();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, profile?.isRegistered, profile?.cnic, address]); // loadLands is a stable local function

  // ─── Tab button helper ────────────────────────────────────────────────────
  const tabBtn = (t: Tab, label: string, Icon: React.ElementType, badge?: number) => (
    <button
      onClick={() => setTab(t)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
        tab === t
          ? 'bg-accent text-white'
          : 'bg-surface text-muted hover:text-foreground hover:bg-surface-elevated'
      }`}
    >
      <Icon size={14} /> {label}
      {!!badge && badge > 0 && (
        <span className="ml-0.5 bg-orange-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
          {badge}
        </span>
      )}
    </button>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      {txToast && (
        <TxToast txHash={txToast.hash} message={txToast.message} onDismiss={() => setTxToast(null)} />
      )}

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-2">
          <span className="text-xs font-mono text-muted tracking-[0.2em] uppercase">Landowner Portal</span>
          <h1 className="font-sans font-semibold text-3xl text-foreground tracking-tight mt-2">User Dashboard</h1>
          {profile?.isRegistered && (
            <p className="text-muted text-sm mt-1 font-mono">
              {profile.name} · CNIC {profile.cnic}
            </p>
          )}
        </div>

        {/* ── Not connected ────────────────────────────────────────────────── */}
        {!address && (
          <div className="glass-card p-8 rounded-2xl text-center text-muted">
            Connect your wallet to access the User Portal.
          </div>
        )}

        {/* ── Connected but not registered ─────────────────────────────────── */}
        {address && !isProfileLoading && !profile?.isRegistered && (
          <div className="glass-card p-8 rounded-2xl text-center space-y-4">
            <p className="text-muted text-sm">Register your wallet to get started.</p>
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
                <button onClick={() => setNotice(null)} className="ml-auto text-muted hover:text-foreground">×</button>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex flex-wrap gap-2">
              {tabBtn('lands', 'My Lands', Home)}
              {tabBtn('succession', 'Succession Voting', Gavel, mySuccessionPlans.filter(p => !p.hasMyApproval).length)}
              {tabBtn('subdivision', 'Subdivision Voting', GitBranch)}
              {tabBtn('occupancy', 'Occupancy', Users)}
              {tabBtn('withdraw', 'Withdraw', Wallet)}
            </div>

            {/* ── Tab: My Lands ─────────────────────────────────────────────── */}
            {tab === 'lands' && (
              <section className="space-y-4">
                {isLoadingLands ? (
                  <div className="flex items-center gap-2 text-muted">
                    <Loader2 size={18} className="animate-spin" /> Loading your lands…
                  </div>
                ) : lands.length === 0 ? (
                  <div className="surface p-8 rounded-2xl text-center text-muted">
                    No land records found for your CNIC in the govt registry.
                  </div>
                ) : (
                  lands.map((land) => (
                    <div key={land.landId} className="surface p-5 rounded-2xl space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm text-accent">{land.landId}</p>
                          <p className="text-xs text-muted mt-0.5">
                            {land.isOnChain ? landTypeLabel(land.landType as LandTypeV9) : (land.location ?? 'Not on-chain yet')}
                          </p>
                          {land.areaSqYards && (
                            <p className="text-xs text-muted/60">{land.areaSqYards} sq yards</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          {land.isOnChain ? (
                            <>
                              <span className={`pill border text-xs ${STATUS_TONE[land.status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                {landStatusLabel(land.status as LandStatusV9)}
                              </span>
                              {land.shareBps > 0 && (
                                <span className="pill border text-xs bg-accent/10 text-accent border-accent/20">
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
                          className="flex items-center gap-1 text-xs text-muted hover:text-accent">
                          <ExternalLink size={11} /> IPFS metadata
                        </a>
                      )}

                      {/* Co-verification progress (multi-owner, not yet on-chain) */}
                      {!land.isOnChain && land.coVerification && land.coVerification.totalCount > 1 && (
                        <div className="mt-2 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/15 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-indigo-300 font-medium">
                              <Users size={12} /> Co-owner Verification
                            </span>
                            <span className="text-muted font-mono">
                              {land.coVerification.verifiedCount} / {land.coVerification.totalCount} verified
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all"
                              style={{ width: `${(land.coVerification.verifiedCount / land.coVerification.totalCount) * 100}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-muted leading-relaxed">
                            {land.coVerification.myVerified
                              ? `You have verified. Waiting for ${land.coVerification.totalCount - land.coVerification.verifiedCount} other co-owner(s) to verify before this land is proposed on-chain.`
                              : `This land has ${land.coVerification.totalCount} co-owners. All must verify before it can be minted.`}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {/* Not on-chain: Verify & Mint */}
                        {!land.isOnChain && (
                          <button
                            disabled={verifyingLandId === land.landId || land.coVerification?.myVerified === true}
                            onClick={() => handleVerifyAndMint(land.landId)}
                            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {verifyingLandId === land.landId
                              ? <><Loader2 size={12} className="animate-spin" /> Verifying…</>
                              : land.coVerification?.myVerified
                                ? <><CheckCircle size={12} /> Verified</>
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

                {/* ── Pending succession plans where I am a heir ─────────── */}
                {isLoadingMyPlans ? (
                  <div className="flex items-center gap-2 text-muted text-sm">
                    <Loader2 size={16} className="animate-spin" /> Checking for pending succession plans…
                  </div>
                ) : mySuccessionPlans.length > 0 && (
                  <div className="space-y-4">
                    {mySuccessionPlans.map((plan) => (
                      <div key={plan.landId} className="glass-card rounded-2xl overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                          <div>
                            <p className="text-xs text-muted uppercase tracking-wide font-medium">Pending Succession Plan</p>
                            <p className="font-semibold font-mono mt-0.5">{plan.landId}</p>
                          </div>
                          <span className={`pill border ${plan.hasMyApproval ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                            {plan.hasMyApproval ? 'You voted' : 'Awaiting your vote'}
                          </span>
                        </div>

                        {/* Court order */}
                        <div className="px-5 py-4 border-b border-white/5">
                          <p className="text-xs text-muted mb-2">Court Order</p>
                          <div className="flex items-center gap-3">
                            {/* Try to show image thumbnail; falls back to file icon for PDFs */}
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                              <img
                                src={`${IPFS_GATEWAY}/${plan.courtOrderCid}`}
                                alt="Court order"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute('style');
                                }}
                              />
                              <FileText size={28} className="text-muted" style={{ display: 'none' }} />
                            </div>
                            <a
                              href={`${IPFS_GATEWAY}/${plan.courtOrderCid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-ghost text-xs px-3 py-2 flex items-center gap-1.5"
                            >
                              <ExternalLink size={12} /> View full document
                            </a>
                          </div>
                        </div>

                        {/* Share breakdown */}
                        <div className="px-5 py-4 border-b border-white/5">
                          <p className="text-xs text-muted mb-3">Share Division as per Court Order</p>
                          <div className="space-y-1.5">
                            {plan.heirs.map((heir, i) => {
                              const bps = plan.heirShares[i] ?? 0;
                              const isMe = heir.toLowerCase() === address?.toLowerCase();
                              return (
                                <div key={heir} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isMe ? 'bg-indigo-500/10 border border-indigo-500/20' : 'bg-white/3'}`}>
                                  <span className="font-mono text-xs text-muted truncate max-w-[180px]">
                                    {heir.slice(0, 6)}…{heir.slice(-4)}
                                    {isMe && <span className="ml-2 text-indigo-400 font-medium not-italic">← You</span>}
                                  </span>
                                  <span className="text-sm font-semibold shrink-0">
                                    {(bps / 100).toFixed(2)}%
                                    <span className="ml-1 text-xs text-muted font-normal">({bps} bps)</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Footer: vote progress + buttons */}
                        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="text-xs text-muted">
                            Votes: <span className="text-foreground font-medium">{String(plan.approvalCount)}/{plan.heirs.length}</span>
                            <span className="mx-2">·</span>
                            Your share: <span className="text-foreground font-medium">{(plan.myShareBps / 100).toFixed(2)}%</span>
                          </div>
                          {!plan.hasMyApproval && !plan.isExecuted && (
                            <div className="flex gap-2 sm:ml-auto">
                              <button
                                onClick={() => {
                                  approveProcessedRef.current = false;
                                  writeApprove({
                                    address: CONTRACT_V9_ADDRESS,
                                    abi: CONTRACT_V9_ABI,
                                    functionName: 'approveSuccessionPlan',
                                    args: [plan.landId],
                                  });
                                }}
                                disabled={isApprovePending}
                                className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
                              >
                                {isApprovePending && <Loader2 size={13} className="animate-spin" />}
                                <CheckCircle size={13} /> I Agree
                              </button>
                              <button
                                onClick={() => {
                                  disputeProcessedRef.current = false;
                                  writeDispute({
                                    address: CONTRACT_V9_ADDRESS,
                                    abi: CONTRACT_V9_ABI,
                                    functionName: 'disputeSuccessionPlan',
                                    args: [plan.landId],
                                  });
                                }}
                                disabled={isDisputePending}
                                className="btn-ghost text-sm px-4 py-2 flex items-center gap-2 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40"
                              >
                                {isDisputePending && <Loader2 size={13} className="animate-spin" />}
                                <X size={13} /> Dispute
                              </button>
                            </div>
                          )}
                          {plan.hasMyApproval && (
                            <span className="sm:ml-auto text-xs text-green-400 flex items-center gap-1">
                              <CheckCircle size={12} /> Your vote recorded
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Request Inheritance ──────────────────────────────────── */}
                <div className="glass-card p-5 rounded-2xl space-y-4">
                  <div>
                    <h2 className="font-semibold text-foreground">Request Inheritance</h2>
                    <p className="text-xs text-muted mt-1">
                      Select the land you are inheriting, upload the court order, and submit. Admin will review and initiate the on-chain inheritance procedure.
                    </p>
                  </div>
                  <form onSubmit={handleInheritanceRequest} className="space-y-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">Select your land</label>
                      <select
                        value={reqLandId}
                        onChange={(e) => setReqLandId(e.target.value)}
                        className="field w-full"
                        required
                      >
                        <option value="">— choose a land —</option>
                        {lands
                          .filter((l) => l.isOnChain && l.status === LandStatusV9.ACTIVE)
                          .map((l) => (
                            <option key={l.landId} value={l.landId}>
                              {l.landId}{l.location ? ` · ${l.location}` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">
                        Court order <span className="text-muted-foreground normal-case font-normal">— PDF, JPG or PNG</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer field w-full py-2.5 px-3 hover:border-white/20 transition-colors">
                        <Upload size={14} className="text-muted shrink-0" />
                        <span className="text-sm text-muted truncate">
                          {reqCourtFile ? reqCourtFile.name : 'Click to choose file…'}
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => setReqCourtFile(e.target.files?.[0] ?? null)}
                          required
                        />
                      </label>
                    </div>

                    {reqInhResult && (
                      <div className={`text-xs p-3 rounded-lg border ${reqInhResult.ok ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        {reqInhResult.msg}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isRequestingInh || !reqLandId || !reqCourtFile}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {isRequestingInh && <Loader2 size={14} className="animate-spin" />}
                      {isRequestingInh ? 'Uploading & submitting…' : 'Submit Request'}
                    </button>
                  </form>
                </div>

                {/* ── Vote on Succession Plan ──────────────────────────────── */}
                <div className="glass-card p-5 rounded-2xl space-y-4">
                  <h2 className="font-semibold text-foreground">Vote on Succession Plan</h2>
                  <p className="text-xs text-muted">
                    Enter the <span className="text-muted">deceased owner&apos;s land ID</span> to view and vote on the succession plan.
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
                          <span className="text-muted">Status</span>
                          <span className={successionPlan.isExecuted ? 'text-green-400' : 'text-yellow-400'}>
                            {successionPlan.isExecuted ? 'Executed' : 'Pending Votes'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Approvals</span>
                          <span className="font-mono">{String(successionPlan.approvalCount)} / {successionPlan.heirs?.length ?? 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Heirs</span>
                          <span className="font-mono">{successionPlan.heirs?.length ?? 0}</span>
                        </div>
                        {successionPlan.votingDeadline > BigInt(0) && (
                          <div className="flex justify-between">
                            <span className="text-muted">Deadline</span>
                            <span className="text-xs">{new Date(Number(successionPlan.votingDeadline) * 1000).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      {!successionPlan.isExecuted && (
                        (() => {
                          const now = BigInt(Math.floor(Date.now() / 1000));
                          const deadlinePassed = successionPlan.votingDeadline > BigInt(0) && now > successionPlan.votingDeadline;
                          if (deadlinePassed) return (
                            <div className="text-center py-3 text-sm text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                              Voting period has ended — contact admin to resolve
                            </div>
                          );
                          return hasApproved ? (
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
                        );
                        })()
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
                  <h2 className="font-semibold text-foreground">Check Subdivision Plan</h2>
                  <p className="text-xs text-muted">
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
                          <span className="text-muted">Status</span>
                          <span className={subdivPlan.isExecuted ? 'text-green-400' : 'text-yellow-400'}>
                            {subdivPlan.isExecuted ? 'Executed' : 'Pending Votes'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Approvals</span>
                          <span className="font-mono">{String(subdivPlan.approvalCount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">New plots</span>
                          <span className="font-mono">{subdivPlan.newLandIds.length}</span>
                        </div>
                        {subdivPlan.newLandIds.length > 0 && (
                          <div className="pt-1 space-y-1">
                            {subdivPlan.newLandIds.map((id) => (
                              <p key={id} className="font-mono text-xs text-accent">{id}</p>
                            ))}
                          </div>
                        )}
                      </div>

                      {!subdivPlan.isExecuted && (
                        hasSubdivApproved ? (
                          <div className="text-center py-3 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl">
                            You have already voted on this plan
                          </div>
                        ) : (
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
                        )
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
                  <h2 className="font-semibold text-foreground">Occupancy Agreements</h2>
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
                            <span className="text-muted">Category</span>
                            <span>{occupancyCategoryLabel(a.category as never)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted">Occupant</span>
                            <span className="font-mono text-xs">{a.occupant.slice(0, 8)}…{a.occupant.slice(-6)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted">Expires</span>
                            <span className="text-xs">{new Date(Number(a.endTime) * 1000).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : occLandId && !isLoadingOcc && !occError ? (
                    <p className="text-muted text-sm text-center py-4">No active occupancy agreements.</p>
                  ) : null}
                </div>
              </section>
            )}

            {/* ── Tab: Withdraw ─────────────────────────────────────────────── */}
            {tab === 'withdraw' && (
              <section>
                <div className="glass-card p-6 rounded-2xl space-y-4 max-w-md">
                  <h2 className="font-semibold text-foreground">Pending Sale Proceeds</h2>
                  <p className="text-3xl font-bold text-accent">
                    {pendingProceeds !== undefined
                      ? `${formatEther(pendingProceeds)} ETH`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted">
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
