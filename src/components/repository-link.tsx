import { SourceIcon } from '@/components/source-icon';

export function RepositoryLink() {
  return (
    <a
      aria-label="Jev Search source code on GitHub (opens in a new tab)"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
      href="https://github.com/superagents-lab/jev-search"
      rel="noreferrer"
      target="_blank"
      title="Jev Search on GitHub"
    >
      <SourceIcon id="github" className="size-5" />
    </a>
  );
}
