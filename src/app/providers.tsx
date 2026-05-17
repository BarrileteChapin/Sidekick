import { ChatOrchestrator } from '../chat/ChatOrchestrator';
import { BrowserGeminiAdapter } from '../chat/BrowserGeminiAdapter';
import { ProxyGeminiAdapter } from '../chat/GeminiAdapter';
import { LibraryIndex } from '../data/library/libraryIndex';
import { MusicStyleRegistry } from '../data/musicStyles';
import { getStoredGeminiApiKey } from '../gemini/userKeyStore';
import { GenerationService } from '../generation/generationService';
import { BrowserNextStepsClient } from '../nextSteps/BrowserNextStepsClient';
import { DisabledNextStepsClient, ProxyNextStepsClient, type NextStepsClient } from '../nextSteps/NextStepsClient';
import { createNexusRuntime } from '../nexus/createNexusClient';
import type { NexusClient } from '../nexus/NexusClient';

export type GeminiRuntimeMode = 'browser-key' | 'proxy' | 'offline';

export interface AppServices {
  styles: MusicStyleRegistry;
  library: LibraryIndex;
  generator: GenerationService;
  chat: ChatOrchestrator;
  nextSteps: NextStepsClient;
  nexus: NexusClient;
  nexusMode: 'mock' | 'real';
  nexusSource: string;
  geminiMode: GeminiRuntimeMode;
  hasGeminiApiKey: boolean;
}

export function createAppServices(options: { audiotoolClientId?: string; audiotoolRedirectUrl?: string; geminiApiKey?: string } = {}): AppServices {
  const styles = new MusicStyleRegistry();
  const nexusRuntime = createNexusRuntime({
    audiotoolClientId: options.audiotoolClientId,
    audiotoolRedirectUrl: options.audiotoolRedirectUrl
  });

  const runtime = resolveGeminiRuntime(options.geminiApiKey);
  const nextStepsClient = runtime.mode === 'browser-key'
    ? new BrowserNextStepsClient(runtime.apiKey)
    : runtime.mode === 'proxy'
      ? new ProxyNextStepsClient()
      : new DisabledNextStepsClient('Next Steps analysis needs a Gemini API key in static GitHub Pages mode. Add your key in the Gemini Access panel.');

  console.info('[Sidekick] Service runtime selected.', {
    nexusMode: nexusRuntime.mode,
    nexusSource: nexusRuntime.source,
    geminiMode: runtime.mode,
    hasGeminiApiKey: runtime.mode === 'browser-key'
  });

  return {
    styles,
    library: new LibraryIndex(),
    generator: new GenerationService(styles),
    chat: new ChatOrchestrator(
      styles,
      runtime.mode === 'browser-key' ? new BrowserGeminiAdapter(runtime.apiKey) : runtime.mode === 'proxy' ? new ProxyGeminiAdapter() : undefined
    ),
    nextSteps: nextStepsClient,
    nexus: nexusRuntime.client,
    nexusMode: nexusRuntime.mode,
    nexusSource: nexusRuntime.source,
    geminiMode: runtime.mode,
    hasGeminiApiKey: runtime.mode === 'browser-key'
  };
}

function resolveGeminiRuntime(overrideApiKey?: string):
  | { mode: 'browser-key'; apiKey: string }
  | { mode: 'proxy' }
  | { mode: 'offline' } {
  const apiKey = (overrideApiKey?.trim() || getStoredGeminiApiKey() || '').trim();
  if (apiKey) {
    console.info('[Sidekick] Gemini runtime: using browser key.');
    return { mode: 'browser-key', apiKey };
  }

  if (isStaticHostingRuntime()) {
    console.warn('[Sidekick] Gemini runtime: static hosting detected without browser key. Falling back to offline mode.');
    return { mode: 'offline' };
  }

  console.info('[Sidekick] Gemini runtime: using local proxy endpoints.');
  return { mode: 'proxy' };
}

function isStaticHostingRuntime(): boolean {
  if (typeof window === 'undefined') return false;

  const configuredStaticMode = import.meta.env.VITE_STATIC_DEPLOYMENT === 'true';
  const host = window.location.hostname.toLowerCase();
  return configuredStaticMode || host.endsWith('github.io');
}
