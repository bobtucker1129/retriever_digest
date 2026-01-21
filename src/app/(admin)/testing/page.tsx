'use client';

import { useState } from 'react';

export default function TestingPage() {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);

  const [testEmail, setTestEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  const handlePreviewDaily = async () => {
    setIsLoading(true);
    setError(null);
    setIsMockData(false);

    try {
      const response = await fetch('/api/preview/daily');
      if (!response.ok) {
        throw new Error('Failed to load preview');
      }
      const html = await response.text();
      
      const isMock = response.headers.get('X-Mock-Data') === 'true';
      setIsMockData(isMock);
      setPreviewHtml(html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      setSendResult({ success: false, message: 'Please enter an email address' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      setSendResult({ success: false, message: 'Please enter a valid email address' });
      return;
    }

    setIsSending(true);
    setSendResult(null);

    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSendResult({ success: false, message: data.error || 'Failed to send email' });
      } else {
        setSendResult({ success: true, message: 'Test email sent successfully!' });
      }
    } catch {
      setSendResult({ success: false, message: 'Failed to send email' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="testing-page">
      <h1 className="page-title">Testing</h1>
      <p className="page-description">Preview and test your digests before sending.</p>

      <div className="testing-section">
        <h2 className="section-title">Daily Digest Preview</h2>
        <button
          className="preview-button"
          onClick={handlePreviewDaily}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Preview Daily Digest'}
        </button>

        {error && (
          <p className="error-message">{error}</p>
        )}

        {isMockData && (
          <div className="warning-banner">
            ⚠️ No export data available. Showing preview with sample/mock data.
          </div>
        )}

        {previewHtml && (
          <div className="preview-container">
            <iframe
              srcDoc={previewHtml}
              title="Daily Digest Preview"
              className="preview-iframe"
            />
          </div>
        )}
      </div>

      <div className="testing-section">
        <h2 className="section-title">Send Test Email</h2>
        <p className="section-description">Send a test digest to any email address.</p>
        <div className="test-email-form">
          <input
            type="email"
            className="test-email-input"
            placeholder="Enter email address"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <button
            className="preview-button"
            onClick={handleSendTest}
            disabled={isSending}
          >
            {isSending ? 'Sending...' : 'Send Test'}
          </button>
        </div>
        {sendResult && (
          <p className={sendResult.success ? 'success-message' : 'error-message'}>
            {sendResult.message}
          </p>
        )}
      </div>
    </div>
  );
}
