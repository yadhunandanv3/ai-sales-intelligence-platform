import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST', 'WON'];
const COMPANIES = [
  'Acme Corp', 'Wayne Enterprises', 'Stark Industries', 'Cyberdyne Systems',
  'Initech', 'Umbrella Corp', 'Massive Dynamic', 'Oscorp', 'Hooli', 'Pied Piper'
];
const TAGS_POOL = ['enterprise', 'high-intent', 'inbound', 'demo-requested', 'q3-deal', 'renewal'];

async function main() {
  console.log('🚀 Starting volume seed for Pagination, Indexing & Performance testing...');

  // 1. Find the active tenant organization
  const organization = await prisma.organization.findFirst();
  if (!organization) {
    console.error('❌ No organization found. Please register an organization first via the UI signup page.');
    process.exit(1);
  }

  console.log(`🏢 Seeding 50 test leads into Organization: "${organization.name}" (${organization.id})`);

  const mockLeads = [];
  const now = Date.now();

  for (let i = 1; i <= 50; i++) {
    const stage = STAGES[i % STAGES.length];
    const company = COMPANIES[i % COMPANIES.length];
    const value = (Math.floor(Math.random() * 95) + 5) * 1000; // $5,000 to $100,000
    const score = Math.floor(Math.random() * 80) + 20; // Score 20 - 100
    const randomTags = [TAGS_POOL[i % TAGS_POOL.length], TAGS_POOL[(i + 2) % TAGS_POOL.length]];
    // Stagger creation dates across the last 30 days
    const createdAt = new Date(now - i * 14 * 60 * 60 * 1000);

    mockLeads.push({
      organizationId: organization.id,
      name: `Prospect ${i} (${company.split(' ')[0]})`,
      email: `prospect${i}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      company,
      jobTitle: i % 2 === 0 ? 'VP of Sales' : 'Chief Technology Officer',
      source: i % 3 === 0 ? 'Web' : 'Referral',
      status: stage,
      value: value,
      score: score,
      tags: randomTags,
      createdAt
    });
  }

  // 2. Bulk insert leads
  await prisma.lead.createMany({
    data: mockLeads
  });

  const totalLeads = await prisma.lead.count({ where: { organizationId: organization.id } });
  console.log(`✅ Successfully inserted 50 test leads!`);
  console.log(`📊 Total leads in "${organization.name}": ${totalLeads}`);
  console.log(`\n💡 You can now test:`);
  console.log(`   1. Pagination: GET /api/leads?page=1&limit=10 (Total pages: ${Math.ceil(totalLeads / 10)})`);
  console.log(`   2. Composite Index: Filter by status and order by date`);
  console.log(`   3. Search: Search by company name in the UI`);
}

main()
  .catch((err) => {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
