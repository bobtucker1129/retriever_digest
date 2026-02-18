import { Suspense } from 'react';

const LOGO_URL = 'https://www.booneproofs.net/email/RETRIEVER@3x.png';

interface PageContent {
  icon: string;
  title: string;
  message: string;
}

function getPageContent(type: string | null, error: string | null, success: string | null): PageContent {
  if (error) {
    return {
      icon: '❌',
      title: 'Something went wrong',
      message: error === 'notfound'
        ? "We couldn't find your account. The unsubscribe link may have expired or be invalid."
        : "We couldn't process your request. Please contact your admin if this continues.",
    };
  }

  if (success && type === 'digest') {
    return {
      icon: '✓',
      title: "You've been unsubscribed",
      message: "You will no longer receive the Retriever Daily and Weekly Digest emails. If you change your mind, ask your admin to re-enable your subscription.",
    };
  }

  if (success && type === 'birthday') {
    return {
      icon: '✓',
      title: "Birthday shoutouts turned off",
      message: "We won't feature your birthday in the digest anymore. Your birthday info will remain saved in case you opt back in — just ask your admin.",
    };
  }

  return {
    icon: '🔗',
    title: 'Invalid link',
    message: 'This unsubscribe link appears to be invalid. Please contact your admin.',
  };
}

function UnsubscribeContent({ searchParams }: { searchParams: { type?: string; success?: string; error?: string } }) {
  const type = searchParams.type ?? null;
  const success = searchParams.success ?? null;
  const error = searchParams.error ?? null;

  const content = getPageContent(type, error, success);
  const isSuccess = !!success && !error;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f3f4f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        maxWidth: '480px',
        width: '100%',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#A1252B',
          padding: '24px 20px',
          textAlign: 'center',
        }}>
          <img
            src={LOGO_URL}
            alt="Retriever"
            style={{ width: '80px', height: '80px', marginBottom: '8px' }}
          />
          <h1 style={{ margin: 0, color: 'white', fontSize: '16px', fontWeight: 600 }}>
            Retriever Digest
          </h1>
        </div>

        {/* Content */}
        <div style={{ padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', lineHeight: 1 }}>
            {content.icon}
          </div>
          <h2 style={{
            margin: '0 0 12px 0',
            fontSize: '20px',
            fontWeight: 700,
            color: isSuccess ? '#166534' : '#991B1B',
          }}>
            {content.title}
          </h2>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: '#6b7280',
            lineHeight: '1.6',
          }}>
            {content.message}
          </p>
        </div>

        {/* Footer note */}
        <div style={{
          borderTop: '1px solid #e5e7eb',
          padding: '16px 32px',
          textAlign: 'center',
          backgroundColor: '#f9fafb',
        }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
            BooneGraphics Internal Sales Tool
          </p>
        </div>
      </div>
    </div>
  );
}

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: { type?: string; success?: string; error?: string };
}) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UnsubscribeContent searchParams={searchParams} />
    </Suspense>
  );
}
