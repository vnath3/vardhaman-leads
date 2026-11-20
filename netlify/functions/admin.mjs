import { handleAdmin } from '../../lib/handlers.mjs';
import { getStore } from '../../lib/runtime.mjs';
export default request => handleAdmin(request, { store: getStore() });
export const config = { path: '/api/admin/*' };
