import { handleLead } from '../../lib/handlers.mjs';
import { getStore } from '../../lib/runtime.mjs';
export default (request, context) => handleLead(request, { store: getStore(), geo: context?.geo });
export const config = { path: '/api/lead' };
