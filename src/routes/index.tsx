import { Link, createFileRoute } from '@tanstack/react-router';
import { DemoPicks, DemoRanks, EngineStrip } from '@/components/home-demos';
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

/* design-structure: macrostructure=workbench · hero=form-as-CTA · features=annotated-fragments (caption column + live-styled UI) · footer=Ft2 */

function Home() {
  return (
    <>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
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

      <main className="mx-auto max-w-5xl px-4">
        <section className="flex min-h-[62dvh] flex-col justify-center py-16">
          <h1 className="display max-w-3xl text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.02] tracking-[-0.01em] text-foreground">
            Ask the web.
            <br />
            Ranked by <span className="text-primary">Jev</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Jev picks where to look and puts the results that answer you first.
          </p>
          <div className="mt-8 max-w-2xl">
            <SearchBox autoFocus />
          </div>
          <ul className="mt-4 flex max-w-2xl flex-wrap gap-2 text-sm">
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
        </section>

        <section className="grid gap-8 border-t py-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
          <div className="max-w-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Jev picks where to look</h2>
            <p className="mt-3 text-muted-foreground">
              Eleven engines, one question. Jev reads it and decides which of them will actually have the answer, and how far back to look.
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 p-6">
            <DemoPicks />
          </div>
        </section>

        <section className="grid gap-8 border-t py-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
          <div className="max-w-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Jev ranks what comes back</h2>
            <p className="mt-3 text-muted-foreground">
              Every result is judged on one thing: does it answer you. That number is the order. Keyword look-alikes go to the bottom, not the top.
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 p-6">
            <DemoRanks />
          </div>
        </section>

        <section className="grid gap-8 border-t py-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
          <div className="max-w-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Eleven engines behind one box</h2>
            <p className="mt-3 text-muted-foreground">
              The open web, the places people talk, and the catalogues that know one thing well. Via Search1API.
            </p>
          </div>
          <div className="flex items-center">
            <EngineStrip />
          </div>
        </section>
      </main>
    </>
  );
}
