import { useMemo, useState } from 'react';
import type { GeminiRuntimeMode } from '../app/providers';

export function GeminiConfigPanel({
  mode,
  hasApiKey,
  onSaveApiKey,
  onClearApiKey
}: {
  mode: GeminiRuntimeMode;
  hasApiKey: boolean;
  onSaveApiKey: (apiKey: string) => void;
  onClearApiKey: () => void;
}) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const helperMessage = useMemo(() => buildHelperMessage(mode, hasApiKey), [mode, hasApiKey]);

  function handleSave() {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setMessage('Enter a Gemini API key before saving.');
      return;
    }
    onSaveApiKey(trimmed);
    setApiKeyInput('');
    setMessage('Gemini API key saved in this browser.');
  }

  return (
    <section className="card" aria-labelledby="gemini-access-title">
      <details className="card-dropdown" open>
        <summary className="card-dropdown-toggle">
          <h2 id="gemini-access-title" className="dashboard-header-title">
            Gemini Access
          </h2>
        </summary>
        <div className="card-dropdown-content">
          <p className="subtle">
            For GitHub Pages testing, each user can paste their own Gemini API key. The key stays in local browser storage.
          </p>
          <p className="subtle mono">{helperMessage}</p>

          <div className="stack">
            <div className="field">
              <label htmlFor="gemini-api-key">Gemini API key</label>
              <input
                id="gemini-api-key"
                type="password"
                autoComplete="off"
                placeholder="Paste your Gemini key"
                value={apiKeyInput}
                onChange={(event) => {
                  setMessage(null);
                  setApiKeyInput(event.target.value);
                }}
              />
            </div>

            <div className="pill-row">
              <button className="button secondary small" type="button" disabled={!apiKeyInput.trim()} onClick={handleSave}>
                Save key
              </button>
              <button className="button secondary small" type="button" disabled={!hasApiKey} onClick={onClearApiKey}>
                Remove key
              </button>
            </div>
          </div>

          {message ? <p className="status-bar">{message}</p> : null}
        </div>
      </details>
    </section>
  );
}

function buildHelperMessage(mode: GeminiRuntimeMode, hasApiKey: boolean): string {
  if (mode === 'browser-key' && hasApiKey) {
    return 'Mode: browser key enabled. Chat planning and Next Steps use your local key.';
  }

  if (mode === 'proxy') {
    return 'Mode: local proxy enabled. You can still add a browser key to test static hosting behavior.';
  }

  return 'Mode: static/offline proxy unavailable. Add a key to enable Sidekick-powered AI features.';
}