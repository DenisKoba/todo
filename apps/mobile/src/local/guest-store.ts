import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";
import type { TodoItem, TodoList } from "@/api/client";
import { DEFAULT_LIST_COLOR, type ListColorKey } from "@/theme/list-colors";

type GuestListRow = {
  id: string;
  title: string;
  comment: string | null;
  color_key: ListColorKey;
  position: number;
};

type GuestItemRow = {
  id: string;
  list_id: string;
  title: string;
  comment: string | null;
  completed: number;
  position: number;
};

export type GuestImportPayload = {
  lists: Array<{
    clientId: string;
    title: string;
    comment: string | null;
    colorKey: ListColorKey;
    position: number;
    items: Array<{
      clientId: string;
      title: string;
      comment: string | null;
      completed: boolean;
      position: number;
    }>;
  }>;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync("todo-guest-v1.db")
    .then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS guest_lists (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          comment TEXT,
          color_key TEXT NOT NULL DEFAULT 'neutral',
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          imported_owner_id TEXT
        );
        CREATE TABLE IF NOT EXISTS guest_items (
          id TEXT PRIMARY KEY NOT NULL,
          list_id TEXT NOT NULL REFERENCES guest_lists(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          comment TEXT,
          completed INTEGER NOT NULL DEFAULT 0,
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS guest_items_list_position_idx
          ON guest_items(list_id, position);
      `);
      const columns = await database.getAllAsync<{ name: string }>(
        "PRAGMA table_info(guest_lists)",
      );
      if (!columns.some((column) => column.name === "color_key")) {
        await database.execAsync(
          "ALTER TABLE guest_lists ADD COLUMN color_key TEXT NOT NULL DEFAULT 'neutral'",
        );
      }
      return database;
    })
    .catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  return databasePromise;
}

function validTitle(value: string, maxLength: number): string {
  const title = value.trim();
  if (!title || title.length > maxLength) {
    throw new Error(`Title must be between 1 and ${maxLength} characters.`);
  }
  return title;
}

function validComment(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value.length > 2000) {
    throw new Error("Comment must be at most 2000 characters.");
  }
  return value;
}

function itemFromRow(row: GuestItemRow): TodoItem {
  return {
    id: row.id,
    title: row.title,
    comment: row.comment,
    completed: row.completed !== 0,
    position: row.position,
  };
}

async function readPendingLists(
  database: SQLite.SQLiteDatabase,
): Promise<Array<GuestListRow & { items: TodoItem[] }>> {
  const [lists, items] = await Promise.all([
    database.getAllAsync<GuestListRow>(`
      SELECT id, title, comment, color_key, position
      FROM guest_lists
      WHERE imported_owner_id IS NULL
      ORDER BY position ASC, created_at ASC
    `),
    database.getAllAsync<GuestItemRow>(`
      SELECT item.id, item.list_id, item.title, item.comment,
             item.completed, item.position
      FROM guest_items AS item
      JOIN guest_lists AS list ON list.id = item.list_id
      WHERE list.imported_owner_id IS NULL
      ORDER BY item.position ASC, item.created_at ASC
    `),
  ]);

  const itemsByList = new Map<string, TodoItem[]>();
  for (const row of items) {
    const current = itemsByList.get(row.list_id) ?? [];
    current.push(itemFromRow(row));
    itemsByList.set(row.list_id, current);
  }
  return lists.map((list) => ({
    ...list,
    items: itemsByList.get(list.id) ?? [],
  }));
}

/** Guest data never touches the API. Imported lists remain on disk but are hidden. */
export async function getGuestLists(): Promise<TodoList[]> {
  const database = await getDatabase();
  const lists = await readPendingLists(database);
  return lists.map(({ id, title, comment, color_key, items }) => ({
    id,
    title,
    comment,
    colorKey: color_key,
    items,
  }));
}

export async function createGuestList(input: {
  title: string;
  comment?: string | null;
  colorKey?: ListColorKey;
}): Promise<TodoList> {
  const database = await getDatabase();
  const id = Crypto.randomUUID();
  const title = validTitle(input.title, 120);
  const comment = validComment(input.comment);
  const colorKey = input.colorKey ?? DEFAULT_LIST_COLOR;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const next = await transaction.getFirstAsync<{ position: number }>(`
      SELECT COALESCE(MAX(position) + 1, 0) AS position
      FROM guest_lists
      WHERE imported_owner_id IS NULL
    `);
    await transaction.runAsync(
      `INSERT INTO guest_lists
         (id, title, comment, color_key, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      title,
      comment,
      colorKey,
      next?.position ?? 0,
      new Date().toISOString(),
    );
  });
  return { id, title, comment, colorKey, items: [] };
}

export async function updateGuestList(
  listId: string,
  input: { title: string; comment: string | null; colorKey: ListColorKey },
): Promise<TodoList> {
  const database = await getDatabase();
  const title = validTitle(input.title, 120);
  const comment = validComment(input.comment);
  const result = await database.runAsync(
    `UPDATE guest_lists SET title = ?, comment = ?, color_key = ?
     WHERE id = ? AND imported_owner_id IS NULL`,
    title,
    comment,
    input.colorKey,
    listId,
  );
  if (!result.changes) throw new Error("List not found.");
  const lists = await getGuestLists();
  return lists.find((list) => list.id === listId)!;
}

