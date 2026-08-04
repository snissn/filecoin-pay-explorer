"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  fetchSourceTokens,
  type SquidFundingPlan,
  type SquidPublicClient,
  type SquidWalletClient,
} from "squid-evm-funding";
import { formatUnits, parseUnits } from "viem";
import { estimateTotalFee } from "viem/op-stack";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import useSynapse from "@/hooks/useSynapse";
import { USDFC_DECIMALS } from "../data/funding-runway";
import { executeSquidTopUp } from "../data/squid-execution";
import { planSquidTopUp, SQUID_SOURCE_CHAINS } from "../data/squid-quote";

type SquidQuoteReviewProps = {
  acquisitionState: "acquired" | "blocked" | "idle" | "processing";
  destinationAmount: bigint | null;
  network: "calibration" | "mainnet";
  onAcquired: (amount: bigint) => void;
  onAcquisitionStateChange: (state: "acquired" | "blocked" | "idle" | "processing") => void;
};

function displayAmount(amount: bigint, decimals: number, symbol: string) {
  return `${formatUnits(amount, decimals)} ${symbol}`;
}

export function SquidQuoteReview({
  acquisitionState,
  destinationAmount,
  network,
  onAcquired,
  onAcquisitionStateChange,
}: SquidQuoteReviewProps) {
  const { address, chainId } = useAccount();
  const { constants } = useSynapse();
  const [sourceChainId, setSourceChainId] = useState("");
  const [sourceTokenAddress, setSourceTokenAddress] = useState("");
  const [sourceAmount, setSourceAmount] = useState("");
  const [plan, setPlan] = useState<SquidFundingPlan | null>(null);
  const [maximumNativeFee, setMaximumNativeFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const latestQuoteState = useRef({
    address,
    chainId,
    destinationAmount,
    sourceAmount,
    sourceChainId,
    sourceTokenAddress,
  });
  const sourceChain = Number(sourceChainId);
  const sourcePublicClient = usePublicClient({ chainId: sourceChain || undefined });
  const { data: sourceWalletClient } = useWalletClient({ chainId: sourceChain || undefined });
  const destinationClient = usePublicClient({ chainId: 314 });
  const integratorId = process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID ?? "";
  const { data: tokens = [], isFetching: isLoadingTokens } = useQuery({
    enabled: integratorId !== "" && SQUID_SOURCE_CHAINS.some((chain) => chain.id === sourceChain),
    queryFn: () => fetchSourceTokens(sourceChain, { integratorId }),
    queryKey: ["squid", "source-tokens", sourceChain],
  });
  const source = tokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase());

  // biome-ignore lint/correctness/useExhaustiveDependencies: the dependencies intentionally invalidate the displayed quote.
  useEffect(() => {
    setPlan(null);
  }, [address, chainId, destinationAmount, sourceAmount, sourceChainId, sourceTokenAddress]);

  useEffect(() => {
    latestQuoteState.current = { address, chainId, destinationAmount, sourceAmount, sourceChainId, sourceTokenAddress };
  }, [address, chainId, destinationAmount, sourceAmount, sourceChainId, sourceTokenAddress]);

  const review = async () => {
    setError(null);
    if (network !== "mainnet") return setError("Squid routes currently target Filecoin mainnet.");
    if (!address || !source || destinationAmount === null)
      return setError("Select a source token and enter both amounts.");
    let parsedSourceAmount: bigint;
    try {
      parsedSourceAmount = parseUnits(sourceAmount, source.decimals);
    } catch {
      return setError("Enter a valid source amount.");
    }
    if (parsedSourceAmount <= 0n) return setError("Enter a source amount greater than zero.");
    const quotedOwner = address;
    const quotedChainId = chainId;
    const quotedState = { destinationAmount, sourceAmount, sourceChainId, sourceTokenAddress };
    try {
      const result = await planSquidTopUp({
        destinationAmount,
        destinationToken: constants.contracts.usdfc,
        integratorId,
        owner: quotedOwner,
        source,
        sourceAmount: parsedSourceAmount,
      });
      if (
        latestQuoteState.current.address !== quotedOwner ||
        latestQuoteState.current.chainId !== quotedChainId ||
        latestQuoteState.current.destinationAmount !== quotedState.destinationAmount ||
        latestQuoteState.current.sourceAmount !== quotedState.sourceAmount ||
        latestQuoteState.current.sourceChainId !== quotedState.sourceChainId ||
        latestQuoteState.current.sourceTokenAddress !== quotedState.sourceTokenAddress
      ) {
        throw new Error("Funding details or wallet changed while requesting the quote.");
      }
      setPlan(result);
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : "Squid could not provide a route.");
    }
  };

  const acquire = async () => {
    setError(null);
    if (acquisitionState === "blocked")
      return setError("Check your source wallet activity before starting another acquisition.");
    if (acquisitionState !== "idle") return setError("This acquisition is already complete or in progress.");
    if (network !== "mainnet") return setError("Squid routes currently target Filecoin mainnet.");
    if (!address || !source || !plan || destinationAmount === null)
      return setError("Review a route before acquiring USDFC.");
    if (chainId !== source.chainId)
      return setError("Switch your wallet to the selected source network before confirming.");
    if (!sourcePublicClient || !sourceWalletClient || !destinationClient)
      return setError("Wallet or network client is unavailable.");
    if (!sourceWalletClient.account || sourceWalletClient.account.address.toLowerCase() !== address.toLowerCase())
      return setError("Wallet account changed before confirming.");
    let maxNativeFee: bigint;
    try {
      maxNativeFee = parseUnits(maximumNativeFee, 18);
    } catch {
      return setError("Enter a valid maximum network fee.");
    }
    if (maxNativeFee <= 0n) return setError("Enter a positive network-fee limit.");
    if (plan.quotes.some((quote) => quote.expiresAt <= Math.floor(Date.now() / 1_000)))
      return setError("This route expired. Review it again before acquiring USDFC.");

    const publicClient =
      source.chainId === 10 || source.chainId === 8453
        ? {
            ...sourcePublicClient,
            estimateTotalFee: (request: Parameters<typeof estimateTotalFee>[1]) =>
              estimateTotalFee(sourcePublicClient, request),
          }
        : sourcePublicClient;
    let executionStarted = false;
    onAcquisitionStateChange("processing");
    try {
      await executeSquidTopUp({
        destinationClient: destinationClient as unknown as SquidPublicClient,
        integratorId,
        maxNativeFee,
        onExecutionStart: () => {
          executionStarted = true;
        },
        plan,
        sourcePublicClient: publicClient as unknown as SquidPublicClient,
        sourceWalletClient: sourceWalletClient as SquidWalletClient,
      });
      onAcquisitionStateChange("acquired");
      onAcquired(destinationAmount);
    } catch (executionError) {
      onAcquisitionStateChange(executionStarted ? "blocked" : "idle");
      setError(executionError instanceof Error ? executionError.message : "Squid could not complete the acquisition.");
    }
  };

  return (
    <section className='grid gap-3 rounded-md border p-3 text-sm' aria-label='Swap quote review'>
      <div>
        <p className='font-medium'>Pay with another token</p>
        <p className='text-muted-foreground'>Review only — this does not request a wallet signature.</p>
      </div>
      <label className='grid gap-1'>
        Source network
        <select
          disabled={acquisitionState !== "idle"}
          value={sourceChainId}
          onChange={(event) => setSourceChainId(event.target.value)}
        >
          <option value=''>Select a network</option>
          {SQUID_SOURCE_CHAINS.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </label>
      <label className='grid gap-1'>
        Source token
        <select
          disabled={acquisitionState !== "idle" || sourceChainId === "" || isLoadingTokens}
          value={sourceTokenAddress}
          onChange={(event) => setSourceTokenAddress(event.target.value)}
        >
          <option value=''>{isLoadingTokens ? "Loading tokens…" : "Select a token"}</option>
          {tokens.map((token) => (
            <option key={token.token} value={token.token}>
              {token.symbol}
            </option>
          ))}
        </select>
      </label>
      <label className='grid gap-1'>
        Maximum source amount
        <input
          min='0'
          disabled={acquisitionState !== "idle"}
          step='any'
          type='number'
          value={sourceAmount}
          onChange={(event) => setSourceAmount(event.target.value)}
        />
      </label>
      <button
        type='button'
        onClick={review}
        disabled={!source || destinationAmount === null || acquisitionState !== "idle"}
      >
        Review route
      </button>
      {error && (
        <p className='text-destructive' role='alert'>
          {error}
        </p>
      )}
      {plan?.quotes[0] && (
        <div className='grid gap-1 border-t pt-3'>
          <p>Spend: {displayAmount(plan.quotes[0].sourceAmount, plan.source.decimals, plan.source.symbol)}</p>
          <p>Receive at least: {displayAmount(plan.quotes[0].destinationAmount, USDFC_DECIMALS, "USDFC")}</p>
          <p>Slippage: 1%</p>
          <p>Expires: {new Date(plan.quotes[0].expiresAt * 1_000).toLocaleString()}</p>
          <p>Route: {plan.quotes[0].actions.map((action) => action.description ?? action.type).join(" → ")}</p>
          {plan.quotes[0].costs.length > 0 && (
            <p>
              Fees:{" "}
              {plan.quotes[0].costs
                .map((cost) => displayAmount(cost.amount, cost.token.decimals, cost.token.symbol))
                .join(", ")}
            </p>
          )}
          <label className='grid gap-1 pt-2'>
            Maximum network fee (native token)
            <input
              min='0'
              disabled={acquisitionState !== "idle"}
              onChange={(event) => setMaximumNativeFee(event.target.value)}
              step='any'
              type='number'
              value={maximumNativeFee}
            />
          </label>
          <button disabled={acquisitionState !== "idle"} onClick={acquire} type='button'>
            {acquisitionState === "processing" ? "Acquiring USDFC..." : "Acquire USDFC"}
          </button>
          {acquisitionState === "blocked" && (
            <p>Outcome needs verification. Check wallet activity before starting another one.</p>
          )}
        </div>
      )}
    </section>
  );
}
