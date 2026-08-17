import type { RailSubscription, Subscription } from "@filecoin-pay/types/boss";
import { describe, expect, it } from "vitest";
import {
  type PayRailAssociationFacts,
  type VerifyBossPayRailAssociationInput,
  verifyBossPayRailAssociation,
} from "./association";
import type { BossDeploymentManifest } from "./config";

const ADDRESS = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const HASH = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;

function manifest(): BossDeploymentManifest {
  const deployment = (digit: string, block: number) => ({
    address: ADDRESS(digit),
    runtimeCodeHash: HASH(digit),
    deploymentTxHash: HASH("f"),
    deploymentBlock: block,
  });
  return {
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
  };
}

function bossAssociation(overrides: Partial<RailSubscription> = {}): RailSubscription {
  return {
    __typename: "RailSubscription",
    id: "association-1",
    chainId: "314159",
    filecoinPay: ADDRESS("1"),
    bossAccount: ADDRESS("a"),
    subscriptionId: HASH("b"),
    railId: "42",
    payer: ADDRESS("c"),
    payee: ADDRESS("d"),
    operator: ADDRESS("a"),
    token: ADDRESS("5"),
    active: true,
    createdBlock: "120",
    createdTransaction: HASH("f"),
    ...overrides,
  };
}

function bossSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    __typename: "Subscription",
    id: "subscription-entity",
    chainId: "314159",
    accountAddress: ADDRESS("a"),
    subscriptionId: HASH("b"),
    offerHash: HASH("1"),
    resourceKey: HASH("c"),
    railId: "42",
    beneficiary: ADDRESS("d"),
    token: ADDRESS("5"),
    provider: ADDRESS("f"),
    reporter: ADDRESS("e"),
    resourceAdapter: ADDRESS("7"),
    pricingAdapter: ADDRESS("8"),
    resourceDataHash: HASH("2"),
    pricingDataHash: HASH("3"),
    accessGrantHash: HASH("4"),
    policyWord: "0",
    billingKind: 1,
    assuranceKind: 1,
    dependencyKind: 0,
    activationKind: 0,
    terminationBillingKind: 0,
    pauseAllowed: true,
    maxRatePerEpoch: "100",
    maxFixedLockup: "1000",
    maxSingleCharge: "100",
    maxChargePerWindow: "1000",
    lifetimeCapGross: "1000",
    chargeWindowEpochs: "10",
    notAfterEpoch: "10000",
    maxLockupPeriod: "100",
    acceptedRatePerEpoch: "10",
    acceptedEpoch: "110",
    quoteEpoch: "110",
    quoteValidThroughEpoch: "140",
    quoteTtlEpochs: "30",
    currentFixedBudget: "100",
    totalRawGross: "20",
    totalChargedGross: "15",
    claimCount: "1",
    provisioningHash: null,
    resourceStatusHash: HASH("9"),
    activatedEpoch: "111",
    pausedEpoch: null,
    resumedEpoch: null,
    terminationRequestedEpoch: null,
    payEndEpoch: null,
    finalSettledEpoch: null,
    pauseRateUpdateDeferred: false,
    state: "ACTIVE",
    requiresAccountRead: false,
    createdBlock: "110",
    createdTransaction: HASH("a"),
    ...overrides,
  };
}

function payRail(overrides: Partial<PayRailAssociationFacts> = {}): PayRailAssociationFacts {
  return {
    railId: "42",
    payer: { address: ADDRESS("c") },
    payee: { address: ADDRESS("d") },
    operator: { address: ADDRESS("a") },
    validator: ADDRESS("a"),
    token: { address: ADDRESS("5") },
    ...overrides,
  };
}

function input(overrides: Partial<VerifyBossPayRailAssociationInput> = {}): VerifyBossPayRailAssociationInput {
  return {
    routeChainId: 314159,
    trustedFilecoinPay: ADDRESS("1"),
    manifest: manifest(),
    bossAssociation: bossAssociation(),
    bossSubscription: bossSubscription(),
    payRail: payRail(),
    ...overrides,
  };
}

describe("Boss to Filecoin Pay rail association", () => {
  it("accepts only the complete exact tuple", () => {
    expect(verifyBossPayRailAssociation(input())).toEqual({
      status: "matched",
      association: {
        chainId: 314159,
        filecoinPay: ADDRESS("1"),
        bossAccount: ADDRESS("a"),
        subscriptionEntityId: "subscription-entity",
        subscriptionId: HASH("b"),
        railId: "42",
        payer: ADDRESS("c"),
        payee: ADDRESS("d"),
        operator: ADDRESS("a"),
        validator: ADDRESS("a"),
        token: ADDRESS("5"),
        active: true,
      },
    });
  });

  it.each([
    ["chainId", { routeChainId: 314 }],
    ["filecoinPay", { trustedFilecoinPay: ADDRESS("f") }],
    ["bossAccount", { bossSubscription: bossSubscription({ accountAddress: ADDRESS("f") }) }],
    ["subscriptionId", { bossSubscription: bossSubscription({ subscriptionId: HASH("f") }) }],
    ["railId", { payRail: payRail({ railId: "43" }) }],
    ["payer", { payRail: payRail({ payer: { address: ADDRESS("f") } }) }],
    ["payee", { payRail: payRail({ payee: { address: ADDRESS("f") } }) }],
    ["operator", { payRail: payRail({ operator: { address: ADDRESS("f") } }) }],
    ["token", { payRail: payRail({ token: { address: ADDRESS("f") } }) }],
    ["validator", { payRail: payRail({ validator: ADDRESS("f") }) }],
  ] as const)("rejects a %s mismatch", (field, overrides) => {
    const result = verifyBossPayRailAssociation(input(overrides));
    expect(result.status).toBe("mismatched");
    if (result.status === "mismatched") expect(result.mismatches.map((mismatch) => mismatch.field)).toContain(field);
  });

  it("rejects a lookalike rail even when its payee and operator match", () => {
    const result = verifyBossPayRailAssociation(
      input({
        payRail: payRail({ railId: "999", payer: { address: ADDRESS("f") }, token: { address: ADDRESS("6") } }),
      }),
    );
    expect(result.status).toBe("mismatched");
    if (result.status === "mismatched") {
      expect(new Set(result.mismatches.map((mismatch) => mismatch.field))).toEqual(
        new Set(["railId", "payer", "token"]),
      );
    }
  });

  it("normalizes hexadecimal case but rejects malformed validator authority", () => {
    const caseNormalized = verifyBossPayRailAssociation(
      input({ payRail: payRail({ validator: ADDRESS("a").toUpperCase().replace("0X", "0x") }) }),
    );
    expect(caseNormalized.status).toBe("matched");

    const malformed = verifyBossPayRailAssociation(input({ payRail: payRail({ validator: "not-an-address" }) }));
    expect(malformed.status).toBe("unverifiable");
    if (malformed.status === "unverifiable") {
      expect(malformed.reasons).toContain("Filecoin Pay validator is not a valid EVM address");
    }
  });
});
