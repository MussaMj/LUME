import {validateConfig} from '../server/config.js';
import {verifyMailConfiguration} from '../server/mail.js';
import {db} from '../server/db.js';
if(process.env.NODE_ENV!=='production')throw new Error('Define NODE_ENV=production no ambiente a verificar.');
validateConfig();
await verifyMailConfiguration();db.close();
