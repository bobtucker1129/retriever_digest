'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/goals', label: 'Goals' },
  { href: '/recipients', label: 'Recipients' },
  { href: '/testing', label: 'Testing' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <ul className="nav-tabs">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              className={`nav-tab ${pathname === tab.href ? 'active' : ''}`}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
