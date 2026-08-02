import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { NexsetDataService } from './tools.js';

export function createNexsetMcpServer(data: NexsetDataService): McpServer {
  const server = new McpServer(
    { name: 'nexset', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  registerReadTool(server, 'get_profile', '读取本地用户训练档案。', z.object({}), () =>
    data.getProfile(),
  );
  registerReadTool(server, 'get_active_plan', '读取当前激活的训练计划和动作。', z.object({}), () =>
    data.getActivePlan(),
  );
  registerReadTool(
    server,
    'list_recent_workouts',
    '读取最近完成或进行中的训练记录。',
    z.object({ limit: z.number().int().min(1).max(100).default(10) }),
    ({ limit }) => data.listRecentWorkouts(limit),
  );
  registerReadTool(
    server,
    'get_intelligence_metrics',
    '按模型类型读取延迟、通过率、估算成本与降级率。',
    z.object({ sinceDays: z.number().int().min(1).max(365).default(30) }),
    ({ sinceDays }) => data.getIntelligenceMetrics(sinceDays),
  );
  registerReadTool(server, 'get_sync_status', '读取 WebDAV 离线队列与幂等收件箱状态。', z.object({}), () =>
    data.getSyncStatus(),
  );
  return server;
}

function registerReadTool<T extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: z.ZodObject<T>,
  read: (input: z.infer<z.ZodObject<T>>) => unknown | Promise<unknown>,
): void {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      const result = await read(input as z.infer<z.ZodObject<T>>);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
