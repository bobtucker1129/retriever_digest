'use server';

import prisma from '@/lib/db';
import { GoalType } from '@/generated/prisma/client';

export type GoalData = {
  salesRevenue: string;
  salesCount: number;
  estimatesCreated: number;
  newCustomers: number;
};

export type SaveGoalResult = {
  success: boolean;
  error?: string;
};

export async function getGoals(): Promise<{
  monthly: GoalData;
  annual: GoalData;
}> {
  const goals = await prisma.goal.findMany();
  
  const emptyGoal: GoalData = {
    salesRevenue: '0',
    salesCount: 0,
    estimatesCreated: 0,
    newCustomers: 0,
  };

  const monthly = goals.find((g: { type: GoalType }) => g.type === GoalType.MONTHLY);
  const annual = goals.find((g: { type: GoalType }) => g.type === GoalType.ANNUAL);

  return {
    monthly: monthly
      ? {
          salesRevenue: monthly.salesRevenue.toString(),
          salesCount: monthly.salesCount,
          estimatesCreated: monthly.estimatesCreated,
          newCustomers: monthly.newCustomers,
        }
      : emptyGoal,
    annual: annual
      ? {
          salesRevenue: annual.salesRevenue.toString(),
          salesCount: annual.salesCount,
          estimatesCreated: annual.estimatesCreated,
          newCustomers: annual.newCustomers,
        }
      : emptyGoal,
  };
}

export async function saveGoal(formData: FormData): Promise<SaveGoalResult> {
  try {
    const type = formData.get('type') as string;
    const salesRevenue = formData.get('salesRevenue') as string;
    const salesCount = formData.get('salesCount') as string;
    const estimatesCreated = formData.get('estimatesCreated') as string;
    const newCustomers = formData.get('newCustomers') as string;

    const goalType = type === 'monthly' ? GoalType.MONTHLY : GoalType.ANNUAL;

    await prisma.goal.upsert({
      where: { type: goalType },
      update: {
        salesRevenue: salesRevenue || '0',
        salesCount: parseInt(salesCount || '0', 10),
        estimatesCreated: parseInt(estimatesCreated || '0', 10),
        newCustomers: parseInt(newCustomers || '0', 10),
      },
      create: {
        type: goalType,
        salesRevenue: salesRevenue || '0',
        salesCount: parseInt(salesCount || '0', 10),
        estimatesCreated: parseInt(estimatesCreated || '0', 10),
        newCustomers: parseInt(newCustomers || '0', 10),
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to save goal:', error);
    return { success: false, error: 'Failed to save goals. Please try again.' };
  }
}
