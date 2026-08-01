# feedseed-web — Feedseed (Gemma3-270M) for the browser

OpenCairn's own fine-tuned function-calling model, converted to run **in the
browser on WebGPU** via transformers.js. This is the "download the full app —
including the model — from a URL, no store, no cloud" path (see
`../../feedseedBackend.js`).

## What's here (committed)

| file | role |
|---|---|
| `config.json` | Gemma3 (`gemma3_text` / `Gemma3ForCausalLM`) architecture |
| `generation_config.json` | decode defaults |
| `tokenizer.json` | the fast tokenizer (48k vocab-trimmed) |
| `tokenizer_config.json` | **chat template embedded here** (the FunctionGemma Gemma3 template) + fast-tokenizer class |
| `chat_template.jinja` | reference copy of the template |

## What's NOT committed (hosted — `.gitignore`d)

| file | size | dtype | notes |
|---|---|---|---|
| `onnx/model_fp16.onnx` | 310 MB | fp16, **no weight quant** | **the only shipped dtype** (WebGPU) |

`feedseedBackend.js` loads `fp16` only (`CFG.dtypes = ['fp16']`). At deploy,
**upload the `onnx/` directory to the same origin as the PWA** so it's fetched
same-origin (CSP-clean) and cached by transformers.js's browser cache for
offline reuse. If a device's WebGPU stack can't load fp16, the edgeAI cascade
falls through to the deterministic rule parser — **not** to a 4-bit model.

### Why fp16 and not 4-bit (MEASURED)

Re-measured the A/B tool-selection set (25 cases) through each ONNX dtype via
onnxruntime, unconstrained (the grammar fixes *structure*, not *which tool*):

| dtype | size | A/B tool-match | verdict |
|---|---|---|---|
| fp32 / fp16 (no weight quant) | 310 MB | ~24/25 (native-equivalent) | **ship this** |
| q4 / q4f16 (4-bit matmul) | 137–197 MB | **4/25 (16%)** | unusable |

A 270M model has too little weight redundancy for 4-bit: RTN quant noise plus the
negative-heavy training collapses borderline cases to `{"calls":[]}`. The crude
q4/q4f16 quant — not the model — was the source of the old browser 64%. fp16 is
mandatory here.

## How it was built (on the GPU box, CPU-only steps)

1. `optimum` ONNX export of `feedseed-v2t-merged` (gemma3_text, gold+augmented+
   Oak-distilled, vocab-trimmed 48k) → `model.onnx` (fp32).
2. `onnxconverter_common.float16` (`keep_io_types`) → `model_fp16.onnx`.
3. tokenizer + configs copied; chat template embedded in `tokenizer_config.json`.
   (A `MatMulNBitsQuantizer` 4-bit `model_q4.onnx` was produced and measured, then
   dropped from the ship list — see the table above.)

## Model v2s (this build)

SFT of the gold-trim model (2 epochs) on **gold (1878) + augmented (716:
hard-negatives/get_location/check_off_route/volume/query + 53 injury/emergency
positives) + Oak-distilled (3160)**, served with a system prompt that keeps the
negative guardrail (chit-chat/weather/venting → empty) AND mandates
`dial_emergency(service:sos)` on any clear injury / call-for-help / SOS / rescue
(train==serve, verified byte-identical to
`feedseedBackend.FEEDSEED_SYSTEM_PROMPT`).

Native results (MEASURED): A/B **25/25 (100%)**, hiking-eval **97.9%** (47/48),
fc-backtest realname **74.5%** (149/200). The v2 safety regression is FIXED — the
model itself now fires `dial_emergency` on "SOS I broke my ankle" and all 8
coordinator-listed injury variants; negatives held 6/6 (no false-positive
regression). Trade-off vs the interim v2 (100% / 78.5%): the emergency data +
softened prompt cost ~1 hiking enum case and ~4pts realname, both still above the
original pre-project baseline (91.7% / 70.5%). Residual gap: 4 indirect,
keyword-less emergencies ("chest pains", "friend passed out") still miss — caught
by neither the model nor the rule parser.

## Honest note on quality

Grammar-constrained (GBNF) decoding still runs in the browser
(`grammarDecode.mjs`) for 100% valid JSON + real tool + real retrieved name, and
retrieval grounding (`retrieval_decode.mjs`) remains the name guarantee. What the
grammar CANNOT fix is *semantic tool selection* — which is exactly what fp16 (vs
4-bit) and the v2 data preserve.
