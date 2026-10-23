import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const directory=path.resolve(process.argv[2] || '');
const manifest=JSON.parse(readFileSync(path.join(directory,'manifest.json'),'utf8'));
if(!manifest.hashes?.['database.sqlite'])throw new Error('Manifesto inválido.');
for(const [name,expected] of Object.entries(manifest.hashes)){
 const file=path.resolve(directory,name);
 if(!file.startsWith(directory+path.sep))throw new Error('Caminho inválido no manifesto.');
 if(crypto.createHash('sha256').update(readFileSync(file)).digest('hex')!==expected)throw new Error(`Checksum inválido: ${name}`);
}
const database=new DatabaseSync(path.join(directory,'database.sqlite'),{readOnly:true});
if(database.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('SQLite corrompido.');
database.close();console.log('Snapshot íntegro: base de dados e uploads verificados.');
