import type { Session } from "@supabase/supabase-js";
import { ApiError, api, type TodoItem, type TodoList } from "@/api/client";
import {
  createGuestItem,
  createGuestItems,
  createGuestList,
  deleteGuestItem,
  deleteGuestList,
  getGuestLists,
  getPendingGuestImport,
  markGuestListsImported,
  setGuestItemCompleted,
} from "@/local/guest-store";
import { t } from "@/i18n";

type ListInput = { title: string; comment: string | null };
type ItemInput = { title: string; comment: string | null };

/** The older API creates one task at a time, so some may persist before a failure. */
export class PartialBatchCreateError extends Error {
  readonly created: TodoItem[];
  /** Unconfirmed items; the failed request may still have reached the server. */
  readonly remaining: ItemInput[];
  readonly cause: unknown;

  constructor(created: TodoItem[], remaining: ItemInput[], cause: unknown) {
    const total = created.length + remaining.length;
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `At least ${created.length} of ${total} tasks were added. Refresh the list before retrying. ${reason}`,
    );
    this.name = "PartialBatchCreateError";
    this.created = created;
    this.remaining = remaining;
    this.cause = cause;
  }
}

/** Nest's 404 for an unknown route is distinct from a missing list's 404. */
function isMissingBatchRoute(error: unknown, listId: string): boolean {
  if (!(error instanceof ApiError) || error.status !== 404) return false;
  if (!error.message.startsWith("Cannot POST ")) return false;
  const route = error.message.slice("Cannot POST ".length).split("?")[0];
  return route.endsWith(`/lists/${listId}/items/batch`);
}
type ImportResponse = {
  lists: Array<{ clientId: string; id: string; imported: boolean }>;
};

const importsInFlight = new Map<string, Promise<void>>();
const pausedGuestImports = new Set<string>();

export function listQueryKey(session: Session | null) {
  return ["lists", session?.user.id ?? "guest"] as const;
}

/** Import one list at a time and acknowledge it locally only after the API succeeds. */
async function importPendingGuestLists(session: Session): Promise<void> {
  const ownerId = session.user.id;
  const existing = importsInFlight.get(ownerId);
  if (existing) return existing;
  if (pausedGuestImports.has(ownerId)) return;

  const run = (async () => {
    const pending = await getPendingGuestImport();
    for (const list of pending.lists) {
      if (pausedGuestImports.has(ownerId)) return;
      const result = await api<ImportResponse>("/lists/import", session, {
        method: "POST",
        body: JSON.stringify({ lists: [list] }),
      });
      if (!result.lists.some((entry) => entry.clientId === list.clientId)) {
        throw new Error("The server did not confirm the imported list.");
      }
      await markGuestListsImported(ownerId, [list.clientId]);
    }
  })();
  importsInFlight.set(ownerId, run);
  try {
    await run;
  } finally {
    importsInFlight.delete(ownerId);
  }
}

/** Stop new imports and let any in-flight write finish before account deletion. */
export async function pauseGuestImportsForAccountDeletion(
  ownerId: string,
): Promise<() => void> {
  pausedGuestImports.add(ownerId);
  try {
    await importsInFlight.get(ownerId);
  } catch {
    // The failed import keeps its lists pending locally.
  }
  return () => pausedGuestImports.delete(ownerId);
}

export async function getLists(session: Session | null): Promise<TodoList[]> {
  if (!session) return getGuestLists();
  try {
    await importPendingGuestLists(session);
  } catch {
    throw new Error(t("guestDataImportFailed"));
  }
  return api<TodoList[]>("/lists", session);
}

export async function createList(session: Session | null, input: ListInput) {
  if (!session) return createGuestList(input);
  await importPendingGuestLists(session);
  return api<TodoList>("/lists", session, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createItem(
  session: Session | null,
  listId: string,
  input: ItemInput,
): Promise<TodoItem> {
  if (!session) return createGuestItem(listId, input);
  await importPendingGuestLists(session);
  return api<TodoItem>(`/lists/${listId}/items`, session, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createItems(
  session: Session | null,
  listId: string,
  items: ItemInput[],
): Promise<TodoItem[]> {
  if (!session) return createGuestItems(listId, items);
  await importPendingGuestLists(session);
  try {
    return await api<TodoItem[]>(`/lists/${listId}/items/batch`, session, {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  } catch (error) {
    if (!isMissingBatchRoute(error, listId)) throw error;
  }

  // Backward compatibility until the batch endpoint reaches Render.
  const created: TodoItem[] = [];
  for (const [index, item] of items.entries()) {
    try {
      created.push(
        await api<TodoItem>(`/lists/${listId}/items`, session, {
          method: "POST",
          body: JSON.stringify(item),
        }),
      );
    } catch (cause) {
      if (created.length === 0) throw cause;
      throw new PartialBatchCreateError(created, items.slice(index), cause);
    }
  }
  return created;
}

export async function setItemCompleted(
  session: Session | null,
  itemId: string,
  completed: boolean,
): Promise<TodoItem> {
  if (!session) return setGuestItemCompleted(itemId, completed);
  return api<TodoItem>(`/items/${itemId}`, session, {
    method: "PATCH",
    body: JSON.stringify({ completed }),
  });
}

export async function removeItem(session: Session | null, itemId: string) {
  if (!session) return deleteGuestItem(itemId);
  return api<{ ok: true }>(`/items/${itemId}`, session, { method: "DELETE" });
}

export async function removeItems(session: Session | null, itemIds: string[]) {
  for (const id of itemIds) await removeItem(session, id);
  return itemIds;
}

export async function removeList(session: Session | null, listId: string) {
  if (!session) return deleteGuestList(listId);
  return api<{ ok: true }>(`/lists/${listId}`, session, { method: "DELETE" });
}
