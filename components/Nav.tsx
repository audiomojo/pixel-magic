'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function Nav() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d: { pendingGroupCount: number }) => setPendingCount(d.pendingGroupCount))
      .catch(() => {});
  }, []);

  const links = [
    { href: '/', label: 'Dashboard', badge: null },
    { href: '/review', label: 'Review Queue', badge: pendingCount > 0 ? pendingCount : null },
    { href: '/stats', label: 'Stats', badge: null },
  ];

  return (
    <nav className="sticky top-0 z-10 border-b bg-background">
      <div className="mx-auto flex h-11 max-w-2xl items-center gap-6 px-4">
        <span className="text-sm font-semibold">✨ Pixel Magic</span>
        <div className="flex items-center gap-5">
          {links.map(({ href, label, badge }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 text-sm transition-colors',
                  active
                    ? 'border-b-2 border-primary pb-0.5 font-semibold text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                {badge != null && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
