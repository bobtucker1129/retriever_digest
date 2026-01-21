'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.push('/goals');
      } else {
        setError('Invalid password');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <svg
            className="login-logo"
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
          <h1>Retriever Daily Digest</h1>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="password" className="login-label">
            Admin Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
            placeholder="Enter password"
            autoFocus
            disabled={isLoading}
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}
