'use client';

import { useState, useEffect } from 'react';
import { useReadContract, usePublicClient } from 'wagmi';
import { parseAbiItem } from 'viem';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import Navbar from '@/src/components/Navbar';
import { Search, Loader2, CheckCircle2, AlertCircle, ExternalLink, FileText, ShieldCheck, ShieldAlert, Clock } from 'lucide-react';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Public Sepolia RPCs cap eth_getLogs at 10k blocks. Stay safely under that.
const MAX_LOG_RANGE = BigInt(9500);
// Sepolia averages ~12s per block — used to translate verifiedAt → block range.
const SEPOLIA_BLOCK_TIME_SECS = BigInt(12);
// Padding to absorb block-time drift around the mint timestamp.
const BLOCK_PADDING = BigInt(1000);

interface HistoryEvent {
  type: 'MINT' | 'TRANSFER';
  from: string;
  to: string;
  txHash: string;
  blockNumber: bigint;
}

const STATUS_META: Record<number, { label: string; tone: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  0: { label: 'Active', tone: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle2 },
  1: { label: 'Pending Inheritance', tone: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock },
  2: { label: 'Locked / Disputed', tone: 'bg-red-500/10 text-red-400 border-red-500/20', icon: ShieldAlert },
};

export default function VerifyPage() {
  const [searchId, setSearchId] = useState('');
  const [queryId, setQueryId] = useState('');
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const publicClient = usePublicClient();

  const { data: landRecord, isLoading, isError } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLandRecord',
    args: queryId ? [queryId] : undefined,
    query: { enabled: !!queryId, retry: false },
  });

  /**
   * Fetch on-chain history for a land starting at its mint block.
   *
   * Public Sepolia RPCs (publicnode, thirdweb default) limit eth_getLogs to a
   * 10,000-block range, so we cannot use fromBlock: 'earliest'. Instead, we use
   * the LandRecord.verifiedAt timestamp (which is the mint block timestamp) to
   * estimate the mint block, then scan forward in chunked windows until we
   * reach the current head.
   */
  const fetchHistory = async (landId: string, verifiedAtSecs: bigint) => {
    if (!publicClient) return;
    setLoadingHistory(true);
    setHistory([]);
    setHistoryError(null);

    try {
      const latest = await publicClient.getBlockNumber();

      // Estimate the mint block from verifiedAt timestamp.
      const nowSecs = BigInt(Math.floor(Date.now() / 1000));
      const ageSecs = nowSecs > verifiedAtSecs ? nowSecs - verifiedAtSecs : BigInt(0);
      const blocksAgo = ageSecs / SEPOLIA_BLOCK_TIME_SECS;
      const estimatedMintBlock = latest > blocksAgo + BLOCK_PADDING
        ? latest - blocksAgo - BLOCK_PADDING
        : BigInt(0);

      const transferEvent = parseAbiItem(
        'event LandTransferred(string landId, address indexed from, address indexed to, uint256 price)'
      );
      const mintEvent = parseAbiItem(
        'event LandMinted(address indexed owner, string landId, uint8 lType, uint256 tokenId)'
      );

      const events: HistoryEvent[] = [];

      // Walk from the estimated mint block forward to head, in chunks safely
      // under the 10k-block public-RPC limit.
      let from = estimatedMintBlock;
      while (from <= latest) {
        const to = from + MAX_LOG_RANGE > latest ? latest : from + MAX_LOG_RANGE;

        const [transferLogs, mintLogs] = await Promise.all([
          publicClient.getLogs({
            address: CONTRACT_ADDRESS,
            event: transferEvent,
            fromBlock: from,
            toBlock: to,
          }),
          publicClient.getLogs({
            address: CONTRACT_ADDRESS,
            event: mintEvent,
            fromBlock: from,
            toBlock: to,
          }),
        ]);

        for (const log of mintLogs) {
          if ((log.args as Record<string, unknown>).landId === landId) {
            events.push({
              type: 'MINT',
              from: 'GOVT',
              // @ts-expect-error -- wagmi type inference
              to: log.args.owner,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
            });
          }
        }
        for (const log of transferLogs) {
          if ((log.args as Record<string, unknown>).landId === landId) {
            events.push({
              type: 'TRANSFER',
              // @ts-expect-error -- wagmi type inference
              from: log.args.from,
              // @ts-expect-error -- wagmi type inference
              to: log.args.to,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
            });
          }
        }

        if (to >= latest) break;
        from = to + BigInt(1);
      }

      events.sort((a, b) => Number(b.blockNumber - a.blockNumber));
      setHistory(events);
    } catch (e) {
      console.error('History fetch failed:', e);
      setHistoryError(
        'Could not load on-chain history. The RPC may be rate-limited or temporarily unavailable — try again in a moment.'
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  // Trigger the history fetch once the LandRecord is loaded — we need its
  // verifiedAt timestamp to bound the log scan to a manageable block range.
  useEffect(() => {
    if (!queryId || !landRecord) return;
    const record = landRecord as Record<string, unknown>;
    if (record.currentOwner === ZERO_ADDRESS) return; // no record → no history
    void fetchHistory(queryId, record.verifiedAt as bigint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryId, landRecord]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchId.trim()) return;
    setQueryId(searchId.trim());
  };

  const isValidRecord = landRecord && (landRecord as Record<string, unknown>).currentOwner !== ZERO_ADDRESS;
  const record = landRecord as Record<string, unknown> | undefined;

  const shorten = (addr: string) => addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;

  return (
    <div className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl px-6 py-12 md:px-10">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-gray-400 px-3 py-1 rounded-full text-[11px] font-medium mb-5">
            <ShieldCheck size={12} className="text-indigo-400" />
            Public On-Chain Verification
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Verify Land Ownership
          </h1>
          <p className="text-gray-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            Look up any registered parcel and view its complete chain of title — straight from the
            blockchain. No login required.
          </p>
        </div>

        {/* Search bar */}
        <form
          onSubmit={handleSearch}
          className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto mb-10"
        >
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Enter Land ID (e.g. LND-001)"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg pl-11 pr-4 py-3 text-white text-sm font-mono outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={!searchId.trim() || isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-6 py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Verify
          </button>
        </form>

        {/* States */}
        {!queryId && (
          <div className="max-w-xl mx-auto text-center text-xs text-gray-600">
            Tip: Land IDs follow the format your government registry uses — typically a string like
            <span className="font-mono text-gray-500"> LND-001</span>.
          </div>
        )}

        {!isLoading && queryId && (isError || !isValidRecord) && (
          <div className="max-w-xl mx-auto bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Record not found</p>
              <p className="text-xs text-red-400/80 mt-1">
                No land record exists on-chain for ID <span className="font-mono">{queryId}</span>.
                Check the spelling and try again.
              </p>
            </div>
          </div>
        )}

        {isValidRecord && record && (
          <div className="grid md:grid-cols-3 gap-6 text-left">

            {/* Current title card */}
            <div className="md:col-span-1 surface p-6 rounded-2xl h-fit">
              <div className="flex justify-between items-start border-b border-white/5 pb-4 mb-4">
                <h2 className="text-lg font-semibold tracking-tight">Current Title</h2>
                {(() => {
                  const meta = STATUS_META[Number(record.status)] ?? STATUS_META[0];
                  const Icon = meta.icon;
                  return (
                    <span className={`pill border ${meta.tone}`}>
                      <Icon size={11} /> {meta.label}
                    </span>
                  );
                })()}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide">Current Owner</label>
                  <p className="text-sm font-mono text-indigo-300 break-all mt-0.5">
                    {record.currentOwner as string}
                  </p>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide">CNIC</label>
                  <p className="text-sm font-mono text-gray-200 mt-0.5">
                    {record.cnic as string}
                  </p>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide">Land ID</label>
                  <p className="text-sm font-mono text-gray-200 mt-0.5">
                    {record.landId as string}
                  </p>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide">Verified On</label>
                  <p className="text-sm text-gray-300 mt-0.5">
                    {new Date(Number(record.verifiedAt) * 1000).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </p>
                </div>
                {record.ipfsHash ? (
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${record.ipfsHash as string}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-sm font-medium text-gray-200 transition-colors"
                  >
                    <FileText size={14} /> View Original Deed
                  </a>
                ) : null}
              </div>
            </div>

            {/* History timeline */}
            <div className="md:col-span-2 surface p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold tracking-tight">Chain of Title</h2>
                <span className="text-[11px] text-gray-500">
                  {history.length} event{history.length === 1 ? '' : 's'}
                </span>
              </div>

              {loadingHistory ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" /> Tracing blockchain events…
                </div>
              ) : historyError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-2.5">
                  <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-300">{historyError}</p>
                    <button
                      onClick={() => {
                        const r = landRecord as Record<string, unknown> | undefined;
                        if (r?.verifiedAt) void fetchHistory(queryId, r.verifiedAt as bigint);
                      }}
                      className="mt-2 text-xs text-red-300 hover:text-red-200 underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No on-chain events found for this land yet.
                </p>
              ) : (
                <div className="relative border-l-2 border-white/10 ml-3">
                  {history.map((event, i) => (
                    <div key={event.txHash + i} className="mb-7 ml-6 relative last:mb-0">
                      <div
                        className={`absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-[#0a0b1e] ${
                          event.type === 'MINT' ? 'bg-green-500' : 'bg-indigo-500'
                        }`}
                      />
                      <div className="bg-white/[0.03] hover:bg-white/[0.05] p-4 rounded-lg border border-white/[0.05] transition-colors">
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                          <span
                            className={`pill ${
                              event.type === 'MINT'
                                ? 'bg-green-500/15 text-green-300'
                                : 'bg-indigo-500/15 text-indigo-300'
                            }`}
                          >
                            {event.type === 'MINT' ? 'Government Issuance' : 'Ownership Transfer'}
                          </span>
                          <a
                            href={`https://sepolia.etherscan.io/tx/${event.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-gray-500 hover:text-indigo-300 flex items-center gap-1 font-mono"
                          >
                            <ExternalLink size={10} />
                            {event.txHash.slice(0, 10)}…
                          </a>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="block text-[11px] text-gray-500 uppercase tracking-wide">From</span>
                            <span className="font-mono text-gray-300">{shorten(event.from)}</span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-gray-500 uppercase tracking-wide">To</span>
                            <span className="font-mono text-white">{shorten(event.to)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
