# Piper

Install Piper locally and place approved `.onnx` voice models in `reference/voice/piper/voices`.

Configuration:

```env
PIPER_EXE=C:\path\to\piper.exe
PIPER_VOICE_MODEL=C:\path\to\voice.onnx
```

If `PIPER_VOICE_MODEL` is not set, the provider looks for the first `.onnx` file in `reference/voice/piper/voices`.
