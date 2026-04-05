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
  const [inbound, setInbound] = useState('');
  const [outbound, setOutbound] = useState('');
  const [threshold, setThreshold] = useState(90);
  const [extensions, setExtensions] = useState<string[]>(['jpg', 'jpeg', 'png', 'heic', 'webp']);
  const [saving, setSaving] = useState(false);

  // Sync local state when config loads asynchronously
  useEffect(() => {
    if (config) {
      setInbound(config.inboundFolder);
      setOutbound(config.outboundBase);
      setThreshold(config.similarityThreshold);
      setExtensions(config.supportedExtensions);
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
        inboundFolder: inbound.trim(),
        outboundBase: outbound.trim(),
        similarityThreshold: threshold,
        supportedExtensions: extensions,
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

  // Collapsed summary while a scan is running
  if (scanning) {
    return (
      <div className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        {inbound || '—'} → {outbound || '—'} · {threshold}% threshold
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 text-sm">
      <p className="mb-3 font-medium">Configuration</p>

      <div className="mb-3 space-y-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Inbound folder</label>
          <input
            value={inbound}
            onChange={(e) => setInbound(e.target.value)}
            placeholder="/absolute/path/to/inbound"
            className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Output base folder</label>
          <input
            value={outbound}
            onChange={(e) => setOutbound(e.target.value)}
            placeholder="/absolute/path/to/output"
            className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">
          Similarity threshold — <strong>{threshold}%</strong>
        </label>
        <input
          type="range"
          min={80}
          max={100}
          step={1}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>80%</span>
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

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
