import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EPOCHS_PER_DAY } from "../data/funding-runway";
import { FundingRunway } from "./FundingRunway";

const rate = 10_000_000_000_000n;
const now = 1_767_225_600n;

describe("FundingRunway", () => {
  it.each([
    [365n, "Long-term funded"],
    [30n, "Funded"],
    [7n, "Low"],
    [3n, "Urgent"],
    [2n, "Critical"],
    [1n, "Critical"],
    [0n, "Critical"],
  ] as const)("renders %i days as %s", (days, status) => {
    const markup = renderToStaticMarkup(
      <FundingRunway
        summary={{
          availableFunds: rate * days * EPOCHS_PER_DAY,
          debt: 0n,
          lockupRatePerEpoch: rate,
          runwayInEpochs: days * EPOCHS_PER_DAY,
        }}
        nowTimestamp={now}
      />,
    );

    expect(markup).toContain(status);
  });

  it("renders the runway, editable top-up amount, and top-up action", () => {
    const markup = renderToStaticMarkup(
      <FundingRunway
        summary={{
          availableFunds: rate * 100n * EPOCHS_PER_DAY,
          debt: 0n,
          lockupRatePerEpoch: rate,
          runwayInEpochs: 100n * EPOCHS_PER_DAY,
        }}
        nowTimestamp={now}
        onTopUp={() => undefined}
      />,
    );

    expect(markup).toContain("Funding runway");
    expect(markup).toContain("Funded");
    expect(markup).toContain("Remaining runway");
    expect(markup).toContain("Suggested top-up (USDFC)");
    expect(markup).toContain('value="7.632"');
    expect(markup).toContain("Top up");
  });

  it("renders a critical state for on-chain debt", () => {
    const markup = renderToStaticMarkup(
      <FundingRunway
        summary={{ availableFunds: 0n, debt: 1n, lockupRatePerEpoch: rate, runwayInEpochs: 0n }}
        nowTimestamp={now}
      />,
    );

    expect(markup).toContain("Critical");
    expect(markup).toContain("Underfunded");
  });
});
