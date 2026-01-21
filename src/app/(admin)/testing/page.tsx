'use client';

import { useState } from 'react';

export default function TestingPage() {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);

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
    </div>
  );
}
