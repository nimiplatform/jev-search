import { Link, createFileRoute } from '@tanstack/react-router';
import { SearchBox } from '@/components/search-box';
import { Wordmark } from '@/components/wordmark';

export const Route = createFileRoute('/')({
  component: Home,
});

const EXAMPLES = [
  'what are people saying about Bun 1.3 this week',
  'who directed Oppenheimer and who is in it',
  'new papers on LLM agents',
  'Claude Code 入门教程视频',
  'reddit threads about self-hosting Postgres in the last 24 hours',
];

function Home() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center justify-center px-4 py-16">
      <Wordmark size="lg" />
      <p className="mt-3 text-center text-muted-foreground">
        Ask in plain language. We pick the right sources, send the right query, and rank what comes back. No generated answers.
      </p>
      <div className="mt-8 w-full">
        <SearchBox autoFocus />
      </div>
      <ul className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
        {EXAMPLES.map((q) => (
          <li key={q}>
            <Link
              className="chip rounded-full border px-3 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              search={{ q }}
              to="/search"
              viewTransition
            >
              {q}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
