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

describe("Boss GraphQL client", () => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it("passes rail IDs as exact decimal strings and returns one verified candidate", async () => {
    const association = { id: "association-1" };
    mocks.request.mockResolvedValueOnce({ railSubscriptions: [association] });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(client.getRailAssociation(HASH("b"), 9_007_199_254_740_993n)).resolves.toBe(association);
    expect(mocks.request).toHaveBeenCalledWith(
      expect.any(String),
      { subscriptionId: HASH("b"), railId: "9007199254740993" },
    );
  });

  it("rejects an ambiguous association instead of selecting one", async () => {
    mocks.request.mockResolvedValueOnce({ railSubscriptions: [{ id: "one" }, { id: "two" }] });

    const client = createBossGraphQLClient("calibration", environment());
    await expect(client.getRailAssociation(HASH("b"), 42n)).rejects.toMatchObject({
      code: "INDEXING_ERROR",
    } satisfies Partial<BossDataSourceError>);
  });

  it("rejects missing or errored index metadata", async () => {
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
  });
});
