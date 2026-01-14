'use client';
import { useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import { uploadToIPFS } from '@/src/utils/pinata';

interface DigitizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  landId: string; // We need to know WHICH land we are updating
  onSuccess: () => void;
}

export default function DigitizationModal({ isOpen, onClose, landId, onSuccess }: DigitizationModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string>('');

  const handleUpload = async () => {
    if (!file || !landId) return;
    
    setUploading(true);
    setStatus('Uploading Document to IPFS...');

    // 1. Upload to Pinata
    const ipfsHash = await uploadToIPFS(file);

    if (!ipfsHash) {
      alert("IPFS Upload Failed. Check your Internet or API Keys.");
      setUploading(false);
      return;
    }

    setStatus('Updating Government Records...');

    // 2. Update Supabase
    // We set status to 'pending' so the Admin sees it.
    const { error } = await supabase
      .from('land_records')
      .update({ 
        ipfs_hash: ipfsHash,
        status: 'pending_verification' // This triggers the Admin Dashboard
      })
      .eq('id', landId);

    if (error) {
      console.error("DB Error:", error);
      alert("Database update failed.");
    } else {
      setStatus('Success!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    }
    setUploading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1e293b] p-8 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2">Request Digitization</h2>
        <p className="text-gray-400 mb-6 text-sm">
          Upload your physical Sale Deed or Proof of Ownership. This will be permanently stored on IPFS.
        </p>

        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
            <input 
              type="file" 
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
            {file && <p className="mt-2 text-sm text-blue-400">Selected: {file.name}</p>}
          </div>

          {status && (
            <div className="text-center text-sm font-medium text-green-400 animate-pulse">
              {status}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
                onClick={onClose}
                className="flex-1 py-3 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
                disabled={uploading}
            >
                Cancel
            </button>
            <button 
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
            >
                {uploading ? 'Processing...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}