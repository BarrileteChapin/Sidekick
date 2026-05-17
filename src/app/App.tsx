import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SessionAnalyzer, type SessionAnalysis } from '../analysis/sessionAnalyzer';
import type { ChatGenerationPlan } from '../chat/schemas';
import { createDefaultProfile, type SessionTrack, type TrackRole, type UserProfile } from '../core/types';
import { loadProfile } from '../core/profileStore';
import type { GeneratedMidi } from '../generation/types';
import { ChatPanel, type ChatDraft } from '../components/ChatPanel';
import { AudiotoolConnectionPanel } from '../components/AudiotoolConnectionPanel';
import { GeminiConfigPanel } from '../components/GeminiConfigPanel';
import { GeneratedMidiCard } from '../components/GeneratedMidiCard';
import { GenerateMusicPanel, type GenerateMusicState } from '../components/GenerateMusicPanel';
import { NextStepsPanel } from '../components/NextStepsPanel';
import { SessionSummary } from '../components/SessionSummary';
import { createAppServices, type AppServices } from './providers';
import { clearStoredGeminiApiKey, storeGeminiApiKey } from '../gemini/userKeyStore';
import { findCompatibleNoteTrack, selectDistributedTargetTrackIds } from './trackRouting';
import type { MidiInsertOptions, NexusConnectionState } from '../nexus/NexusClient';
import type { NextStepsAnalysis } from '../nextSteps/schemas';

