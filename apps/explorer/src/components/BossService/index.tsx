"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SectionContent } from "@filecoin-foundation/ui-filecoin/SectionContent";
import type { ResourceSubscription, Subscription, UsageClaim } from "@filecoin-pay/types/boss";
import { AlertCircle, CircleQuestionMark } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useBlockNumber } from "wagmi";
import BossLifecycleConsole from "@/components/BossLifecycleConsole";
import BossPayAssociation from "@/components/BossPayAssociation";
import { getChain } from "@/constants/chains";
import { useBossGraphQLQuery } from "@/hooks/useBossGraphQLQuery";
import {
  BOSS_AUTHORITY_DISCLOSURES,
  describeBossIndexHealth,
  describeQuoteFreshness,
  formatBossIdentifier,
  formatBossInteger,
  formatLifetimeCap,
  formatRemainingLifetimeCap,
} from "@/services/boss/presentation";
import type { Network } from "@/types";
import { BossDetailField, BossSectionCard, BossStateBadge, BossStatusPanel } from "../BossServices/shared";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Boss data-source error";
}

function ExactValue({ value }: { value: string }) {
  return <code className='break-all text-xs'>{value}</code>;
}

export default function BossService() {
  const { id = "", network } = useParams<{ id: string; network: Network }>();
  const { data: observedBlock } = useBlockNumber({ chainId: getChain(network).id, watch: true });

  const subscriptionQuery = useBossGraphQLQuery<Subscription | null>({
    networkOverride: network,
    queryKey: ["subscription", id],
    query: (client) => client.getSubscription(id),
    enabled: id.length > 0,
    refetchInterval: 30_000,
  });
  const subscription = subscriptionQuery.data ?? null;

  const resourceQuery = useBossGraphQLQuery<ResourceSubscription | null>({
    networkOverride: network,
    queryKey: ["resource-for-subscription", subscription?.subscriptionId ?? "pending"],
    query: (client) =>
      subscription
        ? client.getResourceForSubscription(subscription)
        : Promise.resolve<ResourceSubscription | null>(null),
    enabled: subscription !== null,
    refetchInterval: 30_000,
  });
  const claimsQuery = useBossGraphQLQuery<UsageClaim[]>({
    networkOverride: network,
    queryKey: ["usage-claims", subscription?.subscriptionId ?? "pending"],
    query: (client) =>
      subscription ? client.getUsageClaims(subscription.subscriptionId, 50, 0) : Promise.resolve<UsageClaim[]>([]),
    enabled: subscription !== null,
    refetchInterval: 30_000,
  });
  const indexQuery = useBossGraphQLQuery({
    networkOverride: network,
    queryKey: ["index-status"],
    query: (client) => client.getIndexStatus(),
    refetchInterval: 15_000,
  });

  const refresh = () => {
    void subscriptionQuery.refetch();
    void resourceQuery.refetch();
    void claimsQuery.refetch();
    void indexQuery.refetch();
  };

  if (subscriptionQuery.isLoading) {
    return (
      <PageSection backgroundVariant='light'>
        <LoadingStateCard message='Loading Boss service...' />
      </PageSection>
    );
  }

  if (subscriptionQuery.isError) {
    return (
      <PageSection backgroundVariant='light'>
        <EmptyStateCard
          icon={AlertCircle}
          title='Failed to load Boss service'
          titleTag='h2'
          description={errorMessage(subscriptionQuery.error)}
        >
          <Button onClick={refresh} variant='primary' size='compact'>
            Retry
          </Button>
        </EmptyStateCard>
      </PageSection>
    );
  }

  if (!subscription) {
    return (
      <PageSection backgroundVariant='light'>
        <EmptyStateCard
          icon={CircleQuestionMark}
          title='Boss service not found'
          titleTag='h2'
          description={`Subscription entity "${id}" does not exist or has not been indexed yet.`}
        />
      </PageSection>
    );
  }

  const quoteStatus = describeQuoteFreshness(subscription, observedBlock);
  const indexStatus = indexQuery.isError
    ? {
        label: "Boss index unavailable",
        detail: errorMessage(indexQuery.error),
        tone: "error" as const,
      }
    : describeBossIndexHealth(indexQuery.data?.indexedBlock, observedBlock);
  const resource = resourceQuery.data ?? null;
  const claims = claimsQuery.data ?? [];

  return (
    <PageSection backgroundVariant='light'>
      <SectionContent
        headingTag='h1'
        title='Boss Service Subscription'
        description={`Exact indexed subscription ${formatBossIdentifier(subscription.subscriptionId)}`}
      >
        <div className='space-y-6'>
          <div>
            <Link
              href={`/${network}/services`}
              className='text-sm font-semibold text-primary underline-offset-4 hover:underline'
            >
              ← All Boss services
            </Link>
          </div>

          <BossStatusPanel title='Boss index' status={indexStatus} metadata={indexQuery.data?.deployment} />
          <BossStatusPanel title='Quote freshness' status={quoteStatus} />
          <BossPayAssociation network={network} railId={subscription.railId} subscription={subscription} />
          <BossLifecycleConsole network={network} subscription={subscription} onRefresh={refresh} />

          <BossSectionCard
            title='Subscription identity'
            description='Exact Boss-indexed identifiers. No generic Filecoin Pay rail is labeled as Boss without the cross-source proof above.'
          >
            <dl className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
              <BossDetailField label='State' value={<BossStateBadge state={subscription.state} />} />
              <BossDetailField label='Subscription ID' value={<ExactValue value={subscription.subscriptionId} />} />
              <BossDetailField label='Entity ID' value={<ExactValue value={subscription.id} />} />
              <BossDetailField label='Boss account' value={<ExactValue value={subscription.bossAccount} />} />
              <BossDetailField label='Provider' value={<ExactValue value={subscription.provider} />} />
              <BossDetailField label='Beneficiary' value={<ExactValue value={subscription.beneficiary} />} />
              <BossDetailField label='Resource key' value={<ExactValue value={subscription.resourceKey} />} />
              <BossDetailField
                label='Rail ID'
                value={subscription.railId}
                detail='The cross-source proof validates this rail ID together with every other authority field.'
              />
              <BossDetailField label='Chain ID' value={subscription.chainId} />
            </dl>
          </BossSectionCard>

          <BossSectionCard
            title='Economics'
            description='Amounts are exact token base units; token decimals are not assumed.'
          >
            <dl className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
              <BossDetailField label='Payment token' value={<ExactValue value={subscription.token} />} />
              <BossDetailField label='Rate per epoch' value={formatBossInteger(subscription.ratePerEpoch)} />
              <BossDetailField label='Fixed budget remaining' value={formatBossInteger(subscription.fixedBudget)} />
              <BossDetailField label='Lifetime cap' value={formatLifetimeCap(subscription.lifetimeCapGross)} />
              <BossDetailField label='Lifetime cap remaining' value={formatRemainingLifetimeCap(subscription)} />
              <BossDetailField label='Raw gross usage' value={formatBossInteger(subscription.totalRawGross)} />
              <BossDetailField label='Charged gross' value={formatBossInteger(subscription.totalChargedGross)} />
              <BossDetailField label='Claim count' value={formatBossInteger(subscription.claimCount)} />
              <BossDetailField label='Pricing adapter' value={<ExactValue value={subscription.pricingAdapter} />} />
              <BossDetailField label='Resource adapter' value={<ExactValue value={subscription.resourceAdapter} />} />
            </dl>
          </BossSectionCard>

          <BossSectionCard title='Quote and lifecycle' description='Epoch facts are displayed exactly as indexed.'>
            <dl className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
              <BossDetailField label='Quote epoch' value={formatBossInteger(subscription.quoteEpoch)} />
              <BossDetailField
                label='Quote valid through'
                value={formatBossInteger(subscription.quoteValidThroughEpoch)}
              />
              <BossDetailField
                label='Resource status hash'
                value={
                  subscription.resourceStatusHash ? (
                    <ExactValue value={subscription.resourceStatusHash} />
                  ) : (
                    "Not indexed"
                  )
                }
              />
              <BossDetailField label='Activated epoch' value={formatBossInteger(subscription.activatedEpoch)} />
              <BossDetailField label='Paused epoch' value={formatBossInteger(subscription.pausedEpoch)} />
              <BossDetailField
                label='Termination requested epoch'
                value={formatBossInteger(subscription.terminationRequestedEpoch)}
              />
              <BossDetailField label='Pay end epoch' value={formatBossInteger(subscription.payEndEpoch)} />
              <BossDetailField label='Final settled epoch' value={formatBossInteger(subscription.finalSettledEpoch)} />
            </dl>
          </BossSectionCard>

          <BossSectionCard
            title='Authority boundaries'
            description='Unavailable facts remain unavailable; this page does not convert identifiers into assurances.'
          >
            <dl className='grid gap-5 lg:grid-cols-3'>
              {BOSS_AUTHORITY_DISCLOSURES.map((disclosure) => (
                <BossDetailField
                  key={disclosure.label}
                  label={disclosure.label}
                  value={disclosure.value}
                  detail={disclosure.detail}
                />
              ))}
            </dl>
          </BossSectionCard>

          <BossSectionCard
            title='Resource association'
            description='One exact subscription-to-resource relation, never a label heuristic.'
          >
            {resourceQuery.isLoading && <LoadingStateCard message='Loading resource association...' />}
            {resourceQuery.isError && (
              <div
                className='rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'
                role='alert'
              >
                {errorMessage(resourceQuery.error)}
              </div>
            )}
            {!resourceQuery.isLoading && !resourceQuery.isError && !resource && (
              <p className='text-sm text-muted-foreground'>
                No exact ResourceSubscription entity is indexed for this subscription.
              </p>
            )}
            {!resourceQuery.isLoading && !resourceQuery.isError && resource && (
              <dl className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
                <BossDetailField label='Resource entity ID' value={<ExactValue value={resource.id} />} />
                <BossDetailField label='Resource key' value={<ExactValue value={resource.resourceKey} />} />
                <BossDetailField label='Association active' value={resource.active ? "Yes" : "No"} />
              </dl>
            )}
          </BossSectionCard>

          <BossSectionCard title='Usage claims' description='Newest 50 indexed claims; no per-row query waterfall.'>
            {claimsQuery.isLoading && <LoadingStateCard message='Loading usage claims...' />}
            {claimsQuery.isError && (
              <div
                className='rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'
                role='alert'
              >
                {errorMessage(claimsQuery.error)}
              </div>
            )}
            {!claimsQuery.isLoading && !claimsQuery.isError && claims.length === 0 && (
              <p className='text-sm text-muted-foreground'>No usage claims are indexed for this subscription.</p>
            )}
            {!claimsQuery.isLoading && !claimsQuery.isError && claims.length > 0 && (
              <div className='overflow-x-auto rounded-lg border'>
                <table className='w-full min-w-[850px] text-left text-sm'>
                  <caption className='sr-only'>Boss usage claims</caption>
                  <thead className='border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground'>
                    <tr>
                      <th className='px-4 py-3 font-semibold'>Claim</th>
                      <th className='px-4 py-3 font-semibold'>Observed usage</th>
                      <th className='px-4 py-3 font-semibold'>Raw gross</th>
                      <th className='px-4 py-3 font-semibold'>Charged gross</th>
                      <th className='px-4 py-3 font-semibold'>Block</th>
                      <th className='px-4 py-3 font-semibold'>Evidence</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y'>
                    {claims.map((claim) => (
                      <tr key={claim.id} className='align-top'>
                        <td className='px-4 py-3'>
                          <code title={claim.claimId}>{formatBossIdentifier(claim.claimId)}</code>
                        </td>
                        <td className='px-4 py-3'>{formatBossInteger(claim.observedUsage)}</td>
                        <td className='px-4 py-3'>{formatBossInteger(claim.rawGross)}</td>
                        <td className='px-4 py-3'>{formatBossInteger(claim.chargedGross)}</td>
                        <td className='px-4 py-3'>{formatBossInteger(claim.blockNumber)}</td>
                        <td className='px-4 py-3'>
                          <code title={claim.evidenceHash}>{formatBossIdentifier(claim.evidenceHash)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BossSectionCard>
        </div>
      </SectionContent>
    </PageSection>
  );
}
