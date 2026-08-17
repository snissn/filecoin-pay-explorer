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

const ADDRESS = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const HASH = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;

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

function association(overrides: Record<string, unknown> = {}) {
  return {
    id: "association-1",
    chainId: "314159",
    filecoinPay: ADDRESS("1"),
    bossAccount: ADDRESS("a"),
    subscriptionId: HASH("b"),
    railId: "42",
    payer: ADDRESS("c"),
    payee: ADDRESS("d"),
    operator: ADDRESS("a"),
    validator: ADDRESS("e"),
    token: ADDRESS("5"),
    active: true,
    transactionHash: HASH("f"),
    blockNumber: "120",
    ...overrides,
  };
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "subscription-entity",
    chainId: "314159",
    bossAccount: ADDRESS("a"),
    subscriptionId: HASH("b"),
    railId: "42",
    beneficiary: ADDRESS("d"),
    token: ADDRESS("5"),
    ...overrides,
  };
}

describe("Boss association lookup", () => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it("resolves a unique manifest-bound association by exact rail ID", async () => {
    const candidate = association();
    mocks.request.mockResolvedValueOnce({ railSubscriptions: [candidate] });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(client.getRailAssociationByRailId(42n)).resolves.toBe(candidate);
    expect(mocks.request).toHaveBeenCalledWith(expect.any(String), { railId: "42" });
  });

  it("rejects ambiguous rail candidates", async () => {
    mocks.request.mockResolvedValueOnce({
      railSubscriptions: [association({ id: "one" }), association({ id: "two" })],
    });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(client.getRailAssociationByRailId(42n)).rejects.toMatchObject({ code: "INDEXING_ERROR" });
  });

  it("resolves one exact subscription and rejects cross-subscription facts", async () => {
    const candidate = association();
    const matchingSubscription = subscription();
    mocks.request.mockResolvedValueOnce({ subscriptions: [matchingSubscription] });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(client.getSubscriptionForAssociation(candidate)).resolves.toBe(matchingSubscription);
    expect(mocks.request).toHaveBeenCalledWith(expect.any(String), { subscriptionId: HASH("b") });

    mocks.request.mockResolvedValueOnce({ subscriptions: [subscription({ beneficiary: ADDRESS("f") })] });
    await expect(client.getSubscriptionForAssociation(candidate)).rejects.toMatchObject({ code: "INDEXING_ERROR" });
  });
});
