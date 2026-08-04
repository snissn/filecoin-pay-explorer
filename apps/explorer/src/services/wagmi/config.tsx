import { http } from "viem";
import { arbitrum, avalanche, base, bsc, mainnet as ethereum, optimism, polygon } from "viem/chains";
import { createConfig } from "wagmi";
import { calibration, mainnet } from "@/constants/chains";

export const supportedChains = [mainnet, calibration] as const;
const walletChains = [mainnet, calibration, arbitrum, ethereum, base, optimism, polygon, avalanche, bsc] as const;

export const config = createConfig({
  chains: walletChains,
  ssr: true,
  transports: {
    [arbitrum.id]: http(),
    [avalanche.id]: http(),
    [base.id]: http(),
    [bsc.id]: http(),
    [calibration.id]: http(),
    [ethereum.id]: http(),
    [mainnet.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
  },
});
