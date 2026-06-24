export const externalApiProvider = {
  async status() {
    return {
      ok: false,
      provider: "external_api",
      error: "External API provider is scaffold-only. Configure a provider with confirmed commercial rights before use.",
    };
  },
  async synthesize() {
    throw new Error("External API provider is scaffold-only and has no default paid provider.");
  },
};
