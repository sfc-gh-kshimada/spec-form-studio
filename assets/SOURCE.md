# Japanese PDF Font

Noto Sans JP, SIL Open Font License 1.1.

- Upstream: https://github.com/google/fonts/tree/main/ofl/notosansjp
- License: OFL.txt in this directory.
- Downloaded unchanged. No customer content sent to upstream.
- Server-side only. Never put these assets or customer templates in public/.

## NotoSansJP.ttf

Upstream variable font, kept as the provenance of the derived instance below.

- Git blob: cdd8f083c1f5928ff3361f8cda4d3fc9462cbe89
- SHA-256: c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f
- Variable: `wght` axis, default named instance `Thin`.

## NotoSansJP-Regular.ttf

The PDF renderer uses this file, not the variable font. Two reasons, both measured:
the variable font's default instance is Thin, which is too light for a 7pt form
label; and its `wght` axis has no effect once embedded, so the weight cannot be
chosen at render time.

- SHA-256: d3f69013f5a411101fbd9b895db9996f9149718ec4811c01c4cae18ca182ee69
- Derived locally from NotoSansJP.ttf, no other input:
  `fonttools varLib.instancer -o assets/NotoSansJP-Regular.ttf assets/NotoSansJP.ttf wght=400`
- fontTools 4.65.0.
