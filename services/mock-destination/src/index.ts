import { readPort } from '@agents-review/shared/env';

import { createApp } from './app.ts';

const port = readPort('MOCK_DESTINATION_PORT');

createApp().listen(port, () => {
  console.log(`Mock destination ready at http://localhost:${port} (health: /health)`);
});
