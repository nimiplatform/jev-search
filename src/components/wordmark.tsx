import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

export function Wordmark({ size }: { size: 'sm' | 'lg' }) {
  return (
    <Link
      className={cn(
        'vt-wordmark font-semibold tracking-tight select-none',
        size === 'lg' ? 'text-5xl' : 'text-xl'
      )}
      to="/"
      viewTransition
    >
      s1<span className="text-primary"> ask</span>
    </Link>
  );
}
