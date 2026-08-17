import type { Subscription } from "@filecoin-pay/types/boss";
import { describe, expect, it } from "vitest";
import {
  BOSS_AUTHORITY_DISCLOSURES,
  describeBossIndexHealth,
  describeQuoteFreshness,
  formatBossInteger,
  formatLifetimeCap,
  formatRemainingLifetimeCap,
} from "./presentation";

const MAX_UINT256 = ((1n << 256n) - 1n).toString();

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    __typename: "Subscription",
    id: "subscription-entity",
    chainId: "314159",
    bossAccount: `0x${"1".repeat(40)}`,
    subscriptionId: `0x${"2".repeat(64)}`,
    railId: "7",
    resourceKey: `0x${"3".repeat(64)}`,
    provider: `0x${"4".repeat(40)}`,
    beneficiary: `0x${"5".repeat(40)}`,
    token: `0x${"6".repeat(40)}`,
    resourceAdapter: `0x${"7".repeat(40)}`,
    pricingAdapter: `0x${"8".repeat(40)}`,
    state: "ACTIVE",
    ratePerEpoch: "10",
    fixedBudget: "100",
    lifetimeCapGross: "1000",
    totalRawGross: "300",
    totalChargedGross: "250",
    claimCount: "3",
    quoteEpoch: "120",
    quoteValidThroughEpoch: "160",
    resourceStatusHash: `0x${"9".repeat(64)}`,
    activatedEpoch: "121",
    pausedEpoch: null,
    terminationRequestedEpoch: null,
    payEndEpoch: null,
    finalSettledEpoch: null,
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

  it("distinguishes current, expired, unavailable, and invalid quote authority", () => {
    expect(describeQuoteFreshness(subscription(), 150n)).toMatchObject({ tone: "success" });
    expect(describeQuoteFreshness(subscription(), 161n)).toMatchObject({ tone: "warning" });
    expect(describeQuoteFreshness(subscription({ quoteValidThroughEpoch: null }), 150n)).toMatchObject({
      label: "Quote authority not indexed",
      tone: "neutral",
    });
    expect(describeQuoteFreshness(subscription({ quoteValidThroughEpoch: "not-an-epoch" }), 150n)).toMatchObject({
      label: "Invalid quote metadata",
      tone: "error",
    });
  });

  it("never promotes unavailable assurance, dependency, or access authority into a verified claim", () => {
    expect(BOSS_AUTHORITY_DISCLOSURES.map((item) => item.value)).toEqual(["Not indexed", "Not indexed", "Not indexed"]);
    expect(
      BOSS_AUTHORITY_DISCLOSURES.map((item) => item.detail)
        .join(" ")
        .toLowerCase(),
    ).not.toContain("verified service");
  });

  it("reports bounded index health without hiding impossible metadata", () => {
    expect(describeBossIndexHealth(100n, 110n, 20n)).toMatchObject({ tone: "success" });
    expect(describeBossIndexHealth(100n, 125n, 20n)).toMatchObject({ tone: "warning" });
    expect(describeBossIndexHealth(126n, 125n, 20n)).toMatchObject({ tone: "error" });
    expect(describeBossIndexHealth(100n)).toMatchObject({ tone: "neutral" });
  });
});
