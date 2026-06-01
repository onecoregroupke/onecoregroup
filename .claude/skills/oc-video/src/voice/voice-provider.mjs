import { piperProvider } from "./providers/piper.mjs";
import { melottsProvider } from "./providers/melotts.mjs";
import { manualProvider } from "./providers/manual.mjs";
import { externalApiProvider } from "./providers/external-api.mjs";

const providers = {
  piper: piperProvider,
  melotts: melottsProvider,
  manual: manualProvider,
  external_api: externalApiProvider,
};

export function providerFor(name) {
  return providers[name] || null;
}

export async function providerStatus(profile) {
  const provider = providerFor(profile?.provider);
  if (!provider) return { ok: false, provider: profile?.provider || "missing", error: "Unknown voice provider." };
  return provider.status(profile);
}
