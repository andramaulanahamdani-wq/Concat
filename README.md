# Concat assets

The files Concat downloads on demand, kept apart from the code so the app
stays small.

- `audio/` - the Audio page's Concat shelf: sound effects and short music
  beds, every one synthesised from nothing by
  [`scripts/sfx/generate.py`](https://github.com/andramaulanahamdani-wq/Concat/blob/feat/creator-pack/scripts/sfx/generate.py)
  and released under CC0 1.0. `audio/manifest.json` lists them with their
  SHA-256 digests; the format is `docs/AUDIO_LIBRARY.md`.
