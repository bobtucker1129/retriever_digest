import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, GoalType } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL!;

// Create a pg Pool with SSL configuration for Render's external database
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('render.com')
    ? { rejectUnauthorized: false }
    : undefined,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Create Monthly Goal
  await prisma.goal.upsert({
    where: { type: GoalType.MONTHLY },
    update: {},
    create: {
      type: GoalType.MONTHLY,
      salesRevenue: 85000.0,
      salesCount: 120,
      estimatesCreated: 200,
      newCustomers: 15,
    },
  });
  console.log("Created MONTHLY goal");

  // Create Annual Goal
  await prisma.goal.upsert({
    where: { type: GoalType.ANNUAL },
    update: {},
    create: {
      type: GoalType.ANNUAL,
      salesRevenue: 1000000.0,
      salesCount: 1500,
      estimatesCreated: 2400,
      newCustomers: 180,
    },
  });
  console.log("Created ANNUAL goal");

  // Create sample recipients (mix of active/inactive)
  const recipients = [
    { name: "John Smith", email: "john.smith@boonegraphics.com", active: true },
    { name: "Sarah Johnson", email: "sarah.johnson@boonegraphics.com", active: true },
    { name: "Mike Wilson", email: "mike.wilson@boonegraphics.com", active: false },
  ];

  for (const recipient of recipients) {
    await prisma.recipient.upsert({
      where: { email: recipient.email },
      update: {},
      create: recipient,
    });
    console.log(`Created recipient: ${recipient.name} (${recipient.active ? "active" : "inactive"})`);
  }

  // Create sample DigestData with mock metrics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.digestData.upsert({
    where: { exportDate: today },
    update: {},
    create: {
      exportDate: today,
      data: {
        date: today.toISOString().split("T")[0],
        metrics: {
          dailyRevenue: 4250.75,
          dailySalesCount: 8,
          dailyEstimatesCreated: 12,
          dailyNewCustomers: 2,
          monthToDateRevenue: 42500.0,
          monthToDateSalesCount: 65,
          monthToDateEstimatesCreated: 110,
          monthToDateNewCustomers: 8,
          yearToDateRevenue: 125000.0,
          yearToDateSalesCount: 180,
          yearToDateEstimatesCreated: 320,
          yearToDateNewCustomers: 22,
        },
        highlights: [
          { type: "big_order", description: "Large banner order from ABC Corp - $1,250" },
          { type: "new_customer", description: "Welcome new customer: XYZ Industries" },
        ],
        bdPerformance: [
          { name: "Alice Brown", ordersCompleted: 3, revenue: 2100.5 },
          { name: "Bob Davis", ordersCompleted: 2, revenue: 1500.25 },
        ],
        pmPerformance: [
          { name: "Carol Evans", ordersCompleted: 4, revenue: 2800.0 },
          { name: "Dan Foster", ordersCompleted: 4, revenue: 1450.75 },
        ],
        aiInsights: {
          summary: "Strong performance today with above-average order value. New customer acquisition on track.",
          recommendations: ["Follow up with ABC Corp on potential repeat orders", "Focus on estimates conversion this week"],
        },
      },
    },
  });
  console.log("Created sample DigestData");

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
