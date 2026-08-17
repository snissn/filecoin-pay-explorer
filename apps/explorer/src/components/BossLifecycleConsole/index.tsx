"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Subscription } from "@filecoin-pay/types/boss";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { getChain } from "@/constants/chains";
import useSynapse from "@/hooks/useSynapse";
import {
  BOSS_LIFECYCLE_REVIEW_MAX_AGE_MS,
  type BossLifecycleAction,
  type BossLifecycleCurrentContext,
  type BossLifecycleExecutionReceipt,
  type BossLifecycleReview,
  compareBossLifecycleReview,
  executeBossLifecycleReview,
  prepareBossLifecycleReview,
  resolveBossServicesManager,
  SYNAPSE_BOSS_SERVICES_PROVENANCE,
  serializeBossLifecycleEvidence,
} from "@/services/boss/lifecycle";
import type { Network } from "@/types";

const POSITIVE_DECIMAL = /^[1-9]\d*$/;

interface BossLifecycleConsoleProps {
  network: Network;
  subscription: Subscription;
  onRefresh: () => void;
}

interface LifecycleActionDefinition {
  action: BossLifecycleAction;
  label: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
}

export default function BossLifecycleConsole({ network, subscription, onRefresh }: BossLifecycleConsoleProps) {
  const { address, chainId, isConnected } = useAccount();
  const { synapse } = useSynapse();
  const services = useMemo(() => resolveBossServicesManager(synapse), [synapse]);
  const targetChainId = getChain(network).id;
  const [newFixedBudget, setNewFixedBudget] = useState("");
  const [review, setReview] = useState<BossLifecycleReview | null>(null);
  const [receipt, setReceipt] = useState<BossLifecycleExecutionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const currentContext: BossLifecycleCurrentContext = {
    chainId,
    wallet: address,
    account: subscription.accountAddress,
    subscriptionId: subscription.subscriptionId,
    railId: subscription.railId,
  };
  const reviewMismatches = review ? compareBossLifecycleReview(review, currentContext) : [];
  const walletReady = isConnected && address !== undefined && chainId === targetChainId;
  const sdkReady = services.status === "available";
  const canPrepare = walletReady && sdkReady && !isExecuting;
  const reviewLifetimeMinutes = BOSS_LIFECYCLE_REVIEW_MAX_AGE_MS / 60_000;

  const actions: LifecycleActionDefinition[] = [
    {
      action: "sync",
      label: "Review capacity sync",
      description: "Prepare one permissionless capacity-resource synchronization call.",
      available:
        subscription.billingKind === 1 && ["PENDING_ACTIVATION", "ACTIVE", "PAUSED"].includes(subscription.state),
      unavailableReason: "Capacity sync is available only for live stream-capacity subscriptions.",
    },
    {
      action: "top-up",
      label: "Review fixed-budget target",
      description:
        "Prepare one explicit absolute fixed-budget target in token base units. This is not an additive amount.",
      available: subscription.billingKind === 2 && !["TERMINATING", "ENDED"].includes(subscription.state),
      unavailableReason: "Fixed-budget top-up is available only for non-terminal metered subscriptions.",
    },
    {
      action: "pause",
      label: "Review pause",
      description: "Prepare one pause request. The SDK and contract enforce signer authority.",
      available: subscription.state === "ACTIVE" && subscription.pauseAllowed,
      unavailableReason: subscription.pauseAllowed
        ? "Pause requires an active subscription."
        : "The accepted subscription terms do not allow pause.",
    },
    {
      action: "resume",
      label: "Review resume",
      description: "Prepare one resume request from the currently paused service.",
      available: subscription.state === "PAUSED",
      unavailableReason: "Resume requires a paused subscription.",
    },
    {
      action: "stop",
      label: "Review stop",
      description:
        "Prepare one Boss-operator stop. This terminates only the add-on and must preserve the base FWSS rail.",
      available: ["PENDING_ACTIVATION", "ACTIVE", "PAUSED", "EXHAUSTED"].includes(subscription.state),
      unavailableReason: "Stop is unavailable after termination has begun or completed.",
    },
  ];

  const prepare = (action: BossLifecycleAction) => {
    setError(null);
    setReceipt(null);
    try {
      if (!address || chainId === undefined) {
        throw new Error("Connect a wallet before preparing an action");
      }
      const fixedBudget =
        action === "top-up"
          ? POSITIVE_DECIMAL.test(newFixedBudget)
            ? BigInt(newFixedBudget)
            : (() => {
                throw new Error("New fixed budget must be a positive canonical decimal integer in token base units");
              })()
          : undefined;

      setReview(
        prepareBossLifecycleReview({
          action,
          chainId,
          wallet: address,
          account: subscription.accountAddress,
          subscriptionId: subscription.subscriptionId,
          railId: subscription.railId,
          newFixedBudget: fixedBudget,
          createdAtMs: Date.now(),
        }),
      );
    } catch (cause) {
      setReview(null);
      setError(errorMessage(cause));
    }
  };

  const execute = async () => {
    if (!review || services.status !== "available") return;

    setError(null);
    setIsExecuting(true);
    try {
      const nextReceipt = await executeBossLifecycleReview(services.manager, review, {
        ...currentContext,
        nowMs: Date.now(),
      });
      setReceipt(nextReceipt);
      setReview(null);
      onRefresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <section className='rounded-xl border bg-background p-5 shadow-sm' aria-labelledby='boss-lifecycle-console-title'>
      <div>
        <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Wallet console</p>
        <h2 id='boss-lifecycle-console-title' className='mt-1 text-lg font-semibold'>
          Manage existing Boss service
        </h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          Every button creates a normalized, frozen review first. Confirmation executes exactly one maintained Synapse
          SDK call, retains its transaction evidence, and reconciles Boss, Pay, and resource state once afterward.
          Reviews expire after {reviewLifetimeMinutes} minutes.
        </p>
      </div>

      <div className='mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'>
        <p className='font-semibold'>New-service attach remains fail-closed</p>
        <p className='mt-1'>
          Safe attach requires the complete provider-signed offer, acceptance calldata, pricing/resource payloads, and
          signer evidence. The read index does not reconstruct that executable payload, so no raw JSON or bespoke
          contract-call fallback is provided.
        </p>
      </div>

      {services.status === "unavailable" && (
        <div
          className='mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-100'
          role='status'
        >
          <p className='font-semibold'>Synapse Boss release gate</p>
          <p className='mt-1'>{services.reason}</p>
          <p className='mt-2 break-all text-xs'>
            Required tracker authority: {SYNAPSE_BOSS_SERVICES_PROVENANCE.repository}@
            {SYNAPSE_BOSS_SERVICES_PROVENANCE.commit}
          </p>
        </div>
      )}

      {!isConnected && (
        <p className='mt-4 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground'>
          Connect a wallet to prepare an action. No read-only service data requires a signer.
        </p>
      )}

      {isConnected && chainId !== targetChainId && (
        <p
          className='mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
          role='alert'
        >
          Wallet chain {chainId ?? "unknown"} does not match route chain {targetChainId}. Switch networks before review.
        </p>
      )}

      <div className='mt-5 grid gap-4 lg:grid-cols-2'>
        {actions.map((definition) => (
          <div key={definition.action} className='rounded-lg border p-4'>
            <p className='font-semibold'>{definition.label}</p>
            <p className='mt-1 text-sm text-muted-foreground'>{definition.description}</p>
            {definition.action === "top-up" && (
              <label className='mt-3 block text-sm font-medium'>
                New fixed budget in token base units (absolute target)
                <input
                  className='mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm'
                  inputMode='numeric'
                  value={newFixedBudget}
                  onChange={(event) => setNewFixedBudget(event.target.value)}
                  placeholder={subscription.currentFixedBudget}
                  disabled={isExecuting}
                />
              </label>
            )}
            <Button
              className='mt-3'
              onClick={() => prepare(definition.action)}
              variant='tertiary'
              size='compact'
              disabled={!canPrepare || !definition.available}
            >
              {definition.label}
            </Button>
            {!definition.available && (
              <p className='mt-2 text-xs text-muted-foreground'>{definition.unavailableReason}</p>
            )}
          </div>
        ))}
      </div>

      {review && (
        <div className='mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <p className='font-semibold'>Review {review.action}</p>
              <p className='mt-1'>No transaction has been submitted. Any payload change invalidates this review.</p>
            </div>
            <code className='max-w-full break-all text-xs'>{review.reviewKey}</code>
          </div>
          <dl className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            <ReviewField label='Wallet' value={review.wallet} />
            <ReviewField label='Chain ID' value={review.chainId.toString()} />
            <ReviewField label='Boss account' value={review.account} />
            <ReviewField label='Subscription ID' value={review.subscriptionId} />
            <ReviewField label='Rail ID' value={review.railId} />
            <ReviewField label='New fixed budget' value={review.newFixedBudget?.toString() ?? "Not applicable"} />
          </dl>

          {reviewMismatches.length > 0 && (
            <div
              className='mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'
              role='alert'
            >
              <p className='font-semibold'>Review invalidated</p>
              <ul className='mt-2 list-disc space-y-1 pl-5 text-xs'>
                {reviewMismatches.map((mismatch) => (
                  <li key={mismatch.field}>
                    {mismatch.field}: reviewed <code>{mismatch.reviewed}</code>, current <code>{mismatch.current}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className='mt-4 flex flex-wrap gap-3'>
            <Button
              onClick={() => void execute()}
              variant='primary'
              size='compact'
              disabled={isExecuting || reviewMismatches.length > 0 || services.status !== "available"}
            >
              {isExecuting ? "Submitting one action…" : `Confirm ${review.action}`}
            </Button>
            <Button onClick={() => setReview(null)} variant='tertiary' size='compact' disabled={isExecuting}>
              Cancel review
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div
          className='mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'
          role='alert'
        >
          {error}
        </div>
      )}

      {receipt && (
        <div className='mt-5 rounded-xl border p-4'>
          <p className='font-semibold'>Action receipt: {receipt.status}</p>
          <p className='mt-1 text-sm text-muted-foreground'>
            A fresh review is required before any retry. The console never reruns a partial or rejected action
            automatically.
          </p>
          {receipt.result?.failedStage && (
            <p className='mt-2 text-sm'>Failed SDK stage: {receipt.result.failedStage}</p>
          )}
          {receipt.result?.transactions && receipt.result.transactions.length > 0 && (
            <ol className='mt-4 space-y-2'>
              {receipt.result.transactions.map((transaction, index) => (
                <li
                  key={`${transaction.stage}-${transaction.txHash}-${index}`}
                  className='rounded-lg border p-3 text-sm'
                >
                  <p className='font-medium'>{transaction.stage}</p>
                  <code className='mt-1 block break-all text-xs'>{transaction.txHash}</code>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Receipt status {transaction.receiptStatus ?? "unavailable"}
                    {transaction.blockNumber ? ` · block ${transaction.blockNumber}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <details className='mt-4'>
            <summary className='cursor-pointer text-sm font-semibold'>Exact SDK and reconciliation evidence</summary>
            <pre className='mt-2 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs'>
              {serializeBossLifecycleEvidence(receipt)}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <dt className='text-xs font-semibold uppercase tracking-wide opacity-70'>{label}</dt>
      <dd className='mt-1 break-all font-mono text-xs'>{value}</dd>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const details = "details" in error && Array.isArray(error.details) ? error.details.join("; ") : "";
    return details ? `${error.message}: ${details}` : error.message;
  }
  return String(error);
}
