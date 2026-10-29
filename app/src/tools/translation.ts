export type TranslationLanguage = 'zh' | 'en';
export type TranslationEngine = 'google-web' | 'minimax' | 'glm' | 'deepseek' | 'custom';

export interface TranslationRequest {
  text: string;
  source: TranslationLanguage | 'auto';
  target: TranslationLanguage;
  provider: TranslationEngine;
  model?: string;
  endpoint?: string;
  context?: string;
  /** Development-only ephemeral key; desktop normally uses encrypted safeStorage. */
  apiKey?: string;
}

export interface TranslationProgress {
  type: 'progress' | 'done';
  text: string;
  completed: number;
  total: number;
  detectedSource?: string;
  provider?: string;
}

export interface ProviderConfig {
  name: string;
  endpoint: string;
  model: string;
  configured: boolean;
}

export interface TranslationConfig {
  maxCharacters: number;
  maxContextCharacters: number;
  defaultContext: string;
  presets: Record<string, string>;
  providers: Record<string, ProviderConfig>;
}

export interface TranslationProvider {
  id: string;
  translate(request: TranslationRequest, signal?: AbortSignal, onProgress?: (part: TranslationProgress) => void): Promise<TranslationProgress>;
}

export async function getTranslationConfig(): Promise<TranslationConfig> {
  const response = await fetch('/api/translation/config');
  if (!response.ok) throw new Error('无法读取翻译服务配置，请确认本地服务正在运行。');
  return response.json();
}

export function detectDirection(text: string): TranslationLanguage {
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return han > 0 && han * 2 >= latin ? 'zh' : 'en';
}

export const translationClient: TranslationProvider = {
  id: 'local-provider-router',
  async translate(request, signal, onProgress) {
    const response = await fetch('/api/translation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: '翻译服务暂时不可用。' }));
      throw new Error(body.error || '翻译服务暂时不可用。');
    }
    if (!response.body) throw new Error('无法读取翻译响应。');
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let final: TranslationProgress | undefined;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const part = JSON.parse(line);
      if (part.type === 'error') throw new Error(part.error);
      if (part.type === 'progress' || part.type === 'done') { onProgress?.(part); if (part.type === 'done') final = part; }
    };
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
        lines.forEach(consume);
      }
      buffer += decoder.decode(); if (buffer) consume(buffer);
      if (!final) throw new Error('连接已中断。已完成的部分保留在右侧，可重新翻译。');
      return final;
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  },
};
