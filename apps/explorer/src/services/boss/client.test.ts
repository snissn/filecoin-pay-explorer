import { describe, expect, it } from "vitest";
import { assertBossIndexFresh } from "./client";
import { BossDataSourceError, BossIndexLagError } from "./errors";

describe("Boss index freshness", () => {
  it("accepts a bounded index lag", () => {
    expect(() => assertBossIndexFresh(990n, 1000n, 20n)).not.toThrow();
  });

  it("reports excessive lag with exact block evidence", () => {
    expect(() => assertBossIndexFresh(900n, 1000n, 20n)).toThrow(BossIndexLagError);
    try {
      assertBossIndexFresh(900n, 1000n, 20n);
    } catch (error) {
      expect(error).toMatchObject({ indexedBlock: 900n, observedChainBlock: 1000n, maximumLag: 20n });
    }
  });

  it("rejects impossible or negative block relationships", () => {
    expect(() => assertBossIndexFresh(1001n, 1000n)).toThrow(BossDataSourceError);
    expect(() => assertBossIndexFresh(-1n, 1000n)).toThrow(BossDataSourceError);
  });
});
