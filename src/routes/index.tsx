import { Link, createFileRoute } from '@tanstack/react-router';
import { EngineStrip } from '@/components/home-demos';
import { SearchBox } from '@/components/search-box';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [{ property: 'og:url', content: 'https://jev.s1.dev/' }],
  }),
  component: Home,
});

const EXAMPLES = [
  'TypeSafe Jev API documentation and examples',
  'Jev discussions on Hacker News this week',
  'What are people saying about TypeSafe Jev on Reddit this week',
  'TypeSafe Jev projects on GitHub',
  'Videos about TypeSafe Jev this month',
  'TypeSafe Jev reactions on X today',
];

/* design-structure: search-engine home · centered column, headline as the only voice, form as the CTA · footer=Ft2 */

function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-12 pt-20 sm:py-20">
      <h1 className="vt-wordmark display text-center text-[clamp(2.75rem,6vw,4rem)] leading-none tracking-[-0.01em]">
        Jev <span className="text-primary">Search</span>
      </h1>
      <p className="mt-4 text-center text-lg text-muted-foreground">
        Jev picks where to search and ranks what comes back.
      </p>
      <div className="mt-8 w-full">
        <SearchBox autoFocus />
      </div>
      <ul aria-label="Example searches" className="mt-3 grid w-full gap-2 text-sm sm:grid-cols-2">
        {EXAMPLES.map((q) => (
          <li key={q}>
            <Link
              className="chip block h-full rounded-2xl border px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              search={{ q }}
              to="/search"
              viewTransition
            >
              {q}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-10">
        <EngineStrip />
      </div>
    </main>
  );
}
