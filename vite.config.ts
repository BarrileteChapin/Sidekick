import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { createGeminiNextSteps, createGeminiPlan } from './server/gemini/route';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const localEnv = readLocalServerEnv();
  const basePath = normalizeBasePath(env.VITE_BASE_PATH);
  process.env.GEMINI_API_KEY = localEnv.GEMINI_API_KEY ?? env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
  process.env.GEMINI_FLASH_MODEL = localEnv.GEMINI_FLASH_MODEL ?? env.GEMINI_FLASH_MODEL ?? process.env.GEMINI_FLASH_MODEL;

  return {
    base: basePath,
    plugins: [react(), geminiApiPlugin()],
    server: {
      host: '127.0.0.1',
      port: 5173
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts'
    }
  };
});

function geminiApiPlugin(): Plugin {
  return {
    name: 'sidekick-gemini-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://127.0.0.1:5173').pathname;

        if (path === '/api/gemini/plan') {
          void handleApiRequest(request, response, createGeminiPlan);
          return;
        }

        if (path === '/api/gemini/next-steps') {
          void handleApiRequest(request, response, createGeminiNextSteps);
          return;
        }

        next();
      });
    }
  };
}

async function handleApiRequest(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  handler: (request: Request) => Promise<Response>
) {
  try {
    const body = incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : await readBody(incoming);
    const response = await handler(
      new Request(`http://127.0.0.1:5173${incoming.url ?? '/'}`, {
        method: incoming.method,
        headers: toHeaders(incoming),
        body: body ? new Uint8Array(body) : undefined
      })
    );

    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader('Content-Type', 'application/json');
    outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected API error.' }));
  }
}

function toHeaders(incoming: IncomingMessage): Headers {
  const headers = new Headers();
  Object.entries(incoming.headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
      return;
    }
    if (typeof value === 'string') {
      headers.set(key, value);
    }
  });
  return headers;
}

function readBody(incoming: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer | string) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    incoming.on('end', () => resolve(Buffer.concat(chunks)));
    incoming.on('error', reject);
  });
}

function readLocalServerEnv(): Partial<Record<'GEMINI_API_KEY' | 'GEMINI_FLASH_MODEL', string>> {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return {};

  return readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .reduce<Partial<Record<'GEMINI_API_KEY' | 'GEMINI_FLASH_MODEL', string>>>((values, line) => {
      const match = line.match(/^\s*(GEMINI_API_KEY|GEMINI_FLASH_MODEL)\s*=\s*(.*)\s*$/);
      if (!match) return values;

      const key = match[1] as 'GEMINI_API_KEY' | 'GEMINI_FLASH_MODEL';
      const rawValue = match[2];
      values[key] = rawValue.replace(/^['"]|['"]$/g, '');
      return values;
    }, {});
}

function normalizeBasePath(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw || raw === '/') return '/';
  const cleaned = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${cleaned}/`;
}
