import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { Logo } from './logo';

export function Wordmark({ size }: { size: 'sm' | 'lg' }) {
  return (
    <Link
      className={cn(
        'vt-wordmark inline-flex items-center font-semibold tracking-tight select-none',
        size === 'lg' ? 'gap-3 text-5xl' : 'gap-2 text-xl'
      )}
      to="/"
      viewTransition
    >
      <Logo className={size === 'lg' ? 'size-12' : 'size-6'} />
      <span>
        s1<span className="text-primary"> ask</span>
      </span>
    </Link>
  );
}
