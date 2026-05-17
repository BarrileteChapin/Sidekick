import type { SessionAnalysis } from '../analysis/sessionAnalyzer';
import type { MusicStyleProfile } from '../data/musicStyles';

export function SessionSummary({ analysis, style }: { analysis: SessionAnalysis; style: MusicStyleProfile }) {
  const { session, missingRoles, weakRoles } = analysis;
  return (
    <section className="card session-summary-card" aria-labelledby="session-summary-title">
      <details className="session-summary-details">
        <summary id="session-summary-title" className="session-summary-toggle">
          <span className="dashboard-header-title">Session sketch</span>
        </summary>
        <div className="session-summary-content">
          <p className="subtle">{style.name}</p>
          <div className="pill-row" aria-label="Session facts">
            <span className="pill">{session.bpm} BPM</span>
            <span className="pill">{session.key ?? 'Key unknown'}</span>
            <span className="pill">{session.scaleMode ?? 'Mode unknown'}</span>
            <span className="pill">{session.arrangementState.energy} energy</span>
            <span className="pill">{session.arrangementState.density} density</span>
          </div>
          <p>
            <strong>Tracks:</strong> {session.tracks.map((track) => `${track.name} (${track.role})`).join(', ') || 'No tracks yet'}
          </p>
          <p>
            <strong>Needs:</strong> {missingRoles.join(', ') || 'Core roles covered'}
          </p>
          {weakRoles.length > 0 ? (
            <p>
              <strong>Weak roles:</strong> {weakRoles.join(', ')}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
