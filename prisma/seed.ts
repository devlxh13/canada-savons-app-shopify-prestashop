import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaults = [
  { resourceType: "products", cronExpression: "0 */6 * * *", enabled: true },
  { resourceType: "inventory", cronExpression: "0 */2 * * *", enabled: true },
  { resourceType: "customers", cronExpression: "0 7 * * *", enabled: true },
  { resourceType: "orders", cronExpression: "0 20 * * *", enabled: false },
];

async function main() {
  for (const config of defaults) {
    await prisma.cronConfig.upsert({
      where: { resourceType: config.resourceType },
      create: config,
      update: {},
    });
  }
  console.log("Seeded CronConfig defaults");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
