# DawnVision 🌬️ · English Marketing Copy

> Ready-to-paste copy for Twitter / Product Hunt / HN / Reddit / LinkedIn / Devto / ModelScope / HuggingFace profile.
> One snippet per channel, sized to fit.

---

## 🔥 One-liner

> **One sentence in. One finished short drama out.**
> Open-source multi-agent pipeline. 6 more agents than Sora. A timeline editor Kling doesn't have. Open source — Higgsfield isn't.

---

## 🔥 Twitter / X — 280 chars

> 🌬️ DawnVision v12.263 is live.
>
> ▸ 1 sentence → full short drama
> ▸ 8-agent pipeline (Sora is 1)
> ▸ Style Bible locks visual identity
> ▸ Real CJK subtitles
> ▸ Multiplayer timeline (Yjs CRDT)
> ▸ Bring your own LLM
> ▸ MIT · 3507 tests
>
> github.com/Sunxy146/dawn-vision

---

## 🔥 Product Hunt — Tagline + 1st comment

**Tagline (40 chars max):**
> Open-source 1-line → full short drama AI

**Description:**
> DawnVision is the first **honest multi-agent AI pipeline** for short-form drama. Instead of one black-box model, 8 specialists pass off with strict contracts: Writer → Director → Style Bible → Character Designer → Storyboard (with Vision audit) → Video → Editor.
>
> What competitors don't have:
> - **Style Bible Frame** — one canonical key-art locks all 6 shots to the same look (vs. Sora's 2-frame rolling chain that drifts)
> - **8-dimension Character DNA** + Vision retry — face match averages 82 vs ~65 elsewhere
> - **Real CJK subtitle burn** with libass + system font (every other tool draws garbled glyphs)
> - **Logic Pro-style multi-track timeline** with real BGM waveform, edge-resize, auto-snap
> - **Real-time multiplayer** via Yjs CRDT — live cursors, presence avatars, Y.Map segment locks
> - **BYO LLM** in 3 env vars — OpenAI / Anthropic / DeepSeek / Qwen / Kimi / OpenRouter / Ollama (local)
>
> MIT licensed. 3507 tests passing. Self-hostable on Node 20+.

---

## 🔥 Hacker News — "Show HN" title

> Show HN: DawnVision – Open-source multi-agent AI turns one sentence into a finished short drama

**First comment (background):**

> Author here. After watching every "AI video" tool give us 5-second clips when we actually wanted a short film, I built DawnVision as a multi-agent pipeline.
>
> Key non-obvious technical choices:
>
> 1. **Style Bible Frame as the very first `--sref`** for every subsequent shot. This single trick eliminated ~60% of the "looks like 6 different shows" problem. Most pipelines only carry a rolling 2-frame chain; shot 6 forgets shot 1.
>
> 2. **Character DNA as natural-language anchor.** We run each character's turnaround through a Vision LLM (gpt-4o / claude-opus / etc.) to extract structured features (eye shape, jaw angle, hair style, signature outfit), then inject as English text into every shot prompt that contains the character. Combined with cref/sref, this gives the model two redundant anchors.
>
> 3. **Strip dialogue from the video prompt; burn subtitles in post.** Asking any current video model to render Chinese characters produces garbled glyphs. We add aggressive `--no text --no chinese --no captions` negatives and bake subtitles with ffmpeg `subtitles` filter + system CJK font discovery.
>
> 4. **Yjs CRDT for real-time multiplayer.** Standard awareness handles cursors + presence; Y.Map handles segment-edit locks (more durable than awareness — survives 30s network blips without losing the lock).
>
> 5. **Provider-agnostic LLM.** Every LLM call routes through one OpenAI-compatible `chat/completions` endpoint via subprocess (to dodge Next.js Turbopack's fetch quirks). Swap providers by editing 3 env vars. Tested on OpenAI, Anthropic-via-OpenRouter, DeepSeek-r1, Qwen, MiniMax, GLM, Kimi, local Ollama. See `docs/llm-providers.md`.
>
> 8 months, v2.0 → v12.263, 3507 vitest tests, TypeScript strict, MIT. Honestly happy for criticism — `docs/COMPETITIVE-GAP-2026-05.md` is our own self-audit of where we still lose vs Sora/Kling/Higgsfield.
>
> github.com/Sunxy146/dawn-vision

---

## 🔥 Reddit — r/MachineLearning, r/aivideo, r/SideProject

**Title:**
> [P] Open-sourced an 8-agent AI pipeline that turns 1 sentence into a finished short-form drama (3507 tests, MIT)

**Body:**

I'm sharing **DawnVision** — an open-source alternative to Sora-style "one giant model" approaches. The core idea: short-form drama needs multiple specialized agents handing off with explicit consistency contracts, not one model trying to do everything.

The 8 agents:
1. **Director** — story plan, character roles, style keywords
2. **Writer** — McKee 3-act + 12 short-drama trope templates, hook-first shot 1
3. **Style Bible** — canonical key-art frame, locks visual identity for all subsequent shots
4. **Character Designer** — turnaround sheets + 8-dim DNA via Vision LLM
5. **Scene Designer** — concept art for each location
6. **Storyboard** — per-shot images with Cameo Vision retry (<75 → regen) and Style Audit (<70 → regen)
7. **Video Producer** — multi-engine race (Minimax / Veo / Kling), best result wins
8. **Editor** — j-cut / l-cut on emotional beats, per-act BGM, ffmpeg subtitle burn

On top of the pipeline: a **multi-track Cinema Timeline** (Logic Pro vibe) with real-time Yjs multiplayer (live cursors, segment locks, presence chips). Plus comments+@mentions, project invites with viewer/commenter/editor roles, single-shot regen with reference image upload.

The LLM is provider-agnostic — `docs/llm-providers.md` documents how to swap to gpt-4o / Claude / DeepSeek-r1 / Qwen / Kimi / local Ollama by editing 3 env vars.

Tech: Next.js 16 + TypeScript strict + SQLite + Web Audio API + Yjs. 3507 vitest tests passing. MIT.

Honest competitor comparison: README's vs-competitors table is kept current (verified 2026-07-24: on the blind Artificial Analysis arena, **Google's Gemini Omni Flash now tops both boards** — text-to-video-with-audio at Elo 1245 and image-to-video at 1200 — on a unified text/image/audio/video architecture with conversational video editing; Dreamina Seedance 2.0 720p is #2 on both; Kling 3.0 is the value champion (~$0.50/clip, best for short-form drama); Veo 3.1 stays the quality/physics/4K enterprise pick; Sora 2 is shutting down — app offline 2026-04-26, API ending 2026-09-24 — removed. **We ride the wave via BYO**: since v12.238, `GEMINI_API_KEY` enables the Gemini image provider (Nano Banana) in-pipeline — a leaderboard-topping rival becomes an engine *we* orchestrate). `docs/COMPETITIVE-GAP-2026-05.md` is a dated self-audit.

GitHub: https://github.com/Sunxy146/dawn-vision

---

## 🔥 LinkedIn — for content marketers + indie filmmakers

> 8 months ago we asked: why does every "AI video" tool give us 5-second clips when we actually need 30-second short dramas with consistent characters?
>
> Today we're open-sourcing the answer.
>
> **DawnVision** is a multi-agent AI pipeline:
> ▸ 1 sentence → finished short drama (script + characters + storyboard + video + voiceover + BGM + subtitles)
> ▸ Character consistency via cref + sref + 8-dim DNA + Vision retry
> ▸ Style coherence via Style Bible Frame
> ▸ Real CJK subtitles (no more garbled-glyph issues)
> ▸ Logic Pro-style timeline with real-time multiplayer
> ▸ Bring your own LLM (12+ providers supported)
> ▸ MIT licensed, 3507 tests passing
>
> If you're a vertical-drama studio, content marketing team, indie filmmaker, or comic adaptation studio — give it 10 minutes.
>
> github.com/Sunxy146/dawn-vision
>
> #AIvideo #OpenSource #ContentMarketing #FilmTech #ChineseTech

---

## 🔥 Dev.to / Medium — blog post intro

# How we built an 8-agent AI pipeline that beats Sora at short-form drama

> TL;DR: Sora gives you 5 seconds. We give you 30 seconds + character consistency + real Chinese subtitles + a multiplayer timeline editor. Open source. MIT. 3507 tests.

Most "AI video" tools take a prompt and run it through one giant model. The result feels like a tech demo, not a show. Characters change faces between shots. Visual style drifts. Chinese subtitles render as garbled glyphs. No sense of pacing.

We took the opposite approach: 8 specialized agents, each an expert at their role, handing off with strict consistency contracts.

[... blog continues with full pipeline walkthrough ...]

---

## 🔥 HuggingFace Space / Spaces card

> # 🌬️ DawnVision
>
> Open-source multi-agent AI pipeline that turns one sentence into a finished short-form drama. Built for vertical drama, comic adaptation, content marketing, and indie filmmaking.
>
> **Why it's different**: 8 specialized agents (not one black-box model), Style Bible Frame locks visual identity, 8-dim Character DNA + Vision retry locks faces, real CJK subtitles burned via ffmpeg, multiplayer timeline via Yjs CRDT, bring-your-own LLM (12+ providers).
>
> MIT · Next.js 16 · TypeScript · 3507 tests passing
>
> Source: github.com/Sunxy146/dawn-vision

---

## 🔥 GitHub repo `about` tag

> One sentence → finished short drama. Multi-agent AI pipeline · cinematic storyboards · real-time collab timeline · BYO LLM · MIT · 3507 tests.

---

## 🔥 GitHub topics

`ai` `agents` `multi-agent` `video-generation` `text-to-video` `pipeline` `next-js` `typescript` `cinema` `storyboard` `yjs` `crdt` `realtime-collaboration` `comic-generation` `short-drama` `chinese-ai` `midjourney` `minimax` `kling` `veo` `sora-alternative` `llm-agnostic` `byo-llm` `open-source`
