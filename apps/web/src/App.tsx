import { useQuery } from '@tanstack/react-query';

import { graphql } from './gql';
import { execute } from './graphql/execute';

const HelloQuery = graphql(`
  query Hello {
    hello
  }
`);

function HelloResult() {
  const { data, error, isPending } = useQuery({
    queryKey: ['hello'],
    queryFn: () => execute(HelloQuery),
  });

  if (isPending) return <p>Loading…</p>;
  if (error) return <p role="alert">Could not reach the API: {error.message}</p>;
  return <p data-testid="hello">{data.hello}</p>;
}

export function App() {
  return (
    <main>
      <h1>Agents-Driven Flow</h1>
      <HelloResult />
    </main>
  );
}
