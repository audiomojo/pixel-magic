export const runtime = 'nodejs';

import { scanEmitter } from '@/lib/emitter';
import type { ProgressEvent } from '@/types';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function onProgress(event: ProgressEvent) {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));

        if (event.type === 'complete' || event.type === 'error') {
          scanEmitter.off('progress', onProgress);
          controller.close();
        }
      }

      scanEmitter.on('progress', onProgress);

      // Clean up if client disconnects
      controller.close = (() => {
        const orig = controller.close.bind(controller);
        return () => {
          scanEmitter.off('progress', onProgress);
          orig();
        };
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
