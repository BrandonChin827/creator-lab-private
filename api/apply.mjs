// POST /api/apply: saves a Free Video application to Notion and Kit.
import { handleApply } from './_apply.mjs';

export const POST = request => handleApply(request);
