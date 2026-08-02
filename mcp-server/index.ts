import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createNexsetMcpServer } from './server.js';
import { NexsetDataService, openReadOnlyDatabase } from './tools.js';

const dbPath = resolveDbPath(process.argv.slice(2));
if (!dbPath) {
  process.stderr.write('请通过 --db <path> 或 NEXSET_DB_PATH 指定 Nexset SQLite 数据库。\n');
  process.exit(1);
}

const database = openReadOnlyDatabase(dbPath);
const handle = serveStdio(() => createNexsetMcpServer(new NexsetDataService(database)), {
  onerror: (error) => process.stderr.write(`[nexset-mcp] ${error.message}\n`),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void handle.close().finally(() => {
      database.close();
      process.exit(0);
    });
  });
}

function resolveDbPath(args: string[]): string | undefined {
  const index = args.indexOf('--db');
  return (index >= 0 ? args[index + 1] : undefined) ?? process.env.NEXSET_DB_PATH;
}
