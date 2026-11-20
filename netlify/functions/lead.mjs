import { handleLead } from '../../lib/handlers.mjs';
import { getStore } from '../../lib/runtime.mjs';
export default request => handleLead(request, { store: getStore() });
export const config = { path: '/api/lead' };
