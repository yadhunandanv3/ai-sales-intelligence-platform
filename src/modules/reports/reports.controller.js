import { Router } from 'express';
import { ReportsService } from './reports.service.js';
import { authenticateUser, requirePermission } from '../../middleware/auth.js';

const router = Router();
const reportsService = new ReportsService();

// Secure all reporting endpoints
router.use(authenticateUser);
router.use(requirePermission('report:view'));

/**
 * GET /api/reports/pipeline-stages
 * Summary of lead distributions and value across pipeline stages.
 */
router.get('/pipeline-stages', async (req, res, next) => {
  try {
    const data = await reportsService.getPipelineStageSummary(req.user.organizationId);
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/lead-sources
 * Summary of leads grouped by acquisition source.
 */
router.get('/lead-sources', async (req, res, next) => {
  try {
    const data = await reportsService.getLeadSourceSummary(req.user.organizationId);
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/rep-performance
 * Sales representative leaderboard (won leads, active leads, completed tasks).
 */
router.get('/rep-performance', async (req, res, next) => {
  try {
    const data = await reportsService.getRepPerformanceSummary(req.user.organizationId);
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
});

export default router;
