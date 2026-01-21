'use server';

import prisma from '@/lib/db';

export type RecipientData = {
  id: string;
  name: string;
  email: string;
  active: boolean;
};

export async function getRecipients(): Promise<RecipientData[]> {
  const recipients = await prisma.recipient.findMany({
    orderBy: { name: 'asc' },
  });

  return recipients.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    active: r.active,
  }));
}

export type AddRecipientResult = {
  success: boolean;
  error?: string;
  recipient?: RecipientData;
};

export async function addRecipient(name: string, email: string): Promise<AddRecipientResult> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: 'Invalid email format' };
  }

  if (!name.trim()) {
    return { success: false, error: 'Name is required' };
  }

  try {
    const existing = await prisma.recipient.findUnique({ where: { email } });
    if (existing) {
      return { success: false, error: 'A recipient with this email already exists' };
    }

    const recipient = await prisma.recipient.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        active: true,
      },
    });

    return {
      success: true,
      recipient: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        active: recipient.active,
      },
    };
  } catch {
    return { success: false, error: 'Failed to add recipient' };
  }
}
