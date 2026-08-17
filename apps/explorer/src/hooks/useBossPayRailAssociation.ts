import type { RailSubscription, Subscription } from "@filecoin-pay/types/boss";
import type { QueryObserverResult } from "@tanstack/react-query";
import { getChain } from "@/constants/chains";
import {
  type BossPayAssociationMismatch,
  type PayRailAssociationFacts,
  type VerifiedBossPayRailAssociation,
  verifyBossPayRailAssociation,
} from "@/services/boss/association";
import type { BossDeploymentManifest } from "@/services/boss/config";
import { GET_PAY_RAIL_ASSOCIATION_FACTS } from "@/services/boss/pay-query";
import type { Network } from "@/types";
import { useBossGraphQLQuery } from "./useBossGraphQLQuery";
import { useGraphQLQuery } from "./useGraphQLQuery";

const DECIMAL = /^(0|[1-9]\d*)$/;

interface PayRailProofResponse {
  rails: PayRailAssociationFacts[];
}

interface BossAssociationEvidence {
  association: RailSubscription;
  manifest: BossDeploymentManifest;
}

export type BossPayAssociationViewState =
  | { status: "loading"; message: string }
  | { status: "no-boss-record" }
  | { status: "pending-index"; source: "boss" | "pay"; message: string }
  | { status: "unverifiable"; reasons: string[] }
  | { status: "mismatched"; mismatches: BossPayAssociationMismatch[] }
  | { status: "matched"; association: VerifiedBossPayRailAssociation };

export interface UseBossPayRailAssociationOptions {
  network: Network;
  railId: string;
  subscription?: Subscription;
}

export interface UseBossPayRailAssociationResult {
  state: BossPayAssociationViewState;
  refetch: () => Promise<void>;
}

export function useBossPayRailAssociation({
  network,
  railId,
  subscription,
}: UseBossPayRailAssociationOptions): UseBossPayRailAssociationResult {
  const canonicalRailId = DECIMAL.test(railId);

  const payRailQuery = useGraphQLQuery<PayRailProofResponse, PayRailAssociationFacts | null>({
    networkOverride: network,
    query: GET_PAY_RAIL_ASSOCIATION_FACTS,
    variables: { railId },
    queryKey: ["boss-pay-proof", railId],
    enabled: canonicalRailId,
    select: (data) => {
      if (data.rails.length > 1) {
        throw new Error(`Filecoin Pay index returned multiple rails for rail ID ${railId}`);
      }
      return data.rails[0] ?? null;
    },
    refetchInterval: 30_000,
  });

  const associationQuery = useBossGraphQLQuery<BossAssociationEvidence | null>({
    networkOverride: network,
    queryKey: ["pay-rail-association", railId, subscription?.subscriptionId ?? "by-rail"],
    enabled: canonicalRailId,
    query: async (client) => {
      const association = subscription
        ? await client.getRailAssociation(subscription.subscriptionId, BigInt(railId))
        : await client.getRailAssociationByRailId(BigInt(railId));
      return association ? { association, manifest: client.config.manifest } : null;
    },
    refetchInterval: 30_000,
  });

  const associationEvidence = associationQuery.data ?? null;
  const discoveredSubscriptionQuery = useBossGraphQLQuery<Subscription | null>({
    networkOverride: network,
    queryKey: ["pay-rail-association-subscription", associationEvidence?.association.subscriptionId ?? "pending"],
    enabled: canonicalRailId && subscription === undefined && associationEvidence !== null,
    query: (client) =>
      associationEvidence
        ? client.getSubscriptionForAssociation(associationEvidence.association)
        : Promise.resolve<Subscription | null>(null),
    refetchInterval: 30_000,
  });

  const state = deriveState({
    canonicalRailId,
    network,
    railId,
    subscription,
    payRailQuery,
    associationQuery,
    discoveredSubscriptionQuery,
  });

  return {
    state,
    refetch: async () => {
      await Promise.all([
        payRailQuery.refetch(),
        associationQuery.refetch(),
        subscription === undefined && associationEvidence !== null
          ? discoveredSubscriptionQuery.refetch()
          : Promise.resolve(),
      ]);
    },
  };
}

interface DeriveStateInput {
  canonicalRailId: boolean;
  network: Network;
  railId: string;
  subscription?: Subscription;
  payRailQuery: QueryObserverResult<PayRailAssociationFacts | null, Error>;
  associationQuery: QueryObserverResult<BossAssociationEvidence | null, Error>;
  discoveredSubscriptionQuery: QueryObserverResult<Subscription | null, Error>;
}

function deriveState({
  canonicalRailId,
  network,
  railId,
  subscription,
  payRailQuery,
  associationQuery,
  discoveredSubscriptionQuery,
}: DeriveStateInput): BossPayAssociationViewState {
  if (!canonicalRailId) {
    return { status: "unverifiable", reasons: [`Rail ID ${railId} is not a canonical non-negative decimal integer`] };
  }
  if (payRailQuery.isError) {
    return { status: "unverifiable", reasons: [errorMessage(payRailQuery.error)] };
  }
  if (associationQuery.isError) {
    return { status: "unverifiable", reasons: [errorMessage(associationQuery.error)] };
  }
  if (payRailQuery.isLoading || associationQuery.isLoading) {
    return { status: "loading", message: "Loading exact Boss and Filecoin Pay association facts…" };
  }

  const payRail = payRailQuery.data ?? null;
  const evidence = associationQuery.data ?? null;
  if (!payRail) {
    return {
      status: "pending-index",
      source: "pay",
      message: `Filecoin Pay rail ${railId} is not yet available from the selected ${network} Pay index.`,
    };
  }
  if (!evidence) {
    return subscription
      ? {
          status: "pending-index",
          source: "boss",
          message: `Boss has not indexed the expected association for subscription ${subscription.subscriptionId} and rail ${railId}.`,
        }
      : { status: "no-boss-record" };
  }

  let candidateSubscription = subscription ?? null;
  if (!candidateSubscription) {
    if (discoveredSubscriptionQuery.isError) {
      return { status: "unverifiable", reasons: [errorMessage(discoveredSubscriptionQuery.error)] };
    }
    if (discoveredSubscriptionQuery.isLoading) {
      return { status: "loading", message: "Resolving the exact Boss subscription for this rail…" };
    }
    candidateSubscription = discoveredSubscriptionQuery.data ?? null;
    if (!candidateSubscription) {
      return {
        status: "pending-index",
        source: "boss",
        message: `Boss rail association ${evidence.association.id} has no unique indexed subscription ${evidence.association.subscriptionId}.`,
      };
    }
  }

  return verifyBossPayRailAssociation({
    routeChainId: getChain(network).id,
    trustedFilecoinPay: getChain(network).contracts.payments.address,
    manifest: evidence.manifest,
    bossAssociation: evidence.association,
    bossSubscription: candidateSubscription,
    payRail,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown association verification error";
}
