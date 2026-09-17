import { Link, createFileRoute } from '@tanstack/react-router';
import { DemoPanel, EngineStrip } from '@/components/home-demos';
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

/* design-structure: one screen · hero=H2 split diptych (copy + form left, live-styled product fragment right) · footer=Ft2 */

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

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-12 pt-6 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] md:gap-16 md:pb-16">
        <section>
          <h1 className="display text-[clamp(2.4rem,5.2vw,4rem)] leading-[1.04] tracking-[-0.01em]">
            Ask the web.
            <br />
            Ranked by <span className="text-primary">Jev</span>.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Jev picks where to look and puts the results that answer you first.
          </p>
          <div className="mt-7 max-w-xl">
            <SearchBox autoFocus />
          </div>
          <ul className="mt-3 flex max-w-xl flex-wrap gap-2 text-sm">
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
          <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Eleven engines</span>
            <EngineStrip />
          </div>
        </section>

        <aside className="hidden md:block">
          <DemoPanel />
        </aside>
      </main>
    </>
  );
}
