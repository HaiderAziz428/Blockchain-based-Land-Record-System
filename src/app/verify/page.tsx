'use client';

import { useState } from 'react';
import { useReadContract, usePublicClient } from 'wagmi'; // Import usePublicClient
import { parseAbiItem } from 'viem'; // Import viem helper
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import Header from '@/src/components/Header';

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface HistoryEvent {
  type: 'MINT' | 'TRANSFER';
  from: string;
  to: string;
  txHash: string;
  blockNumber: bigint;
  date?: string; // We will try to fetch timestamp
}

export default function VerifyPage() {
  const [searchId, setSearchId] = useState('');
  const [queryId, setQueryId] = useState('');
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Wagmi Client to fetch logs
  const publicClient = usePublicClient();

  // 1. READ CURRENT STATE
  const { data: landRecord, isLoading, isError } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLandRecord',
    args: queryId ? [queryId] : undefined,
    query: { enabled: !!queryId, retry: false }
  });

  // 2. FETCH HISTORY LOGS
  const fetchHistory = async (landId: string) => {
    if (!publicClient) return;
    setLoadingHistory(true);
    setHistory([]);

    try {
      // A. Fetch 'LandTransferred' Events
      const transferLogs = await publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: parseAbiItem('event LandTransferred(string landId, address indexed from, address indexed to, uint256 price)'),
        fromBlock: 'earliest'
      });

      // B. Fetch 'LandMinted' Events
      const mintLogs = await publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: parseAbiItem('event LandMinted(address indexed owner, string landId, uint8 lType, uint256 tokenId)'),
        fromBlock: 'earliest'
      });

      const events: HistoryEvent[] = [];

      // Filter & Format Mints
      for (const log of mintLogs) {
        // @ts-ignore
        if (log.args.landId === landId) {
          events.push({
            type: 'MINT',
            from: 'GOVT', // Minted by Govt
            // @ts-ignore
            to: log.args.owner,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber
          });
        }
      }

      // Filter & Format Transfers
      for (const log of transferLogs) {
        // @ts-ignore
        if (log.args.landId === landId) {
          events.push({
            type: 'TRANSFER',
            // @ts-ignore
            from: log.args.from,
            // @ts-ignore
            to: log.args.to,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber
          });
        }
      }

      // Sort by Block Number (Newest First)
      events.sort((a, b) => Number(b.blockNumber - a.blockNumber));

      setHistory(events);
    } catch (e) {
      console.error("Error fetching history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchId) return;
    setQueryId(searchId);
    fetchHistory(searchId); // Trigger History Fetch
  };

  const getStatusString = (statusIdx: number) => {
    const statuses = ['Active ✅', 'Pending Inheritance ⚠️', 'Locked / Disputed ⛔'];
    return statuses[statusIdx] || 'Unknown';
  };

  // @ts-ignore
  const isValidRecord = landRecord && landRecord.currentOwner !== ZERO_ADDRESS;

  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <Header />
      
      <main className="pt-32 px-6 max-w-5xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
          Public Land Verification
        </h1>
        <p className="text-gray-400 mb-8">
          Verify property ownership and view the complete Chain of Title.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-2 max-w-lg mx-auto mb-12">
          <input 
            type="text" 
            placeholder="Enter Plot Number (e.g. Plot-101)" 
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="flex-1 bg-[#1e293b] border border-gray-700 rounded-lg p-4 text-white focus:outline-none focus:border-blue-500"
          />
          <button 
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-lg font-bold transition-all"
          >
            Verify
          </button>
        </form>

        {/* --- RESULT SECTION --- */}
        
        {(!isLoading && queryId && (isError || !isValidRecord)) && (
            <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-xl">
                <h3 className="text-xl font-bold text-red-400">Record Not Found</h3>
            </div>
        )}

        {isValidRecord && (
          <div className="grid md:grid-cols-3 gap-8 text-left">
            
            {/* LEFT: CURRENT STATE (The Card) */}
            <div className="md:col-span-1 bg-[#1e293b] border border-blue-500/30 p-6 rounded-2xl h-fit">
              <div className="flex justify-between items-start border-b border-white/10 pb-4 mb-4">
                <h2 className="text-xl font-bold">Current Title</h2>
                <span className="text-green-400 text-xs border border-green-500/50 px-2 py-1 rounded">Verified</span>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500">Current Owner</label>
                  {/* @ts-ignore */}
                  <p className="text-sm font-mono text-blue-300 break-all">{landRecord.currentOwner}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">CNIC</label>
                  {/* @ts-ignore */}
                  <p className="text-lg font-mono">{landRecord.cnic}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Status</label>
                  {/* @ts-ignore */}
                  <p className="font-bold">{getStatusString(landRecord.status)}</p>
                </div>
                <div>
                    <a 
                      // @ts-ignore
                      href={`https://gateway.pinata.cloud/ipfs/${landRecord.ipfsHash}`}
                      target="_blank"
                      className="block w-full text-center bg-white/5 hover:bg-white/10 py-2 rounded border border-white/10 text-sm mt-4"
                    >
                      📄 View Original Deed
                    </a>
                </div>
              </div>
            </div>

            {/* RIGHT: HISTORY TIMELINE (The Blockchain Magic) */}
            <div className="md:col-span-2 bg-[#1e293b] border border-white/10 p-6 rounded-2xl">
              <h2 className="text-xl font-bold mb-6">Chain of Title (Ownership History)</h2>
              
              {loadingHistory ? (
                <div className="text-gray-400 animate-pulse">Tracing Blockchain Events...</div>
              ) : history.length === 0 ? (
                <div className="text-gray-500">No history found (This implies a fresh mint).</div>
              ) : (
                <div className="space-y-0 relative border-l-2 border-gray-700 ml-3">
                  {history.map((event, i) => (
                    <div key={event.txHash + i} className="mb-8 ml-6 relative">
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[31px] top-0 w-4 h-4 rounded-full border-2 border-[#1e293b] ${event.type === 'MINT' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                      
                      <div className="bg-white/5 p-4 rounded-lg border border-white/5 hover:border-white/20 transition-all">
                        <div className="flex justify-between items-start mb-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${event.type === 'MINT' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                {event.type === 'MINT' ? '🏛️ GOVT ISSUANCE' : '🔁 OWNERSHIP TRANSFER'}
                            </span>
                            <a href={`https://sepolia.etherscan.io/tx/${event.txHash}`} target="_blank" className="text-xs text-gray-500 hover:text-blue-400 underline">
                                {event.txHash.slice(0, 10)}...
                            </a>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="block text-gray-500 text-xs">From</span>
                                <span className="font-mono text-gray-300">{event.from.slice(0, 8)}...</span>
                            </div>
                            <div>
                                <span className="block text-gray-500 text-xs">To</span>
                                <span className="font-mono text-white">{event.to.slice(0, 8)}...</span>
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