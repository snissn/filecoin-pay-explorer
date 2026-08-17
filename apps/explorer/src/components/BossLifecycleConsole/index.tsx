"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Subscription } from "@filecoin-pay/types/boss";
import { useMemo, useRef, useState } from "react";
import { useAccount, useBlockNumber } from "wagmi";
import CustomConnectButton from "@/components/shared/CustomConnectButton";
import { getChain } from "@/constants/chains";
import { useBossGraphQLQuery } from "@/hooks/useBossGraphQLQuery";
import { useBossPayRailAssociation } from "@/hooks/useBossPayRailAssociation";
import useSynapse from "@/hooks/useSynapse";
import {
  type BossLifecycleAction,
  type BossLifecycleCurrentContext,
  type BossLifecycleDirectAuthority,
  BossLifecycleExecutionGate,
  type BossLifecycleExecutionReceipt,
  type BossLifecycleReview,
  compareBossLifecycleReview,
  createBossAssociationProofKey,
  isBossLifecycleActionAvailable,
  isBossLifecycleIndexFresh,
  prepareBossLifecycleReview,
  resolveBossLifecycleDirectAuthority,
  resolveBossServicesManager,
  SYNAPSE_BOSS_SERVICES_PROVENANCE,
  serializeBossLifecycleEvidence,
} from "@/services/boss/lifecycle";
import type { Network } from "@/types";

const POSITIVE_DECIMAL = /^[1-9]\d*$/;
const CANONICAL_DECIMAL = /^(0|[1-9]\d*)$/;

interface BossLifecycleConsoleProps {
  network: Network;
  subscription: Subscription;
  onRefresh: () => void;
}

interface LifecycleActionDefinition {
  action: BossLifecycleAction;
  label: string;
  description: string;
}

