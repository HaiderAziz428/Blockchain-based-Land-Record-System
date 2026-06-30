# Admin Key Encryption — LandLedger

## Why This Was Needed

The `ADMIN_PRIVATE_KEY` is an Ethereum private key that controls the `verificationBackend` wallet on-chain. This wallet is the only one allowed to mint land NFTs, initiate inheritance cases, resolve disputes, and propose subdivisions. If someone gets this key, they can mint fake land records or force-execute inheritance proposals — effectively forging ownership on the blockchain.

Storing it as plain text in `.env.local` means:
- If the file is accidentally committed to git, the key is permanently exposed in history.
- If the server's environment variables are leaked in an error log or a misconfigured endpoint, the raw key is visible.
- If someone screenshots the file or copies it, they have the key immediately usable.

Encrypting it means that even if someone gets the file contents, they see an unreadable blob — not a usable key.

---

## Why AES-256-GCM Over Everything Else

### Base64

Not encryption at all. It is just encoding — like writing in a different alphabet. Anyone who sees it can decode it in two seconds using any online tool. Provides zero security.

### RSA

RSA is designed for two parties to exchange messages securely when they have never met. It uses a public key to encrypt and a private key to decrypt. For storing a secret *on the same server*, RSA is the wrong tool — it is designed for communication, not storage. It is also significantly slower and more complex to implement correctly than AES.

### AES-128

Same algorithm as AES-256, just with a shorter key (128 bits vs 256 bits). AES-128 is still considered secure today, but AES-256 is the standard for anything classified as sensitive. Since there is no performance difference in a server startup context, using 256 bits is the obvious choice.

### DES / 3DES

DES (Data Encryption Standard) was broken in 1999. A purpose-built machine cracked it in 22 hours. 3DES extended DES by running it three times, but it has been officially deprecated by NIST since 2023. Using either for a new project is indefensible.

### AES-256-CBC (the other AES mode)

AES-256-CBC encrypts your data correctly but has one weakness: if someone tampers with the encrypted bytes (flips a bit, replaces a section), decryption will not notice. It will return garbage data silently. You would not know the key was corrupted until you tried to use it on-chain and got a signature error — which would be very confusing to debug.

### AES-256-GCM (what we use)

GCM builds on AES-256 and adds a tamper detection step. When you encrypt, GCM produces a short 16-byte value called an **authentication tag** that is a fingerprint of your encrypted data. When you decrypt, it recomputes that fingerprint and compares it. If even a single byte was changed — whether by accident (disk corruption) or by an attacker — decryption throws an error immediately instead of returning a corrupted key silently.

For a private key, this matters enormously. A silently corrupted private key would sign transactions with a wrong key, which would either fail on-chain or — worse — send funds to an unexpected address. GCM makes corruption detectable and immediate.

**Summary table:**

| Method       | Encrypts? | Detects tampering? | Still secure? | Right tool for this? |
|--------------|-----------|-------------------|---------------|----------------------|
| Base64       | No        | No                | N/A           | No                   |
| RSA          | Yes       | No                | Yes           | No (wrong use case)  |
| AES-128      | Yes       | No (CBC) / Yes (GCM) | Yes        | Acceptable           |
| DES / 3DES   | Yes       | No                | No (broken)   | No                   |
| AES-256-CBC  | Yes       | No                | Yes           | Acceptable but weaker|
| **AES-256-GCM** | **Yes** | **Yes**           | **Yes**       | **Best choice**      |

---

## Architecture: How It Works in the DApp

### The two values stored in `.env.local`

```
ENCRYPTION_MASTER_KEY=<64 hex chars — 256 random bits>
ENCRYPTED_ADMIN_KEY=<iv>:<authTag>:<ciphertext>
```

- `ENCRYPTION_MASTER_KEY` is generated once by the encrypt script. It is a random 256-bit number. This is the key that AES-256-GCM uses.
- `ENCRYPTED_ADMIN_KEY` is the result of encrypting the raw Ethereum private key. It is stored as three hex values joined by colons: the IV (random nonce used during encryption), the authentication tag (tamper fingerprint), and the ciphertext (the actual encrypted key bytes).

The raw `ADMIN_PRIVATE_KEY` is no longer in `.env.local` at all.

### What happens at server startup (per API request)

