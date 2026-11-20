import { sha256 } from '../lib/auth.mjs';
const password = process.argv[2];
if (!password) { console.error('Usage: npm run hash -- "your password"'); process.exit(1); }
console.log(sha256(password));
