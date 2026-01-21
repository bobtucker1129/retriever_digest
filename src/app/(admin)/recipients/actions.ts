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
