import { useEffect, useRef, useState } from 'react';
import type { ChatGenerationPlan } from '../chat/schemas';
import type { TrackRole } from '../core/types';

export interface ChatDraft {
  id: string;
  text: string;
}

const quickPrompts = [
  'Suggest one arrangement improvement for this session.',
  'Compose an 8-bar deep house bassline that fits this track.',
  'Create a bass track with bassline, compose MIDI, and insert it into the project.',
  'Create a machiniste drum track and insert a 4-bar groove.',
  'Set BPM to 128, then compose and insert a lead MIDI idea using heisenberg.'
] as const;

export function ChatPanel({
  latestPlan,
  isWorking,
  onSend,
  draft,
  styleInstrumentByRole,
  projectInstrumentNames = [],
  focusSignal = 0
}: {
  latestPlan: ChatGenerationPlan | null;
  isWorking: boolean;
  onSend: (message: string) => Promise<void>;
  draft?: ChatDraft | null;
  styleInstrumentByRole?: Partial<Record<TrackRole, string>>;
  projectInstrumentNames?: string[];
  focusSignal?: number;
}) {
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState(draft?.text ?? 'Make an 8-bar deep house bassline that fits this track.');
  const styleInstrumentHint = formatStyleInstrumentHint(styleInstrumentByRole);
  const uniqueProjectInstruments = [...new Set(projectInstrumentNames)].filter((name) => name.length > 0);

  useEffect(() => {
    if (focusSignal <= 0) return;
    const input = promptInputRef.current;
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusSignal]);

  async function handleSend() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    await onSend(trimmedMessage);
  }

  return (
    <section id="sidekick-assistant-panel" className="card" aria-labelledby="chat-title">
      <h2 id="chat-title">Sidekick Assistant</h2>
      <p className="subtle">Chat for Audiotool suggestions, MIDI composition, and optional track insertion plans.</p>
      {styleInstrumentHint ? <p className="subtle mono chat-instrument-hint">Style defaults: {styleInstrumentHint}</p> : null}
      {uniqueProjectInstruments.length > 0 ? (
        <p className="subtle mono chat-instrument-hint">Detected project instruments: {uniqueProjectInstruments.join(', ')}</p>
      ) : null}
      <div className="stack">
        <div className="chat-suggestions">
          <details className="chat-suggestions-details">
            <summary className="chat-suggestions-toggle">
              <span className="subtle mono chat-suggestions-label">Try a quick request</span>
            </summary>
            <div className="chat-suggestion-list" aria-label="Quick Sidekick requests">
              {quickPrompts.map((prompt) => (
                <button key={prompt} className="pill chat-suggestion-pill" type="button" disabled={isWorking} onClick={() => setMessage(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className="field">
          <label htmlFor="chat-message">Prompt</label>
          <textarea
            id="chat-message"
            className="chat-message-input"
            ref={promptInputRef}
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        <button className="button" type="button" disabled={isWorking || !message.trim()} onClick={() => void handleSend()}>
          {isWorking ? 'Planning...' : 'Create assistant plan'}
        </button>
        {latestPlan ? (
          <div aria-live="polite">
            <h3>Plan</h3>
            <p>{latestPlan.userFacingSummary}</p>
            {latestPlan.safetyNotes?.map((note) => (
              <p className="subtle" key={note}>
                {note}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatStyleInstrumentHint(styleInstrumentByRole?: Partial<Record<TrackRole, string>>): string {
  if (!styleInstrumentByRole) return '';
  const entries = Object.entries(styleInstrumentByRole).filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (entries.length === 0) return '';
  return entries.map(([role, instrument]) => `${role}: ${instrument}`).join(', ');
}
