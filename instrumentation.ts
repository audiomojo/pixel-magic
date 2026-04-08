export async function register() {
  // Only run scorer on the Node.js server runtime, not the edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { readConfig } = await import('./lib/config');
    const { startScorer } = await import('./lib/scorer');
    const { getScoringCounts } = await import('./lib/db');

    try {
      const config = readConfig();
      if (config.aiScoringEnabled) {
        const { queued, scoring } = getScoringCounts();
        if (queued + scoring > 0) {
          // Fire and forget — don't block server startup
          startScorer(config).catch((err: unknown) =>
            console.error('[instrumentation] scorer error:', err)
          );
        }
      }
    } catch {
      // No config.json yet (first run) — skip scoring
    }
  }
}
