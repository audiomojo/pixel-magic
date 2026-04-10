import fs from 'fs';
import path from 'path';
import type { AppConfig } from '@/types';

function configPath(): string {
  return path.join(process.env.DATA_DIR || process.cwd(), 'config.json');
}

const CONFIG_DEFAULTS: Pick<AppConfig, 'aiScoringEnabled' | 'ollamaBaseUrl' | 'ollamaModel'> = {
  aiScoringEnabled: false,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  ollamaModel: 'llama3.2-vision:11b',
};

export function readConfig(): AppConfig {
  const raw = fs.readFileSync(configPath(), 'utf-8');
  return { ...CONFIG_DEFAULTS, ...(JSON.parse(raw) as AppConfig) };
}

export function writeConfig(config: AppConfig): void {
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8');
}