```
.env.local
  ENCRYPTION_MASTER_KEY  ──┐
  ENCRYPTED_ADMIN_KEY    ──┴──► getAdminKey()  [src/utils/adminKey.ts]
                                      │
                                      ▼
                               Parse iv : authTag : ciphertext
                                      │
                                      ▼
                               AES-256-GCM decrypt
                               (throws if authTag mismatch)
                                      │
                                      ▼
                               Raw Ethereum private key (in memory only)
                                      │
                                      ▼
                               privateKeyToAccount(key)
                                      │
                                      ▼
                               walletClient.writeContract(...)
                                      │
                                      ▼
                               Sepolia RPC → on-chain transaction
```

The raw key exists **only in memory, only for the duration of a single API request**. It is never logged, never returned in a response, never stored anywhere after decryption.

### Real-time interaction flow in the DApp

This is what happens when a user clicks "Mint" on the dashboard:

```
Browser (User Dashboard)
  │
  │  POST /api/verify  { userAddress, landId }
  ▼
Next.js API Route (/api/verify/route.ts)
  │
  ├─ getAdminKey()
  │    reads ENCRYPTION_MASTER_KEY + ENCRYPTED_ADMIN_KEY from env
  │    decrypts with AES-256-GCM → raw private key in memory
  │
  ├─ publicClient.readContract(getUser)
  │    checks wallet is registered on-chain
  │
  ├─ supabase.from('govt_land_records').select(...)
  │    cross-checks the land belongs to this CNIC
  │
  ├─ publicClient.readContract(getLandRecord)
  │    confirms land is not already minted
  │
  ├─ pinJsonToPinata(metadata)
  │    uploads ERC-721 metadata JSON to IPFS
  │    returns CID
  │
  ├─ supabase.update({ ipfs_hash: CID })
  │    saves CID back to govt registry
  │
  ├─ publicClient.simulateContract(proposeLandImport)
  │    dry-run to catch reverts before spending gas
  │
  └─ walletClient.writeContract(proposeLandImport)
       signs transaction with decrypted admin key
       broadcasts to Sepolia via publicnode.com RPC
       returns txHash
  │
  ▼
Browser receives { success: true, txHash }
  shows TxToast with Etherscan link
  dashboard refetches on-chain state
```

The same `getAdminKey()` flow happens for:
- `/api/inheritance` → `initiateInheritance()` on-chain
- `/api/dispute` → `resolveInheritanceDispute()` / `resolveLandImportDispute()` on-chain
- `/api/subdivision` → `proposeSubdivision()` on-chain

### What is never decrypted by the browser

The browser **never** sees:
- `ENCRYPTION_MASTER_KEY`
- `ENCRYPTED_ADMIN_KEY`
- The raw Ethereum private key

These exist only on the server side. The browser only ever receives a `txHash` and can verify the result independently on Etherscan or by reading the contract.

---

## Setup: How to Encrypt Your Key (One Time)

**Step 1.** Make sure `ADMIN_PRIVATE_KEY` is set in `.env.local`.

**Step 2.** Run the encrypt script:

```bash
node scripts/encrypt-admin-key.mjs
```

**Step 3.** The script prints two lines like this:

```
ENCRYPTION_MASTER_KEY=a3f8...64 hex chars
ENCRYPTED_ADMIN_KEY=9c1a...:b3f2...:7d4e...
```

**Step 4.** Paste both lines into `.env.local`.

**Step 5.** Delete the `ADMIN_PRIVATE_KEY=` line from `.env.local`.

**Step 6.** Restart the dev server (`npm run dev`).

The server will now decrypt the key automatically on every API request that needs it.

---

## What Happens If the Encrypted Value Is Tampered With

If someone edits `ENCRYPTED_ADMIN_KEY` in `.env.local` — even changing a single character — `getAdminKey()` will throw:

```
Error: Unsupported state or unable to authenticate data
```

This happens because the authentication tag computed during decryption no longer matches the one stored in the value. The server returns a 500 error immediately instead of attempting to use a corrupted key. You would never silently sign a transaction with the wrong wallet.

---

## Files

| File | Role |
|------|------|
| `scripts/encrypt-admin-key.mjs` | One-time setup — encrypts raw key, prints env vars to paste |
| `src/utils/adminKey.ts` | `getAdminKey()` — decrypts at runtime, called by all API routes |
| `src/app/api/verify/route.ts` | Minting — calls `getAdminKey()` before signing `proposeLandImport` |
| `src/app/api/inheritance/route.ts` | Inheritance — calls `getAdminKey()` before signing `initiateInheritance` |
| `src/app/api/dispute/route.ts` | Dispute resolution — calls `getAdminKey()` before signing resolve functions |
| `src/app/api/subdivision/route.ts` | Subdivision — calls `getAdminKey()` before signing `proposeSubdivision` |
