import Navigation from '@/components/Navigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="header">
        <div className="header-content">
          <svg
            className="logo"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="50" cy="50" r="45" fill="#2563eb" />
            <ellipse cx="35" cy="40" rx="6" ry="7" fill="#1a1a1a" />
            <ellipse cx="65" cy="40" rx="6" ry="7" fill="#1a1a1a" />
            <ellipse cx="50" cy="55" rx="10" ry="8" fill="#1a1a1a" />
            <path
              d="M30 70 Q50 85 70 70"
              stroke="#1a1a1a"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
            <ellipse cx="20" cy="50" rx="15" ry="20" fill="#2563eb" />
            <ellipse cx="80" cy="50" rx="15" ry="20" fill="#2563eb" />
          </svg>
          <h1 className="header-title">Retriever Daily Digest</h1>
        </div>
      </header>
      <Navigation />
      <main>{children}</main>
    </>
  );
}
