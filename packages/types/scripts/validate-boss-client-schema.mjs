import { readFileSync } from "node:fs";
import { Kind, parse, print } from "graphql";

const authorityPath = process.argv[2];
if (!authorityPath) throw new Error("usage: validate-boss-client-schema.mjs <authoritative-schema>");

const client = definitions(readFileSync(new URL("../schemas/boss.schema.graphql", import.meta.url), "utf8"));
const authority = definitions(readFileSync(authorityPath, "utf8"));
const entities = [
  "BossAccount",
  "BossService",
  "ResourceSubscription",
  "Subscription",
  "UsageClaim",
  "RailSubscription",
];

for (const name of entities) {
  const expected = authority.get(name);
  const selected = client.get(name);
  if (!expected || expected.kind !== Kind.OBJECT_TYPE_DEFINITION) throw new Error(`authority lacks object ${name}`);
  if (!selected || selected.kind !== Kind.OBJECT_TYPE_DEFINITION) throw new Error(`client lacks object ${name}`);
  const expectedFields = new Map(expected.fields.map((field) => [field.name.value, print(field.type)]));
  for (const field of selected.fields) {
    const observed = expectedFields.get(field.name.value);
    const requested = print(field.type);
    if (observed !== requested) {
      throw new Error(`${name}.${field.name.value}: client=${requested}, authority=${observed ?? "missing"}`);
    }
  }
}

const expectedStates = enumValues(authority, "SubscriptionState");
const selectedStates = enumValues(client, "SubscriptionState");
if (JSON.stringify(selectedStates) !== JSON.stringify(expectedStates)) {
  throw new Error(`SubscriptionState drift: client=${selectedStates.join(",")}, authority=${expectedStates.join(",")}`);
}
console.log(`Boss client schema is a strict field/type subset of ${authorityPath}`);

function definitions(source) {
  return new Map(
    parse(source)
      .definitions.filter((definition) => "name" in definition && definition.name)
      .map((definition) => [definition.name.value, definition]),
  );
}

function enumValues(map, name) {
  const definition = map.get(name);
  if (!definition || definition.kind !== Kind.ENUM_TYPE_DEFINITION) throw new Error(`missing enum ${name}`);
  return definition.values.map((value) => value.name.value);
}
