// better-sqlite3 13 uses Node-API prebuilds shared by Node and Electron; no ABI rebuild is necessary.
import Database from 'better-sqlite3'
const db = new Database(':memory:')
db.prepare('SELECT 1').get()
db.close()
console.log(
  'SQLite Node-API prebuild loaded. Electron runtime loading is checked by bun run test:electron.',
)
