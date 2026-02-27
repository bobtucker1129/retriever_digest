import { z } from 'zod';

const highlightSchema = z.object({
  type: z.string().optional(),
  description: z.string(),
});

const performanceSchema = z.object({
  name: z.string(),
  estimatesCreated: z.number().optional(),
  ordersCompleted: z.number().optional().default(0),
  revenue: z.number().optional().default(0),
});

const metricSchema = z.object({
  dailyRevenue: z.number(),
  dailySalesCount: z.number(),
  dailyEstimatesCreated: z.number(),
  dailyNewCustomers: z.number(),
  monthToDateRevenue: z.number(),
  monthToDateSalesCount: z.number(),
  monthToDateEstimatesCreated: z.number(),
  monthToDateNewCustomers: z.number(),
  yearToDateRevenue: z.number(),
  yearToDateSalesCount: z.number(),
  yearToDateEstimatesCreated: z.number(),
  yearToDateNewCustomers: z.number(),
  dailyInvoicesCreatedAmount: z.number().optional().default(0),
});

const aiInsightSchema = z.object({
  type: z.string(),
  title: z.string(),
  message: z.string(),
  items: z
    .array(
      z.object({
        name: z.string(),
        detail: z.string().optional(),
        value: z.string().optional(),
      })
    )
    .default([]),
});

const newCustomerEstimateSchema = z.object({
  accountId: z.number(),
  accountName: z.string(),
  salesRep: z.string().optional(),
  estimateValue: z.number().optional().default(0),
  jobDescription: z.string().optional(),
  orderedDate: z.string().nullable().optional(),
});

export const exportPayloadSchema = z
  .object({
    date: z.string(),
    metrics: metricSchema,
    highlights: z.array(highlightSchema).default([]),
    bdPerformance: z.array(performanceSchema).default([]),
    pmPerformance: z.array(performanceSchema).default([]),
    aiInsights: z.array(aiInsightSchema).optional(),
    newCustomerEstimates: z.array(newCustomerEstimateSchema).optional(),
    aiInspiration: z
      .object({
        type: z.string(),
        content: z.string(),
        attribution: z.string().optional(),
        savedAt: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export type ExportPayload = z.infer<typeof exportPayloadSchema>;
