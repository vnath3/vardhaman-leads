import { createStore } from './store.mjs';
let store; // reused across invocations of a warm function
export const getStore = (env = process.env) => (store === undefined ? (store = createStore(env)) : store);
