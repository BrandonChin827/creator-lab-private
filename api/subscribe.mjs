// POST /api/subscribe: saves a YouTube Idea Skill signup to Kit.
import { handleSubscribe } from './_lead.mjs';

export const POST = request => handleSubscribe(request);
