import { readFileSync } from "node:fs";

const [managerPath, typesPath, errorsPath] = process.argv.slice(2);
if (!managerPath || !typesPath || !errorsPath) {
  throw new Error("usage: validate-synapse-boss-services.mjs <manager.ts> <types.ts> <errors.ts>");
}

const manager = normalize(readFileSync(managerPath, "utf8"));
const types = normalize(readFileSync(typesPath, "utf8"));
const errors = normalize(readFileSync(errorsPath, "utf8"));

requireText(manager, "async topUp(options: BossServicesTopUpOptions)", "manager exposes the typed top-up method");
requireText(manager, "topUpBossFixedBudgetCall(options)", "top-up forwards the typed options");
requireText(types, "newFixedBudget: bigint", "top-up uses the absolute newFixedBudget input");
requireText(types, "export interface BossServicesTransactionEvidence", "transaction evidence is exported");
requireText(types, "hash: Hash", "transaction evidence carries an exact hash");
requireText(types, "receipt: TransactionReceipt | null", "transaction evidence carries a receipt");
requireText(
  errors,
  "readonly completed: BossServicesTransactionEvidence[]",
  "partial errors retain completed evidence",
);
requireText(errors, "readonly failedStage: BossServicesStage", "partial errors retain the failed stage");

for (const method of ["sync", "topUp", "pause", "resume", "stop"]) {
  requireText(manager, `async ${method}(`, `manager exposes ${method}`);
}

console.log("Explorer lifecycle adapter matches the pinned Synapse Boss services API.");

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function requireText(source, expected, description) {
  if (!source.includes(expected)) {
    throw new Error(`Pinned Synapse API drift: ${description}; missing ${JSON.stringify(expected)}`);
  }
}
