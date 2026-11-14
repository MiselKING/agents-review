import { createServer } from 'node:http';

import { createDb } from '@agents-review/db';
import { readPort } from '@agents-review/shared/env';

import { createApi } from './yoga.ts';

const port = readPort('API_PORT');
const { db } = createDb();
const yoga = createApi(db);

// Yoga's Node listener catches handler errors itself and answers with a 500.
createServer(yoga.requestListener).listen(port, () => {
  console.log(`API ready at http://localhost:${port}${yoga.graphqlEndpoint}`);
});
