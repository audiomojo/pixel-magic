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
  }, [pathname]);

  const links = [
    { href: '/', label: 'Dashboard', badge: null },
    { href: '/review', label: 'Review Queue', badge: pendingCount > 0 ? pendingCount : null },
    { href: '/stats', label: 'Stats', badge: null },
  ];

  return (
    <nav className="sticky top-0 z-10 bg-[#1a2b4a]">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <span className="text-sm font-bold text-white">Pixel Magic</span>
        <div className="flex items-center gap-1">
          {links.map(({ href, label, badge }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-white/[0.18] font-semibold text-white'
                    : 'font-medium text-white/70 hover:bg-white/10 hover:text-white',
                )}
              >
                {label}
                {badge != null && (
                  <span className="rounded-full bg-[#4e79a7] px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
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
