export interface ConversationState {
  conversationId: string;
  lastSearchQuery: string | null;
  lastSearchResultIds: string[];
  lastViewedProductId: string | null;
  updatedAt: string;
}

export interface ConversationDb {
  getState(conversationId: string): ConversationState | null;
  saveState(state: ConversationState): void;
  close(): void;
}

import { DatabaseSync } from "node:sqlite";

function rowToState(row: Record<string, unknown>): ConversationState {
  return {
    conversationId: row.conversationId as string,
    lastSearchQuery: (row.lastSearchQuery as string | null) ?? null,
    lastSearchResultIds: JSON.parse(row.lastSearchResultIds as string) as string[],
    lastViewedProductId: (row.lastViewedProductId as string | null) ?? null,
    updatedAt: row.updatedAt as string,
  };
}

export function openConversationDb(location: string): ConversationDb {
  const db = new DatabaseSync(location);
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      conversationId TEXT PRIMARY KEY,
      lastSearchQuery TEXT,
      lastSearchResultIds TEXT NOT NULL,
      lastViewedProductId TEXT,
      updatedAt TEXT NOT NULL
    )
  `);

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO conversations
      (conversationId, lastSearchQuery, lastSearchResultIds, lastViewedProductId, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  const getById = db.prepare("SELECT * FROM conversations WHERE conversationId = ?");

  return {
    saveState(state: ConversationState): void {
      upsert.run(
        state.conversationId,
        state.lastSearchQuery,
        JSON.stringify(state.lastSearchResultIds),
        state.lastViewedProductId,
        state.updatedAt,
      );
    },
    getState(conversationId: string): ConversationState | null {
      const row = getById.get(conversationId) as Record<string, unknown> | undefined;
      if (row === undefined) return null;
      return rowToState(row);
    },
    close(): void {
      db.close();
    },
  };
}
