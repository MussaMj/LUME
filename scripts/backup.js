import { createBackup } from '../server/backups.js';
import { db } from '../server/db.js';
console.log(createBackup(process.argv[2] || process.env.BACKUP_DIR));db.close();
