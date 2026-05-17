import type { MusicStyleProfile } from '../data/musicStyles';
import type { GenerationRequest } from '../generation/types';

export interface GenerateMusicState {
  styleProfileId: string;
  targetRole: GenerationRequest['targetRole'];
  bars: GenerationRequest['bars'];
  outputMode: GenerationRequest['outputMode'];
}

export function GenerateMusicPanel({
  styles,
  value,
  isGenerating,
  onChange,
  onGenerate
}: {
  styles: MusicStyleProfile[];
  value: GenerateMusicState;
  isGenerating: boolean;
  onChange: (next: GenerateMusicState) => void;
  onGenerate: () => void;
}) {
  const fixedRole: GenerateMusicState['targetRole'] = 'full';
  return (
    <section className="card" aria-labelledby="generate-title">
      <h2 id="generate-title">Generate music</h2>
      <div className="stack">
        <div className="field">
          <label htmlFor="style">Style</label>
          <select id="style" value={value.styleProfileId} onChange={(event) => onChange({ ...value, styleProfileId: event.target.value, targetRole: fixedRole })}>
            {styles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="bars">Bars</label>
          <select id="bars" value={value.bars} onChange={(event) => onChange({ ...value, bars: Number(event.target.value) as GenerateMusicState['bars'], targetRole: fixedRole })}>
            {[4, 8, 16, 32].map((bars) => (
              <option key={bars} value={bars}>
                {bars}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mode">Output mode</label>
          <select id="mode" value={value.outputMode} onChange={(event) => onChange({ ...value, outputMode: event.target.value as GenerateMusicState['outputMode'], targetRole: fixedRole })}>
            <option value="motif">motif</option>
            <option value="motif_chords_bass">motif + chords + bass</option>
            <option value="motif_chords_bass_drums">motif + chords + bass + drums</option>
            <option value="variation">variation</option>
            <option value="continuation">continuation</option>
          </select>
        </div>
        <button className="button" type="button" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? 'Generating...' : 'Generate Music'}
        </button>
      </div>
    </section>
  );
}
