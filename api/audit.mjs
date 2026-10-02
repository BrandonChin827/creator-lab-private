// POST /api/audit: saves a Free Channel Audit application to Notion and Kit.
import { handleAudit } from './_audit.mjs';

export const POST = request => handleAudit(request);
