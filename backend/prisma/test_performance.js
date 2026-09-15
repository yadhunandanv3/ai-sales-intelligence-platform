import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  console.log(`Running EXPLAIN ANALYZE for org: ${org.name} (${org.id})...\n`);

  // Force PostgreSQL query planner to evaluate Index Scan even on small row counts
  await prisma.$queryRawUnsafe(`SET enable_seqscan = OFF;`);

  const plan1 = await prisma.$queryRawUnsafe(`
    EXPLAIN ANALYZE 
    SELECT id, name, status, "createdAt" 
    FROM "Lead" 
    WHERE "organizationId" = '${org.id}' 
      AND "status" = 'NEW' 
    ORDER BY "createdAt" DESC;
  `);

  console.log('=== 1. EXPLAIN ANALYZE: Filter by (organizationId, status) ===');
  plan1.forEach(row => console.log(row['QUERY PLAN']));

  const plan2 = await prisma.$queryRawUnsafe(`
    EXPLAIN ANALYZE 
    SELECT id, name, "createdAt" 
    FROM "Lead" 
    WHERE "organizationId" = '${org.id}' 
    ORDER BY "createdAt" DESC 
    LIMIT 10 OFFSET 10;
  `);

  console.log('\n=== 2. EXPLAIN ANALYZE: Pagination & Ordering by (organizationId, createdAt) ===');
  plan2.forEach(row => console.log(row['QUERY PLAN']));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
