// POST /api/discovery: saves a Discovery Call application to Kit.
import { handleDiscovery } from './_discovery.mjs';

export const POST = request => handleDiscovery(request);
