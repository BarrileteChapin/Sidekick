import { useId, useState, type FormEvent } from 'react';
import { NEXT_STEPS_AUDIO_SIZE_LIMIT_BYTES } from '../nextSteps/NextStepsClient';
import type { NextStepsAnalysis, NextStepsClaim } from '../nextSteps/schemas';

export function NextStepsPanel({
  analysis,
  isWorking,
  onAnalyze,
  onRoadmapHelp
}: {
  analysis: NextStepsAnalysis | null;
  isWorking: boolean;
  onAnalyze: (file: File) => Promise<void>;
  onRoadmapHelp: (prompt: string) => void;
}) {
  const fileInputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    if (file.size > NEXT_STEPS_AUDIO_SIZE_LIMIT_BYTES) {
      setError('Choose an audio file smaller than 20 MB.');
      return;
    }

    setError(null);
    try {
      await onAnalyze(file);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not analyze that audio file.');
    }
  }

  return (
    <section className="card" aria-labelledby="next-steps-title">
      <h2 id="next-steps-title">Next Steps</h2>
      <p className="subtle">
        Upload a reference song and Gemini Flash will turn its musical traits into a learning roadmap for building a new original track in Audiotool.
      </p>

      <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
        <div className="field">
          <label htmlFor={fileInputId}>Reference audio</label>
          <input
            id={fileInputId}
            type="file"
            accept="audio/*"
            onChange={(event) => {
              setError(null);
              setFile(event.target.files?.[0] ?? null);
            }}
          />
          <p className="subtle mono">Gemini estimates BPM, key, sections, chords, instruments, vocals, beat grid, and energy arc.</p>
        </div>

        <button className="button" type="submit" disabled={isWorking || !file}>
          {isWorking ? 'Analyzing reference...' : 'Analyze reference'}
        </button>
      </form>

      {error ? (
        <p className="status-bar" role="alert">
          {error}
        </p>
      ) : null}

      {analysis ? <NextStepsResult analysis={analysis} onRoadmapHelp={onRoadmapHelp} /> : null}
    </section>
  );
}

function NextStepsResult({
  analysis,
  onRoadmapHelp
}: {
  analysis: NextStepsAnalysis;
  onRoadmapHelp: (prompt: string) => void;
}) {
  const [checkedCards, setCheckedCards] = useState<string[]>([]);
  const claims = analysisFields
    .map(([key, label]) => {
      const claim = analysis.analysis[key];
      return claim ? { ...claim, label } : null;
    })
    .filter((claim): claim is NextStepsClaim & { label: string } => Boolean(claim));

  return (
    <div className="next-steps-menu" aria-live="polite">
      <section className="result-panel" aria-labelledby="next-insights-title">
        <details className="next-insights-details" open>
          <summary className="next-insights-toggle">
            <div className="result-panel-header">
              <span className="mono">Insights</span>
              <h3 id="next-insights-title">What Sidekick noted</h3>
            </div>
          </summary>
          <div className="next-insights-content">
            <p>{analysis.educatorSummary}</p>

            {claims.length > 0 ? (
              <div className="analysis-grid">
                {claims.map((claim) => (
                  <article className="analysis-tile" key={claim.label}>
                    <span className="mono">{claim.label}</span>
                    <p>{claim.value}</p>
                    <span className={`claim-badge ${claim.confidence}`}>{claim.confidence}</span>
                    {claim.note ? <p className="subtle">{claim.note}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}

            <div className="insight-columns">
              <ClaimGroup title="Observed" items={analysis.observed} emptyText="No direct facts returned." />
              <ClaimGroup title="Likely" items={analysis.likely} emptyText="No likely inferences returned." />
              <ClaimGroup title="Uncertain" items={analysis.uncertain} emptyText="No uncertain claims returned." />
            </div>
          </div>
        </details>
      </section>

      <section className="result-panel" aria-labelledby="next-suggestions-title">
        <div className="result-panel-header">
          <span className="mono">Suggestions</span>
          <h3 id="next-suggestions-title">Ideas for your own track</h3>
        </div>
        <ClaimGroup title="Creative directions" items={analysis.suggested} emptyText="No creative suggestions returned." />
      </section>

      <section className="result-panel" aria-labelledby="next-roadmap-title">
        <div className="result-panel-header">
          <span className="mono">Audiotool Roadmap</span>
          <h3 id="next-roadmap-title">Build it step by step</h3>
        </div>
        <div className="roadmap-card-list">
          {analysis.productionRoadmap.map((step, index) => {
            const cardId = `${index}-${step.title}`;
            const checked = checkedCards.includes(cardId);

            return (
              <article className={`roadmap-card ${checked ? 'is-checked' : ''}`} key={cardId}>
                <label className="roadmap-card-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setCheckedCards((current) => (current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]))
                    }
                  />
                  <span>{index + 1}</span>
                </label>
                <div className="roadmap-card-body">
                  <div>
                    <h4>{step.title}</h4>
                    {step.audiotoolFocus ? <p className="subtle">{step.audiotoolFocus}</p> : null}
                  </div>
                  <ul>
                    {step.steps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <button className="button secondary small" type="button" onClick={() => onRoadmapHelp(createRoadmapHelpPrompt(step.title, step.steps, step.audiotoolFocus))}>
                    Ask Sidekick Assistant
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ClaimGroup({ title, items, emptyText }: { title: string; items: string[]; emptyText?: string }) {
  if (items.length === 0) {
    return emptyText ? (
      <div>
        <h4>{title}</h4>
        <p className="subtle">{emptyText}</p>
      </div>
    ) : null;
  }

  return (
    <div>
      <h4>{title}</h4>
      <ul className="claim-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function createRoadmapHelpPrompt(title: string, steps: string[], audiotoolFocus?: string): string {
  return [
    `Help me with this Audiotool roadmap step: ${title}.`,
    audiotoolFocus ? `Audiotool focus: ${audiotoolFocus}.` : null,
    `Steps: ${steps.join(' ')}`,
    'Turn this into a practical Sidekick Assistant request with concrete musical choices, but keep it original and do not copy the reference track.'
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

const analysisFields: Array<[keyof NextStepsAnalysis['analysis'], string]> = [
  ['genreSubgenre', 'Genre / subgenre'],
  ['bpm', 'BPM feel'],
  ['keyMood', 'Key / mood'],
  ['loudnessEnergyCurve', 'Loudness / energy curve'],
  ['beatGrid', 'Beat grid'],
  ['sectionBoundaries', 'Section boundaries'],
  ['chordEstimate', 'Chord estimate'],
  ['instrumentStemEstimate', 'Instrument / stem estimate'],
  ['vocalInstrumentalDetection', 'Vocal / instrumental'],
  ['arrangement', 'Arrangement'],
  ['drums', 'Drums'],
  ['bass', 'Bass'],
  ['harmony', 'Harmony'],
  ['melody', 'Melody'],
  ['vocalsSamples', 'Vocals / samples'],
  ['soundDesign', 'Sound design'],
  ['transitions', 'Transitions'],
  ['energyArc', 'Energy arc']
];
