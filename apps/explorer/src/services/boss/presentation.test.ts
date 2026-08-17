import type { Subscription } from "@filecoin-pay/types/boss";
import { describe, expect, it } from "vitest";
import {
  describeBossAuthorities,
  describeBossIndexHealth,
  describeBossStateAuthority,
  describeQuoteFreshness,
  formatBossInteger,
  formatLifetimeCap,
  formatRemainingLifetimeCap,
} from "./presentation";

const MAX_UINT256 = ((1n << 256n) - 1n).toString();
const ADDRESS = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const HASH = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    __typename: "Subscription",
    id: "subscription-entity",
    chainId: "314159",
    accountAddress: ADDRESS("1"),
    subscriptionId: HASH("2"),
    offerHash: HASH("3"),
    resourceKey: HASH("4"),
    railId: "7",
    beneficiary: ADDRESS("5"),
    token: ADDRESS("6"),
    provider: ADDRESS("7"),
    reporter: ADDRESS("8"),
    resourceAdapter: ADDRESS("9"),
    pricingAdapter: ADDRESS("a"),
    resourceDataHash: HASH("b"),
    pricingDataHash: HASH("c"),
    accessGrantHash: HASH("d"),
    policyWord: "0",
    billingKind: 2,
    assuranceKind: 2,
    dependencyKind: 1,
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
    acceptedEpoch: "120",
    quoteEpoch: "120",
    quoteValidThroughEpoch: "160",
    quoteTtlEpochs: "40",
    currentFixedBudget: "100",
    totalRawGross: "300",
    totalChargedGross: "250",
    claimCount: "3",
    provisioningHash: null,
    resourceStatusHash: HASH("e"),
    activatedEpoch: "121",
    pausedEpoch: null,
    resumedEpoch: null,
    terminationRequestedEpoch: null,
    payEndEpoch: null,
    finalSettledEpoch: null,
    pauseRateUpdateDeferred: false,
    state: "ACTIVE",
    requiresAccountRead: false,
    createdBlock: "120",
    createdTransaction: HASH("f"),
    ...overrides,
  };
}

describe("Boss read presentation", () => {
  it("renders exact integers without Number precision loss", () => {
    expect(formatBossInteger("9007199254740993123456789")).toBe("9,007,199,254,740,993,123,456,789");
    expect(formatBossInteger("1e18")).toBe("Invalid indexed value");
  });

  it("preserves the unlimited cap sentinel and clamps exhausted remaining capacity", () => {
    expect(formatLifetimeCap(MAX_UINT256)).toBe("Unlimited");
    expect(formatRemainingLifetimeCap(subscription({ lifetimeCapGross: MAX_UINT256 }))).toBe("Unlimited");
    expect(formatRemainingLifetimeCap(subscription({ lifetimeCapGross: "100", totalChargedGross: "125" }))).toBe("0");
  });

  it("distinguishes current, expired, unavailable-height, and invalid quote authority", () => {
    expect(describeQuoteFreshness(subscription(), 150n)).toMatchObject({ tone: "success" });
    expect(describeQuoteFreshness(subscription(), 161n)).toMatchObject({ tone: "warning" });
    expect(describeQuoteFreshness(subscription(), undefined)).toMatchObject({ tone: "neutral" });
    expect(describeQuoteFreshness(subscription({ quoteValidThroughEpoch: "not-an-epoch" }), 150n)).toMatchObject({
      label: "Invalid quote metadata",
      tone: "error",
    });
  });

  it("renders accepted assurance/dependency/access authority without overstating it", () => {
    const disclosures = describeBossAuthorities(subscription());
    expect(disclosures.map((item) => item.value)).toEqual(["Trusted metering", "Soft", expect.stringContaining("…")]);
    expect(
      disclosures
        .map((item) => item.detail)
        .join(" ")
        .toLowerCase(),
    ).toContain("trusted reporter");
    expect(
      disclosures
        .map((item) => item.detail)
        .join(" ")
        .toLowerCase(),
    ).not.toContain("verified service");
  });

  it("flags event-stream state that needs a direct account read", () => {
    expect(describeBossStateAuthority(subscription())).toMatchObject({ tone: "success" });
    expect(describeBossStateAuthority(subscription({ requiresAccountRead: true }))).toMatchObject({ tone: "warning" });
  });

  it("reports bounded index health without hiding impossible metadata", () => {
    expect(describeBossIndexHealth(100n, 110n, 20n)).toMatchObject({ tone: "success" });
    expect(describeBossIndexHealth(100n, 125n, 20n)).toMatchObject({ tone: "warning" });
    expect(describeBossIndexHealth(126n, 125n, 20n)).toMatchObject({ tone: "error" });
    expect(describeBossIndexHealth(100n)).toMatchObject({ tone: "neutral" });
  });
});
