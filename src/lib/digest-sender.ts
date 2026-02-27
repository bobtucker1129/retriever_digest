import { sendEmail } from '@/lib/email';

export interface DigestRecipient {
  id: string;
  name: string;
  email: string;
}

export interface DigestSendResult {
  sent: number;
  failed: number;
  errors: string[];
}

interface SendDigestBatchOptions {
  recipients: DigestRecipient[];
  subject: string;
  buildHtml: (recipient: DigestRecipient) => Promise<string>;
  logPrefix: string;
}

export async function sendDigestBatch({
  recipients,
  subject,
  buildHtml,
  logPrefix,
}: SendDigestBatchOptions): Promise<DigestSendResult> {
  const result: DigestSendResult = { sent: 0, failed: 0, errors: [] };

  for (const recipient of recipients) {
    try {
      const html = await buildHtml(recipient);
      const emailResult = await sendEmail({
        to: recipient.email,
        subject,
        html,
      });

      if (emailResult.success) {
        console.log(`[${logPrefix}] Sent to ${recipient.name} <${recipient.email}>`);
        result.sent += 1;
      } else {
        const errorMessage = emailResult.error || 'Unknown email send failure';
        console.error(`[${logPrefix}] Failed to send to ${recipient.email}: ${errorMessage}`);
        result.failed += 1;
        result.errors.push(`${recipient.email}: ${errorMessage}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${logPrefix}] Error sending to ${recipient.email}: ${errorMessage}`);
      result.failed += 1;
      result.errors.push(`${recipient.email}: ${errorMessage}`);
    }
  }

  console.log(`[${logPrefix}] Complete - Sent: ${result.sent}, Failed: ${result.failed}`);
  return result;
}
