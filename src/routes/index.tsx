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
  'reddit threads about self-hosting Postgres',
];

function Home() {
  return (
    <>
      <header className="mx-auto flex max-w-5xl items-center px-4 py-3">
        <Wordmark size="sm" />
      </header>
      <main className="mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-center justify-center px-4 pb-24">
        <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          Ask the web, ranked by <span className="text-primary">Jev</span>
        </h1>
        <p className="mt-4 max-w-md text-center text-lg text-muted-foreground">
          TypeSafe's Jev picks where to look and puts the results that answer you first.
        </p>
        <div className="mt-8 w-full">
          <SearchBox autoFocus />
        </div>
        <ul className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
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
        <p className="mt-12 text-center text-xs text-muted-foreground">
          Understanding and ranking by{' '}
          <a className="underline underline-offset-4 hover:text-foreground" href="https://typesafe.ai" rel="noreferrer" target="_blank">
            Jev, TypeSafe's judgment model
          </a>
          . Ten engines via{' '}
          <a className="underline underline-offset-4 hover:text-foreground" href="https://www.search1api.com" rel="noreferrer" target="_blank">
            Search1API
          </a>
          . No generated answers.
        </p>
      </main>
    </>
  );
}
