import type { GeneratedMidi } from '../generation/types';
import { downloadMidi } from '../generation/midiWriter';
import type { MidiInsertOptions } from '../nexus/NexusClient';
import type { SessionTrack, TrackRole } from '../core/types';
import { planDistributedMidiInsertion, formatPresetLabel } from '../app/trackRouting';
import { useMemo, useState } from 'react';

export function GeneratedMidiCard({
  midi,
  canInsert,
  noteTracks,
  styleInstruments,
  canAutoCreateInstruments,
  onPreview,
  onInsert,
  onRegenerate,
  onCreateNoteTracks
}: {
  midi: GeneratedMidi | null;
  canInsert: boolean;
  noteTracks: SessionTrack[];
  styleInstruments?: Partial<Record<TrackRole, string>>;
  canAutoCreateInstruments?: boolean;
  onPreview: () => void;
  onInsert: (options: MidiInsertOptions) => void;
  onRegenerate: () => void;
  onCreateNoteTracks: (count: number) => void;
}) {
  const [trackMode, setTrackMode] = useState<MidiInsertOptions['trackMode']>('distribute');
  const [targetTrackId, setTargetTrackId] = useState('');
  const [startBar, setStartBar] = useState(1);
  const [startBeat, setStartBeat] = useState(1);
  const missingLaneCount = useMemo(() => {
    if (!midi) return 0;
    return Math.max(0, midi.tracks.filter((track) => track.notes.length > 0).length - noteTracks.length);
  }, [midi, noteTracks.length]);

  const insertionPreview = useMemo(() => {
    if (!midi || trackMode !== 'distribute') return null;
    const generatedTracks = midi.tracks
      .filter((track) => track.notes.length > 0)
      .map((track) => ({ role: track.role, name: track.name }));
    return planDistributedMidiInsertion({
      generatedTracks,
      noteTracks,
      instruments: styleInstruments,
      canAutoCreateInstruments: Boolean(canAutoCreateInstruments)
    });
  }, [midi, noteTracks, styleInstruments, canAutoCreateInstruments, trackMode]);

  if (!midi) {
    return null;
  }

  const insertStartBeat = Math.max(0, (startBar - 1) * 4 + (startBeat - 1));

  return (
    <section className="card" aria-labelledby="generated-title">
      <h2 id="generated-title">{midi.name}</h2>
      <div className="pill-row">
        <span className="pill">{midi.request.bpm} BPM</span>
        <span className="pill">{midi.request.key} {midi.request.scaleMode}</span>
        <span className="pill">{midi.request.bars} bars</span>
        <span className="pill">{midi.tracks.length} tracks</span>
      </div>
      <ul>
        {midi.explanation.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div>
        <h3>Generated tracks</h3>
        <ul className="mono">
          {midi.tracks.map((track) => (
            <li key={`${track.channel}-${track.name}`}>
              Ch {track.channel}: {track.name} ({track.role}, {track.notes.length} notes)
            </li>
          ))}
        </ul>
      </div>
      <div className="stack">
        <h3>Insert options</h3>
        <div className="two-col">
          <div className="field">
            <label htmlFor="insert-bar">Start bar</label>
            <select id="insert-bar" value={startBar} onChange={(event) => setStartBar(Number(event.target.value))}>
              {Array.from({ length: 33 }, (_, index) => index + 1).map((bar) => (
                <option key={bar} value={bar}>
                  {bar}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="insert-beat">Beat</label>
            <select id="insert-beat" value={startBeat} onChange={(event) => setStartBeat(Number(event.target.value))}>
              {[1, 2, 3, 4].map((beat) => (
                <option key={beat} value={beat}>
                  {beat}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="insert-mode">Track routing</label>
          <select id="insert-mode" value={trackMode} onChange={(event) => setTrackMode(event.target.value as MidiInsertOptions['trackMode'])}>
            <option value="distribute">Distribute generated tracks across note lanes</option>
            <option value="selected">Put all generated tracks on selected note lane</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="insert-target-track">Selected note lane</label>
          <select id="insert-target-track" value={targetTrackId} onChange={(event) => setTargetTrackId(event.target.value)} disabled={noteTracks.length === 0}>
            <option value="">First available note lane</option>
            {noteTracks.map((track) => {
              const presetHint = formatPresetLabel(track.instrumentName);
              return (
              <option key={track.id} value={track.id}>
                {track.name} ({track.role}{presetHint ? ` · ${presetHint}` : ''})
              </option>
              );
            })}          </select>
        </div>
        {insertionPreview && insertionPreview.length > 0 ? (
          <div className="insertion-preview" aria-label="Distribute-mode routing preview">
            <h4 className="insertion-preview-title">Where MIDI will go (distribute)</h4>
            <ul className="mono subtle insertion-preview-list">
              {insertionPreview.map((row, index) => (
                <li key={`${row.generatedRole}-${index}`}>
                  <strong>{row.generatedRole}</strong>
                  <span className="insertion-preview-summary"> — {row.summary}</span>
                  {row.detail ? <div className="insertion-preview-detail">{row.detail}</div> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {missingLaneCount > 0 ? (
          <p className="subtle">
            {canAutoCreateInstruments
              ? `${missingLaneCount} instrument track${missingLaneCount === 1 ? '' : 's'} will be created automatically when you insert.`
              : `${missingLaneCount} instrument track${missingLaneCount === 1 ? ' is' : 's are'} missing. Create them below before inserting.`}
          </p>
        ) : null}
      </div>
      <div className="pill-row">
        <button className="button secondary" type="button" onClick={onPreview}>
          Preview
        </button>
        <button className="button" type="button" onClick={() => downloadMidi(midi.midiBytes, `${midi.name.replace(/\s+/g, '-').toLowerCase()}.mid`)}>
          Download MIDI
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => onInsert({ trackMode, targetTrackId: targetTrackId || undefined, startBeat: insertStartBeat })}
          disabled={!canInsert}
        >
          Insert at bar {startBar}.{startBeat}
        </button>
        {missingLaneCount > 0 && !canAutoCreateInstruments ? (
          <button className="button secondary" type="button" onClick={() => onCreateNoteTracks(missingLaneCount)} disabled={!canInsert}>
            Create {missingLaneCount} instrument track{missingLaneCount === 1 ? '' : 's'}
          </button>
        ) : null}
        <button className="button secondary" type="button" onClick={onRegenerate}>
          Regenerate
        </button>
      </div>
    </section>
  );
}
