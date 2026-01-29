import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Resend inbound email webhook payload structure
interface ResendInboundPayload {
  type: 'email.received';
  created_at: string;
  data: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    headers: Record<string, string>;
  };
}

// Verify webhook signature from Resend
function verifyWebhookSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Extract plain text from email, cleaning up quoted replies
function extractMessageText(text: string, html: string): string {
  // Prefer plain text, fall back to stripping HTML
  let message = text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Remove common reply patterns (quoted text from previous emails)
  const replyPatterns = [
    /On .+ wrote:[\s\S]*/i,  // "On Mon, Jan 28, 2026 at 10:00 AM John wrote:"
    /^>.*$/gm,               // Lines starting with >
    /_{10,}/,                // Long underscores (separator)
    /-{10,}/,                // Long dashes (separator)
    /From:[\s\S]*?Sent:[\s\S]*?To:/,    // Outlook-style reply headers
  ];
  
  for (const pattern of replyPatterns) {
    message = message.replace(pattern, '').trim();
  }
  
  // Limit to 500 characters
  if (message.length > 500) {
    message = message.substring(0, 497) + '...';
  }
  
  return message.trim();
}

// Extract email address from "Name <email>" format
function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : from.toLowerCase();
}

export async function POST(request: NextRequest) {
  console.log('[Shoutout Inbound] Received webhook');
  
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('[Shoutout Inbound] RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('resend-signature') || request.headers.get('svix-signature');
    
    // Verify signature in production
    if (process.env.NODE_ENV === 'production') {
      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        console.error('[Shoutout Inbound] Invalid webhook signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }
    
    const payload: ResendInboundPayload = JSON.parse(rawBody);
    
    if (payload.type !== 'email.received') {
      console.log(`[Shoutout Inbound] Ignoring event type: ${payload.type}`);
      return NextResponse.json({ success: true, ignored: true });
    }
    
    const senderEmail = extractEmailAddress(payload.data.from);
    console.log(`[Shoutout Inbound] Email from: ${senderEmail}`);
    
    // Look up sender in recipients table (case-insensitive)
    const recipient = await prisma.recipient.findFirst({
      where: {
        email: {
          equals: senderEmail,
          mode: 'insensitive',
        },
        active: true,
      },
    });
    
    if (!recipient) {
      console.log(`[Shoutout Inbound] Sender not found in recipients: ${senderEmail}`);
      return NextResponse.json({ 
        success: false, 
        error: 'Sender not a registered recipient' 
      }, { status: 200 }); // Return 200 to not trigger retries
    }
    
    // Extract and clean the message
    const message = extractMessageText(payload.data.text, payload.data.html);
    
    if (!message) {
      console.log('[Shoutout Inbound] Empty message after processing');
      return NextResponse.json({ 
        success: false, 
        error: 'Empty message' 
      }, { status: 200 });
    }
    
    // Check if they already have a pending shoutout (optional: allow multiple)
    const existingCount = await prisma.shoutout.count({
      where: { recipientId: recipient.id },
    });
    
    if (existingCount >= 3) {
      console.log(`[Shoutout Inbound] ${recipient.name} already has ${existingCount} pending shoutouts`);
      // Send notification about limit
      await sendEmail({
        to: senderEmail,
        subject: 'Shoutout Limit Reached',
        html: `
          <p>Hi ${recipient.name},</p>
          <p>You already have ${existingCount} shoutouts waiting to go out in the next digest. 
          Please wait until the next digest is sent before submitting more.</p>
          <p>Thanks!</p>
        `,
      });
      return NextResponse.json({ 
        success: false, 
        error: 'Shoutout limit reached' 
      }, { status: 200 });
    }
    
    // Save the shoutout
    const shoutout = await prisma.shoutout.create({
      data: {
        recipientId: recipient.id,
        message,
      },
    });
    
    console.log(`[Shoutout Inbound] Created shoutout ${shoutout.id} from ${recipient.name}`);
    
    // Send confirmation email
    const confirmResult = await sendEmail({
      to: senderEmail,
      subject: 'Shoutout Received!',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px;">
          <p>Hi ${recipient.name},</p>
          <p>Your shoutout has been received and will appear in the next digest!</p>
          <div style="background: #f5f5f5; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0;">
            <p style="margin: 0; font-style: italic;">"${message}"</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            This message will be included in the next daily or weekly digest that goes out.
          </p>
        </div>
      `,
    });
    
    if (!confirmResult.success) {
      console.error('[Shoutout Inbound] Failed to send confirmation:', confirmResult.error);
    }
    
    return NextResponse.json({ 
      success: true, 
      shoutoutId: shoutout.id,
      recipientName: recipient.name,
    });
    
  } catch (error) {
    console.error('[Shoutout Inbound] Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
