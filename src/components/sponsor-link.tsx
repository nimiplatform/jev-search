import { Heart } from 'lucide-react';

export function SponsorLink() {
  return (
    <a
      aria-label="Sponsor Jev Search (opens in a new tab)"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-primary"
      href="https://profile.stripe.com/@s1_dev"
      rel="noreferrer"
      target="_blank"
      title="Sponsor Jev Search"
    >
      <Heart aria-hidden className="size-5" fill="currentColor" />
    </a>
  );
}
