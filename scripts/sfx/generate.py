#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
"""The Concat sound library's sound effects, synthesised from nothing.

Every sound here is made by this script from noise, oscillators and
filters - no recording, no sample from anywhere - so the whole set is
CC0: anyone may use it for anything. Run it again and the same files come
out, bit for bit (the noise is seeded), which is what lets the manifest's
digests be checked.

    python3 scripts/sfx/generate.py OUT_DIR

writes `<id>.ogg` for every sound and `manifest.json` in the shape
docs/AUDIO_LIBRARY.md describes. Needs numpy, scipy and ffmpeg (with
libvorbis) on the PATH.
"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

RATE = 48000
SOURCE = "https://github.com/andramaulanahamdani-wq/Concat/blob/main/scripts/sfx/generate.py"


# ── building blocks ──────────────────────────────────────────────────────


def rng(seed):
    return np.random.default_rng(seed)


def t_of(seconds):
    return np.arange(int(seconds * RATE)) / RATE


def noise(seconds, seed):
    return rng(seed).standard_normal(int(seconds * RATE))


def brown(seconds, seed):
    x = np.cumsum(noise(seconds, seed))
    x = x - np.convolve(x, np.ones(4801) / 4801, mode="same")
    return x / (np.max(np.abs(x)) + 1e-9)


def lowpass(x, hz, order=2):
    return sosfilt(butter(order, min(hz, RATE * 0.45), "low", fs=RATE, output="sos"), x)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=RATE, output="sos"), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, RATE * 0.45)], "band", fs=RATE, output="sos"), x)


def sweep_filter(x, start_hz, end_hz, q=4.0, curve=1.0, blocks=200):
    """A resonant band-pass whose centre glides from start to end."""
    out = np.zeros_like(x)
    n = len(x)
    size = max(1, n // blocks)
    zi = None
    for i in range(0, n, size):
        frac = (i / max(1, n - 1)) ** curve
        f = start_hz * (end_hz / start_hz) ** frac
        bw = f / q
        b, a = butter(2, [max(20, f - bw / 2), min(RATE * 0.45, f + bw / 2)], "band", fs=RATE)
        if zi is None or len(zi) != max(len(a), len(b)) - 1:
            zi = np.zeros(max(len(a), len(b)) - 1)
        out[i : i + size], zi = lfilter(b, a, x[i : i + size], zi=zi)
    return out


def env_ad(n_or_t, attack, decay, curve=3.0):
    t = n_or_t if isinstance(n_or_t, np.ndarray) else t_of(n_or_t)
    e = np.where(t < attack, t / max(attack, 1e-6), np.exp(-(t - attack) * curve / max(decay, 1e-6)))
    return e


def env_swell(seconds, peak=0.6, power=2.0):
    """Up to a peak at `peak` of the way, then down."""
    t = t_of(seconds) / seconds
    return np.where(t < peak, (t / peak) ** power, ((1 - t) / (1 - peak)) ** 1.2)


def fade(x, inn=0.01, out=0.05):
    n = len(x)
    a, b = int(inn * RATE), int(out * RATE)
    shape = (-1, 1) if x.ndim == 2 else (-1,)
    if a:
        x[:a] *= np.linspace(0, 1, a).reshape(shape)
    if b:
        x[-b:] *= np.linspace(1, 0, b).reshape(shape)
    return x


def sine(freq, seconds, phase=0.0):
    t = t_of(seconds)
    if callable(freq):
        f = freq(t)
        return np.sin(2 * np.pi * np.cumsum(f) / RATE + phase)
    return np.sin(2 * np.pi * freq * t + phase)


def saw(freq, seconds, seed=0):
    t = t_of(seconds)
    f = freq(t) if callable(freq) else np.full_like(t, freq)
    ph = np.cumsum(f) / RATE + rng(seed).random()
    return 2 * (ph - np.floor(ph + 0.5))


def reverb(x, seconds=2.0, wet=0.35, damp=4000):
    """A small Schroeder reverb: four combs into two all-passes."""
    out = np.zeros(len(x) + int(seconds * RATE))
    src = np.concatenate([x, np.zeros(int(seconds * RATE))])
    for d_ms in (29.7, 37.1, 41.1, 43.7):
        d = int(d_ms * RATE / 1000)
        g = 10 ** (-3 * d / (seconds * RATE))
        a = np.zeros(d + 1)
        a[0], a[d] = 1, -g
        out += lfilter([1], a, lowpass(src, damp, 1))
    for d_ms, g in ((5.0, 0.7), (1.7, 0.7)):
        d = int(d_ms * RATE / 1000)
        b = np.zeros(d + 1)
        a = np.zeros(d + 1)
        b[0], b[d] = -g, 1
        a[0], a[d] = 1, -g
        out = lfilter(b, a, out)
    out /= np.max(np.abs(out)) + 1e-9
    dry = np.concatenate([x, np.zeros(int(seconds * RATE))])
    dry /= np.max(np.abs(dry)) + 1e-9
    return (1 - wet) * dry + wet * out


def stereo(left, right=None, width=0.3, seed=0):
    if right is None:
        d = int(0.011 * RATE)
        right = np.concatenate([np.zeros(d), left[:-d]]) if len(left) > d else left
        right = (1 - width) * left + width * right
    return np.stack([left, right], axis=1)


def norm(x, peak_db=-1.0):
    peak = 10 ** (peak_db / 20)
    return x / (np.max(np.abs(x)) + 1e-9) * peak


# ── the sounds ───────────────────────────────────────────────────────────

SOUNDS = []


def sound(id, name, category, loop=False):
    def register(fn):
        SOUNDS.append((id, name, category, fn))
        return fn

    return register


# Whoosh


@sound("whoosh-short", "Whoosh, short", "Whoosh")
def _():
    s = 0.7
    x = sweep_filter(noise(s, 1), 300, 3000, q=2.5) * env_swell(s, 0.55)
    return fade(x)


@sound("whoosh-long", "Whoosh, long", "Whoosh")
def _():
    s = 1.6
    x = sweep_filter(noise(s, 2), 200, 2500, q=2.0, curve=0.8) * env_swell(s, 0.6, 2.5)
    return stereo(fade(x), width=0.5)


@sound("whoosh-deep", "Whoosh, deep", "Whoosh")
def _():
    s = 1.2
    x = sweep_filter(noise(s, 3), 80, 900, q=1.5) * env_swell(s, 0.6)
    x += 0.4 * sine(lambda t: 60 + 40 * t, s) * env_swell(s, 0.6)
    return fade(x)


@sound("swoosh-fast", "Swoosh, fast", "Whoosh")
def _():
    s = 0.35
    x = sweep_filter(noise(s, 4), 800, 6000, q=3.0) * env_swell(s, 0.4, 1.5)
    return fade(x, 0.003, 0.03)


@sound("reverse-whoosh", "Reverse whoosh", "Whoosh")
def _():
    s = 1.4
    x = sweep_filter(noise(s, 5), 4000, 300, q=2.0) * env_swell(s, 0.9, 3.0)
    return fade(x, 0.01, 0.01)


@sound("air-swipe", "Air swipe", "Whoosh")
def _():
    s = 0.5
    x = bandpass(noise(s, 6), 1500, 7000) * env_swell(s, 0.35, 1.2)
    return fade(x, 0.002, 0.04)


@sound("sweep-up", "Transition sweep up", "Whoosh")
def _():
    s = 1.0
    x = sweep_filter(noise(s, 7), 200, 8000, q=5.0, curve=1.5) * env_swell(s, 0.85, 1.5)
    return fade(x)


@sound("sweep-down", "Transition sweep down", "Whoosh")
def _():
    s = 1.0
    x = sweep_filter(noise(s, 8), 8000, 150, q=5.0, curve=0.6) * env_swell(s, 0.2, 1.0)
    return fade(x)


@sound("glitch-whoosh", "Glitch whoosh", "Whoosh")
def _():
    s = 0.8
    x = sweep_filter(noise(s, 9), 300, 5000, q=2.5) * env_swell(s, 0.5)
    gate = np.repeat(rng(9).random(int(s * 60) + 1) > 0.3, RATE // 60)[: len(x)]
    crush = np.round(x * 8) / 8
    return fade(np.where(gate, crush, x * 0.2))


@sound("wind-gust", "Wind gust", "Whoosh")
def _():
    s = 2.5
    x = sweep_filter(noise(s, 10), 250, 900, q=6.0, curve=0.5) * env_swell(s, 0.45, 1.5)
    return stereo(fade(x), width=0.6)


# Impact


@sound("boom-cinematic", "Cinematic boom", "Impact")
def _():
    s = 4.0
    t = t_of(s)
    sub = sine(lambda t: 30 + 70 * np.exp(-t * 6), s) * env_ad(t, 0.005, 2.5, 3)
    crack = lowpass(noise(s, 11), 1800) * env_ad(t, 0.001, 0.25, 6)
    return stereo(fade(reverb(sub + 0.6 * crack, 3.0, 0.4, 1500)[: len(t)], 0.0, 0.5))


@sound("sub-drop", "Sub drop", "Impact")
def _():
    s = 3.0
    t = t_of(s)
    x = sine(lambda t: 25 + 95 * np.exp(-t * 2.2), s) * env_ad(t, 0.01, 2.0, 2.5)
    return fade(np.tanh(x * 1.6))


@sound("hit-metal", "Metal hit", "Impact")
def _():
    s = 2.5
    t = t_of(s)
    x = sum(sine(f, s) * env_ad(t, 0.001, d, 3) * a for f, d, a in
            ((412, 1.8, 1.0), (1063, 1.1, 0.6), (1870, 0.7, 0.4), (2940, 0.4, 0.3), (5210, 0.2, 0.2)))
    x += bandpass(noise(s, 12), 2000, 9000) * env_ad(t, 0.0005, 0.03, 5) * 0.8
    return fade(reverb(x, 2.0, 0.3)[: len(t)], 0, 0.3)


@sound("knock-wood", "Wood knock", "Impact")
def _():
    s = 0.6
    t = t_of(s)
    one = sine(220, s) * env_ad(t, 0.0005, 0.06, 5) + bandpass(noise(s, 13), 600, 2500) * env_ad(t, 0.0003, 0.02, 5)
    x = one.copy()
    gap = int(0.18 * RATE)
    x[gap:] += 0.8 * one[:-gap]
    return fade(reverb(x, 0.8, 0.2)[: len(t)], 0, 0.05)


@sound("door-slam", "Heavy door slam", "Impact")
def _():
    s = 2.5
    t = t_of(s)
    x = lowpass(noise(s, 14), 700) * env_ad(t, 0.002, 0.12, 4)
    x += sine(lambda t: 55 + 30 * np.exp(-t * 20), s) * env_ad(t, 0.002, 0.4, 4)
    return fade(reverb(x, 2.2, 0.45, 2500)[: len(t)], 0, 0.4)


@sound("braam", "Horror braam", "Impact")
def _():
    s = 4.0
    t = t_of(s)
    x = sum(saw(f * (1 + 0.004 * k), s, k) for k, f in enumerate((49, 49.5, 98.3, 73.4)))
    x = lowpass(x, 900, 4) * env_ad(t, 0.04, 3.0, 2.2)
    return stereo(fade(np.tanh(reverb(x, 3.0, 0.35, 1200)[: len(t)] * 2), 0, 0.6), width=0.5)


@sound("jump-scare", "Jump scare stinger", "Impact")
def _():
    s = 2.5
    t = t_of(s)
    cluster = sum(saw(f, s, k) for k, f in enumerate((311, 329.6, 349.2, 466.2, 493.9, 622.3)))
    x = highpass(cluster, 200) * env_ad(t, 0.003, 1.4, 3)
    x += highpass(noise(s, 15), 3000) * env_ad(t, 0.001, 0.3, 4) * 1.5
    x += sine(lambda t: 40 + 60 * np.exp(-t * 10), s) * env_ad(t, 0.002, 0.8, 3) * 2
    return stereo(fade(np.tanh(reverb(x, 2.0, 0.35)[: len(t)] * 1.5), 0, 0.5), width=0.4)


@sound("heartbeat", "Heartbeat, single", "Impact")
def _():
    s = 1.0
    t = t_of(s)
    beat = lambda at, amp: sine(lambda t: 45 + 25 * np.exp(-np.maximum(t - at, 0) * 30), s) * env_ad(np.maximum(t - at, 0), 0.008, 0.12, 4) * (t >= at) * amp
    return fade(lowpass(beat(0.02, 1.0) + beat(0.3, 0.7), 300), 0, 0.1)


@sound("camera-shutter", "Camera shutter", "Impact")
def _():
    s = 0.35
    t = t_of(s)
    click = lambda at: bandpass(noise(s, int(at * 1000) + 16), 1500, 8000) * env_ad(np.maximum(t - at, 0), 0.0003, 0.012, 5) * (t >= at)
    return fade(click(0.0) + 0.8 * click(0.09), 0, 0.02)


@sound("typewriter-key", "Typewriter key", "Impact")
def _():
    s = 0.25
    t = t_of(s)
    x = bandpass(noise(s, 17), 1200, 6000) * env_ad(t, 0.0003, 0.015, 5)
    x += sine(1800, s) * env_ad(t, 0.0005, 0.03, 5) * 0.3
    return fade(x, 0, 0.02)


@sound("clock-tick", "Clock tick", "Impact")
def _():
    s = 0.2
    t = t_of(s)
    x = bandpass(noise(s, 18), 2500, 9000) * env_ad(t, 0.0002, 0.008, 5) + sine(3200, s) * env_ad(t, 0.0003, 0.02, 5) * 0.4
    return fade(x, 0, 0.02)


@sound("bell-toll", "Bell toll", "Impact")
def _():
    s = 7.0
    t = t_of(s)
    base = 110.0
    partials = ((0.5, 5.5, 0.6), (1.0, 4.5, 1.0), (1.2, 3.5, 0.6), (1.5, 3.0, 0.5), (2.0, 2.4, 0.4), (2.5, 1.6, 0.25), (3.0, 1.2, 0.2), (4.2, 0.7, 0.15))
    x = sum(sine(base * r * (1 + 0.0015 * i), s) * env_ad(t, 0.002, d, 2.5) * a for i, (r, d, a) in enumerate(partials))
    return stereo(fade(reverb(x, 3.5, 0.35, 3000)[: len(t)], 0, 1.0), width=0.4)


@sound("glass-ping", "Glass ping", "Impact")
def _():
    s = 2.0
    t = t_of(s)
    x = sum(sine(f, s) * env_ad(t, 0.001, d, 3) * a for f, d, a in ((2093, 1.5, 1.0), (5340, 0.6, 0.4), (8120, 0.3, 0.2)))
    return fade(reverb(x, 1.5, 0.25)[: len(t)], 0, 0.3)


@sound("thud-low", "Low thud", "Impact")
def _():
    s = 1.2
    t = t_of(s)
    x = sine(lambda t: 50 + 50 * np.exp(-t * 25), s) * env_ad(t, 0.002, 0.35, 4) + lowpass(noise(s, 19), 400) * env_ad(t, 0.001, 0.06, 5)
    return fade(np.tanh(x * 1.4), 0, 0.2)


# Riser


@sound("riser-noise", "Noise riser", "Riser")
def _():
    s = 4.0
    t = t_of(s) / s
    x = sweep_filter(noise(s, 20), 200, 9000, q=1.5, curve=2.0) * (t ** 2)
    return stereo(fade(x, 0.05, 0.01), width=0.5)


@sound("riser-tone", "Tone riser", "Riser")
def _():
    s = 4.0
    t = t_of(s) / s
    x = sum(saw(lambda tt, m=m: m * (80 * 2 ** (tt / 4.0 * 2.5)), 4.0, k) for k, m in enumerate((1.0, 1.005, 2.0)))
    x = lowpass(x, 3000, 2) * (t ** 1.8)
    return stereo(fade(x, 0.05, 0.01), width=0.5)


@sound("riser-tension", "Tension riser", "Riser")
def _():
    s = 6.0
    t = t_of(s) / s
    x = np.zeros(len(t))
    for k in range(6):
        ph = (t * 1.2 + k / 6) % 1.0
        f = 60 * 2 ** (ph * 6)
        x += sine(lambda tt, k=k: 60 * 2 ** ((((tt / s) * 1.2 + k / 6) % 1.0) * 6), s) * np.sin(np.pi * ph) ** 2
    x *= t ** 1.5
    return stereo(fade(lowpass(x, 4000), 0.1, 0.02), width=0.4)


@sound("riser-horror", "Horror riser", "Riser")
def _():
    s = 5.0
    t = t_of(s) / s
    x = sum(saw(lambda tt, f=f: f * (1 + 0.5 * (tt / 5.0) ** 2), 5.0, k) for k, f in enumerate((220, 233.1, 311.1, 329.6)))
    x = bandpass(x, 300, 5000) * (t ** 2.2)
    x *= 1 + 0.3 * np.sin(2 * np.pi * (4 + 10 * t) * t_of(s))
    return stereo(fade(np.tanh(x), 0.1, 0.02), width=0.5)


@sound("reverse-cymbal", "Reverse cymbal", "Riser")
def _():
    s = 3.0
    t = t_of(s)
    x = highpass(noise(s, 21), 4000) * env_ad(t, 0.001, 2.5, 3)
    return stereo(fade(reverb(x, 1.5, 0.3)[: len(t)][::-1].copy(), 0.05, 0.005), width=0.6)


@sound("suspense-build", "Suspense build", "Riser")
def _():
    s = 8.0
    t = t_of(s)
    pulse_rate = 1.2 + 3.5 * (t / s) ** 2
    beat = (np.sin(2 * np.pi * np.cumsum(pulse_rate) / RATE) > 0.95).astype(float)
    kick = lowpass(beat, 120, 2) * 30
    pad = lowpass(sum(saw(f, s, k) for k, f in enumerate((55, 55.3, 82.4))), 500) * (t / s) ** 1.5
    return stereo(fade(np.tanh(kick + pad), 0.1, 0.05), width=0.3)


@sound("energy-charge", "Energy charge", "Riser")
def _():
    s = 2.5
    t = t_of(s) / s
    x = sine(lambda tt: 200 * 2 ** (tt / 2.5 * 3), s) * (t ** 1.5)
    x += bandpass(noise(s, 22), 2000, 8000) * (t ** 3) * 0.4
    x *= 1 + 0.5 * np.sin(2 * np.pi * 30 * t_of(s))
    return fade(x, 0.02, 0.01)


@sound("uplifter", "Uplifter", "Riser")
def _():
    s = 3.0
    t = t_of(s) / s
    x = sweep_filter(noise(s, 23), 500, 12000, q=3.0, curve=1.2) * (t ** 1.5)
    x += sine(lambda tt: 300 * 2 ** (tt / 3.0 * 2), s) * (t ** 2) * 0.3
    return stereo(fade(x, 0.05, 0.01), width=0.5)


# Ambience


@sound("drone-dark", "Dark drone", "Ambience")
def _():
    s = 20.0
    t = t_of(s)
    x = sum(saw(f, s, k) for k, f in enumerate((41.2, 41.5, 61.7, 82.4)))
    x = lowpass(x, 300 + 150 * np.sin(2 * np.pi * 0.05 * t).mean(), 4)
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * t)
    return stereo(fade(x, 2.0, 2.0), width=0.6)


@sound("drone-ominous", "Ominous drone", "Ambience")
def _():
    s = 20.0
    t = t_of(s)
    x = sine(55, s) + sine(55.7, s) + 0.5 * sine(110.9, s) + 0.3 * sine(164.8, s)
    x += 0.4 * lowpass(brown(s, 24), 200)
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.07 * t)
    return stereo(fade(x, 2.0, 2.0), width=0.5)


@sound("wind-howling", "Howling wind", "Ambience")
def _():
    s = 20.0
    t = t_of(s)
    gust = 0.5 + 0.5 * np.sin(2 * np.pi * 0.09 * t + np.sin(2 * np.pi * 0.031 * t) * 3)
    left = sweep_filter(noise(s, 25), 300, 600, q=8.0) * gust + 0.3 * lowpass(noise(s, 26), 500)
    right = sweep_filter(noise(s, 27), 340, 520, q=8.0) * gust[::-1] + 0.3 * lowpass(noise(s, 28), 500)
    return fade(stereo(left, right), 2.0, 2.0)


@sound("rain", "Rain", "Ambience")
def _():
    s = 20.0
    hiss = bandpass(noise(s, 29), 800, 9000) * 0.4
    drops = (rng(30).random(int(s * RATE)) > 0.9993).astype(float)
    drops = bandpass(drops * rng(31).random(len(drops)), 2000, 8000) * 6
    x = hiss + drops
    return stereo(fade(x, 1.5, 1.5), bandpass(noise(s, 32), 800, 9000) * 0.4 + np.roll(drops, 977), 0)


@sound("tv-static", "TV static", "Ambience")
def _():
    s = 8.0
    x = highpass(noise(s, 33), 500) * (0.85 + 0.15 * np.sin(2 * np.pi * 60 * t_of(s)))
    return fade(x, 0.05, 0.3)


@sound("radio-tuning", "Radio tuning", "Ambience")
def _():
    s = 6.0
    t = t_of(s)
    x = bandpass(noise(s, 34), 400, 4000) * 0.6
    whistle = sine(lambda tt: 900 + 700 * np.sin(2 * np.pi * 0.4 * tt), s) * (np.sin(2 * np.pi * 0.7 * t) > 0.6) * 0.5
    x = bandpass(x + whistle, 300, 3500)
    return fade(np.round(x * 24) / 24, 0.05, 0.3)


@sound("room-tone-eerie", "Eerie room tone", "Ambience")
def _():
    s = 20.0
    t = t_of(s)
    x = 0.6 * lowpass(brown(s, 35), 400) + 0.08 * sine(60, s) + 0.05 * sine(120.5, s)
    x += 0.15 * bandpass(noise(s, 36), 2000, 4000) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t))
    return stereo(fade(x, 2.0, 2.0), width=0.5)


@sound("heartbeat-loop", "Heartbeat loop", "Ambience")
def _():
    s = 8.0
    t = t_of(s)
    x = np.zeros(len(t))
    for start in np.arange(0, s - 0.5, 0.85):
        for at, amp in ((0.0, 1.0), (0.26, 0.7)):
            tt = t - start - at
            x += sine(lambda u: 45 + 25 * np.exp(-np.maximum(u - start - at, 0) * 30), s) * env_ad(np.maximum(tt, 0), 0.008, 0.12, 4) * (tt >= 0) * amp
    return fade(lowpass(x, 300), 0.02, 0.2)


@sound("clock-ticking", "Clock ticking", "Ambience")
def _():
    s = 10.0
    t = t_of(s)
    x = np.zeros(len(t))
    for k, start in enumerate(np.arange(0, s, 0.5)):
        tt = t - start
        pitch = 3200 if k % 2 == 0 else 2700
        x += (sine(pitch, s) * 0.4 + bandpass(noise(s, 37 + k % 2), 2500, 9000)) * env_ad(np.maximum(tt, 0), 0.0003, 0.01, 5) * (tt >= 0)
    return fade(reverb(x, 0.6, 0.15)[: len(t)], 0.01, 0.1)


@sound("fire-crackle", "Fire crackle", "Ambience")
def _():
    s = 15.0
    roar = lowpass(brown(s, 38), 300) * 0.6
    pops = (rng(39).random(int(s * RATE)) > 0.9997).astype(float) * rng(40).random(int(s * RATE))
    pops = bandpass(pops, 1500, 7000) * 10
    return stereo(fade(roar + pops, 1.0, 1.0), roar + np.roll(pops, 1777), 0)


@sound("cave-drips", "Cave drips", "Ambience")
def _():
    s = 15.0
    t = t_of(s)
    x = 0.15 * lowpass(brown(s, 41), 150)
    r = rng(42)
    for start in np.cumsum(r.uniform(0.6, 2.2, 20)):
        if start > s - 1:
            break
        tt = t - start
        f = r.uniform(900, 2200)
        x += sine(lambda u, f=f, start=start: f * (1 + 0.6 * np.exp(-np.maximum(u - start, 0) * 40)), s) * env_ad(np.maximum(tt, 0), 0.001, 0.06, 4) * (tt >= 0) * 0.5
    return stereo(fade(reverb(x, 3.0, 0.5, 3000)[: len(t)], 1.0, 1.0), width=0.6)


@sound("underwater", "Underwater rumble", "Ambience")
def _():
    s = 15.0
    t = t_of(s)
    x = lowpass(brown(s, 43), 250) + 0.3 * lowpass(noise(s, 44), 600) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.2 * t))
    return stereo(fade(x, 1.0, 1.0), width=0.5)


@sound("night-crickets", "Night crickets", "Ambience")
def _():
    s = 15.0
    t = t_of(s)
    chirp = (np.sin(2 * np.pi * 18 * t) > 0.2) * (np.sin(2 * np.pi * 0.6 * t) > -0.2)
    x = sine(4300, s) * chirp * 0.25 + sine(4650, s) * np.roll(chirp, 7311) * 0.15
    x += 0.05 * lowpass(brown(s, 45), 400)
    return stereo(fade(x, 1.0, 1.0), width=0.6)


# Music


def chord_pad(seconds, roots, seed, cutoff=900, detune=0.006):
    t = t_of(seconds)
    per = seconds / len(roots)
    x = np.zeros(len(t))
    for i, notes in enumerate(roots):
        seg = (t >= i * per) & (t < (i + 1) * per + 0.5)
        local = np.clip((t - i * per) / 0.8, 0, 1) * np.clip(((i + 1) * per + 0.5 - t) / 0.8, 0, 1)
        for k, f in enumerate(notes):
            for d in (-detune, 0, detune):
                x += saw(f * (1 + d), seconds, seed + k) * local * seg
    return lowpass(x, cutoff, 4)


@sound("dark-pad", "Dark ambient pad", "Music")
def _():
    s = 32.0
    x = chord_pad(s, [(55, 82.4, 130.8), (49, 73.4, 116.5), (43.7, 65.4, 103.8), (49, 73.4, 110)], 46, 700)
    return stereo(fade(reverb(x, 4.0, 0.4, 1500)[: int(s * RATE)], 2.0, 3.0), width=0.6)


@sound("mystery-pulse", "Mystery pulse", "Music")
def _():
    s = 24.0
    t = t_of(s)
    pad = chord_pad(s, [(110, 130.8, 164.8), (98, 116.5, 146.8), (87.3, 103.8, 130.8), (98, 123.5, 146.8)], 47, 1100)
    beat = ((t * 2) % 1.0 < 0.03).astype(float)
    bass = sine(55, s) * lowpass(beat, 30, 1) * 40
    tick = highpass(noise(s, 48), 6000) * env_ad(((t * 4) % 1.0) / 4, 0.0005, 0.02, 5) * 0.15
    return stereo(fade(0.7 * pad + bass + tick, 1.0, 2.5), width=0.5)


@sound("fantasy-choir", "Fantasy choir pad", "Music")
def _():
    s = 30.0
    t = t_of(s)
    x = np.zeros(len(t))
    for notes in ((146.8, 220, 293.7, 349.2),):
        for k, f in enumerate(notes):
            vib = lambda tt, f=f, k=k: f * (1 + 0.004 * np.sin(2 * np.pi * (5 + k * 0.3) * tt))
            src = saw(vib, s, 49 + k)
            # "ah": formants near 700, 1100 and 2400 Hz.
            x += bandpass(src, 600, 800) + 0.6 * bandpass(src, 1000, 1250) + 0.25 * bandpass(src, 2200, 2700)
    x *= np.clip(t / 3, 0, 1)
    return stereo(fade(reverb(x, 4.5, 0.5, 4000)[: len(t)], 2.0, 3.0), width=0.7)


@sound("tension-strings", "Tension strings", "Music")
def _():
    s = 20.0
    t = t_of(s)
    x = np.zeros(len(t))
    for k, f in enumerate((196, 207.7, 293.7, 311.1)):
        trem = 0.6 + 0.4 * (np.sin(2 * np.pi * 9 * t + k) > 0)
        x += saw(lambda tt, f=f: f * (1 + 0.003 * np.sin(2 * np.pi * 5.5 * tt)), s, 50 + k) * trem
    x = bandpass(x, 200, 3500) * np.clip(t / 2, 0, 1)
    return stereo(fade(reverb(x, 2.5, 0.35)[: len(t)], 1.0, 2.0), width=0.5)


# ── writing them out ─────────────────────────────────────────────────────


def write_wav(path, x):
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    channels = 1 if x.ndim == 1 else x.shape[1]
    data = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as out:
        out.setnchannels(channels)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(data.tobytes())


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    listed = []
    for id, name, category, make in SOUNDS:
        x = make()
        x = norm(x, -1.5 if category != "Ambience" and category != "Music" else -6.0)
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, "s.wav")
            write_wav(wav, x)
            ogg = os.path.join(out_dir, f"{id}.ogg")
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "libvorbis", "-q:a", "4",
                 "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", ogg],
                check=True,
            )
        data = open(ogg, "rb").read()
        listed.append({
            "id": id,
            "name": name,
            "category": category,
            "file": f"{id}.ogg",
            "duration": round(len(x) / RATE, 2),
            "bytes": len(data),
            "license": "CC0-1.0",
            "source": SOURCE,
            "author": "Concat contributors (synthesised)",
            "sha256": hashlib.sha256(data).hexdigest(),
        })
        print(f"{id:22} {category:9} {len(x) / RATE:6.2f}s {len(data) // 1024:5d} KB")
    with open(os.path.join(out_dir, "manifest.json"), "w") as out:
        json.dump({"version": 1, "sounds": listed}, out, indent=2)
        out.write("\n")
    print(f"{len(listed)} sounds")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "audio")
