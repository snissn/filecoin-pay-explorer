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
  GET_BOSS_RESOURCE_FOR_SUBSCRIPTION,
  GET_BOSS_SERVICE,
  GET_BOSS_SUBSCRIPTION,
  GET_BOSS_USAGE_CLAIMS,
  LIST_BOSS_SUBSCRIPTIONS,
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

interface BossResourcesResponse {
  resourceSubscriptions: ResourceSubscription[];
}

interface BossSubscriptionResponse {
  subscription: Subscription | null;
}

interface BossSubscriptionsResponse {
  subscriptions: Subscription[];
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

export type BossResourceIdentity = Pick<Subscription, "bossAccount" | "resourceKey" | "subscriptionId">;

export interface BossGraphQLClient {
  readonly config: BossDataSourceConfig;
  getIndexStatus(): Promise<BossIndexStatus>;
  getAccount(id: string): Promise<BossAccount | null>;
  getService(id: string): Promise<BossService | null>;
  getResource(id: string): Promise<ResourceSubscription | null>;
  getResourceForSubscription(identity: BossResourceIdentity): Promise<ResourceSubscription | null>;
  getSubscription(id: string): Promise<Subscription | null>;
  listSubscriptions(first?: number, skip?: number): Promise<Subscription[]>;
  getUsageClaims(subscriptionId: string, first?: number, skip?: number): Promise<UsageClaim[]>;
  getRailAssociation(subscriptionId: string, railId: bigint): Promise<RailSubscription | null>;
}

export function createBossGraphQLClient(network: Network, environment?: BossPublicEnvironment): BossGraphQLClient {
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

      const indexedBlock = BigInt(response._meta.block.number);
      const deploymentBlock = config.manifest.deploymentBlock;
      if (deploymentBlock !== undefined && indexedBlock < BigInt(deploymentBlock)) {
        throw new BossDataSourceError(
          "INDEXING_ERROR",
          `Boss subgraph indexed block ${indexedBlock} predates manifest deployment block ${deploymentBlock}`,
        );
      }

      return {
        indexedBlock,
        blockHash: response._meta.block.hash ?? undefined,
        deployment: response._meta.deployment,
      };
    },
    async getAccount(id) {
      const account = (await client.request<BossAccountResponse>(GET_BOSS_ACCOUNT, { id })).bossAccount;
      if (!account) {
        return null;
      }

      assertIndexedIdentity(account.id, id, "Boss account id");
      assertIndexedChain(config, account.chainId, "Boss account");
      assertIndexedAuthority(account.factory, config.manifest.contracts.BossFactory.address, "Boss account factory");
      assertIndexedAuthority(
        account.serviceRegistry,
        config.manifest.contracts.BossServiceRegistry.address,
        "Boss account service registry",
      );
      assertIndexedAuthority(
        account.adapterRegistry,
        config.manifest.contracts.BossAdapterRegistry.address,
        "Boss account adapter registry",
      );
      assertIndexedAuthority(
        account.filecoinPay,
        config.manifest.dependencies.filecoinPay,
        "Boss account Filecoin Pay authority",
      );
      return account;
    },
    async getService(id) {
      const service = (await client.request<BossServiceResponse>(GET_BOSS_SERVICE, { id })).bossService;
      if (!service) {
        return null;
      }

      assertIndexedIdentity(service.id, id, "Boss service id");
      assertIndexedChain(config, service.chainId, "Boss service");
      assertIndexedAuthority(
        service.serviceRegistry,
        config.manifest.contracts.BossServiceRegistry.address,
        "Boss service registry",
      );
      return service;
    },
    async getResource(id) {
      const resource = (await client.request<BossResourceResponse>(GET_BOSS_RESOURCE, { id })).resourceSubscription;
      if (!resource) {
        return null;
      }

      assertIndexedIdentity(resource.id, id, "Boss resource id");
      assertIndexedChain(config, resource.chainId, "Boss resource");
      return resource;
    },
    async getResourceForSubscription(identity) {
      const response = await client.request<BossResourcesResponse>(GET_BOSS_RESOURCE_FOR_SUBSCRIPTION, {
        subscriptionId: identity.subscriptionId,
      });
      if (response.resourceSubscriptions.length > 1) {
        throw new BossDataSourceError(
          "INDEXING_ERROR",
          `Boss index returned multiple resource associations for subscription ${identity.subscriptionId}`,
        );
      }

      const resource = response.resourceSubscriptions[0];
      if (!resource) {
        return null;
      }

      assertIndexedChain(config, resource.chainId, "Boss resource");
      assertIndexedIdentity(resource.subscriptionId, identity.subscriptionId, "Boss resource subscription id");
      assertIndexedIdentity(resource.resourceKey, identity.resourceKey, "Boss resource key");
      assertIndexedIdentity(resource.bossAccount, identity.bossAccount, "Boss resource account");
      return resource;
    },
    async getSubscription(id) {
      const subscription = (await client.request<BossSubscriptionResponse>(GET_BOSS_SUBSCRIPTION, { id })).subscription;
      if (!subscription) {
        return null;
      }

      assertIndexedIdentity(subscription.id, id, "Boss subscription id");
      assertSubscriptionAuthority(config, subscription);
      return subscription;
    },
    async listSubscriptions(first = 100, skip = 0) {
      assertPagination(first, skip, "Boss subscriptions");
      const response = await client.request<BossSubscriptionsResponse>(LIST_BOSS_SUBSCRIPTIONS, { first, skip });
      assertUniqueIds(response.subscriptions, "Boss subscriptions");
      for (const subscription of response.subscriptions) {
        assertSubscriptionAuthority(config, subscription);
      }
      return response.subscriptions;
    },
    async getUsageClaims(subscriptionId, first = 100, skip = 0) {
      assertPagination(first, skip, "Boss usage claims");
      const response = await client.request<BossUsageClaimsResponse>(GET_BOSS_USAGE_CLAIMS, {
        subscriptionId,
        first,
        skip,
      });
      assertUniqueIds(response.usageClaims, "Boss usage claims");
      for (const claim of response.usageClaims) {
        assertIndexedChain(config, claim.chainId, "Boss usage claim");
        assertIndexedIdentity(claim.subscriptionId, subscriptionId, "Boss usage claim subscription id");
      }
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

      const association = response.railSubscriptions[0];
      if (!association) {
        return null;
      }

      assertIndexedChain(config, association.chainId, "Boss rail association");
      assertIndexedIdentity(association.subscriptionId, subscriptionId, "Boss rail association subscription id");
      assertIndexedIdentity(association.railId, railId.toString(), "Boss rail association rail id");
      assertIndexedAuthority(
        association.filecoinPay,
        config.manifest.dependencies.filecoinPay,
        "Boss rail association Filecoin Pay authority",
      );
      assertIndexedAuthority(
        association.token,
        config.manifest.dependencies.token,
        "Boss rail association payment token",
      );
      return association;
    },
  };
}

