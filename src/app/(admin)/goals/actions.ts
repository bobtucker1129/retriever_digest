'use server';

import prisma from '@/lib/db';
import { GoalType } from '@/generated/prisma/client';

export type GoalData = {
  salesRevenue: string;
  salesCount: number;
  estimatesCreated: number;
  newCustomers: number;
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
