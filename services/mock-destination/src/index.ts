import { readPort } from '@agents-review/shared/env';

import { createApp } from './app.ts';
import { readSettings } from './config.ts';

let port: number;
let settings: ReturnType<typeof readSettings>;
try {
  port = readPort('MOCK_DESTINATION_PORT');
  settings = readSettings();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

createApp(settings).listen(port, () => {
  console.log(
    `Mock destination ready at http://localhost:${port} (failure rate ${settings.failureRate}, ` +
      `rate limit ${settings.rateLimitPerSecond || 'none'} per second)`,
  );
});
