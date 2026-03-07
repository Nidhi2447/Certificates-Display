const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

// Files/folders to exclude from the tree scan
const SKIP = new Set([
  'node_modules', '.git',
  'index.html', 'server.js',
  'package.json', 'package-lock.json',
  '.gitignore', 'README.md',
  '.DS_Store', 'Thumbs.db'
]);

// ─── Directory scanner ──────────────────────────────
function scanDir(dirPath, relPath = '') {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (e) {
    return [];
  }

  const result = [];
  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;

    const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const children = scanDir(path.join(dirPath, entry.name), entryRel);
      if (children.length > 0) {
        result.push({ name: entry.name, type: 'dir', path: entryRel, children });
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      result.push({ name: entry.name, type: 'file', path: entryRel });
    }
  }
  return result;
}

// ─── Express app ────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(express.static(ROOT));

app.get('/api/tree', (req, res) => {
  try {
    const tree = scanDir(ROOT);
    res.json({ tree });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WebSocket for live reload ───────────────────────
const wss = new WebSocket.Server({ server });

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Debounced file-watcher
let debounceTimer = null;

try {
  fs.watch(ROOT, { recursive: true }, (event, filename) => {
    if (!filename) return;
    // Ignore changes to server/config files
    const base = filename.split(path.sep)[0];
    if (SKIP.has(base) || filename.startsWith('node_modules')) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`  Change detected: ${filename}`);
      broadcast({ type: 'reload' });
    }, 600);
  });
} catch (e) {
  console.warn('File watcher could not start:', e.message);
}

wss.on('connection', () => console.log('  Browser connected (live reload active)'));

// ─── Start ───────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Certificate Display  →  http://localhost:${PORT}\n`);
});
