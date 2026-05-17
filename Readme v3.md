# Sidekick

**Sidekick is an AI-powered music production companion for Audiotool.**

It helps producers move from a blank project to a workable musical idea by combining two complementary workflows:

1. **Generate inspiration** — create MIDI-based melody, chord, bass, and rhythm ideas using a rule-based motif engine inspired by MotifMachine.
2. **Learn from references** — upload a reference song, analyze its musical characteristics with an LLM-powered assistant, and translate those insights into actions inside an Audiotool project.

Sidekick is designed as a creative assistant, not an autopilot. It gives you musical starting points, explains production ideas, and helps shape them into your own track.

\---

## Why Sidekick?

Music producers often get stuck at two points:

* **Starting from nothing**: finding a hook, chord loop, bassline, or groove that feels worth developing.
* **Learning from references**: understanding what makes a reference track work and turning that knowledge into a project-specific action.

Sidekick addresses both.

It can generate track ideas quickly, but it can also listen to a reference track and help you understand its BPM, groove, structure, energy, and production direction. From there, its assistant can suggest what to add, modify, or try inside your Audiotool project.

\---

## Core Features

### 1\. Idea Generation with MotifMachine-Inspired MIDI Logic

Sidekick can generate short musical ideas for different electronic and beat-based styles. Depending on the selected mode, it can create:

* Lead motifs
* Chord progressions
* Basslines

The generation engine is inspired by the original **MotifMachine** project, a real-time MIDI generator for evolving EDM/house-style musical patterns.

Sidekick adapts that concept for Audiotool by turning motif generation into a browser-based creative workflow.

\---

### 2\. Reference Song Learning

Upload a reference track and Sidekick analyzes it to extract useful production guidance such as:

* Approximate BPM and rhythmic feel
* Energy profile
* Structural sections
* Style and arrangement cues
* Suggested production steps

The goal is not to copy the reference track. The goal is to understand its musical and production logic, then apply those learnings to your own idea.

\---

### 3\. AI Assistant for Audiotool Projects

Sidekick includes an assistant that helps bridge the gap between analysis and action.

You can ask it questions such as:

* “How can I make my current loop sound more like this reference?”
* “What should I add after this section?”
* “Can you suggest a bassline direction?”
* “How should I arrange this into an intro and drop?”

The assistant is designed to help translate musical observations into project-level suggestions.

\---

## How the Generative Engine Works

Sidekick’s music generation is based on the idea that useful musical creativity comes from **structure plus variation**, not pure randomness.

The engine uses several layers:

```text
Style / Genre Preset
        ↓
Scale + Mode Selection
        ↓
4-Chord Progression Engine
        ↓
Motif Generation or Motif Recall
        ↓
Harmonic Snapping
        ↓
Bass, Chord, and Drum Generation
        ↓
Audiotool / MIDI Output
```

\---

### Motif-Based Melody Generation

A motif is a short musical idea, usually one or two bars long. Instead of generating completely new notes every time, Sidekick creates, stores, recalls, and transforms motifs.

This gives the music:

* Recognition
* Repetition
* Variation
* A sense of identity

The generator creates motifs using controlled randomness:

* Notes are chosen from the selected scale or mode.
* Melodic motion is biased toward stepwise movement.
* Rhythmic positions are selected from a musical grid.
* Swing and groove settings shift certain notes for feel.
* The motif is cleaned so the lead remains monophonic.

\---

### Harmonic Snapping

After a motif is generated, Sidekick checks it against the current chord progression.

Certain structurally important notes are snapped to chord tones:

* First note of each bar
* Last note of each bar
* Strong beats such as beat 1 and beat 3

This keeps the melody connected to the harmony while still allowing weaker beats to use passing tones and scale notes.

In practical terms: the melody does not just wander around the scale. It lands on notes that make sense against the chords.

\---

### Chord Progression Engine

Sidekick uses genre-aware 4-chord loops as a harmonic foundation.

For example:

* Major: I – V – vi – IV
* Minor: i – VI – III – VII
* Dorian: i – VII – IV – i
* Harmonic minor: i – VI – III – V

These progressions loop while the motif engine generates or recalls melodic material above them.

\---

### Motif Memory and Transformations

Sidekick stores generated motifs in memory. Later, instead of always creating something new, it may recall a previous motif and transform it.

Transformations include:

* **Transpose**: shift the motif up or down within the scale
* **Rhythm nudge**: move selected notes slightly earlier or later
* **Ornament**: add a short approach note before a strong beat

This creates evolving patterns that feel intentional rather than random.

\---

### Bass and Chord Generation

When full arrangement mode is enabled:

* Chords are generated from the progression engine.
* Bass follows the chord root.
* Lead remains monophonic.
* Bass remains monophonic.
* Chords remain polyphonic.

