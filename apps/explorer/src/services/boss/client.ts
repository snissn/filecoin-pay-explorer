import type {
  BossAccount,
  BossService,
  RailSubscription,
  ResourceSubscription,
  Subscription,
  UsageClaim,
} from "@filecoin-pay/types/boss";
import { GraphQLClient } from "graphql-request";
import type { Network } from "@/types";
import { type BossDataSourceConfig, type BossPublicEnvironment, getBossDataSourceConfig } from "./config";
import { BossDataSourceError, BossIndexLagError } from "./errors";
import {
  GET_BOSS_ACCOUNT,
  GET_BOSS_INDEX_STATUS,
  GET_BOSS_RAIL_ASSOCIATION,
  GET_BOSS_RESOURCE,
  GET_BOSS_SERVICE,
  GET_BOSS_SUBSCRIPTION,
  GET_BOSS_USAGE_CLAIMS,
} from "./queries";

interface BossIndexStatusResponse {
  _meta: {
    block: { number: number; hash?: string | null; timestamp?: string | null };
    deployment: string;
    hasIndexingErrors: boolean;
  } | null;
}

interface BossAccountResponse {
  bossAccount: BossAccount | null;
}

interface BossServiceResponse {
  bossService: BossService | null;
}

interface BossResourceResponse {
  resourceSubscription: ResourceSubscription | null;
}

interface BossSubscriptionResponse {
  subscription: Subscription | null;
}

interface BossUsageClaimsResponse {
  usageClaims: UsageClaim[];
}

interface BossRailAssociationResponse {
  railSubscriptions: RailSubscription[];
}

export interface BossIndexStatus {
  indexedBlock: bigint;
  blockHash?: string;
  deployment: string;
}

export interface BossGraphQLClient {
  readonly config: BossDataSourceConfig;
  getIndexStatus(): Promise<BossIndexStatus>;
  getAccount(id: string): Promise<BossAccount | null>;
  getService(id: string): Promise<BossService | null>;
  getResource(id: string): Promise<ResourceSubscription | null>;
  getSubscription(id: string): Promise<Subscription | null>;
  getUsageClaims(subscriptionId: string, first?: number, skip?: number): Promise<UsageClaim[]>;
  getRailAssociation(subscriptionId: string, railId: bigint): Promise<RailSubscription | null>;
}

export function createBossGraphQLClient(
  network: Network,
  environment?: BossPublicEnvironment,
): BossGraphQLClient {
  const config = getBossDataSourceConfig(network, environment);
  const client = new GraphQLClient(config.endpoint);

  return {
    config,
    async getIndexStatus() {
      const response = await client.request<BossIndexStatusResponse>(GET_BOSS_INDEX_STATUS);
      if (!response._meta) {
        throw new BossDataSourceError("INDEXING_ERROR", "Boss subgraph did not return indexing metadata");
      }
      if (response._meta.hasIndexingErrors) {
        throw new BossDataSourceError("INDEXING_ERROR", "Boss subgraph reports indexing errors");
      }
      return {
        indexedBlock: BigInt(response._meta.block.number),
        blockHash: response._meta.block.hash ?? undefined,
        deployment: response._meta.deployment,
      };
    },
    async getAccount(id) {
      return (await client.request<BossAccountResponse>(GET_BOSS_ACCOUNT, { id })).bossAccount;
    },
    async getService(id) {
      return (await client.request<BossServiceResponse>(GET_BOSS_SERVICE, { id })).bossService;
    },
    async getResource(id) {
      return (await client.request<BossResourceResponse>(GET_BOSS_RESOURCE, { id })).resourceSubscription;
    },
    async getSubscription(id) {
      return (await client.request<BossSubscriptionResponse>(GET_BOSS_SUBSCRIPTION, { id })).subscription;
    },
    async getUsageClaims(subscriptionId, first = 100, skip = 0) {
      const response = await client.request<BossUsageClaimsResponse>(GET_BOSS_USAGE_CLAIMS, {
        subscriptionId,
        first,
        skip,
      });
      return response.usageClaims;
    },
    async getRailAssociation(subscriptionId, railId) {
      const response = await client.request<BossRailAssociationResponse>(GET_BOSS_RAIL_ASSOCIATION, {
        subscriptionId,
        railId: railId.toString(),
      });
      if (response.railSubscriptions.length > 1) {
        throw new BossDataSourceError(
          "INDEXING_ERROR",
          `Boss index returned multiple rail associations for subscription ${subscriptionId} and rail ${railId}`,
        );
      }
      return response.railSubscriptions[0] ?? null;
    },
  };
}

export function assertBossIndexFresh(
  indexedBlock: bigint,
  observedChainBlock: bigint,
  maximumLag: bigint = 20n,
): void {
  if (indexedBlock < 0n || observedChainBlock < 0n || maximumLag < 0n) {
    throw new BossDataSourceError("INDEXING_ERROR", "Boss index block inputs must be non-negative");
  }
  if (indexedBlock > observedChainBlock) {
    throw new BossDataSourceError("INDEXING_ERROR", "Boss index block cannot exceed the observed chain block");
  }
  if (observedChainBlock - indexedBlock > maximumLag) {
    throw new BossIndexLagError(indexedBlock, observedChainBlock, maximumLag);
  }
}
