'use client';
import { useState } from 'react';
import { X, UploadCloud, Loader2 } from 'lucide-react';
import { marketDb } from '@/src/lib/marketplace';

export default function CreateListingModal({ isOpen, onClose, land, onSuccess, sellerAddress }: any) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');

    const [landType, setLandType] = useState('Real Estate (House/Plot)');
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
            setStatus('Uploading Photos to IPFS...');
            const photoHashes: string[] = [];
            const limit = Math.min(files.length, 3);

            // Upload directly to IPFS using Pinata API
            for (let i = 0; i < limit; i++) {
                const formData = new FormData();
                formData.append('file', files[i]);

                const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
                    method: 'POST',
                    headers: {
                        'pinata_api_key': process.env.NEXT_PUBLIC_PINATA_API_KEY || '', // Ensure these are in env if uploading from client, or use an API route
                        'pinata_secret_api_key': process.env.NEXT_PUBLIC_PINATA_API_SECRET || ''
                    },
                    body: formData
                });
                const data = await res.json();
                if (data.IpfsHash) photoHashes.push(data.IpfsHash);
            }

            setStatus('Saving to Marketplace Database...');
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
            alert("Property Listed on Marketplace successfully!");
            onSuccess();
            onClose();
        } catch (err: any) {
            alert("Error: " + err.message);
        } finally {
            setLoading(false);
            setStatus('');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b1e]/80 backdrop-blur-md p-4">
            <div className="glass-card p-6 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative animate-[fadeUp_0.3s_ease]">
                <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white"><X size={20} /></button>
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    <UploadCloud className="text-brand-primary" /> List Property for Sale
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-white/60">Property Type</label>
                            <select value={landType} onChange={(e) => setLandType(e.target.value)} className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none">
                                <option>Real Estate (House/Plot)</option>
                                <option>Agricultural Land</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-white/60">WhatsApp Number</label>
                            <input type="text" placeholder="+92 300..." value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none" required />
                        </div>
                        <div>
                            <label className="text-xs text-white/60">Min Price (ETH)</label>
                            <input type="number" step="0.001" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none" required />
                        </div>
                        <div>
                            <label className="text-xs text-white/60">Max Price (ETH)</label>
                            <input type="number" step="0.001" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none" required />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-white/60">Description & Details</label>
                        <textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none" placeholder="e.g. Corner plot, near park..." required />
                    </div>
                    <div>
                        <label className="text-xs text-white/60">Upload Photos (Max 3, Stored on IPFS)</label>
                        <input type="file" multiple accept="image/*" onChange={e => setFiles(e.target.files)} className="w-full mt-1 text-sm text-white/60 file:bg-brand-primary file:border-0 file:rounded-xl file:px-4 file:py-2 file:text-white" required />
                    </div>

                    {(loading) && (
                        <div className="text-brand-secondary text-sm flex items-center gap-2 mt-2">
                            <Loader2 className="animate-spin" size={16} /> {status}
                        </div>
                    )}

                    <button type="submit" disabled={loading} className="w-full bg-brand-primary hover:bg-indigo-500 py-3.5 rounded-xl font-bold text-white transition-all disabled:opacity-50 mt-4">
                        {loading ? 'Processing...' : 'Create Listing'}
                    </button>
                </form>
            </div>
        </div>
    );
}