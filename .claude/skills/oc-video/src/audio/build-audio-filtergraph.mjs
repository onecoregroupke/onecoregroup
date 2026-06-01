export function buildAudioFiltergraph({ hasVoice = false, hasMusic = false, targetLufs = -14, truePeak = -1 } = {}) {
  if (!hasVoice && !hasMusic) {
    return { filter: `anullsrc=r=48000:cl=stereo,loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=11`, outputLabel: "aout" };
  }
  if (hasVoice && hasMusic) {
    return {
      filter: `[1:a]volume=0.20[music];[0:a]highpass=f=80,acompressor=threshold=-18dB:ratio=2.5[voice];[music][voice]sidechaincompress=threshold=0.04:ratio=8:attack=80:release=800[ducked];[voice][ducked]amix=inputs=2:duration=longest,loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=11[aout]`,
      outputLabel: "aout"
    };
  }
  return { filter: `loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=11`, outputLabel: "aout" };
}
