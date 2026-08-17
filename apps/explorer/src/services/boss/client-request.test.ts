import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("graphql-request", () => ({
  GraphQLClient: class {
    request = mocks.request;
  },
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((result, part, index) => `${result}${part}${values[index] ?? ""}`, ""),
}));

import { createBossGraphQLClient } from "./client";
import { BossDataSourceError } from "./errors";

const ADDRESS = (digit: string) => `0x${digit.repeat(40)}`;
const HASH = (digit: string) => `0x${digit.repeat(64)}`;
const CHAIN_ID = "314159";
const SUBSCRIPTION_ID = HASH("b");
const RESOURCE_KEY = HASH("d");
const BOSS_ACCOUNT = ADDRESS("a");

function environment() {
  const deployment = (digit: string, block: number) => ({
    address: ADDRESS(digit),
    runtimeCodeHash: HASH(digit),
    deploymentTxHash: HASH("f"),
    deploymentBlock: block,
  });
  return {
    endpoint: "https://boss.example.test/graphql",
    manifestJson: JSON.stringify({
      schemaVersion: 1,
      network: "filecoin-testnet",
      chainId: 314159,
      protocolCommit: "a".repeat(40),
      accountCreationCodeHash: HASH("a"),
      deploymentBlock: 100,
      dependencies: {
        filecoinPay: ADDRESS("1"),
        pdpVerifier: ADDRESS("2"),
        fwssService: ADDRESS("3"),
        fwssStateView: ADDRESS("4"),
        token: ADDRESS("5"),
      },
      contracts: {
        BossFactory: deployment("6", 100),
        BossServiceRegistry: deployment("7", 101),
        BossAdapterRegistry: deployment("8", 102),
        BossStateView: deployment("9", 103),
        BossBundles: deployment("a", 104),
      },
    }),
  };
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-1",
    chainId: CHAIN_ID,
    factory: ADDRESS("6"),
    serviceRegistry: ADDRESS("7"),
    adapterRegistry: ADDRESS("8"),
    filecoinPay: ADDRESS("1"),
    ...overrides,
  };
}

function service(overrides: Record<string, unknown> = {}) {
  return {
    id: "service-1",
    chainId: CHAIN_ID,
    serviceRegistry: ADDRESS("7"),
    ...overrides,
  };
}

function resource(overrides: Record<string, unknown> = {}) {
  return {
    id: "resource-1",
    chainId: CHAIN_ID,
    bossAccount: BOSS_ACCOUNT,
    resourceKey: RESOURCE_KEY,
    subscriptionId: SUBSCRIPTION_ID,
    active: true,
    ...overrides,
  };
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "subscription-1",
    chainId: CHAIN_ID,
    bossAccount: BOSS_ACCOUNT,
    subscriptionId: SUBSCRIPTION_ID,
    resourceKey: RESOURCE_KEY,
    token: ADDRESS("5"),
    ...overrides,
  };
}

function usageClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: "claim-1",
    chainId: CHAIN_ID,
    subscriptionId: SUBSCRIPTION_ID,
    ...overrides,
  };
}

function railAssociation(overrides: Record<string, unknown> = {}) {
  return {
    id: "association-1",
    chainId: CHAIN_ID,
    filecoinPay: ADDRESS("1"),
    subscriptionId: SUBSCRIPTION_ID,
    railId: "9007199254740993",
    token: ADDRESS("5"),
    ...overrides,
  };
}

