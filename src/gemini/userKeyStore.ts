const GEMINI_API_KEY_STORAGE_KEY = 'sidekick:gemini-api-key';

export function getStoredGeminiApiKey(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim();
  return value ? value : null;
}

export function storeGeminiApiKey(apiKey: string): void {
  if (typeof localStorage === 'undefined') return;
  const value = apiKey.trim();
  if (!value) return;
  localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, value);
}

export function clearStoredGeminiApiKey(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
}