function assertSubscriptionAuthority(config: BossDataSourceConfig, subscription: Subscription): void {
  assertIndexedChain(config, subscription.chainId, "Boss subscription");
  assertIndexedAuthority(subscription.token, config.manifest.dependencies.token, "Boss subscription payment token");
}

function assertPagination(first: number, skip: number, label: string): void {
  if (!Number.isInteger(first) || first < 1 || first > 100) {
    throw new BossDataSourceError("INVALID_QUERY", `${label} page size must be an integer between 1 and 100`);
  }
  if (!Number.isInteger(skip) || skip < 0) {
    throw new BossDataSourceError("INVALID_QUERY", `${label} skip must be a non-negative integer`);
  }
}

function assertUniqueIds(entities: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const entity of entities) {
    if (ids.has(entity.id)) {
      throw new BossDataSourceError("INDEXING_ERROR", `${label} returned duplicate entity id ${entity.id}`);
    }
    ids.add(entity.id);
  }
}

function assertIndexedChain(config: BossDataSourceConfig, actualChainId: string, entity: string): void {
  assertIndexedAuthority(actualChainId, config.manifest.chainId.toString(), `${entity} chain ID`);
}

function assertIndexedAuthority(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new BossDataSourceError(
      "NETWORK_MISMATCH",
      `${label} ${actual} does not match deployment manifest authority ${expected}`,
    );
  }
}

function assertIndexedIdentity(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new BossDataSourceError("INDEXING_ERROR", `${label} ${actual} does not match requested identity ${expected}`);
  }
}

export function assertBossIndexFresh(indexedBlock: bigint, observedChainBlock: bigint, maximumLag: bigint = 20n): void {
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
