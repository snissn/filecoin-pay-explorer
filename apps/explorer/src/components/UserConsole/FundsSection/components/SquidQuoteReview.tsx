"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { fetchSourceTokens, type SquidQuote } from "squid-evm-funding";
import { formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";
import useSynapse from "@/hooks/useSynapse";
import { USDFC_DECIMALS } from "../data/funding-runway";
import { quoteSquidTopUp, SQUID_SOURCE_CHAINS } from "../data/squid-quote";

type SquidQuoteReviewProps = {
  destinationAmount: bigint | null;
  network: "calibration" | "mainnet";
};

function displayAmount(amount: bigint, decimals: number, symbol: string) {
  return `${formatUnits(amount, decimals)} ${symbol}`;
}

export function SquidQuoteReview({ destinationAmount, network }: SquidQuoteReviewProps) {
  const { address, chainId } = useAccount();
  const { constants } = useSynapse();
  const [sourceChainId, setSourceChainId] = useState("");
  const [sourceTokenAddress, setSourceTokenAddress] = useState("");
  const [sourceAmount, setSourceAmount] = useState("");
  const [quote, setQuote] = useState<SquidQuote | null>(null);
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
  const integratorId = process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID ?? "";
  const { data: tokens = [], isFetching: isLoadingTokens } = useQuery({
    enabled: integratorId !== "" && SQUID_SOURCE_CHAINS.some((chain) => chain.id === sourceChain),
    queryFn: () => fetchSourceTokens(sourceChain, { integratorId }),
    queryKey: ["squid", "source-tokens", sourceChain],
  });
  const source = tokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase());

  // biome-ignore lint/correctness/useExhaustiveDependencies: the dependencies intentionally invalidate the displayed quote.
  useEffect(() => {
    setQuote(null);
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
      const result = await quoteSquidTopUp({
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
      setQuote(result);
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : "Squid could not provide a route.");
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
        <select value={sourceChainId} onChange={(event) => setSourceChainId(event.target.value)}>
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
          disabled={sourceChainId === "" || isLoadingTokens}
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
        Source amount
        <input
          min='0'
          step='any'
          type='number'
          value={sourceAmount}
          onChange={(event) => setSourceAmount(event.target.value)}
        />
      </label>
      <button type='button' onClick={review} disabled={!source || destinationAmount === null}>
        Review route
      </button>
      {error && (
        <p className='text-destructive' role='alert'>
          {error}
        </p>
      )}
      {quote && (
        <div className='grid gap-1 border-t pt-3'>
          <p>Spend: {displayAmount(quote.sourceAmount, source?.decimals ?? 18, source?.symbol ?? "")}</p>
          <p>Receive at least: {displayAmount(quote.destinationAmount, USDFC_DECIMALS, "USDFC")}</p>
          <p>Slippage: 1%</p>
          <p>Expires: {new Date(quote.expiresAt * 1_000).toLocaleString()}</p>
          <p>Route: {quote.actions.map((action) => action.description ?? action.type).join(" → ")}</p>
          {quote.costs.length > 0 && (
            <p>
              Fees:{" "}
              {quote.costs.map((cost) => displayAmount(cost.amount, cost.token.decimals, cost.token.symbol)).join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
