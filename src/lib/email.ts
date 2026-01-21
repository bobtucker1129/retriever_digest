import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM;
  
  if (!from) {
    return {
      success: false,
      error: 'EMAIL_FROM environment variable not set',
    };
  }

  if (!process.env.RESEND_API_KEY) {
    return {
      success: false,
      error: 'RESEND_API_KEY environment variable not set',
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error sending email',
    };
  }
}
