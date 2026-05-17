import type { DrumParams, MidiNoteEvent } from './types';

// ─── Fixed GM drum-kit note assignments ────────────────────────────────────
// These never change across genres – only the rhythm parameters change.
const KICK = 36;
const SNARE = 38;
const CLOSED_HAT = 42;
const OPEN_HAT = 46;
const RIM = 37;
const TOM_LO = 45;
const TOM_HI = 47;

// ─── Grid constants ─────────────────────────────────────────────────────────
// A phrase is always 2 bars of 4/4, giving 32 sixteenth-note steps.
// Step 0 = beat 1 of bar 1.  Each beat = 4 steps.  Each bar = 16 steps.
const TOTAL_STEPS = 32;
const BEATS_PER_STEP = 0.25; // one 16th note = 0.25 beats
const HIT_DURATION = 0.1;    // short percussive gate (in beats)

// ─── Kick templates (2-bar, 32-step 16th-note grid) ────────────────────────
// All patterns avoid placing kicks on positions that conflict with the
// snare so the two can freely overlap only where musically intended.
const KICK_TEMPLATES: Readonly<Record<string, readonly number[]>> = {
  // Kick on every quarter note (house staple)
  four_on_floor: [0, 4, 8, 12, 16, 20, 24, 28],
  // Dense off-beat pattern: beat 1, beat 2, "and of 3" per bar (Baile Funk / club)
  broken_club:   [0, 4, 6, 10, 16, 20, 22, 26],
  // beat1 + and-of-2 + beat4 per bar – the reggaeton signature
  dembow:        [0, 6, 12, 16, 22, 28],
  // Syncopated off-grid kicks: beat1, and-of-2, and-of-4 per bar (UK Garage)
  two_step:      [0, 6, 14, 16, 22, 30],
  // Irregular Amen-inspired break (DnB / Jungle)
  breakbeat:     [0, 3, 10, 14, 16, 19, 26, 30],
  // One kick per bar on beat 1 – half-time feel (Trap / Hip-Hop)
  half_time:     [0, 16],
  // Minimal one-per-bar anchor (Amapiano / Lo-fi)
  sparse:        [0, 16],
};

// ─── Snare templates (2-bar, 32-step 16th-note grid) ───────────────────────
const SNARE_TEMPLATES: Readonly<Record<string, readonly number[]>> = {
  // Classic beats 2 and 4
  backbeat:  [4, 12, 20, 28],
  // Beat 3 only – creates the characteristic half-time snare drop
  half_time: [8, 24],
  // and-of-2 + and-of-4 per bar (reggaeton dembow clap)
  dembow:    [6, 14, 22, 30],
  // Syncopated push: "e of 1" and "e of 3" per bar (UK Garage 2-step)
  two_step:  [2, 10, 18, 26],
  // Off-beat irregular snare (DnB breakbeat feel)
  breakbeat: [4, 10, 20, 28],
  // Barely-there accent on beat 4 only
  minimal:   [12, 28],
};

// Off-beat 16th positions used when syncopation is high.
// These are all steps that are NOT on a quarter-note downbeat (0,4,8,12,…).
const SYNCOPATED_POSITIONS: readonly number[] = [
  1,  2,  3,  5,  6,  7,  9,  10, 11, 13, 14, 15,
  17, 18, 19, 21, 22, 23, 25, 26, 27, 29, 30, 31,
];

// ─── DrumEngine ─────────────────────────────────────────────────────────────

export class DrumEngine {
  /**
   * Generate one 2-bar phrase of drum events.
   *
   * Returns MidiNoteEvent[] using GM drum pitches (36, 38, 42, 46, 37, 45, 47).
   * All events have startBeat relative to the start of this phrase (0–7.75 beats).
   * Channel assignment (10) is handled by the caller via GeneratedMidiTrack.
   */
  generatePhrase(params: DrumParams, random: () => number): MidiNoteEvent[] {
    const kickSteps = new Set<number>();
    const snareSteps = new Set<number>();
    const events: MidiNoteEvent[] = [];

    events.push(...this.buildKick(params, random, kickSteps));
    events.push(...this.buildSnare(params, random, snareSteps));
    events.push(...this.buildHats(params, random));

    // Perc avoids landing exactly on kick or snare for clarity
    const rhythmSteps = new Set([...kickSteps, ...snareSteps]);
    events.push(...this.buildPerc(params, random, rhythmSteps));

    events.push(...this.buildGhosts(params, random));
    events.push(...this.buildFill(params, random));

    return events.sort((a, b) => a.startBeat - b.startBeat);
  }

  // ── Private builders ───────────────────────────────────────────────────────

  private buildKick(
    params: DrumParams,
    random: () => number,
    occupied: Set<number>
  ): MidiNoteEvent[] {
    const template = KICK_TEMPLATES[params.kick_pattern] ?? KICK_TEMPLATES['four_on_floor'];
    const velocity = params.velocity_max - 8; // kicks are loud
    const events: MidiNoteEvent[] = [];

    for (const step of template) {
      occupied.add(step);
      events.push(this.hit(step, KICK, velocity, params, false, random));
    }

    // Sparse / half-time patterns add one or two extra hits at higher complexity,
    // making each phrase slightly unique while keeping the core anchor.
    if (params.kick_pattern === 'sparse' || params.kick_pattern === 'half_time') {
      const candidates = [6, 10, 22, 26];
      for (const step of candidates) {
        if (!occupied.has(step) && random() < params.complexity * 0.40) {
          occupied.add(step);
          events.push(this.hit(step, KICK, velocity - 18, params, false, random));
        }
      }
    }

    return events;
  }