export function App() {
  const [services, setServices] = useState<AppServices>(() => createAppServices());
  const analyzer = useMemo(() => new SessionAnalyzer(services.styles), [services.styles]);
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [profile, setProfile] = useState<UserProfile>(() => createDefaultProfile());
  const [generatedMidi, setGeneratedMidi] = useState<GeneratedMidi | null>(null);
  const [chatPlan, setChatPlan] = useState<ChatGenerationPlan | null>(null);
  const [chatDraft, setChatDraft] = useState<ChatDraft | null>(null);
  const [nextStepsAnalysis, setNextStepsAnalysis] = useState<NextStepsAnalysis | null>(null);
  const [connectionState, setConnectionState] = useState<NexusConnectionState | null>(null);
  const [status, setStatus] = useState('Loading mock session...');
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [workspaceView, setWorkspaceView] = useState<'create' | 'learn'>('create');
  const [layoutPreset, setLayoutPreset] = useState<DashboardLayoutPreset>('classic');
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const layoutMenuContainerRef = useRef<HTMLDivElement>(null);
  const [sidekickFocusSignal, setSidekickFocusSignal] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isAnalyzingReference, setIsAnalyzingReference] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  const insertInFlightRef = useRef(false);
  const styles = services.styles.getAll();
  const [generationState, setGenerationState] = useState<GenerateMusicState>({
    styleProfileId: services.styles.getDefault().id,
    targetRole: 'full',
    bars: 8,
    outputMode: 'motif_chords_bass'
  });
  const brandIconUrl = `${import.meta.env.BASE_URL}sidekick-favicon.png`;

  const refreshSession = useCallback(async () => {
    const state = (await services.nexus.getConnectionState?.()) ?? null;
    const [session, loadedProfile] = await Promise.all([services.nexus.getCurrentSessionContext(), loadProfile()]);
    const nextAnalysis = analyzer.analyze(session);
    setConnectionState(state);
    setAnalysis(nextAnalysis);
    setProfile(loadedProfile);
    setGenerationState((current) => ({ ...current, styleProfileId: nextAnalysis.session.styleProfileId ?? current.styleProfileId }));
    setStatus(state?.message ?? `${services.nexusMode === 'real' ? 'Audiotool session' : 'Mock session'} ready via ${services.nexusSource}.`);
  }, [analyzer, services]);

  const useAudiotoolClientId = useCallback((clientId: string) => {
    setStatus('Initializing Audiotool login...');
    setConnectionState(null);
    setAnalysis(null);
    setServices(createAppServices({ audiotoolClientId: clientId }));
  }, []);

  const saveGeminiApiKey = useCallback((apiKey: string) => {
    storeGeminiApiKey(apiKey);
    setStatus('Gemini API key saved for this browser.');
    setServices(createAppServices({ geminiApiKey: apiKey }));
  }, []);

  const clearGeminiApiKey = useCallback(() => {
    clearStoredGeminiApiKey();
    setStatus('Gemini API key removed from this browser.');
    setServices(createAppServices());
  }, []);

  useEffect(() => {
    const bootTimer = window.setTimeout(() => {
      void refreshSession();
    }, 0);
    return () => window.clearTimeout(bootTimer);
  }, [refreshSession]);

  useEffect(() => {
    if (!isLayoutMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (layoutMenuContainerRef.current?.contains(event.target as Node)) return;
      setIsLayoutMenuOpen(false);
    }
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isLayoutMenuOpen]);

  async function handleGenerate(overrides: Partial<GenerateMusicState> = {}) {
    if (!analysis) return;
    setIsGenerating(true);
    try {
      const state = { ...generationState, ...overrides };
      const request = services.generator.createRequestFromSession(analysis.session, {
        ...state,
        styleProfileId: state.styleProfileId,
        targetRole: 'full',
        bars: state.bars,
        outputMode: state.outputMode
      });
      const midi = await services.generator.generate(request);
      setGeneratedMidi(midi);
      setStatus('Generated MIDI is ready.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleChat(message: string) {
    if (!analysis) return;
    setIsChatting(true);
    try {
      const plan = await services.chat.createPlan(message, analysis.session, profile);
      setChatPlan(plan);

      // 1. Project mutations: set_bpm, create_track (before MIDI generation)
      const createdTracks: import('../core/types').SessionTrack[] = [];
      const setupActions = (plan.audiotoolActions ?? []).filter((a) => a.type !== 'auto_insert');
      for (const action of setupActions) {
        if (action.type === 'set_bpm') {
          setStatus(`Setting project BPM to ${action.bpm}…`);
          await services.nexus.setProjectBpm?.(action.bpm);
          addAction(`Set project BPM to ${action.bpm}.`);
        } else if (action.type === 'create_track') {
          setStatus(`Creating "${action.name}" track in Audiotool…`);
          const currentStyle = services.styles.getById(plan.request?.styleProfileId ?? analysis.session.styleProfileId);
          const profileInstrumentSlug = currentStyle.instruments?.[action.role];
          const track = await services.nexus.createSuggestedInstrument?.({
            name: action.name,
            role: action.role,
            tags: [action.role],
            audiotoolInstrumentSlug: action.instrumentSlug ?? sanitizeAutoCreateInstrumentSlug(profileInstrumentSlug)
          });
          if (track) {
            createdTracks.push(track);
            addAction(`Created "${action.name}" track in Audiotool.`);
          }
        }
      }

      // 2. MIDI generation
      let midi: import('../generation/types').GeneratedMidi | null = null;
      if (plan.request) {
        setStatus('Generating MIDI from chat plan…');
        midi = await services.generator.generate(plan.request);
        setGeneratedMidi(midi);
        setStatus('Chat plan generated MIDI.');
      }

      // 3. Auto-insert: place generated MIDI into first created (or existing) note track
      const autoInsertAction = (plan.audiotoolActions ?? []).find((a) => a.type === 'auto_insert');
      if (autoInsertAction && autoInsertAction.type === 'auto_insert' && midi) {
        if (!services.nexus.insertMidi) {
          throw new Error('This connection does not support MIDI insertion. Refresh Sidekick and re-sync your project.');
        }
        const activeTracks = midi.tracks.filter((track) => track.notes.length > 0);
        const style = services.styles.getById(midi.request.styleProfileId);
        const targetTrackIds = selectDistributedTargetTrackIds({
          generatedTracks: activeTracks.map((track) => ({ role: track.role, name: track.name })),
          preferredTracks: createdTracks,
          noteTracks,
          instruments: style.instruments
        });
        const insertOptions: MidiInsertOptions = {
          startBeat: autoInsertAction.startBeat ?? 0
        };

        if (activeTracks.length === 1 && targetTrackIds[0]) {
          insertOptions.targetTrackId = targetTrackIds[0];
          insertOptions.trackMode = 'selected';
        } else if (targetTrackIds.length === activeTracks.length && targetTrackIds.length > 0) {
          insertOptions.targetTrackIds = targetTrackIds;
          insertOptions.trackMode = 'distribute';
        } else if (createdTracks[0]) {
          insertOptions.targetTrackId = createdTracks[0].id;
          insertOptions.trackMode = 'selected';
        }
        setStatus('Auto-inserting MIDI into Audiotool…');
        await services.nexus.insertMidi(midi, insertOptions);
        const label = targetTrackIds.length > 1
          ? ` across ${targetTrackIds.length} target tracks`
          : createdTracks[0]
            ? ` into "${createdTracks[0].name}"`
            : '';
        addAction(`Auto-inserted ${midi.name}${label} at beat ${autoInsertAction.startBeat ?? 0}.`);
        setStatus('MIDI inserted. Refreshing session…');
      }

      if ((plan.audiotoolActions?.length ?? 0) > 0) {
        await refreshSession();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Assistant action failed.');
    } finally {
      setIsChatting(false);
    }
  }

  async function handleAnalyzeReference(file: File) {
    setIsAnalyzingReference(true);
    setStatus(`Analyzing ${file.name} with Gemini Flash...`);
    try {
      const result = await services.nextSteps.analyzeReference(file);
      setNextStepsAnalysis(result);
      addAction(`Analyzed ${file.name}; Next Steps roadmap is ready.`);
      setStatus('Next Steps roadmap is ready.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Reference analysis failed.');
      throw error;
    } finally {
      setIsAnalyzingReference(false);
    }
  }

  function handleRoadmapHelp(prompt: string) {
    setWorkspaceView('create');
    setChatDraft({
      id: crypto.randomUUID(),
      text: prompt
    });
    setSidekickFocusSignal((current) => current + 1);
    addAction('Loaded a Next Steps roadmap prompt into Sidekick Assistant.');
    setStatus('Roadmap step sent to Sidekick Assistant.');
  }

  async function handlePreview() {
    if (!generatedMidi) return;
    try {
      await services.nexus.previewMidi?.(generatedMidi);
      setStatus('Playing generated MIDI preview.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Preview failed.');
    }
  }

  async function handleInsert(options: MidiInsertOptions) {
    if (!generatedMidi) return;
    if (insertInFlightRef.current) {
      const message = 'Insert already in progress. Wait for the current Audiotool write to finish.';
      console.warn('[Sidekick] Ignored duplicate insert click.');
      setStatus(message);
      addAction(message);
      return;
    }
    if (services.nexusMode === 'real' && !connectionState?.connected) {
      const message = connectionState?.projectUrl
        ? 'Audiotool project sync is offline. Re-sync the project and wait for Project synced before inserting.'
        : 'Sync an Audiotool project before inserting MIDI.';
      console.warn('[Sidekick] Blocked insert because the Audiotool document is not connected.', {
        projectUrl: connectionState?.projectUrl,
        connected: connectionState?.connected
      });
      setStatus(message);
      addAction(message);
      return;
    }
    console.log('[Sidekick] Insert requested.', {
      trackMode: options.trackMode ?? 'distribute',
      startBeat: options.startBeat ?? 0,
      connected: connectionState?.connected ?? null,
      noteTrackCount: noteTracks.length
    });
    insertInFlightRef.current = true;
    setIsInserting(true);
    try {
      const activeTracks = generatedMidi.tracks.filter((t) => t.notes.length > 0);
      if (activeTracks.length === 0) {
        setStatus('Nothing to insert: generated MIDI has no notes.');
        addAction('Insert canceled because the generated MIDI contained no notes.');
        return;
      }

      const insertOptions: MidiInsertOptions = { ...options };
      if ((options.trackMode ?? 'distribute') !== 'selected') {
        const style = services.styles.getById(generatedMidi.request.styleProfileId);
        const availableTracks: SessionTrack[] = [...noteTracks];
        const usedTrackIds = new Set<string>();
        const distributedTargets: string[] = [];
        let createdCount = 0;
        const isStaticDeployment = import.meta.env.VITE_STATIC_DEPLOYMENT === 'true'
          || (typeof window !== 'undefined' && window.location.hostname.toLowerCase().endsWith('github.io'));
        let autoCreateUnavailable = isStaticDeployment;
        if (autoCreateUnavailable && services.nexus.createSuggestedInstrument) {
          addAction('Static deployment detected: skipping auto-creation of new instrument lanes for insertion.');
        }

        for (const track of activeTracks) {
          const expectedInstrumentSlug = style.instruments?.[track.role];
          let target = findCompatibleNoteTrack(availableTracks, track.role, expectedInstrumentSlug, usedTrackIds);
          if (!target) {
            target = availableTracks.find((candidate) => !usedTrackIds.has(candidate.id));
          }
          if (!target && services.nexus.createSuggestedInstrument && !autoCreateUnavailable) {
            try {
              setStatus(`Creating ${track.role} instrument track for insertion...`);
              addAction(`Creating ${track.role} instrument track for insertion...`);
              console.log('[Sidekick] Creating insertion instrument.', {
                generatedTrack: track.name,
                role: track.role,
                expectedInstrumentSlug: sanitizeAutoCreateInstrumentSlug(style.instruments?.[track.role]) ?? null
              });
              const created = await services.nexus.createSuggestedInstrument({
                name: track.name,
                role: track.role,
                tags: [track.role],
                audiotoolInstrumentSlug: sanitizeAutoCreateInstrumentSlug(style.instruments?.[track.role])
              });
              availableTracks.push(created);
              target = created;
              createdCount += 1;
            } catch (error) {
              autoCreateUnavailable = true;
              console.warn(
                '[Sidekick] Creating insertion instrument failed. Falling back to existing note lanes.',
                error
              );
              addAction('Could not auto-create a new instrument lane; reusing existing note lanes for insertion.');
            }
          }
          if (!target) {
            target = availableTracks[0];
          }
          if (!target) {
            throw new Error('No compatible Audiotool note lane available for insertion.');
          }
          usedTrackIds.add(target.id);
          distributedTargets.push(target.id);
        }

        if (createdCount > 0) {
          addAction(`Created ${createdCount} insertion instrument track${createdCount === 1 ? '' : 's'} before insertion.`);
        }
        insertOptions.targetTrackIds = distributedTargets;
      }

      setStatus('Inserting generated MIDI into Audiotool...');
      addAction(`Submitting ${generatedMidi.name} to Audiotool at bar ${Math.floor((insertOptions.startBeat ?? 0) / 4) + 1}, beat ${((insertOptions.startBeat ?? 0) % 4) + 1}.`);
      if (!services.nexus.insertMidi) {
        throw new Error('This connection does not support MIDI insertion. Refresh Sidekick and re-sync your project.');
      }
      await services.nexus.insertMidi(generatedMidi, insertOptions);
      const startBeat = insertOptions.startBeat ?? 0;
      addAction(`Inserted ${generatedMidi.name} at bar ${Math.floor(startBeat / 4) + 1}, beat ${(startBeat % 4) + 1}.`);
      setStatus('Inserted generated MIDI into Audiotool. Refreshing session...');
      await refreshSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Insert failed.';
      console.error('[Sidekick] Insert failed in App.', error);
      setStatus(message);
      addAction(`Insert failed: ${message}`);
    } finally {
      console.log('[Sidekick] Insert flow finished.');
      insertInFlightRef.current = false;
      setIsInserting(false);
    }
  }

  async function handleCreateNoteTracks(count: number) {
    if (!generatedMidi) return;
    try {
      if (count <= 0) return;
      const style = services.styles.getById(generatedMidi.request.styleProfileId);
      const activeTracks = generatedMidi.tracks.filter((t) => t.notes.length > 0);

      if (!services.nexus.createSuggestedInstrument) {
        setStatus(`Creating ${count} note lane${count === 1 ? '' : 's'}...`);
        const created = await services.nexus.createAdditionalNoteTracks?.(count);
        addAction(`Created ${created ?? 0} extra Audiotool note lane${created === 1 ? '' : 's'}.`);
        await refreshSession();
        return;
      }

      setStatus(`Creating up to ${count} insertion instrument track${count === 1 ? '' : 's'}...`);
      const availableTracks: SessionTrack[] = [...noteTracks];
      const reservedTrackIds = new Set<string>();

      let created = 0;
      for (const track of activeTracks) {
        if (created >= count) break;
        const expectedInstrumentSlug = style.instruments?.[track.role];
        const matchingTrack = findCompatibleNoteTrack(availableTracks, track.role, expectedInstrumentSlug, reservedTrackIds);
        if (matchingTrack) {
          reservedTrackIds.add(matchingTrack.id);
          continue;
        }
        const result = await services.nexus.createSuggestedInstrument?.({
          name: track.name,
          role: track.role,
          tags: [track.role],
          audiotoolInstrumentSlug: sanitizeAutoCreateInstrumentSlug(style.instruments?.[track.role])
        });
        if (result) {
          created += 1;
          reservedTrackIds.add(result.id);
          availableTracks.push(result);
        }
      }
      addAction(`Created ${created} insertion instrument track${created === 1 ? '' : 's'}.`);
      await refreshSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create instrument tracks.';
      console.error('[Sidekick] Create note tracks failed.', error);
      setStatus(message);
      addAction(`Create tracks failed: ${message}`);
    }
  }

  function addAction(message: string) {
    setActionLog((current) => [createActionLogEntry(message), ...current].slice(0, 4));
  }

  const selectedStyle = services.styles.getById(generationState.styleProfileId);
  const chatStyle = services.styles.getById(analysis?.session.styleProfileId ?? selectedStyle.id);
  const insertionStyleInstruments = sanitizeAutoCreateInstrumentMap(selectedStyle.instruments);
  const noteTracks = analysis?.session.tracks.filter((track) => track.tags?.includes('noteTrack')) ?? [];
  const projectInstrumentNames = analysis?.session.tracks.map((track) => track.instrumentName).filter((name): name is string => Boolean(name)) ?? [];
  const canWriteToAudiotool = services.nexusMode === 'mock' || Boolean(connectionState?.connected);
  const insertHint = services.nexusMode === 'real' && !connectionState?.connected
    ? connectionState?.projectUrl
      ? 'Audiotool project sync is offline. Wait for Project synced before inserting or creating tracks.'
      : 'Sync an Audiotool project before inserting MIDI.'
    : isInserting
      ? 'Insert in progress. Wait for the current Audiotool write to finish.'
      : undefined;

  function handleLayoutPresetSelect(preset: DashboardLayoutPreset) {
    setLayoutPreset(preset);
    setIsLayoutMenuOpen(false);
  }

  return (
    <>
      <main className="app-shell app-dashboard">
        <section className="dashboard-top">
          <section className="card dashboard-brand-card" aria-label="Sidekick overview">
            <img className="dashboard-brand-icon" src={brandIconUrl} alt="Sidekick logo" width={56} height={56} />
            <p className="app-eyebrow mono">Audiotool NEXUS</p>
            <h1 className="app-title">Sidekick</h1>
            <div className="pill-row">
              <span className="pill">{services.nexusMode}</span>
              <span className="pill">{services.nexusSource}</span>
            </div>
          </section>

          {analysis ? (
            <SessionSummary analysis={analysis} style={selectedStyle} />
          ) : (
            <section className="card" aria-labelledby="session-summary-title">
              <h2 id="session-summary-title" className="dashboard-header-title">
                Session sketch
              </h2>
              <p className="subtle">Sync a project to inspect the session summary.</p>
            </section>
          )}

          <AudiotoolConnectionPanel
            nexus={services.nexus}
            state={connectionState}
            onRefresh={refreshSession}
            runtimeMode={services.nexusMode}
            runtimeSource={services.nexusSource}
            onUseClientId={useAudiotoolClientId}
            compact
          />
        </section>

        <section className={`dashboard-body dashboard-layout-${layoutPreset}`} aria-label="Customizable dashboard cards">
          <aside className="dashboard-left-rail stack">
            <section className="card" aria-labelledby="session-assistant-title">
              <details className="card-dropdown" open>
                <summary className="card-dropdown-toggle">
                  <h2 id="session-assistant-title" className="dashboard-header-title">
                    Session Assistant
                  </h2>
                </summary>
                <div className="card-dropdown-content">
                  <p className="status-bar">{status}</p>
                  {actionLog.length > 0 ? (
                    <ul className="action-log mono" aria-label="Recent Sidekick actions">
                      {actionLog.map((entry) => (
                        <li key={entry.id}>{entry.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            </section>
            <GeminiConfigPanel
              mode={services.geminiMode}
              hasApiKey={services.hasGeminiApiKey}
              onSaveApiKey={saveGeminiApiKey}
              onClearApiKey={clearGeminiApiKey}
            />
            <ChatPanel
              key={chatDraft?.id ?? 'default-chat-draft'}
              latestPlan={chatPlan}
              isWorking={isChatting}
              onSend={handleChat}
              draft={chatDraft}
              styleInstrumentByRole={chatStyle.instruments}
              projectInstrumentNames={projectInstrumentNames}
              focusSignal={sidekickFocusSignal}
            />
          </aside>

          <section className="card dashboard-workspace" aria-labelledby="workspace-title">
            <div className="workspace-toolbar">
              <h2 id="workspace-title" className="workspace-title">
                Workspace
              </h2>
              <div className="workspace-tabs" role="tablist" aria-label="Primary workflows">
                <button
                  id="workspace-tab-create"
                  role="tab"
                  aria-selected={workspaceView === 'create'}
                  aria-controls="workspace-panel-create"
                  type="button"
                  className={`workspace-tab ${workspaceView === 'create' ? 'is-active' : ''}`}
                  onClick={() => setWorkspaceView('create')}
                >
                  Create
                </button>
                <button
                  id="workspace-tab-learn"
                  role="tab"
                  aria-selected={workspaceView === 'learn'}
                  aria-controls="workspace-panel-learn"
                  type="button"
                  className={`workspace-tab ${workspaceView === 'learn' ? 'is-active' : ''}`}
                  onClick={() => setWorkspaceView('learn')}
                >
                  Learn
                </button>
              </div>
            </div>

            {workspaceView === 'create' ? (
              <div id="workspace-panel-create" role="tabpanel" aria-labelledby="workspace-tab-create" className="workspace-panel stack">
                <GenerateMusicPanel
                  styles={styles}
                  value={generationState}
                  isGenerating={isGenerating}
                  onChange={setGenerationState}
                  onGenerate={() => void handleGenerate()}
                />
                {generatedMidi ? (
                  <>
                    <p className="section-label" role="separator" aria-hidden="true">
                      Output
                    </p>
                    <GeneratedMidiCard
                      midi={generatedMidi}
                      canInsert={Boolean(services.nexus.insertMidi) && !isInserting && canWriteToAudiotool}
                      insertHint={insertHint}
                      noteTracks={noteTracks}
                      styleInstruments={insertionStyleInstruments}
                      canAutoCreateInstruments={Boolean(services.nexus.createSuggestedInstrument)}
                      onPreview={() => void handlePreview()}
                      onInsert={(options) => void handleInsert(options)}
                      onRegenerate={() => void handleGenerate()}
                      onCreateNoteTracks={(count) => void handleCreateNoteTracks(count)}
                    />
                  </>
                ) : null}
              </div>
            ) : (
              <div id="workspace-panel-learn" role="tabpanel" aria-labelledby="workspace-tab-learn" className="workspace-panel stack">
                <NextStepsPanel
                  analysis={nextStepsAnalysis}
                  isWorking={isAnalyzingReference}
                  onAnalyze={handleAnalyzeReference}
                  onRoadmapHelp={handleRoadmapHelp}
                />
              </div>
            )}
          </section>
        </section>
        {isChatting || isAnalyzingReference ? (
          <div className="sidekick-loading-overlay" role="status" aria-live="polite" aria-label="Sidekick is working">
            <div className="sidekick-loading-card">
              <div className="music-note-loader" aria-hidden="true">
                <span className="music-note-head">
                  <span className="music-note-fill" />
                </span>
                <span className="music-note-stem" />
                <span className="music-note-flag" />
              </div>
              <p className="sidekick-loading-text mono">sidekicking; analyzing; producing; vibing</p>
            </div>
          </div>
        ) : null}
      </main>
      <div className="dashboard-layout-fab" ref={layoutMenuContainerRef}>
        <button
          className="button secondary small layout-toggle-button"
          type="button"
          aria-expanded={isLayoutMenuOpen}
          aria-controls="layout-preset-menu"
          onClick={() => setIsLayoutMenuOpen((open) => !open)}
        >
          Layout
        </button>
        {isLayoutMenuOpen ? (
          <div id="layout-preset-menu" className="dashboard-layout-menu" role="menu" aria-label="Choose dashboard layout">
            {DASHBOARD_LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`dashboard-layout-menu-option ${layoutPreset === option.id ? 'is-active' : ''}`}
                type="button"
                role="menuitemradio"
                aria-checked={layoutPreset === option.id}
                onClick={() => handleLayoutPresetSelect(option.id)}
              >
                <span>{option.label}</span>
                <small className="subtle">{option.description}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

interface ActionLogEntry {
  id: string;
  message: string;
}

type DashboardLayoutPreset = 'classic' | 'balanced' | 'sidekick-focus' | 'workspace-focus' | 'stacked';

const DASHBOARD_LAYOUT_OPTIONS: Array<{ id: DashboardLayoutPreset; label: string; description: string }> = [
  { id: 'classic', label: 'Classic', description: 'Original two-column setup.' },
  { id: 'balanced', label: 'Balanced', description: 'Equal space for Sidekick and Workspace.' },
  { id: 'sidekick-focus', label: 'Sidekick Focus', description: 'Wider left rail for assistant flow.' },
  { id: 'workspace-focus', label: 'Workspace Focus', description: 'Wider workspace for production tasks.' },
  { id: 'stacked', label: 'Stacked', description: 'Single-column reading layout.' }
];

function createActionLogEntry(message: string): ActionLogEntry {
  return {
    id: crypto.randomUUID(),
    message
  };
}

const PRESET_REFERENCE_PATTERN = /^(?:presets\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeAutoCreateInstrumentSlug(instrumentSlug: string | undefined): string | undefined {
  const trimmed = instrumentSlug?.trim();
  if (!trimmed) return undefined;
  if (PRESET_REFERENCE_PATTERN.test(trimmed) && !trimmed.toLowerCase().startsWith('presets/')) {
    return `presets/${trimmed}`;
  }
  return trimmed;
}

function sanitizeAutoCreateInstrumentMap(
  instruments: Partial<Record<TrackRole, string>> | undefined
): Partial<Record<TrackRole, string>> | undefined {
  if (!instruments) return undefined;

  const entries = Object.entries(instruments)
    .map(([role, slug]) => [role, sanitizeAutoCreateInstrumentSlug(slug)])
    .filter((entry): entry is [string, string] => Boolean(entry[1]));

  return entries.length > 0 ? Object.fromEntries(entries) as Partial<Record<TrackRole, string>> : undefined;
}
