#!/usr/bin/env bash
# Generates the looping student ambience track used by the game and quiz.
# The source is synthesized locally so the asset has no licensing or network
# dependency. ffmpeg performs the final mono MP3 encode.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/public/audio"
OUT="$OUT_DIR/student-ambience.mp3"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT_DIR"

python3 - "$TMP/ambience.wav" <<'PY'
import math
import struct
import sys
import wave

RATE = 44_100
BAR = 4.0
BARS = 8
DURATION = BAR * BARS  # 32 seconds
SAMPLES = int(RATE * DURATION)
buffer = [0.0] * SAMPLES


def add_note(freq, start, duration, amplitude, attack=0.02, release=0.35, harmonic=0.0):
    """Adds a soft sine note with linear attack and cosine release."""
    first = int(start * RATE)
    count = int(duration * RATE)
    attack_samples = max(1, int(attack * RATE))
    release_samples = max(1, int(release * RATE))
    for index in range(count):
        position = first + index
        if position >= SAMPLES:
            break
        local = index / RATE
        envelope = 1.0
        if index < attack_samples:
            envelope = index / attack_samples
        remaining = count - index
        if remaining < release_samples:
            envelope *= 0.5 - 0.5 * math.cos(math.pi * remaining / release_samples)
        phase = 2.0 * math.pi * freq * local
        wave_value = math.sin(phase)
        if harmonic:
            wave_value += harmonic * math.sin(2.0 * phase)
        buffer[position] += amplitude * envelope * wave_value


# I - V - vi - IV in C major, repeated twice. Each entry is the chord's tones.
CHORDS = [
    (261.63, 329.63, 392.00),  # C major
    (196.00, 246.94, 293.66),  # G major
    (220.00, 261.63, 329.63),  # A minor
    (174.61, 220.00, 261.63),  # F major
]

for bar in range(BARS):
    root, third, fifth = CHORDS[bar % len(CHORDS)]
    start = bar * BAR

    # Warm sustained pad with a gentle detune for movement.
    for frequency in (root, third, fifth):
        add_note(frequency, start, BAR - 0.08, 0.045, attack=0.35, release=0.7)
        add_note(frequency * 1.004, start, BAR - 0.08, 0.02, attack=0.5, release=0.8)

    # Soft bass root one octave down.
    add_note(root / 2.0, start, BAR - 0.1, 0.06, attack=0.08, release=0.9)

    # Cheerful arpeggio: eighth notes over the chord, one octave up.
    pattern = [root, third, fifth, root * 2.0, fifth, third, root * 2.0, fifth]
    for step, frequency in enumerate(pattern):
        note_start = start + step * 0.5
        add_note(frequency, note_start, 1.1, 0.055, attack=0.012, release=0.45, harmonic=0.18)


# Normalize to about -6 dBFS and taper the first/last few milliseconds so the
# loop boundary never clicks.
peak = max(abs(value) for value in buffer) or 1.0
gain = 0.5 / peak
fade_samples = int(0.01 * RATE)
for index in range(SAMPLES):
    value = buffer[index] * gain
    if index < fade_samples:
        value *= index / fade_samples
    elif index >= SAMPLES - fade_samples:
        value *= (SAMPLES - index) / fade_samples
    buffer[index] = value

with wave.open(sys.argv[1], "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(RATE)
    output.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, value)) * 32767)) for value in buffer))
PY

ffmpeg -hide_banner -loglevel error -y \
  -i "$TMP/ambience.wav" \
  -ac 1 -codec:a libmp3lame -b:a 96k \
  -metadata title="Student ambience loop" \
  -metadata artist="opencode-class" \
  "$OUT"

echo "Wrote $OUT"
