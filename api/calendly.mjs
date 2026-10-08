// POST /api/calendly: Calendly webhook that marks Discovery Call bookings in Kit and Notion.
import { handleCalendly } from './_calendly.mjs';

export const POST = request => handleCalendly(request);
