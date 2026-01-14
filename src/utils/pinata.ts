// src/utils/pinata.ts
import axios from 'axios';

const JWT = process.env.NEXT_PUBLIC_PINATA_JWT; // Optional if using JWT
const API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
const API_SECRET = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;

export const uploadToIPFS = async (file: File): Promise<string | null> => {
  if (!API_KEY || !API_SECRET) {
    console.error("Pinata Keys are missing in .env.local");
    return null;
  }

  const formData = new FormData();
  formData.append('file', file);

  const metadata = JSON.stringify({
    name: `LandDoc_${Date.now()}`,
  });
  formData.append('pinataMetadata', metadata);

  const options = JSON.stringify({
    cidVersion: 0,
  });
  formData.append('pinataOptions', options);

  try {
    const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
      headers: {
        'Content-Type': `multipart/form-data`,
        'pinata_api_key': API_KEY,
        'pinata_secret_api_key': API_SECRET,
      },
    });
    return res.data.IpfsHash; // Returns the Hash (e.g., Qm...)
  } catch (error) {
    console.error("Error uploading to Pinata:", error);
    return null;
  }
};