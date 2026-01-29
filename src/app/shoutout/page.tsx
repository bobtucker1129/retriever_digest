'use client';

import { useState } from 'react';
import { submitShoutout } from './actions';

export default function ShoutoutPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [recipientName, setRecipientName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const result = await submitShoutout(email, message);

    setIsSubmitting(false);

    if (result.success) {
      setSuccess(true);
      setRecipientName(result.recipientName || '');
      setEmail('');
      setMessage('');
    } else {
      setError(result.error || 'Something went wrong');
    }
  };

  const handleReset = () => {
    setSuccess(false);
    setRecipientName('');
    setError('');
  };

  return (
    <div className="shoutout-public-container">
      <div className="shoutout-public-card">
        <div className="shoutout-public-header">
          <h1>Send a Shoutout</h1>
          <p>Share a message with the team in the next Retriever Digest</p>
        </div>

        {success ? (
          <div className="shoutout-success">
            <div className="shoutout-success-icon">✓</div>
            <h2>Shoutout Sent!</h2>
            <p>
              Thanks{recipientName ? `, ${recipientName}` : ''}! Your message will appear in the next digest.
            </p>
            <button 
              className="shoutout-submit-button"
              onClick={handleReset}
            >
              Send Another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="shoutout-form">
            <div className="shoutout-field">
              <label htmlFor="email" className="shoutout-label">
                Your Email
              </label>
              <input
                id="email"
                type="email"
                className="shoutout-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@boonegraphics.net"
                disabled={isSubmitting}
                autoComplete="email"
              />
              <p className="shoutout-hint">
                Must match your email in the recipient list
              </p>
            </div>

            <div className="shoutout-field">
              <label htmlFor="message" className="shoutout-label">
                Your Message
              </label>
              <textarea
                id="message"
                className="shoutout-textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Great job this week, team! Let's finish strong..."
                disabled={isSubmitting}
                maxLength={500}
                rows={4}
              />
              <p className="shoutout-hint">
                {message.length}/500 characters
              </p>
            </div>

            {error && <p className="shoutout-error">{error}</p>}

            <button
              type="submit"
              className="shoutout-submit-button"
              disabled={isSubmitting || !email || !message}
            >
              {isSubmitting ? 'Sending...' : 'Send Shoutout'}
            </button>
          </form>
        )}

        <div className="shoutout-footer">
          <p>Retriever Daily Digest • BooneGraphics</p>
        </div>
      </div>
    </div>
  );
}
