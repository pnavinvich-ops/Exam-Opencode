'use strict';

// Local development entry:  npm start
// Uses built-in SQLite of Node.js (needs Node >= 23.4), or a remote
// libSQL/Turso database when DATABASE_URL is set.

if (!process.env.DATABASE_URL) {
  try {
    require('node:sqlite');
  } catch (e) {
    console.error('\n❌ node:sqlite is not available in your Node.js ' + process.version);
    console.error('   This project requires Node.js >= 23.4 (built-in SQLite),');
    console.error('   or set DATABASE_URL to a libSQL/Turso database.');
    console.error('   Fix: install a current Node from https://nodejs.org, then run:  npm start\n');
    process.exit(1);
  }
}

const app = require('./api/server/app');

const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, () => {
  console.log(`Physics Exam Library running at http://localhost:${PORT}`);
  console.log('Open this address in your browser. Demo login: admin / Admin@1234');
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error('   Another server is probably still running.');
    console.error('   Fix: close it, or run on another port:  set PORT=3001 && npm start\n');
    process.exit(1);
  }
  throw err;
});
