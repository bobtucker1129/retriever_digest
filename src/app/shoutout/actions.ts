'use server';

import prisma from '@/lib/db';

export type SubmitShoutoutResult = {
  success: boolean;
  error?: string;
  recipientName?: string;
};

export async function submitShoutout(email: string, message: string): Promise<SubmitShoutoutResult> {
  // Validate inputs
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedMessage = message.trim();

  if (!trimmedEmail) {
    return { success: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { success: false, error: 'Please enter a valid email address' };
  }

  if (!trimmedMessage) {
    return { success: false, error: 'Message is required' };
  }

  if (trimmedMessage.length > 500) {
    return { success: false, error: 'Message must be 500 characters or less' };
  }

  try {
    // Look up recipient by email (case-insensitive, active only)
    const recipient = await prisma.recipient.findFirst({
      where: {
        email: {
          equals: trimmedEmail,
          mode: 'insensitive',
        },
        active: true,
      },
    });

    if (!recipient) {
      return { 
        success: false, 
        error: 'Email not recognized. Only active digest recipients can submit shoutouts.' 
      };
    }

    // Check for spam - max 3 pending shoutouts per person
    const existingCount = await prisma.shoutout.count({
      where: { recipientId: recipient.id },
    });

    if (existingCount >= 3) {
      return { 
        success: false, 
        error: 'You already have 3 pending shoutouts. Please wait until the next digest is sent.' 
      };
    }

    // Create the shoutout
    await prisma.shoutout.create({
      data: {
        recipientId: recipient.id,
        message: trimmedMessage,
      },
    });

    return { 
      success: true, 
      recipientName: recipient.name,
    };
  } catch (error) {
    console.error('[Shoutout Submit] Error:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