export default function BossLifecycleConsole({ network, subscription, onRefresh }: BossLifecycleConsoleProps) {
  const { address, chainId, isConnected } = useAccount();
  const targetChainId = getChain(network).id;
  const { data: observedBlock } = useBlockNumber({ chainId: targetChainId, watch: true });
  const { synapse } = useSynapse();
  const services = useMemo(() => resolveBossServicesManager(synapse), [synapse]);
  const association = useBossPayRailAssociation({ network, railId: subscription.railId, subscription });
  const indexQuery = useBossGraphQLQuery({
    networkOverride: network,
    queryKey: ["index-status"],
    query: (client) => client.getIndexStatus(),
    refetchInterval: 15_000,
  });
  const executionGate = useRef(new BossLifecycleExecutionGate()).current;
  const [newFixedBudget, setNewFixedBudget] = useState("");
  const [review, setReview] = useState<BossLifecycleReview | null>(null);
  const [receipt, setReceipt] = useState<BossLifecycleExecutionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReadingAuthority, setIsReadingAuthority] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const verifiedAssociation = association.state.status === "matched" ? association.state.association : undefined;
  const associationReady = verifiedAssociation?.active === true;
  const associationProofKey = verifiedAssociation ? createBossAssociationProofKey(verifiedAssociation) : "unverified";
  const indexReady = isBossLifecycleIndexFresh(
    indexQuery.data?.deployment,
    indexQuery.data?.indexedBlock,
    observedBlock,
  );
  const fixedBudgetReady = CANONICAL_DECIMAL.test(subscription.currentFixedBudget);
  const walletReady = isConnected && address !== undefined && chainId === targetChainId;
  const sdkReady = services.status === "available";
  const canPrepare =
    walletReady &&
    sdkReady &&
    associationReady &&
    indexReady &&
    fixedBudgetReady &&
    !isReadingAuthority &&
    !isExecuting;

  const directExpectation = {
    subscriptionId: subscription.subscriptionId,
    railId: subscription.railId,
    billingKind: subscription.billingKind,
    pauseAllowed: subscription.pauseAllowed,
    token: subscription.token,
    beneficiary: subscription.beneficiary,
    resourceKey: subscription.resourceKey,
  };

  const loadDirectAuthority = async (): Promise<BossLifecycleDirectAuthority> => {
    if (services.status !== "available") throw new Error(services.reason);
    const snapshot = await services.manager.get({
      account: subscription.accountAddress,
      subscriptionId: subscription.subscriptionId,
    });
    return resolveBossLifecycleDirectAuthority(snapshot, directExpectation);
  };

  const buildCurrentContext = (
    nowMs: number,
    direct: BossLifecycleDirectAuthority,
    indexStatus: { deployment?: string; indexedBlock?: bigint } | undefined = indexQuery.data,
  ): BossLifecycleCurrentContext => ({
    chainId,
    wallet: address,
    account: subscription.accountAddress,
    subscriptionId: subscription.subscriptionId,
    railId: subscription.railId,
    subscriptionState: direct.subscriptionState,
    billingKind: direct.billingKind,
    pauseAllowed: direct.pauseAllowed,
    requiresAccountRead: subscription.requiresAccountRead,
    directReadVerified: true,
    token: direct.token,
    beneficiary: direct.beneficiary,
    resourceKey: direct.resourceKey,
    associationProofKey,
    indexDeployment: indexStatus?.deployment,
    indexedBlock: indexStatus?.indexedBlock,
    observedBlock,
    currentFixedBudget: direct.currentFixedBudget,
    nowMs,
  });

  const reviewedDirectAuthority: BossLifecycleDirectAuthority | undefined = review
    ? {
        subscriptionId: review.subscriptionId,
        railId: review.railId,
        subscriptionState: review.subscriptionState,
        billingKind: review.billingKind,
        pauseAllowed: review.pauseAllowed,
        token: review.token,
        beneficiary: review.beneficiary,
        resourceKey: review.resourceKey,
        currentFixedBudget: review.currentFixedBudget.toString(),
        railAssociationValid: true,
      }
    : undefined;
  const reviewMismatches =
    review && reviewedDirectAuthority
      ? compareBossLifecycleReview(review, buildCurrentContext(Date.now(), reviewedDirectAuthority))
      : [];

  const actions: LifecycleActionDefinition[] = [
    {
      action: "sync",
      label: "Review capacity sync",
      description: "Prepare one permissionless capacity-resource synchronization call.",
    },
    {
      action: "top-up",
      label: "Review fixed-budget target",
      description:
        "Prepare one explicit new fixed-budget target in token base units. This is an absolute target, not an increment.",
    },
    {
      action: "pause",
      label: "Review pause",
      description: "Prepare one pause request. The SDK and contract enforce signer authority.",
    },
    {
      action: "resume",
      label: "Review resume",
      description: "Prepare one resume request from the currently paused service.",
    },
    {
      action: "stop",
      label: "Review stop",
      description:
        "Prepare one Boss-operator stop. This terminates only the add-on and must preserve the base FWSS rail.",
    },
  ];

  const prepare = async (action: BossLifecycleAction) => {
    setError(null);
    setReceipt(null);
    setIsReadingAuthority(true);
    try {
      if (!address || chainId === undefined) {
        throw new Error("Connect a wallet before preparing an action");
      }
      if (chainId !== targetChainId) {
        throw new Error(`Wallet chain ${chainId} does not match route chain ${targetChainId}`);
      }
      if (services.status !== "available") throw new Error(services.reason);
      if (!verifiedAssociation || !associationReady) {
        throw new Error("An exact active D2 Boss-to-Filecoin-Pay association proof is required before review");
      }
      if (!indexReady || !indexQuery.data || observedBlock === undefined) {
        throw new Error("The authenticated Boss index must be current before review");
      }
      if (!fixedBudgetReady) {
        throw new Error("The indexed current fixed budget is not a canonical non-negative decimal integer");
      }

      const direct = await loadDirectAuthority();
      if (!isBossLifecycleActionAvailable(action, direct.subscriptionState, direct.billingKind, direct.pauseAllowed)) {
        throw new Error(
          `${action} is unavailable for live state ${direct.subscriptionState} and billing kind ${direct.billingKind}`,
        );
      }

      let reviewedFixedBudget: bigint | undefined;
      if (action === "top-up") {
        if (!POSITIVE_DECIMAL.test(newFixedBudget)) {
          throw new Error("New fixed budget must be a positive canonical decimal integer in token base units");
        }
        reviewedFixedBudget = BigInt(newFixedBudget);
      }

      setReview(
        prepareBossLifecycleReview({
          action,
          chainId,
          wallet: address,
          account: subscription.accountAddress,
          subscriptionId: direct.subscriptionId,
          railId: direct.railId,
          subscriptionState: direct.subscriptionState,
          billingKind: direct.billingKind,
          pauseAllowed: direct.pauseAllowed,
          requiresAccountRead: subscription.requiresAccountRead,
          directReadVerified: true,
          token: direct.token,
          beneficiary: direct.beneficiary,
          resourceKey: direct.resourceKey,
          associationProofKey: createBossAssociationProofKey(verifiedAssociation),
          indexDeployment: indexQuery.data.deployment,
          indexedBlock: indexQuery.data.indexedBlock,
          observedBlock,
          currentFixedBudget: direct.currentFixedBudget,
          newFixedBudget: reviewedFixedBudget,
          createdAtMs: Date.now(),
        }),
      );
    } catch (cause) {
      setReview(null);
      setError(errorMessage(cause));
    } finally {
      setIsReadingAuthority(false);
    }
  };

  const execute = async () => {
    if (!review || services.status !== "available") return;

    setError(null);
    setIsExecuting(true);
    try {
      const [indexResult] = await Promise.all([indexQuery.refetch(), association.refetch()]);
      if (!indexResult.data || observedBlock === undefined || !reviewedDirectAuthority) {
        throw new Error("The authenticated Boss authority could not be refreshed before execution");
      }
      const nextReceipt = await executionGate.execute(
        services.manager,
        review,
        buildCurrentContext(Date.now(), reviewedDirectAuthority, indexResult.data),
      );
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
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div className='max-w-3xl'>
          <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Wallet console</p>
          <h2 id='boss-lifecycle-console-title' className='mt-1 text-lg font-semibold'>
            Manage existing Boss service
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Every action performs a current signer-free BossAccount read, then creates a normalized frozen review.
            Confirmation repeats the direct read, executes exactly one maintained Synapse SDK call, retains exact
            transaction evidence, and reconciles Boss, Pay, and resource state once afterward.
          </p>
        </div>
        <CustomConnectButton />
      </div>

      <div className='mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'>
        <p className='font-semibold'>New-service attach remains fail-closed</p>
        <p className='mt-1'>
          Safe attach requires the complete provider-signed offer, acceptance calldata, pricing/resource payloads, and
          signer evidence. The read index does not reconstruct that executable payload, so no raw JSON or bespoke
          contract-call fallback is provided.
        </p>
      </div>

      {subscription.requiresAccountRead && (
        <div
          className='mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100'
          role='status'
        >
          <p className='font-semibold'>Current contract read required</p>
          <p className='mt-1'>
            Settlement-driven state can change without another Boss event. This console reads the current subscription
            directly before review and again before execution; indexed state alone never authorizes the write.
          </p>
        </div>
      )}

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

      {!associationReady && (
        <div
          className='mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
          role='status'
        >
          <p className='font-semibold'>Exact active association proof required</p>
          <p className='mt-1'>Current D2 proof state: {association.state.status}.</p>
        </div>
      )}

      {!indexReady && (
        <div
          className='mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
          role='status'
        >
          <p className='font-semibold'>Authenticated current Boss index required</p>
          <p className='mt-1'>
            {indexQuery.isError
              ? errorMessage(indexQuery.error)
              : "The selected Boss deployment and route-chain height must be available and at most 20 blocks apart."}
          </p>
        </div>
      )}

      {!fixedBudgetReady && (
        <p
          className='mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'
          role='alert'
        >
          The indexed current fixed budget is malformed. Lifecycle actions remain disabled.
        </p>
      )}

      {!isConnected && (
        <p className='mt-4 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground'>
          Connect a wallet above to prepare an action. Read-only service data and direct authority checks remain
          signer-free.
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
        {actions.map((definition) => {
          const indexedActionAvailable = isBossLifecycleActionAvailable(
            definition.action,
            subscription.state,
            subscription.billingKind,
            subscription.pauseAllowed,
          );
          return (
            <div key={definition.action} className='rounded-lg border p-4'>
              <p className='font-semibold'>{definition.label}</p>
              <p className='mt-1 text-sm text-muted-foreground'>{definition.description}</p>
              {definition.action === "top-up" && (
                <label className='mt-3 block text-sm font-medium'>
                  New fixed-budget target in token base units
                  <input
                    className='mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm'
                    inputMode='numeric'
                    value={newFixedBudget}
                    onChange={(event) => setNewFixedBudget(event.target.value)}
                    placeholder={subscription.currentFixedBudget}
                    disabled={isReadingAuthority || isExecuting}
                  />
                  <span className='mt-1 block text-xs text-muted-foreground'>
                    Current indexed fixed budget: {subscription.currentFixedBudget}. The direct read is authoritative at
                    review time.
                  </span>
                </label>
              )}
              <Button
                className='mt-3'
                onClick={() => void prepare(definition.action)}
                variant='tertiary'
                size='compact'
                disabled={!canPrepare || !indexedActionAvailable}
              >
                {isReadingAuthority ? "Reading current authority…" : definition.label}
              </Button>
              {!indexedActionAvailable && (
                <p className='mt-2 text-xs text-muted-foreground'>
                  Unavailable from indexed state {subscription.state}, billing kind {subscription.billingKind}, and
                  pause authority {subscription.pauseAllowed ? "allowed" : "disallowed"}. A direct read rechecks these
                  facts before review.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {review && (
        <div className='mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <p className='font-semibold'>Review {review.action}</p>
              <p className='mt-1'>
                No transaction has been submitted. Any payload, wallet, association, index, or direct-state change
                invalidates this review.
              </p>
            </div>
            <code className='max-w-full break-all text-xs'>{review.reviewKey}</code>
          </div>
          <dl className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            <ReviewField label='Wallet' value={review.wallet} />
            <ReviewField label='Chain ID' value={review.chainId.toString()} />
            <ReviewField label='Boss account' value={review.account} />
            <ReviewField label='Subscription ID' value={review.subscriptionId} />
            <ReviewField label='Rail ID' value={review.railId} />
            <ReviewField label='Direct subscription state' value={review.subscriptionState} />
            <ReviewField label='Billing kind' value={review.billingKind.toString()} />
            <ReviewField label='Pause allowed' value={review.pauseAllowed ? "Yes" : "No"} />
            <ReviewField label='Payment token' value={review.token} />
            <ReviewField label='Beneficiary' value={review.beneficiary} />
            <ReviewField label='Resource key' value={review.resourceKey} />
            <ReviewField label='Current direct fixed budget' value={review.currentFixedBudget.toString()} />
            <ReviewField label='New fixed-budget target' value={review.newFixedBudget?.toString() ?? "None"} />
            <ReviewField label='Direct account read' value='Verified' />
            <ReviewField
              label='Index state authority'
              value={review.requiresAccountRead ? "Direct read required" : "Event stream current"}
            />
            <ReviewField label='Index deployment' value={review.indexDeployment} />
            <ReviewField label='Indexed block' value={review.indexedBlock.toString()} />
            <ReviewField label='Observed block' value={review.observedBlock.toString()} />
            <ReviewField label='Review expires' value={new Date(review.expiresAtMs).toISOString()} />
          </dl>

          {reviewMismatches.length > 0 && (
            <div
              className='mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'
              role='alert'
            >
              <p className='font-semibold'>Review invalidated</p>
              <ul className='mt-2 list-disc space-y-1 pl-5 text-xs'>
                {reviewMismatches.map((mismatch, index) => (
                  <li key={`${mismatch.field}-${index}`}>
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
              {isExecuting ? "Rechecking authority and submitting…" : `Confirm ${review.action}`}
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
            A fresh direct read and review are required before any retry. The console never reruns a partial or rejected
            action automatically.
          </p>
          {receipt.error && (
            <p className='mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'>
              {receipt.error}
            </p>
          )}
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