export async function createGuestItem(
  listId: string,
  input: { title: string; comment?: string | null },
): Promise<TodoItem> {
  const [item] = await createGuestItems(listId, [
    { title: input.title, comment: input.comment ?? null },
  ]);
  return item;
}

export async function createGuestItems(
  listId: string,
  inputs: Array<{ title: string; comment: string | null }>,
): Promise<TodoItem[]> {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) {
    throw new Error("Add between 1 and 100 tasks at a time.");
  }
  const items = Array.from(inputs, (input) => {
    if (typeof input?.title !== "string") {
      throw new Error("Task title must be text.");
    }
    if (input.comment != null && typeof input.comment !== "string") {
      throw new Error("Task comment must be text.");
    }
    return {
      title: validTitle(input.title, 240),
      comment: validComment(input.comment),
    };
  });
  const database = await getDatabase();
  let created: TodoItem[] = [];
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const list = await transaction.getFirstAsync<{ id: string }>(
      `SELECT id FROM guest_lists WHERE id = ? AND imported_owner_id IS NULL`,
      listId,
    );
    if (!list) throw new Error("List not found.");
    const next = await transaction.getFirstAsync<{ position: number }>(
      `SELECT COALESCE(MAX(position) + 1, 0) AS position
       FROM guest_items WHERE list_id = ?`,
      listId,
    );
    const firstPosition = next?.position ?? 0;
    const createdAt = new Date().toISOString();
    const inserted: TodoItem[] = [];
    for (const [index, input] of items.entries()) {
      const item: TodoItem = {
        id: Crypto.randomUUID(),
        title: input.title,
        comment: input.comment,
        completed: false,
        position: firstPosition + index,
      };
      await transaction.runAsync(
        `INSERT INTO guest_items
           (id, list_id, title, comment, completed, position, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        item.id,
        listId,
        item.title,
        item.comment,
        item.position,
        createdAt,
      );
      inserted.push(item);
    }
    created = inserted;
  });
  return created;
}

export async function setGuestItemCompleted(
  itemId: string,
  completed: boolean,
): Promise<TodoItem> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `UPDATE guest_items
     SET completed = ?
     WHERE id = ? AND list_id IN (
       SELECT id FROM guest_lists WHERE imported_owner_id IS NULL
     )`,
    completed ? 1 : 0,
    itemId,
  );
  if (!result.changes) throw new Error("Task not found.");
  const item = await database.getFirstAsync<GuestItemRow>(
    `SELECT id, list_id, title, comment, completed, position
     FROM guest_items WHERE id = ?`,
    itemId,
  );
  if (!item) throw new Error("Task not found.");
  return itemFromRow(item);
}

export async function deleteGuestItem(itemId: string): Promise<{ ok: true }> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `DELETE FROM guest_items
     WHERE id = ? AND list_id IN (
       SELECT id FROM guest_lists WHERE imported_owner_id IS NULL
     )`,
    itemId,
  );
  if (!result.changes) throw new Error("Task not found.");
  return { ok: true };
}

export async function deleteGuestList(listId: string): Promise<{ ok: true }> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `DELETE FROM guest_lists WHERE id = ? AND imported_owner_id IS NULL`,
    listId,
  );
  if (!result.changes) throw new Error("List not found.");
  return { ok: true };
}

/** Stable client IDs let the server deduplicate a retry after a lost response. */
export async function getPendingGuestImport(): Promise<GuestImportPayload> {
  const database = await getDatabase();
  const lists = await readPendingLists(database);
  return {
    lists: lists.map((list) => ({
      clientId: list.id,
      title: list.title,
      comment: list.comment,
      colorKey: list.color_key,
      position: list.position,
      items: list.items.map((item) => ({
        clientId: item.id,
        title: item.title,
        comment: item.comment,
        completed: item.completed,
        position: item.position,
      })),
    })),
  };
}

/** Call only after the authenticated import endpoint confirms these client IDs. */
export async function markGuestListsImported(
  ownerId: string,
  clientIds: string[],
): Promise<void> {
  if (!ownerId) throw new Error("Owner ID is required.");
  if (clientIds.length === 0) return;
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const clientId of new Set(clientIds)) {
      await transaction.runAsync(
        `UPDATE guest_lists SET imported_owner_id = ?
         WHERE id = ? AND imported_owner_id IS NULL`,
        ownerId,
        clientId,
      );
    }
  });
}

/** Remove device copies linked to a deleted account; unrelated guest lists remain. */
export async function deleteImportedGuestLists(ownerId: string): Promise<void> {
  if (!ownerId) throw new Error("Owner ID is required.");
  const database = await getDatabase();
  await database.runAsync(
    `DELETE FROM guest_lists WHERE imported_owner_id = ?`,
    ownerId,
  );
}
