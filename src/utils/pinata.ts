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

function assertKeys() {
  if (!API_KEY || !API_SECRET) {
    throw new Error(
      'Pinata API keys missing. Set NEXT_PUBLIC_PINATA_API_KEY and NEXT_PUBLIC_PINATA_API_SECRET (or NEXT_PUBLIC_PINATA_SECRET_KEY) in .env.local, then restart the dev server.'
    );
  }
}

function describeStatus(status: number, bodyText: string): string {
  if (status === 401 || status === 403) {
    return `Pinata rejected the API key (HTTP ${status}). The key is invalid, revoked, or lacks pinning permission. Generate a new key at app.pinata.cloud → API Keys.`;
  }
  if (status === 413) {
    return `File is too large for Pinata (HTTP 413). The free tier caps individual uploads at ~10 MB.`;
  }
  if (status === 429) {
    return `Pinata rate limit hit (HTTP 429). Wait a minute and retry.`;
  }
  if (status >= 500) {
    return `Pinata server error (HTTP ${status}). Try again in a moment.`;
  }
  return `Pinata returned HTTP ${status}: ${bodyText.slice(0, 200)}`;
}

export const uploadFileToIPFS = async (file: File, name?: string): Promise<string | null> => {
  assertKeys();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('pinataMetadata', JSON.stringify({ name: name ?? `LandFile_${Date.now()}` }));
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  let res: Response;
  try {
    res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
  } catch (e) {
    throw new Error(`Network error reaching Pinata: ${(e as Error).message}`);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(describeStatus(res.status, bodyText));
  }

  let data: { IpfsHash?: string };
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`Pinata returned non-JSON response: ${bodyText.slice(0, 200)}`);
  }
  if (!data.IpfsHash) {
    throw new Error(`Pinata response missing IpfsHash: ${bodyText.slice(0, 200)}`);
  }
  return data.IpfsHash;
};

export const uploadJSONToIPFS = async (content: object, name?: string): Promise<string | null> => {
  assertKeys();

  let res: Response;
  try {
    res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        pinataContent: content,
        pinataMetadata: { name: name ?? `Metadata_${Date.now()}` },
        pinataOptions: { cidVersion: 1 },
      }),
    });
  } catch (e) {
    throw new Error(`Network error reaching Pinata: ${(e as Error).message}`);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(describeStatus(res.status, bodyText));
  }

  let data: { IpfsHash?: string };
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`Pinata returned non-JSON response: ${bodyText.slice(0, 200)}`);
  }
  if (!data.IpfsHash) {
    throw new Error(`Pinata response missing IpfsHash: ${bodyText.slice(0, 200)}`);
  }
  return data.IpfsHash;
};

// Backward-compat alias used by existing imports
export const uploadToIPFS = uploadFileToIPFS;
