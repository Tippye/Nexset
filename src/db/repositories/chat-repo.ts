import { asc, desc, eq } from 'drizzle-orm';

import { newId } from '@/lib/id';

import { logOp } from '../oplog';
import { chatMessages, chatSessions } from '../schema';
import type { DB } from '../types';

export async function createChatSession(db: DB, title?: string): Promise<string> {
  const now = Date.now();
  const row = { id: newId(), title: title ?? null, createdAt: now, updatedAt: now };
  await db.insert(chatSessions).values(row);
  await logOp(db, 'chat_sessions', row.id, 'put', row);
  return row.id;
}

export async function getLatestChatSession(db: DB): Promise<string | null> {
  const rows = await db
    .select()
    .from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(1);
  return rows.length ? rows[0].id : null;
}

export async function addChatMessage(
  db: DB,
  sessionId: string,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  card?: unknown,
): Promise<string> {
  const row = {
    id: newId(),
    sessionId,
    role,
    content,
    cardJson: card === undefined ? null : JSON.stringify(card),
    createdAt: Date.now(),
  };
  await db.insert(chatMessages).values(row);
  await logOp(db, 'chat_messages', row.id, 'put', row);
  await db
    .update(chatSessions)
    .set({ updatedAt: row.createdAt })
    .where(eq(chatSessions.id, sessionId));
  return row.id;
}

export async function getChatMessages(db: DB, sessionId: string, limit = 40) {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);
  return rows.reverse();
}

export async function getChatMessagesAsc(db: DB, sessionId: string) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
}
