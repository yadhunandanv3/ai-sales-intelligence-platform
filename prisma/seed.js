import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const permissions = [
  { name: 'lead:create', description: 'Allows creating new leads' },
  { name: 'lead:read', description: 'Allows viewing leads' },
  { name: 'lead:update', description: 'Allows updating lead details' },
  { name: 'lead:delete', description: 'Allows archiving or deleting leads' },
  { name: 'lead:assign', description: 'Allows assigning leads to users' },
  { name: 'task:create', description: 'Allows creating tasks' },
  { name: 'task:update', description: 'Allows updating and completing tasks' },
  { name: 'report:view', description: 'Allows viewing pipeline and sales analytics reports' },
  { name: 'user:manage', description: 'Allows inviting and managing organization users' },
  { name: 'organization:manage', description: 'Allows modifying organization settings' }
];

const roles = [
  {
    name: 'SUPER_ADMIN',
    description: 'System-level admin with unrestricted permissions',
    permissions: [
      'lead:create', 'lead:read', 'lead:update', 'lead:delete', 'lead:assign',
      'task:create', 'task:update', 'report:view', 'user:manage', 'organization:manage'
    ]
  },
  {
    name: 'ORG_ADMIN',
    description: 'Tenant organization owner with full control of their organization',
    permissions: [
      'lead:create', 'lead:read', 'lead:update', 'lead:delete', 'lead:assign',
      'task:create', 'task:update', 'report:view', 'user:manage', 'organization:manage'
    ]
  },
  {
    name: 'SALES_MANAGER',
    description: 'Manager overseeing sales team pipelines and reporting',
    permissions: [
      'lead:create', 'lead:read', 'lead:update', 'lead:assign',
      'task:create', 'task:update', 'report:view'
    ]
  },
  {
    name: 'SALES_REP',
    description: 'Representative responsible for daily lead contact and follow-ups',
    permissions: [
      'lead:create', 'lead:read', 'lead:update',
      'task:create', 'task:update'
    ]
  }
];

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Create Permissions (Idempotent)
  const createdPermissions = {};
  for (const perm of permissions) {
    const record = await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm
    });
    createdPermissions[perm.name] = record;
  }
  console.log(`✅ Seeded ${Object.keys(createdPermissions).length} permissions.`);

  // 2. Create Roles and Map Permissions
  for (const roleDef of roles) {
    const roleRecord = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { description: roleDef.description },
      create: {
        name: roleDef.name,
        description: roleDef.description
      }
    });

    console.log(`✅ Seeded Role: ${roleDef.name}`);

    // Map permissions to this role
    for (const permName of roleDef.permissions) {
      const permRecord = createdPermissions[permName];
      if (permRecord) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: roleRecord.id,
              permissionId: permRecord.id
            }
          },
          update: {},
          create: {
            roleId: roleRecord.id,
            permissionId: permRecord.id
          }
        });
      }
    }
    console.log(`   🔗 Mapped permissions to ${roleDef.name}.`);
  }

  console.log('🌿 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
