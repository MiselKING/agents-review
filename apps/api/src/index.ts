import { createServer } from 'node:http';

import { readPort } from '@agents-review/shared/env';

import { yoga } from './yoga.ts';

const port = readPort('API_PORT');

// Yoga's Node listener catches handler errors itself and answers with a 500.
createServer(yoga.requestListener).listen(port, () => {
  console.log(`API ready at http://localhost:${port}${yoga.graphqlEndpoint}`);
});
