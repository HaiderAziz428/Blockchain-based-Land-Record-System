# Blockchain-Based Land Record System

A decentralized land registry system built with Next.js, Supabase, and Wagmi. This project aims to provide a secure, transparent, and efficient way to manage land records using blockchain technology.

## Features

- **Decentralized Record Keeping**: Immutable land records on the blockchain.
- **Secure Authentication**: Wallet-based login using RainbowKit.
- **Dual Database Architecture**: 
  - **Government Node**: Mocked using Supabase for official records.
  - **Marketplace Node**: Currently Supabase (transitioning to IPFS) for DApp data.
- **Admin Management**: Secure admin actions signed via private key.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- A Web3 Wallet (e.g., [Metamask](https://metamask.io/))

## Getting Started

Follow these steps to set up the project locally.

### 1. Clone the Repository

```bash
git clone https://github.com/HaiderAziz428/Blockchain-based-Land-Record-System.git
cd Blockchain-based-Land-Record-System
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Environment Configuration

This project requires specific environment variables to function correctly. 

1. Create a file named `.env.local` in the root directory.
2. Copy the contents of `.env.example` or use the reference below.

#### Required Variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_WALLETCONNET_PROJECT_ID` | **Required.** Get this from [WalletConnect Cloud](https://cloud.walletconnect.com/). It enables the RainbowKit wallet connection capabilities. |
| `NEXT_PUBLIC_SUPABASE_URL` | **Government DB.** The URL for the Supabase instance acting as the Government's existing record database (Mock DB). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | **Government DB.** The public API key (anon key) for the Government Supabase instance. |
| `NEXT_PUBLIC_MARKET_URL` | **DApp DB.** The URL for the secondary Supabase instance used for marketplace or DApp-specific data. *Note: Future implementation will move this to IPFS.* |
| `NEXT_PUBLIC_MARKET_KEY` | **DApp DB.** The public API key (anon key) for the DApp Supabase instance. |
| `ADMIN_PRIVATE_KEY` | **Critical.** The private key of the designated Admin wallet. This key is used on the server-side to sign and authorize administrative transactions on the blockchain. **DO NOT SHARE THIS KEY.** |

**Example `.env.local` file:**

```env
NEXT_PUBLIC_WALLETCONNET_PROJECT_ID=your_project_id
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_key
NEXT_PUBLIC_MARKET_URL=https://abc.supabase.co
NEXT_PUBLIC_MARKET_KEY=your_key
ADMIN_PRIVATE_KEY=0x...
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19
- **Styling**: TailwindCSS
- **Blockchain**: Wagmi, Viem, RainbowKit
- **Database**: Supabase (PostgreSQL)
