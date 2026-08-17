export type BossDataSourceErrorCode =
  | "MISSING_ENDPOINT"
  | "INVALID_ENDPOINT"
  | "MISSING_MANIFEST"
  | "INVALID_MANIFEST"
  | "INVALID_QUERY"
  | "NETWORK_MISMATCH"
  | "INDEXING_ERROR"
  | "INDEX_LAG";

export class BossDataSourceError extends Error {
  constructor(
    readonly code: BossDataSourceErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BossDataSourceError";
  }
}

export class BossIndexLagError extends BossDataSourceError {
  constructor(
    readonly indexedBlock: bigint,
    readonly observedChainBlock: bigint,
    readonly maximumLag: bigint,
  ) {
    super(
      "INDEX_LAG",
      `Boss index is ${observedChainBlock - indexedBlock} blocks behind; maximum accepted lag is ${maximumLag}`,
    );
    this.name = "BossIndexLagError";
  }
}
