import { createUnsubscribeToken } from '@/lib/unsubscribe-token';

function buildUnsubscribeUrl(recipientId: string, type: 'digest' | 'birthday'): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://retriever-digest.onrender.com';
  const token = createUnsubscribeToken(recipientId, type);
  return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function renderUnsubscribeFooter(recipientId: string): string {
  const digestUrl = buildUnsubscribeUrl(recipientId, 'digest');
  const birthdayUrl = buildUnsubscribeUrl(recipientId, 'birthday');
  return `
    <div style="text-align: center; padding: 10px 20px 4px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 11px; color: #9ca3af;">
        <a href="${digestUrl}" style="color: #9ca3af; text-decoration: underline;">Unsubscribe from digest</a>
        &nbsp;·&nbsp;
        <a href="${birthdayUrl}" style="color: #9ca3af; text-decoration: underline;">Opt out of birthday shoutouts</a>
      </p>
    </div>
  `;
}
