import { useState } from 'react';
import type { NexusClient, NexusConnectionState } from '../nexus/NexusClient';

export function AudiotoolConnectionPanel({
  nexus,
  state,
  onRefresh,
  runtimeMode,
  runtimeSource,
  onUseClientId,
  compact = false
}: {
  nexus: NexusClient;
  state: NexusConnectionState | null;
  onRefresh: () => Promise<void>;
  runtimeMode: 'mock' | 'real';
  runtimeSource: string;
  onUseClientId: (clientId: string) => void;
  compact?: boolean;
}) {
  const [projectUrl, setProjectUrl] = useState(state?.projectUrl ?? '');
  const [clientId, setClientId] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const isMockMode = !state || state.mode === 'mock';
  const suggestedRedirectUrl = getSuggestedRedirectUrl(state);

  async function run(action: () => Promise<void> | void) {
    setIsWorking(true);
    try {
      await action();
      await onRefresh();
    } finally {
      setIsWorking(false);
    }
  }

  function renderMockControls(includeRuntimeSource: boolean) {
    return (
      <>
        {includeRuntimeSource ? <p>{runtimeSource}</p> : null}
        <p className="subtle">
          Register an app at developer.audiotool.com with redirect URI <strong>{suggestedRedirectUrl}</strong>, then paste the client ID.
        </p>
        <div className="field">
          <label htmlFor="audiotool-client-id">Audiotool client ID</label>
          <textarea
            id="audiotool-client-id"
            rows={2}
            placeholder="Paste your Audiotool application client ID"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          />
        </div>
        <button className="button" type="button" disabled={!clientId.trim()} onClick={() => onUseClientId(clientId.trim())}>
          Enable Audiotool Login
        </button>
      </>
    );
  }

  function renderConnectedControls(connectionState: NexusConnectionState, includeMessage: boolean) {
    return (
      <>
        {includeMessage ? <p>{connectionState.message}</p> : null}
        {connectionState.redirectUrl ? (
          <p className="mono">
            OAuth redirect: <strong>{connectionState.redirectUrl}</strong>
          </p>
        ) : null}

        {connectionState.canLogin ? (
          <button className="button" type="button" disabled={isWorking || !nexus.login} onClick={() => void run(() => nexus.login?.())}>
            Log in with Audiotool
          </button>
        ) : null}

        {connectionState.canConnectProject ? (
          <div className="stack">
            <div className="field">
              <label htmlFor="audiotool-project-url">Project URL</label>
              <textarea
                id="audiotool-project-url"
                rows={2}
                placeholder="https://beta.audiotool.com/studio?project=..."
                value={projectUrl}
                onChange={(event) => setProjectUrl(event.target.value)}
              />
            </div>
            <div className="pill-row">
              <button
                className="button"
                type="button"
                disabled={isWorking || !projectUrl.trim() || !nexus.connectProject}
                onClick={() => void run(() => nexus.connectProject?.(projectUrl))}
              >
                Sync project
              </button>
              <button className="button secondary" type="button" disabled={isWorking} onClick={() => void run(onRefresh)}>
                Refresh
              </button>
              {nexus.logout ? (
                <button className="button secondary" type="button" disabled={isWorking} onClick={() => void run(() => nexus.logout?.())}>
                  Logout
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (compact) {
    const authStatusLabel = isMockMode
      ? `Mode: ${runtimeMode}`
      : state.authenticated
        ? `Logged in${state.userName ? ` as ${state.userName}` : ''}`
        : 'Not logged in';
    const syncStatusLabel = isMockMode ? 'Login not configured' : state.connected ? 'Project synced' : 'No project synced';
    const summaryMessage = isMockMode ? runtimeSource : state.message;

    return (
      <section className="card connection-compact-tile" aria-labelledby="audiotool-connection-title">
        <h2 id="audiotool-connection-title">Audiotool connection</h2>
        <p className="subtle">{summaryMessage}</p>
        <div className="pill-row">
          <span className="pill">{authStatusLabel}</span>
          <span className="pill">{syncStatusLabel}</span>
        </div>
        <details className="connection-details">
          <summary>{isWorking ? 'Working...' : 'Manage connection'}</summary>
          <div className="stack">{isMockMode ? renderMockControls(false) : renderConnectedControls(state, false)}</div>
        </details>
      </section>
    );
  }

  if (isMockMode) {
    return (
      <section className="card" aria-labelledby="audiotool-connection-title">
        <h2 id="audiotool-connection-title">Audiotool connection</h2>
        <div className="pill-row">
          <span className="pill">Mode: {runtimeMode}</span>
          <span className="pill">Login not configured</span>
        </div>
        {renderMockControls(true)}
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="audiotool-connection-title">
      <h2 id="audiotool-connection-title">Audiotool connection</h2>
      <div className="pill-row">
        <span className="pill">{state.authenticated ? `Logged in${state.userName ? ` as ${state.userName}` : ''}` : 'Not logged in'}</span>
        <span className="pill">{state.connected ? 'Project synced' : 'No project synced'}</span>
      </div>
      {renderConnectedControls(state, true)}
    </section>
  );
}

function getSuggestedRedirectUrl(state: NexusConnectionState | null): string {
  const redirectFromState = state?.redirectUrl?.trim();
  if (redirectFromState) return redirectFromState;

  const redirectFromEnv = import.meta.env.VITE_AUDIOTOOL_REDIRECT_URL?.trim();
  if (redirectFromEnv) return redirectFromEnv;

  if (typeof window !== 'undefined') {
    return new URL(import.meta.env.BASE_URL ?? '/', window.location.origin).toString();
  }

  return 'http://127.0.0.1:5173/';
}
