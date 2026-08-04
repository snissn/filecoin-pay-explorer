import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EPOCHS_PER_DAY } from "../data/funding-runway";
import { FundingRunway } from "./FundingRunway";

const rate = 10_000_000_000_000n;
const now = 1_767_225_600n;

describe("FundingRunway", () => {
  it("renders the runway, one-year suggestion, and top-up action", () => {
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
    expect(markup).toContain("Suggested top-up to one year");
    expect(markup).toContain("7.632 USDFC");
    expect(markup).toContain("Top up");
  });
});
