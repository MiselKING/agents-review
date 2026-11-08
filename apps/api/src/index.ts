import { createServer } from 'node:http';
import { readPort } from '@agents-review/shared/env';
import { yoga } from './yoga.ts';

const port = readPort('API_PORT');

createServer(yoga).listen(port, () => {
  console.log(`API ready at http://localhost:${port}${yoga.graphqlEndpoint}`);
});
