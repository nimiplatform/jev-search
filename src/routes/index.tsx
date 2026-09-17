import { Link, createFileRoute } from '@tanstack/react-router';
import { SearchBox } from '@/components/search-box';
import { Wordmark } from '@/components/wordmark';

export const Route = createFileRoute('/')({
  component: Home,
});

const EXAMPLES = [
  'what are people saying about Bun 1.3 this week',
  'new open source MCP servers on GitHub',
  'reactions to the latest Claude release on Hacker News',
  'reddit threads about self-hosting Postgres in the last 24 hours',
];

function Home() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center justify-center px-4 py-16">
      <Wordmark size="lg" />
      <p className="mt-3 text-center text-muted-foreground">
        Ask what happened recently. Get the right sources, ranked. No generated answers.
      </p>
      <div className="mt-8 w-full">
        <SearchBox autoFocus />
      </div>
      <ul className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
        {EXAMPLES.map((q) => (
          <li key={q}>
            <Link
              className="rounded-full border px-3 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              search={{ q }}
              to="/search"
            >
              {q}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
