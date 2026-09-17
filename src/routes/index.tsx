import { Link, createFileRoute } from '@tanstack/react-router';
import { EngineStrip } from '@/components/home-demos';
import { SearchBox } from '@/components/search-box';
import { Wordmark } from '@/components/wordmark';

export const Route = createFileRoute('/')({
  component: Home,
});

const EXAMPLES = [
  'what are people saying about Bun 1.3 this week',
  'who directed Oppenheimer and who is in it',
  'new papers on LLM agents',
];

/* design-structure: search-engine home · centered column, headline as the only voice, form as the CTA · footer=Ft2 */

function Home() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Wordmark size="sm" />
        <a
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href="https://typesafe.ai"
          rel="noreferrer"
          target="_blank"
        >
          Jev for Search
        </a>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-24">
        <h1 className="display text-center text-[clamp(2.4rem,5.2vw,3.75rem)] leading-[1.04] tracking-[-0.01em]">
          Ask the web. Ranked by <span className="text-primary">Jev</span>.
        </h1>
        <p className="mt-4 max-w-md text-center text-lg text-muted-foreground">
          Jev picks where to look and puts the results that answer you first.
        </p>
        <div className="mt-8 w-full">
          <SearchBox autoFocus />
        </div>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
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
        <div className="mt-10 flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <EngineStrip />
          <span>Eleven engines, one question</span>
        </div>
      </main>
    </>
  );
}
