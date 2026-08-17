import { describe, expect, it } from "vitest";
import { getBossDataSourceConfig, parseBossDeploymentManifest } from "./config";
import { BossDataSourceError } from "./errors";

const ADDRESS = (digit: string) => `0x${digit.repeat(40)}`;
const HASH = (digit: string) => `0x${digit.repeat(64)}`;

function deployment(digit: string, block: number) {
  return {
    address: ADDRESS(digit),
    runtimeCodeHash: HASH(digit),
    deploymentTxHash: HASH(digit === "f" ? "e" : "f"),
    deploymentBlock: block,
  };
}

function expectBossError(operation: () => unknown, code: BossDataSourceError["code"]): void {
  try {
    operation();
    throw new Error(`Expected BossDataSourceError with code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(BossDataSourceError);
    expect(error).toMatchObject({ code });
  }
}

function calibrationManifest() {
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

describe("Boss data-source configuration", () => {
  it("accepts one exact Calibration endpoint and deployment manifest", () => {
    const config = getBossDataSourceConfig("calibration", {
      endpoint: "https://boss.example.test/graphql",
      manifestJson: JSON.stringify(calibrationManifest()),
    });

    expect(config.endpoint).toBe("https://boss.example.test/graphql");
    expect(config.manifest.chainId).toBe(314159);
    expect(config.manifest.contracts.BossFactory.address).toBe(ADDRESS("6"));
  });

  it("fails closed when endpoint or manifest authority is missing", () => {
    expectBossError(() => getBossDataSourceConfig("calibration", { manifestJson: "{}" }), "MISSING_ENDPOINT");
    expectBossError(
      () => getBossDataSourceConfig("calibration", { endpoint: "https://boss.example.test/graphql" }),
      "MISSING_MANIFEST",
    );
  });

  it("rejects wrong-chain, zero-address, zero-hash, and unknown-contract manifests", () => {
    const wrongChain = calibrationManifest();
    wrongChain.chainId = 314;
    expectBossError(() => parseBossDeploymentManifest(JSON.stringify(wrongChain), "calibration"), "NETWORK_MISMATCH");

    const zeroDependency = calibrationManifest();
    zeroDependency.dependencies.filecoinPay = ADDRESS("0");
    expect(() => parseBossDeploymentManifest(JSON.stringify(zeroDependency), "calibration")).toThrow(
      BossDataSourceError,
    );

    const zeroRuntimeHash = calibrationManifest();
    zeroRuntimeHash.contracts.BossFactory.runtimeCodeHash = HASH("0");
    expect(() => parseBossDeploymentManifest(JSON.stringify(zeroRuntimeHash), "calibration")).toThrowError(
      /nonzero bytes32/,
    );

    const unknownContract = calibrationManifest() as ReturnType<typeof calibrationManifest> & {
      contracts: ReturnType<typeof calibrationManifest>["contracts"] & { Mystery: ReturnType<typeof deployment> };
    };
    unknownContract.contracts.Mystery = deployment("b", 105);
    expect(() => parseBossDeploymentManifest(JSON.stringify(unknownContract), "calibration")).toThrowError(
      /unsupported entries/,
    );
  });

  it("rejects insecure public endpoints", () => {
    expectBossError(
      () =>
        getBossDataSourceConfig("calibration", {
          endpoint: "http://boss.example.test/graphql",
          manifestJson: JSON.stringify(calibrationManifest()),
        }),
      "INVALID_ENDPOINT",
    );
  });
});
