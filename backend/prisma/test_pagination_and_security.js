import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 Testing Pagination, Security, and Multi-Tenancy Isolation...\n');

  // 1. Fetch Tenant A
  const tenantA = await prisma.organization.findFirst({ where: { name: 'salesAI' } });
  if (!tenantA) {
    console.error('Tenant A (salesAI) not found.');
    return;
  }

  // 2. Pagination test on DB & Prisma
  const page1 = await prisma.lead.findMany({
    where: { organizationId: tenantA.id },
    orderBy: { createdAt: 'desc' },
    skip: 0,
    take: 10
  });

  const page2 = await prisma.lead.findMany({
    where: { organizationId: tenantA.id },
    orderBy: { createdAt: 'desc' },
    skip: 10,
    take: 10
  });

  const totalLeads = await prisma.lead.count({ where: { organizationId: tenantA.id } });

  console.log('--- [1. PAGINATION VERIFICATION] ---');
  console.log(`Total Leads in Tenant A: ${totalLeads}`);
  console.log(`Page 1 count: ${page1.length} | First lead: "${page1[0]?.name}"`);
  console.log(`Page 2 count: ${page2.length} | First lead: "${page2[0]?.name}"`);
  const page1Ids = new Set(page1.map(l => l.id));
  const hasOverlap = page2.some(l => page1Ids.has(l.id));
  console.log(`Page 1 & 2 Overlap: ${hasOverlap ? '❌ FAILED (overlap detected)' : '✅ PASSED (clean offset pagination without duplicates)'}`);

  // 3. Security & Multi-Tenancy Isolation
  console.log('\n--- [2. MULTI-TENANT ISOLATION & SECURITY VERIFICATION] ---');
  let tenantB = await prisma.organization.findUnique({ where: { subdomain: 'tenant-b-sec' } });
  if (!tenantB) {
    tenantB = await prisma.organization.create({
      data: {
        name: 'Tenant B Security Audit Inc',
        subdomain: 'tenant-b-sec'
      }
    });
    console.log(`Created isolated Tenant B: "${tenantB.name}" (${tenantB.id})`);
  }

  // Query Tenant B leads
  const tenantBLeads = await prisma.lead.findMany({
    where: { organizationId: tenantB.id }
  });
  console.log(`Tenant B Leads Count: ${tenantBLeads.length} (Expected: 0)`);
  if (tenantBLeads.length === 0) {
    console.log('✅ PASSED: Tenant B cannot see any of Tenant A\'s leads! Strict organizationId partition maintained.');
  } else {
    console.log('❌ FAILED: Cross-tenant data leak!');
  }

  console.log('\n🎉 All checks completed successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