  private buildSnare(
    params: DrumParams,
    random: () => number,
    occupied: Set<number>
  ): MidiNoteEvent[] {
    const template = SNARE_TEMPLATES[params.snare_pattern] ?? SNARE_TEMPLATES['backbeat'];
    const velocity = Math.round((params.velocity_min + params.velocity_max) / 2);
    const events: MidiNoteEvent[] = [];

    for (const step of template) {
      occupied.add(step);
      // Kick and snare may share a step (e.g. four-on-floor + backbeat at beat 2).
      // Both MIDI notes are sent simultaneously, which is correct behaviour.
      events.push(this.hit(step, SNARE, velocity, params, false, random));
    }

    return events;
  }

  private buildHats(params: DrumParams, random: () => number): MidiNoteEvent[] {
    const events: MidiNoteEvent[] = [];
    const closedVel = Math.round(
      params.velocity_min + (params.velocity_max - params.velocity_min) * 0.30
    );
    const openVel = Math.round(
      params.velocity_min + (params.velocity_max - params.velocity_min) * 0.45
    );

    // Each 16th-note step has hat_density probability of getting a hat.
    // A fraction open_hat_rate of those become open hats (with swing applied).
    for (let step = 0; step < TOTAL_STEPS; step++) {
      if (random() > params.hat_density) continue;
      const useOpen = random() < params.open_hat_rate;
      events.push(
        this.hit(
          step,
          useOpen ? OPEN_HAT : CLOSED_HAT,
          useOpen ? openVel : closedVel,
          params,
          true, // hats are swung
          random
        )
      );
    }

    return events;
  }

  private buildPerc(
    params: DrumParams,
    random: () => number,
    avoidSteps: Set<number>
  ): MidiNoteEvent[] {
    const events: MidiNoteEvent[] = [];
    const velocity = Math.round(
      params.velocity_min + (params.velocity_max - params.velocity_min) * 0.40
    );

    // High syncopation → draw only from off-beat 16th positions.
    // Low syncopation → any step is a candidate.
    const pool =
      params.syncopation > 0.5
        ? SYNCOPATED_POSITIONS.filter((s) => !avoidSteps.has(s))
        : Array.from({ length: TOTAL_STEPS }, (_, i) => i).filter(
            (s) => !avoidSteps.has(s)
          );

    // Scale probability by 0.5 so perc_density=1.0 produces ~12 hits,
    // keeping the groove readable even at maximum density.
    const prob = params.perc_density * 0.5;
    for (const step of pool) {
      if (random() > prob) continue;
      events.push(this.hit(step, RIM, velocity, params, true, random));
    }

    return events;
  }

  private buildGhosts(params: DrumParams, random: () => number): MidiNoteEvent[] {
    const events: MidiNoteEvent[] = [];
    if (params.ghost_note_prob <= 0) return events;

    for (let step = 0; step < TOTAL_STEPS; step++) {
      if (step % 4 === 0) continue; // skip quarter-note downbeats

      // 8th-note off-beats (step % 4 === 2) get full ghost probability;
      // remaining 16th positions get a reduced probability.
      const is8thOffbeat = step % 4 === 2;
      const prob = is8thOffbeat ? params.ghost_note_prob : params.ghost_note_prob * 0.4;
      if (random() > prob) continue;

      const rawBeat = step * BEATS_PER_STEP;
      // Ghost notes always swing with the groove
      const beat = this.swingBeat(rawBeat, params.swing);
      // Ghost notes are always very quiet regardless of genre velocity range
      const ghostVel = Math.floor(random() * 18) + 14; // 14–31
      events.push({ pitch: SNARE, startBeat: beat, durationBeats: HIT_DURATION, velocity: ghostVel });
    }

    return events;
  }

  private buildFill(params: DrumParams, random: () => number): MidiNoteEvent[] {
    const events: MidiNoteEvent[] = [];
    if (random() > params.fill_prob) return events;

    const velocity = Math.round((params.velocity_min + params.velocity_max) / 2) + 6;
    // Fill region: last 6 steps of the 2-bar phrase (steps 26–31)
    const fillStart = 26;
    const maxHits = Math.ceil(params.complexity * 5);
    const usedSteps = new Set<number>();

    for (let i = 0; i < maxHits; i++) {
      const step = fillStart + Math.floor(random() * (TOTAL_STEPS - fillStart));
      if (usedSteps.has(step)) continue;
      usedSteps.add(step);
      const pitch = random() < 0.55 ? TOM_LO : TOM_HI;
      events.push(this.hit(step, pitch, velocity, params, false, random));
    }

    return events;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private hit(
    step: number,
    pitch: number,
    velocity: number,
    params: DrumParams,
    withSwing: boolean,
    random: () => number
  ): MidiNoteEvent {
    const rawBeat = step * BEATS_PER_STEP;
    const beat = withSwing ? this.swingBeat(rawBeat, params.swing) : rawBeat;
    return {
      pitch,
      startBeat: beat,
      durationBeats: HIT_DURATION,
      velocity: this.humanize(velocity, params, random),
    };
  }

  /**
   * Delays the 8th-note off-beats (steps 2, 6, 10, 14… in the 16th grid)
   * by swingAmount beats, producing a triplet-feel groove.
   */
  private swingBeat(beat: number, swingAmount: number): number {
    const eighth = Math.round(beat * 2);
    return beat + (eighth % 2 === 1 ? swingAmount : 0);
  }

  private humanize(base: number, params: DrumParams, random: () => number): number {
    const offset = Math.round((random() * 2 - 1) * params.velocity_humanization);
    return Math.max(params.velocity_min, Math.min(params.velocity_max, base + offset));
  }
}
