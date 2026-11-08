#!/usr/bin/env python3
"""Transcribe un audio (nota de voz de WhatsApp) a texto con faster-whisper.

Uso: python3 transcribe.py <archivo-de-audio>
Imprime el texto transcrito por stdout (una sola línea).
Si no entiende nada, no imprime nada.
"""
import sys
import wave
import numpy as np


def main():
    if len(sys.argv) < 2:
        return
    audio_path = sys.argv[1]
    # Cargar el audio como float32 (evita el problema de av.open con algunos ogg)
    try:
        from faster_whisper import WhisperModel
        import subprocess
        # Convertir a wav 16k mono con ffmpeg (WhatsApp manda ogg/opus)
        wav_path = audio_path + ".wav"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", audio_path,
             "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav_path],
            check=True,
        )
        with wave.open(wav_path) as w:
            n = w.getnframes()
            audio = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(audio, language="es", vad_filter=False)
        text = " ".join(s.text.strip() for s in segments).strip()
        if text:
            print(text)
    except Exception:
        pass


if __name__ == "__main__":
    main()
