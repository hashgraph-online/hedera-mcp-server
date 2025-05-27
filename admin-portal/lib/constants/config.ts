import { calculateHbarForCredits } from '@/lib/pricing';

export const HEDERA_CONFIG = {
  network: process.env.NEXT_PUBLIC_HEDERA_NETWORK || "mainnet",
  walletConnect: {
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
    metadata: {
      name: "Hedera MCP Admin Portal",
      description: "Admin portal for managing Hedera MCP Server credits",
      url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
      icons: ["/favicon.ico"] as string[],
    },
  },
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "",
  },
};

export const CREDIT_PACKAGES = [
  { amount: 1000, price: calculateHbarForCredits(1000), label: "Starter", savings: "0%" },
  { amount: 10000, price: calculateHbarForCredits(10000), label: "Growth", savings: "10%" },
  { amount: 50000, price: calculateHbarForCredits(50000), label: "Business", savings: "15%" },
  { amount: 100000, price: calculateHbarForCredits(100000), label: "Enterprise", savings: "20%" },
] as const;