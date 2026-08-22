'use strict';

// Vercel serverless entry. @vercel/node detects the exported Express app.
// Requires DATABASE_URL (+ DATABASE_AUTH_TOKEN) pointing at libSQL/Turso,
// because the serverless filesystem is read-only.
module.exports = require('./server/app');
