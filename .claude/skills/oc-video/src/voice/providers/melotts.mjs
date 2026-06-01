export const melottsProvider = {
  async status() {
    return {
      ok: false,
      provider: "melotts",
      error: "MeloTTS provider is scaffolded but not installed. Use Piper or manual voiceover for now.",
    };
  },
  async synthesize() {
    throw new Error("MeloTTS provider scaffold exists, but generation is not implemented yet.");
  },
};
