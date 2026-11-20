import { handleEvent } from '../../lib/handlers.mjs';
import { getStore } from '../../lib/runtime.mjs';
export default request => handleEvent(request, { store: getStore() });
export const config = { path: '/api/event' };
