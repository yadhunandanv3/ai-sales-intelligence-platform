-- DropIndex
DROP INDEX "Activity_leadId_idx";

-- DropIndex
DROP INDEX "Activity_organizationId_idx";

-- DropIndex
DROP INDEX "Lead_assignedUserId_idx";

-- DropIndex
DROP INDEX "Lead_organizationId_idx";

-- DropIndex
DROP INDEX "Lead_pipelineStageId_idx";

-- DropIndex
DROP INDEX "Lead_status_idx";

-- DropIndex
DROP INDEX "Note_leadId_idx";

-- DropIndex
DROP INDEX "Note_organizationId_idx";

-- DropIndex
DROP INDEX "Notification_isRead_idx";

-- DropIndex
DROP INDEX "Notification_organizationId_idx";

-- DropIndex
DROP INDEX "Notification_userId_idx";

-- DropIndex
DROP INDEX "Task_assignedUserId_idx";

-- DropIndex
DROP INDEX "Task_dueDate_idx";

-- DropIndex
DROP INDEX "Task_leadId_idx";

-- DropIndex
DROP INDEX "Task_organizationId_idx";

-- CreateIndex
CREATE INDEX "Activity_organizationId_leadId_createdAt_idx" ON "Activity"("organizationId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_idx" ON "Lead"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Lead_organizationId_pipelineStageId_idx" ON "Lead"("organizationId", "pipelineStageId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_assignedUserId_idx" ON "Lead"("organizationId", "assignedUserId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_createdAt_idx" ON "Lead"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_deletedAt_idx" ON "Lead"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Note_organizationId_leadId_createdAt_idx" ON "Note"("organizationId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_userId_isRead_createdAt_idx" ON "Notification"("organizationId", "userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Task_organizationId_leadId_idx" ON "Task"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "Task_organizationId_assignedUserId_status_idx" ON "Task"("organizationId", "assignedUserId", "status");

-- CreateIndex
CREATE INDEX "Task_organizationId_dueDate_idx" ON "Task"("organizationId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_organizationId_deletedAt_idx" ON "Task"("organizationId", "deletedAt");
