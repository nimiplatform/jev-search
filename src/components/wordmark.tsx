import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

export function Wordmark({ size }: { size: 'sm' | 'lg' }) {
  return (
    <Link
      className={cn(
        'font-semibold tracking-tight select-none',
        size === 'lg' ? 'text-5xl' : 'text-xl'
      )}
      to="/"
    >
      last<span className="text-primary">24</span>hours
    </Link>
  );
}
