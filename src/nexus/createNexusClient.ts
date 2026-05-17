import { AudiotoolSdkNexusClient } from './AudiotoolSdkNexusClient';
import { MockNexusClient } from './MockNexusClient';
import type { NexusClient } from './NexusClient';
import { RealNexusClient, type AudiotoolNexusLike } from './RealNexusClient';

type NexusWindow = Window & typeof globalThis & {
  audiotoolNexus?: AudiotoolNexusLike;
  nexus?: AudiotoolNexusLike;
  NEXUS?: AudiotoolNexusLike;
};

export type NexusRuntimeMode = 'mock' | 'real' | 'auto';

export interface NexusRuntime {
  client: NexusClient;
  mode: 'mock' | 'real';
  source: string;
}

export interface NexusRuntimeOptions {
  mode?: NexusRuntimeMode;
  audiotoolClientId?: string;
  audiotoolRedirectUrl?: string;
}

const legacyStoredClientIdKey = 'sidekick:audiotool-client-id';
const clientIdOverrideKey = 'sidekick:audiotool-client-id-override';

export function createNexusRuntime(options: NexusRuntimeOptions = {}): NexusRuntime {
  const mode = options.mode ?? getConfiguredMode();
  const hostNexus = getHostNexus();

  if (mode !== 'mock' && hostNexus) {
    return {
      client: new RealNexusClient(hostNexus),
      mode: 'real',
      source: 'Audiotool host NEXUS'
    };
  }

  const clientId = resolveClientId(options.audiotoolClientId);
  if (mode !== 'mock' && typeof clientId === 'string' && clientId.length > 0) {
    const explicitClientId = options.audiotoolClientId?.trim();
    if (explicitClientId) {
      storeClientIdOverride(explicitClientId);
    }
    return {
      client: new AudiotoolSdkNexusClient(clientId, getRedirectUrl(options.audiotoolRedirectUrl)),
      mode: 'real',
      source: '@audiotool/nexus OAuth'
    };
  }

  return {
    client: new MockNexusClient(),
    mode: 'mock',
    source:
      mode === 'mock'
        ? 'Mock NEXUS'
        : 'Mock fallback; set VITE_AUDIOTOOL_CLIENT_ID or enter a client ID to enable Audiotool login'
  };
}

function resolveClientId(optionClientId: string | undefined): string | null {
  const explicitClientId = optionClientId?.trim();
  if (explicitClientId) return explicitClientId;

  const configuredClientId = import.meta.env.VITE_AUDIOTOOL_CLIENT_ID?.trim();
  if (configuredClientId) return configuredClientId;

  const overrideClientId = getStoredClientIdOverride();
  if (overrideClientId) return overrideClientId;

  return getLegacyStoredClientId();
}

function getConfiguredMode(): NexusRuntimeMode {
  const mode = import.meta.env.VITE_SIDEKICK_MODE;
  return mode === 'real' || mode === 'mock' || mode === 'auto' ? mode : 'auto';
}

function getHostNexus(): AudiotoolNexusLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const hostWindow = window as NexusWindow;
  return hostWindow.audiotoolNexus ?? hostWindow.nexus ?? hostWindow.NEXUS ?? null;
}

function getLegacyStoredClientId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(legacyStoredClientIdKey);
  return value?.trim() || null;
}

function getStoredClientIdOverride(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(clientIdOverrideKey);
  return value?.trim() || null;
}

function storeClientIdOverride(clientId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(clientIdOverrideKey, clientId);
}

function getRedirectUrl(optionRedirectUrl: string | undefined): string {
  const redirectFromOption = optionRedirectUrl?.trim();
  if (redirectFromOption) return redirectFromOption;

  const redirectFromEnv = import.meta.env.VITE_AUDIOTOOL_REDIRECT_URL?.trim();
  if (redirectFromEnv) return redirectFromEnv;

  if (typeof window !== 'undefined') {
    return getRuntimeRedirectUrl();
  }

  return 'http://127.0.0.1:5173/';
}

function getRuntimeRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL ?? '/', window.location.origin).toString();
}
