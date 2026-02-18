'use server';

import prisma from '@/lib/db';

export type RecipientData = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  birthday: string | null;
  optOutDigest: boolean;
  optOutBirthday: boolean;
};

function mapRecipient(r: {
  id: string;
  name: string;
  email: string;
  active: boolean;
  birthday: string | null;
  optOutDigest: boolean;
  optOutBirthday: boolean;
}): RecipientData {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    active: r.active,
    birthday: r.birthday,
    optOutDigest: r.optOutDigest,
    optOutBirthday: r.optOutBirthday,
  };
}

function validateBirthday(birthday: string): boolean {
  if (!birthday) return true;
  return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(birthday.trim());
}

export async function getRecipients(): Promise<RecipientData[]> {
  const recipients = await prisma.recipient.findMany({
    orderBy: { name: 'asc' },
  });

  return recipients.map(mapRecipient);
}

export type AddRecipientResult = {
  success: boolean;
  error?: string;
  recipient?: RecipientData;
};

export async function addRecipient(
  name: string,
  email: string,
  birthday?: string,
  optOutDigest?: boolean,
  optOutBirthday?: boolean
): Promise<AddRecipientResult> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: 'Invalid email format' };
  }

  if (!name.trim()) {
    return { success: false, error: 'Name is required' };
  }

  const trimmedBirthday = birthday?.trim() || null;
  if (trimmedBirthday && !validateBirthday(trimmedBirthday)) {
    return { success: false, error: 'Birthday must be in MM-DD format (e.g. 02-18)' };
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
        birthday: trimmedBirthday,
        optOutDigest: optOutDigest ?? false,
        optOutBirthday: optOutBirthday ?? false,
      },
    });

    return { success: true, recipient: mapRecipient(recipient) };
  } catch {
    return { success: false, error: 'Failed to add recipient' };
  }
}

export type UpdateRecipientResult = {
  success: boolean;
  error?: string;
  recipient?: RecipientData;
};

export async function updateRecipient(
  id: string,
  name: string,
  email: string,
  birthday?: string,
  optOutDigest?: boolean,
  optOutBirthday?: boolean
): Promise<UpdateRecipientResult> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: 'Invalid email format' };
  }

  if (!name.trim()) {
    return { success: false, error: 'Name is required' };
  }

  const trimmedBirthday = birthday?.trim() || null;
  if (trimmedBirthday && !validateBirthday(trimmedBirthday)) {
    return { success: false, error: 'Birthday must be in MM-DD format (e.g. 02-18)' };
  }

  try {
    const existing = await prisma.recipient.findUnique({ where: { email } });
    if (existing && existing.id !== id) {
      return { success: false, error: 'A recipient with this email already exists' };
    }

    const recipient = await prisma.recipient.update({
      where: { id },
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        birthday: trimmedBirthday,
        optOutDigest: optOutDigest ?? false,
        optOutBirthday: optOutBirthday ?? false,
      },
    });

    return { success: true, recipient: mapRecipient(recipient) };
  } catch {
    return { success: false, error: 'Failed to update recipient' };
  }
}

export type DeleteRecipientResult = {
  success: boolean;
  error?: string;
};

export async function deleteRecipient(id: string): Promise<DeleteRecipientResult> {
  try {
    await prisma.recipient.delete({ where: { id } });
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete recipient' };
  }
}

export type ToggleActiveResult = {
  success: boolean;
  error?: string;
  active?: boolean;
};

export async function toggleRecipientActive(id: string): Promise<ToggleActiveResult> {
  try {
    const recipient = await prisma.recipient.findUnique({ where: { id } });
    if (!recipient) {
      return { success: false, error: 'Recipient not found' };
    }

    const updated = await prisma.recipient.update({
      where: { id },
      data: { active: !recipient.active },
    });

    return { success: true, active: updated.active };
  } catch {
    return { success: false, error: 'Failed to toggle recipient status' };
  }
}
