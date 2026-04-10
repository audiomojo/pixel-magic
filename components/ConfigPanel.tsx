'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppConfig } from '@/types';

const ALL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'tiff', 'gif', 'bmp'];

interface ConfigPanelProps {
  config: AppConfig | null;
  scanning: boolean;
  onSaved: (config: AppConfig) => void;
}

export function ConfigPanel({ config, scanning, onSaved }: ConfigPanelProps) {
  const [threshold, setThreshold] = useState(90);
  const [extensions, setExtensions] = useState<string[]>(['jpg', 'jpeg', 'png', 'heic', 'webp']);
  const [saving, setSaving] = useState(false);
  const [aiScoringEnabled, setAiScoringEnabled] = useState(false);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://host.docker.internal:11434');
  const [ollamaModel, setOllamaModel] = useState('qwen2.5vl:7b');

  useEffect(() => {
    if (config) {
      setThreshold(config.similarityThreshold);
      setExtensions(config.supportedExtensions);
      setAiScoringEnabled(config.aiScoringEnabled ?? false);
      setOllamaBaseUrl(config.ollamaBaseUrl ?? 'http://host.docker.internal:11434');
      setOllamaModel(config.ollamaModel ?? 'qwen2.5vl:7b');
    }
  }, [config]);

  function toggleExtension(ext: string) {
    setExtensions((prev) =>
      prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: AppConfig = {
        similarityThreshold: threshold,
        supportedExtensions: extensions,
        aiScoringEnabled,
        ollamaBaseUrl: ollamaBaseUrl.trim(),
        ollamaModel: ollamaModel.trim(),
      };
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error: string };
        toast.error(error);
      } else {
        toast.success('Configuration saved');
        onSaved(body);
      }
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  if (scanning) {
    return (
      <div className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        {threshold}% similarity threshold
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 text-sm">
      <p className="mb-3 font-medium">Configuration</p>

      <div className="mb-3">
        <label htmlFor="similarity-threshold" className="mb-1 block text-xs text-muted-foreground">
          Similarity threshold — <strong>{threshold}%</strong>
        </label>
        <input
          id="similarity-threshold"
          type="range"
          min={50}
          max={100}
          step={1}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-xs text-muted-foreground">File extensions</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_EXTENSIONS.map((ext) => {
            const active = extensions.includes(ext);
            return (
              <button
                key={ext}
                type="button"
                onClick={() => toggleExtension(ext)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                {ext}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-xs text-muted-foreground">AI Scoring</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={aiScoringEnabled}
              onChange={(e) => setAiScoringEnabled(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-primary"
            />
            Enable automatic photo scoring via Ollama
          </label>
          {aiScoringEnabled && (
            <>
              <div>
                <label htmlFor="ollama-url" className="mb-1 block text-xs text-muted-foreground">
                  Ollama base URL
                </label>
                <input
                  id="ollama-url"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="ollama-model" className="mb-1 block text-xs text-muted-foreground">
                  Ollama model
                </label>
                <input
                  id="ollama-model"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const res = await fetch('/api/scoring/rescore', { method: 'POST' });
                  if (!res.ok) {
                    const { error } = (await res.json()) as { error: string };
                    toast.error(error);
                  } else {
                    toast.success('Re-scoring started');
                  }
                }}
                className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
              >
                Re-score All
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
