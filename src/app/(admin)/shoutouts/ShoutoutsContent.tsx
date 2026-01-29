'use client';

import { useState } from 'react';
import { ShoutoutData, deleteShoutout } from './actions';

type Props = {
  initialShoutouts: ShoutoutData[];
  shoutoutUrl: string;
};

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export default function ShoutoutsContent({ initialShoutouts, shoutoutUrl }: Props) {
  const [shoutouts, setShoutouts] = useState<ShoutoutData[]>(initialShoutouts);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shoutoutUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = shoutoutUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError('');
    
    const result = await deleteShoutout(id);
    
    if (result.success) {
      setShoutouts(shoutouts.filter((s) => s.id !== id));
    } else {
      setError(result.error || 'Failed to delete shoutout');
    }
    
    setDeletingId(null);
  };

  return (
    <>
      {/* Instructions Section */}
      <div className="shoutout-instructions">
        <div className="shoutout-email-section">
          <h2 className="section-title">Send a Shoutout</h2>
          <p className="section-description">
            Share this link with recipients so they can submit messages for the next digest.
          </p>
          <div className="email-display">
            <a href={shoutoutUrl} target="_blank" rel="noopener noreferrer" className="email-address" style={{ textDecoration: 'none' }}>
              {shoutoutUrl}
            </a>
            <button 
              className="copy-button" 
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="instructions-list">
            <h3>How it works:</h3>
            <ol>
              <li>Recipients visit the link above</li>
              <li>They enter their registered email and a message (max 500 characters)</li>
              <li>The system verifies they&apos;re on the recipient list</li>
              <li>Their message will appear in the next daily or weekly digest</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Pending Shoutouts Section */}
      <div className="shoutout-pending">
        <h2 className="section-title">
          Pending Shoutouts {shoutouts.length > 0 && <span className="count-badge">{shoutouts.length}</span>}
        </h2>
        
        {error && <p className="error-message">{error}</p>}
        
        {shoutouts.length === 0 ? (
          <div className="empty-state">
            No pending shoutouts. Messages will appear here after recipients send them in.
          </div>
        ) : (
          <div className="shoutouts-list">
            {shoutouts.map((shoutout) => (
              <div key={shoutout.id} className="shoutout-card">
                <div className="shoutout-header">
                  <div className="shoutout-author">
                    <strong>{shoutout.recipientName}</strong>
                    <span className="shoutout-time">{formatTimeAgo(shoutout.createdAt)}</span>
                  </div>
                  <button
                    className="delete-shoutout-button"
                    onClick={() => handleDelete(shoutout.id)}
                    disabled={deletingId === shoutout.id}
                    title="Delete shoutout"
                  >
                    {deletingId === shoutout.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
                <p className="shoutout-message">&ldquo;{shoutout.message}&rdquo;</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
