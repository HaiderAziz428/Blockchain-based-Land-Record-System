'use client';
import { useState } from 'react';
import { uploadToIPFS } from '@/src/utils/pinata'; // Reuse your utility
import { marketDb } from '@/src/lib/marketplace';

interface CreateListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  land: { land_id: string; location: string };
  onSuccess: () => void;
  sellerAddress: string;
}

export default function CreateListingModal({ isOpen, onClose, land, onSuccess, sellerAddress }: CreateListingModalProps) {
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [landType, setLandType] = useState('Real Estate');
  const [desc, setDesc] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsapp || !minPrice || !maxPrice || !files) return alert("Please fill all fields");

    setLoading(true);

    try {
      // 1. Upload Photos to IPFS
      const photoHashes: string[] = [];
      // Upload first 3 photos max to save time/bandwidth
      const limit = Math.min(files.length, 3);
      
      for (let i = 0; i < limit; i++) {
        const hash = await uploadToIPFS(files[i]);
        if (hash) photoHashes.push(hash);
      }

      // 2. Save to Marketplace DB
      const { error } = await marketDb.from('listings').insert({
        land_id: land.land_id,
        seller_wallet: sellerAddress,
        land_type: landType,
        description: desc,
        price_min: parseFloat(minPrice),
        price_max: parseFloat(maxPrice),
        location: land.location,
        whatsapp: whatsapp,
        photos: photoHashes,
        status: 'listed' 
      });

      if (error) throw error;

      alert("Property Listed on Marketplace!");
      onSuccess();
      onClose();

    } catch (err: any) {
      console.error(err);
      alert("Error creating listing: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-[#1e293b] p-6 rounded-2xl w-full max-w-2xl border border-white/10 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-white mb-4">List Property for Sale</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="grid grid-cols-2 gap-4">
            <div>
               <label className="text-gray-400 text-xs">Property Type</label>
               <select 
                 value={landType} 
                 onChange={(e) => setLandType(e.target.value)}
                 className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-white"
               >
                 <option>Real Estate (House/Plot)</option>
                 <option>Agricultural Land</option>
               </select>
            </div>
            <div>
               <label className="text-gray-400 text-xs">WhatsApp Number</label>
               <input type="text" placeholder="+92 300..." value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                 className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
               <label className="text-gray-400 text-xs">Min Price (ETH)</label>
               <input type="number" step="0.001" value={minPrice} onChange={e => setMinPrice(e.target.value)}
                 className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-white" />
            </div>
            <div>
               <label className="text-gray-400 text-xs">Max Price (ETH)</label>
               <input type="number" step="0.001" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
                 className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-white" />
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs">Description</label>
            <textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 p-3 rounded text-white" 
              placeholder="e.g. Corner plot, near park, fertile soil..." />
          </div>

          <div>
             <label className="text-gray-400 text-xs">Upload Photos (Max 3)</label>
             <input type="file" multiple accept="image/*" onChange={e => setFiles(e.target.files)}
                className="w-full mt-1 text-sm text-gray-400 file:bg-blue-600 file:border-0 file:rounded file:px-4 file:py-2 file:text-white" />
          </div>

          <div className="flex gap-4 mt-6">
            <button type="button" onClick={onClose} className="flex-1 py-3 text-gray-400">Cancel</button>
            <button type="submit" disabled={loading} className="flex-[2] bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-white">
               {loading ? 'Uploading & Listing...' : 'Create Listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}