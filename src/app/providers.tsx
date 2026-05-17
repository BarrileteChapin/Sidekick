import { ChatOrchestrator } from '../chat/ChatOrchestrator';
import { ProxyGeminiAdapter } from '../chat/GeminiAdapter';
import { LibraryIndex } from '../data/library/libraryIndex';
import { MusicStyleRegistry } from '../data/musicStyles';
import { GenerationService } from '../generation/generationService';
import { ProxyNextStepsClient, type NextStepsClient } from '../nextSteps/NextStepsClient';
import { createNexusRuntime } from '../nexus/createNexusClient';
import type { NexusClient } from '../nexus/NexusClient';

export interface AppServices {
  styles: MusicStyleRegistry;
  library: LibraryIndex;
  generator: GenerationService;
  chat: ChatOrchestrator;
  nextSteps: NextStepsClient;
  nexus: NexusClient;
  nexusMode: 'mock' | 'real';
  nexusSource: string;
}

export function createAppServices(options: { audiotoolClientId?: string; audiotoolRedirectUrl?: string } = {}): AppServices {
  const styles = new MusicStyleRegistry();
  const nexusRuntime = createNexusRuntime({
    audiotoolClientId: options.audiotoolClientId,
    audiotoolRedirectUrl: options.audiotoolRedirectUrl
  });
  return {
    styles,
    library: new LibraryIndex(),
    generator: new GenerationService(styles),
    chat: new ChatOrchestrator(styles, new ProxyGeminiAdapter()),
    nextSteps: new ProxyNextStepsClient(),
    nexus: nexusRuntime.client,
    nexusMode: nexusRuntime.mode,
    nexusSource: nexusRuntime.source
  };
}
