import { getD1Binding } from "@/lib/runtime-bindings";

export function getDb() {
  const db = getD1Binding();

  if (!db) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Use the Vinext/Sites runtime or keep the built-in knowledge fallback enabled.",
    );
  }

  return db;
}

export function tryGetDb() {
  return getD1Binding();
}