This creates a usable sketch that a producer can edit, replace, or build upon.

\---

### Drum and Rhythm Generation

Sidekick can also use a fixed drum kit across genres:

* Kick
* Snare / Clap
* Closed Hat
* Open Hat
* Perc / Rim
* Tom / Fill

Genre identity comes from rhythm parameters rather than changing the kit itself. For example, Afro House, UK Garage, Trap, Reggaeton, Amapiano, and Drum \& Bass can all use the same six drum voices, but with different kick patterns, snare placement, swing, density, syncopation, ghost notes, and fills.

\---

## Genre and Style Control

Sidekick uses presets to control musical behavior.

A preset may define:

* BPM range
* Scale or mode
* Note density
* Swing amount
* Rhythmic bias
* Motif reuse probability
* Transformation weights
* Chord progression behavior
* Bass relationship

Supported style directions may include:

* Afro House
* Melodic Techno
* Amapiano
* Reggaeton
* Brazilian Funk
* UK Garage
* Drum \& Bass
* Trap / Hip Hop
* Lo-fi Hip Hop
* Phonk

The goal is not to perfectly recreate each genre, but to give each preset a distinct musical behavior that can spark a production idea.

\---

## Audiotool Integration

Sidekick is built for Audiotool workflows.

It can run as a sidebar-style production helper and interact with an Audiotool project through integration adapters. The project uses a local mock-first architecture so it can run even when Audiotool, Gemini, or other external services are unavailable.

Typical workflow:

1. Open Sidekick.
2. Choose a style or generate an idea.
3. Add generated material into the Audiotool project.
4. Upload a reference track if needed.
5. Ask the assistant for next steps.
6. Continue shaping the project manually.

\---

## Quick Start

### 1\. Install dependencies

```bash
npm install
```

### 2\. Start the development server

```bash
npm run dev
```

### 3\. Open the local app

Usually:

```text
http://localhost:5173
```

\---

## Optional: Audiotool and Gemini Configuration

Create a local `.env` file based on `.env.example`.

Important values:

```bash
VITE\_SIDEKICK\_MODE=auto
VITE\_AUDIOTOOL\_CLIENT\_ID=replace-with-audiotool-application-client-id
VITE\_AUDIOTOOL\_REDIRECT\_URL=http://127.0.0.1:5173/
GEMINI\_API\_KEY=replace-with-server-only-secret
GEMINI\_FLASH\_MODEL=gemini-flash-latest
```

Keep API keys server-side. Do not expose Gemini keys in client-side code.

\---

## Available Scripts

```bash
npm run dev
```

Start the local development server.

```bash
npm run build
```

Type-check and build the app.

```bash
npm run test
```

Run tests.

```bash
npm run test:watch
```

Run tests in watch mode.

```bash
npm run lint
```

Run lint checks.

```bash
npm run audit
```

Run dependency audit.

\---

## Project Architecture

Sidekick is organized around a few core modules:

```text
src/
  core music types and schemas
  style and genre registries
  motif-inspired generation logic
  MIDI writing / export helpers
  Audiotool NEXUS adapters
  Gemini / assistant adapters
  UI components
  tests
```

The project follows an adapter-based design so external services can be mocked locally and swapped for real integrations later.

\---

## Relationship to MotifMachine

Sidekick builds on ideas from **MotifMachine**, originally developed as a real-time MIDI motif generator.

MotifMachine focused on:

* Real-time MIDI generation
* Style presets
* Motif memory
* Harmonic snapping
* Chord and bass generation
* DAW-oriented workflows

Sidekick extends this direction by integrating motif-based generation into an Audiotool-focused assistant experience and adding reference-song learning with LLM support.

Original repository:

```text
https://github.com/hemanth-rj/motifmachine
```

Credit: Sidekick’s motif generation concepts are inspired by and adapted from MotifMachine.

\---

## What Sidekick Is Not

Sidekick is not intended to fully produce a finished song automatically.

It is not a replacement for a producer’s taste, arrangement decisions, or sound design.

Instead, it is a creative companion that helps with:

* Starting ideas
* Understanding references
* Translating analysis into production direction
* Generating editable musical material

\---

## Roadmap

Possible future directions:

* More genre-aware rhythm templates
* Better Audiotool timeline editing
* Transformer-assisted motif generation
* Chord extensions such as 7ths, sus chords, and add9s
* Energy curve generation across 8-bar and 16-bar sections
* More detailed reference-track analysis
* User taste memory and feedback-driven personalization
* Exportable MIDI packs
* Real-time parameter controls

\---

## Credits

Sidekick was developed as a music production assistant for Audiotool by Hemanth \& Carlos during the 2026 Lisbon Music Hackspace Hackathon.

\---

## License

This project is licensed under the MIT License.

