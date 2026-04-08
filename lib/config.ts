import fs from 'fs';
import path from 'path';
import type { AppConfig } from '@/types';

const CONFIG_PATH = path.join(process.env.DATA_DIR || process.cwd(), 'config.json');

const CONFIG_DEFAULTS: Pick<AppConfig, 'aiScoringEnabled' | 'ollamaBaseUrl' | 'ollamaModel'> = {
  aiScoringEnabled: false,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  ollamaModel: 'llama3.2-vision:11b',
};

export function readConfig(): AppConfig {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return { ...CONFIG_DEFAULTS, ...(JSON.parse(raw) as AppConfig) };
}

export function writeConfig(config: AppConfig): void {
  if (config.inboundFolder && !fs.existsSync(config.inboundFolder)) {
    throw new Error(`Inbound folder does not exist: ${config.inboundFolder}`);
  }
  if (config.outboundBase && !fs.existsSync(config.outboundBase)) {
    throw new Error(`Output base folder does not exist: ${config.outboundBase}`);
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
