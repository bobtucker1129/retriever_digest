'use server';

import prisma from '@/lib/db';

export type ShoutoutData = {
  id: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
  createdAt: Date;
};

export async function getShoutouts(): Promise<ShoutoutData[]> {
  const shoutouts = await prisma.shoutout.findMany({
    include: {
      recipient: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return shoutouts.map((s) => ({
    id: s.id,
    recipientName: s.recipient.name,
    recipientEmail: s.recipient.email,
    message: s.message,
    createdAt: s.createdAt,
  }));
}

export type DeleteShoutoutResult = {
  success: boolean;
  error?: string;
};

export async function deleteShoutout(id: string): Promise<DeleteShoutoutResult> {
  try {
    await prisma.shoutout.delete({ where: { id } });
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete shoutout' };
  }
}

// Get shoutout form URL
export async function getShoutoutUrl(): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://retriever-digest.onrender.com';
  return `${baseUrl}/shoutout`;
}
