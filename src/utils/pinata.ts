// src/utils/pinata.ts

const API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
const API_SECRET =
  process.env.NEXT_PUBLIC_PINATA_API_SECRET ?? process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;

function authHeaders(): Record<string, string> {
  return {
    pinata_api_key: API_KEY!,
    pinata_secret_api_key: API_SECRET!,
  };
}

function checkKeys(): boolean {
  if (!API_KEY || !API_SECRET) {
    console.error(
      'Pinata API keys missing in .env.local (NEXT_PUBLIC_PINATA_API_KEY and NEXT_PUBLIC_PINATA_API_SECRET or NEXT_PUBLIC_PINATA_SECRET_KEY)'
    );
    return false;
  }
  return true;
}

export const uploadFileToIPFS = async (file: File, name?: string): Promise<string | null> => {
  if (!checkKeys()) return null;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('pinataMetadata', JSON.stringify({ name: name ?? `LandFile_${Date.now()}` }));
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  try {
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    const data = await res.json();
    return (data.IpfsHash as string) ?? null;
  } catch (e) {
    console.error('Pinata file upload failed:', e);
    return null;
  }
};

export const uploadJSONToIPFS = async (content: object, name?: string): Promise<string | null> => {
  if (!checkKeys()) return null;
  try {
    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        pinataContent: content,
        pinataMetadata: { name: name ?? `Metadata_${Date.now()}` },
        pinataOptions: { cidVersion: 1 },
      }),
    });
    const data = await res.json();
    return (data.IpfsHash as string) ?? null;
  } catch (e) {
    console.error('Pinata JSON upload failed:', e);
    return null;
  }
};

// Backward-compat alias used by existing imports
export const uploadToIPFS = uploadFileToIPFS;