describe("Boss GraphQL client", () => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it("passes rail IDs as exact decimal strings and returns one manifest-bound candidate", async () => {
    const association = railAssociation();
    mocks.request.mockResolvedValueOnce({ railSubscriptions: [association] });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(client.getRailAssociation(SUBSCRIPTION_ID, 9_007_199_254_740_993n)).resolves.toBe(association);
    expect(mocks.request).toHaveBeenCalledWith(expect.any(String), {
      subscriptionId: SUBSCRIPTION_ID,
      railId: "9007199254740993",
    });
  });

  it("lists one bounded page and validates every subscription against the manifest", async () => {
    const valid = subscription();
    mocks.request.mockResolvedValueOnce({ subscriptions: [valid] });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(client.listSubscriptions()).resolves.toEqual([valid]);
    expect(mocks.request).toHaveBeenCalledWith(expect.any(String), { first: 100, skip: 0 });

    mocks.request.mockResolvedValueOnce({ subscriptions: [subscription({ token: ADDRESS("f") })] });
    await expect(client.listSubscriptions(25, 50)).rejects.toMatchObject({
      code: "NETWORK_MISMATCH",
    } satisfies Partial<BossDataSourceError>);
  });

  it("rejects duplicate list entities and unbounded pagination", async () => {
    const duplicate = subscription();
    mocks.request.mockResolvedValueOnce({ subscriptions: [duplicate, duplicate] });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(client.listSubscriptions()).rejects.toMatchObject({
      code: "INDEXING_ERROR",
    } satisfies Partial<BossDataSourceError>);
    await expect(client.listSubscriptions(101)).rejects.toMatchObject({
      code: "INVALID_QUERY",
    } satisfies Partial<BossDataSourceError>);
    await expect(client.getUsageClaims(SUBSCRIPTION_ID, 10, -1)).rejects.toMatchObject({
      code: "INVALID_QUERY",
    } satisfies Partial<BossDataSourceError>);
  });

  it("loads one exact resource association for the selected subscription", async () => {
    const validResource = resource();
    mocks.request.mockResolvedValueOnce({ resourceSubscriptions: [validResource] });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(
      client.getResourceForSubscription({
        bossAccount: BOSS_ACCOUNT,
        resourceKey: RESOURCE_KEY,
        subscriptionId: SUBSCRIPTION_ID,
      }),
    ).resolves.toBe(validResource);

    mocks.request.mockResolvedValueOnce({ resourceSubscriptions: [resource({ resourceKey: HASH("e") })] });
    await expect(
      client.getResourceForSubscription({
        bossAccount: BOSS_ACCOUNT,
        resourceKey: RESOURCE_KEY,
        subscriptionId: SUBSCRIPTION_ID,
      }),
    ).rejects.toMatchObject({ code: "INDEXING_ERROR" });
  });

  it("accepts entities only when their chain and deployment authority match the manifest", async () => {
    const client = createBossGraphQLClient("calibration", environment());

    const validAccount = account();
    mocks.request.mockResolvedValueOnce({ bossAccount: validAccount });
    await expect(client.getAccount("account-1")).resolves.toBe(validAccount);

    const validService = service();
    mocks.request.mockResolvedValueOnce({ bossService: validService });
    await expect(client.getService("service-1")).resolves.toBe(validService);

    const validResource = resource();
    mocks.request.mockResolvedValueOnce({ resourceSubscription: validResource });
    await expect(client.getResource("resource-1")).resolves.toBe(validResource);

    const validSubscription = subscription();
    mocks.request.mockResolvedValueOnce({ subscription: validSubscription });
    await expect(client.getSubscription("subscription-1")).resolves.toBe(validSubscription);

    const validClaim = usageClaim();
    mocks.request.mockResolvedValueOnce({ usageClaims: [validClaim] });
    await expect(client.getUsageClaims(SUBSCRIPTION_ID)).resolves.toEqual([validClaim]);
  });

  it("rejects wrong-chain or wrong-deployment data from every getter", async () => {
    const client = createBossGraphQLClient("calibration", environment());

    mocks.request.mockResolvedValueOnce({ bossAccount: account({ factory: ADDRESS("f") }) });
    await expect(client.getAccount("account-1")).rejects.toMatchObject({
      code: "NETWORK_MISMATCH",
    } satisfies Partial<BossDataSourceError>);

    mocks.request.mockResolvedValueOnce({ bossService: service({ serviceRegistry: ADDRESS("f") }) });
    await expect(client.getService("service-1")).rejects.toMatchObject({
      code: "NETWORK_MISMATCH",
    } satisfies Partial<BossDataSourceError>);

    mocks.request.mockResolvedValueOnce({ resourceSubscription: resource({ chainId: "314" }) });
    await expect(client.getResource("resource-1")).rejects.toMatchObject({
      code: "NETWORK_MISMATCH",
    } satisfies Partial<BossDataSourceError>);

    mocks.request.mockResolvedValueOnce({ subscription: subscription({ token: ADDRESS("f") }) });
    await expect(client.getSubscription("subscription-1")).rejects.toMatchObject({
      code: "NETWORK_MISMATCH",
    } satisfies Partial<BossDataSourceError>);

    mocks.request.mockResolvedValueOnce({ usageClaims: [usageClaim({ chainId: "314" })] });
    await expect(client.getUsageClaims(SUBSCRIPTION_ID)).rejects.toMatchObject({
      code: "NETWORK_MISMATCH",
    } satisfies Partial<BossDataSourceError>);

    mocks.request.mockResolvedValueOnce({
      railSubscriptions: [railAssociation({ filecoinPay: ADDRESS("f") })],
    });
    await expect(client.getRailAssociation(SUBSCRIPTION_ID, 9_007_199_254_740_993n)).rejects.toMatchObject({
      code: "NETWORK_MISMATCH",
    } satisfies Partial<BossDataSourceError>);
  });

  it("rejects query and relationship identity mismatches", async () => {
    const client = createBossGraphQLClient("calibration", environment());

    mocks.request.mockResolvedValueOnce({ resourceSubscription: resource({ id: "resource-2" }) });
    await expect(client.getResource("resource-1")).rejects.toMatchObject({
      code: "INDEXING_ERROR",
    } satisfies Partial<BossDataSourceError>);

    mocks.request.mockResolvedValueOnce({ usageClaims: [usageClaim({ subscriptionId: HASH("c") })] });
    await expect(client.getUsageClaims(SUBSCRIPTION_ID)).rejects.toMatchObject({
      code: "INDEXING_ERROR",
    } satisfies Partial<BossDataSourceError>);

    mocks.request.mockResolvedValueOnce({
      railSubscriptions: [railAssociation({ railId: "42" })],
    });
    await expect(client.getRailAssociation(SUBSCRIPTION_ID, 9_007_199_254_740_993n)).rejects.toMatchObject({
      code: "INDEXING_ERROR",
    } satisfies Partial<BossDataSourceError>);
  });

  it("rejects an ambiguous association instead of selecting one", async () => {
    mocks.request.mockResolvedValueOnce({
      railSubscriptions: [railAssociation({ id: "one" }), railAssociation({ id: "two" })],
    });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(client.getRailAssociation(SUBSCRIPTION_ID, 42n)).rejects.toMatchObject({
      code: "INDEXING_ERROR",
    } satisfies Partial<BossDataSourceError>);
  });

  it("rejects missing, errored, or pre-deployment index metadata", async () => {
    const client = createBossGraphQLClient("calibration", environment());
    mocks.request.mockResolvedValueOnce({ _meta: null });
    await expect(client.getIndexStatus()).rejects.toBeInstanceOf(BossDataSourceError);

    mocks.request.mockResolvedValueOnce({
      _meta: {
        block: { number: 100 },
        deployment: "boss-calibration",
        hasIndexingErrors: true,
      },
    });
    await expect(client.getIndexStatus()).rejects.toMatchObject({ code: "INDEXING_ERROR" });

    mocks.request.mockResolvedValueOnce({
      _meta: {
        block: { number: 99 },
        deployment: "boss-calibration",
        hasIndexingErrors: false,
      },
    });
    await expect(client.getIndexStatus()).rejects.toMatchObject({ code: "INDEXING_ERROR" });
  });
});
