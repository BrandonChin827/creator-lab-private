// POST /api/qualify: tags a new subscriber with their optional answers in Kit.
import { handleQualify } from './_lead.mjs';

export const POST = request => handleQualify(request);
