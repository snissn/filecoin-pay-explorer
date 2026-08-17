"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { SectionContent } from "@filecoin-foundation/ui-filecoin/SectionContent";
import type { Subscription } from "@filecoin-pay/types/boss";
import { AlertCircle, Boxes } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useBlockNumber } from "wagmi";
import { getChain } from "@/constants/chains";
import { useBossGraphQLQuery } from "@/hooks/useBossGraphQLQuery";
import {
  describeBossIndexHealth,
  describeQuoteFreshness,
  formatBossIdentifier,
  formatBossInteger,
  formatLifetimeCap,
  formatRemainingLifetimeCap,
} from "@/services/boss/presentation";
import type { Network } from "@/types";
import { BossStateBadge, BossStatusPanel } from "./shared";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Boss data-source error";
}

export default function BossServices() {
  const { network } = useParams<{ network: Network }>();
  const { data: observedBlock } = useBlockNumber({ chainId: getChain(network).id, watch: true });
  const subscriptionsQuery = useBossGraphQLQuery<Subscription[]>({
    networkOverride: network,
    queryKey: ["subscriptions", "first-page"],
    query: (client) => client.listSubscriptions(100, 0),
    refetchInterval: 30_000,
  });
  const indexQuery = useBossGraphQLQuery({
    networkOverride: network,
    queryKey: ["index-status"],
    query: (client) => client.getIndexStatus(),
    refetchInterval: 15_000,
  });

  const indexHealth = indexQuery.isError
    ? {
        label: "Boss index unavailable",
        detail: errorMessage(indexQuery.error),
        tone: "error" as const,
      }
    : describeBossIndexHealth(indexQuery.data?.indexedBlock, observedBlock);

  const subscriptions = subscriptionsQuery.data ?? [];
  const refresh = () => {
    void subscriptionsQuery.refetch();
    void indexQuery.refetch();
  };

  return (
    <PageSection backgroundVariant='light'>
      <SectionContent
        headingTag='h1'
        title='Filecoin Boss Services'
        description='Read-only, manifest-bound subscription state from the distinct Boss index'
      >
        <div className='space-y-6'>
          <BossStatusPanel title='Boss index' status={indexHealth} metadata={indexQuery.data?.deployment} />

          <div className='rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100'>
            This view never infers assurance, dependency, data-access, or Boss-to-Pay association authority from
            provider labels, adapter addresses, or rail IDs. Those fields remain explicitly unavailable until their
            authoritative indexed facts exist.
          </div>

          {subscriptionsQuery.isLoading && <LoadingStateCard message='Loading Boss services...' />}

          {subscriptionsQuery.isError && (
            <EmptyStateCard
              icon={AlertCircle}
              title='Failed to load Boss services'
              titleTag='h2'
              description={errorMessage(subscriptionsQuery.error)}
            >
              <Button onClick={refresh} variant='primary' size='compact'>
                Retry
              </Button>
            </EmptyStateCard>
          )}

          {!subscriptionsQuery.isLoading && !subscriptionsQuery.isError && subscriptions.length === 0 && (
            <EmptyStateCard
              icon={Boxes}
              title='No Boss services indexed'
              titleTag='h2'
              description='No subscription entities are available on the selected network, or the deployment has not been indexed yet.'
            />
          )}

          {!subscriptionsQuery.isLoading && !subscriptionsQuery.isError && subscriptions.length > 0 && (
            <div className='overflow-x-auto rounded-xl border bg-background shadow-sm'>
              <table className='w-full min-w-[1050px] text-left text-sm'>
                <caption className='sr-only'>Manifest-bound Filecoin Boss service subscriptions</caption>
                <thead className='border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground'>
                  <tr>
                    <th className='px-4 py-3 font-semibold'>State</th>
                    <th className='px-4 py-3 font-semibold'>Subscription</th>
                    <th className='px-4 py-3 font-semibold'>Provider</th>
                    <th className='px-4 py-3 font-semibold'>Rate / epoch</th>
                    <th className='px-4 py-3 font-semibold'>Fixed budget</th>
                    <th className='px-4 py-3 font-semibold'>Remaining cap</th>
                    <th className='px-4 py-3 font-semibold'>Quote</th>
                    <th className='px-4 py-3 text-right font-semibold'>Details</th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {subscriptions.map((subscription) => {
                    const quote = describeQuoteFreshness(subscription, observedBlock);
                    return (
                      <tr key={subscription.id} className='align-top hover:bg-muted/20'>
                        <td className='px-4 py-4'>
                          <BossStateBadge state={subscription.state} />
                        </td>
                        <td className='px-4 py-4'>
                          <code className='font-medium' title={subscription.subscriptionId}>
                            {formatBossIdentifier(subscription.subscriptionId)}
                          </code>
                          <p className='mt-1 text-xs text-muted-foreground'>Rail {subscription.railId}</p>
                        </td>
                        <td className='px-4 py-4'>
                          <code title={subscription.provider}>{formatBossIdentifier(subscription.provider)}</code>
                          <p className='mt-1 text-xs text-muted-foreground'>Beneficiary</p>
                          <code className='text-xs' title={subscription.beneficiary}>
                            {formatBossIdentifier(subscription.beneficiary)}
                          </code>
                        </td>
                        <td className='px-4 py-4 font-medium'>
                          {formatBossInteger(subscription.ratePerEpoch)}
                          <p className='mt-1 text-xs font-normal text-muted-foreground'>token base units</p>
                        </td>
                        <td className='px-4 py-4 font-medium'>
                          {formatBossInteger(subscription.fixedBudget)}
                          <p className='mt-1 text-xs font-normal text-muted-foreground'>token base units</p>
                        </td>
                        <td className='px-4 py-4 font-medium'>
                          {formatRemainingLifetimeCap(subscription)}
                          <p className='mt-1 text-xs font-normal text-muted-foreground'>
                            of {formatLifetimeCap(subscription.lifetimeCapGross)}
                          </p>
                        </td>
                        <td className='max-w-56 px-4 py-4'>
                          <p className='font-medium'>{quote.label}</p>
                          <p className='mt-1 text-xs text-muted-foreground'>{quote.detail}</p>
                        </td>
                        <td className='px-4 py-4 text-right'>
                          <Link
                            href={`/${network}/services/${encodeURIComponent(subscription.id)}`}
                            className='font-semibold text-primary underline-offset-4 hover:underline'
                          >
                            Inspect
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionContent>
    </PageSection>
  );
}
