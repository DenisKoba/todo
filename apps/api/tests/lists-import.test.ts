import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { ListsController } from "../src/lists/lists.controller";
import type { PrismaService } from "../src/prisma/prisma.service";

type StoredList = {
  id: string;
  ownerId: string;
  importKey: string | null;
  title: string;
  comment: string | null;
  colorKey?: string;
  position: number;
};
type StoredItem = {
  listId: string;
  title: string;
  comment: string | null;
  completed: boolean;
  position: number;
};

function controllerWithMemoryStore() {
  const profiles = new Map<string, { displayName: string | undefined }>();
  const lists: StoredList[] = [];
  const items: StoredItem[] = [];
  let idSequence = 0;
  const tx = {
    profile: {
      upsert: async ({
        where,
        create,
      }: {
        where: { id: string };
        create: { displayName?: string };
      }) => {
        if (!profiles.has(where.id)) {
          profiles.set(where.id, { displayName: create.displayName });
        }
      },
    },
    todoList: {
      aggregate: async ({ where }: { where: { ownerId: string } }) => ({
        _max: {
          position: lists
            .filter((list) => list.ownerId === where.ownerId)
            .reduce<number | null>(
              (highest, list) => Math.max(highest ?? -1, list.position),
              null,
            ),
        },
      }),
      create: async ({
        data,
      }: {
        data: Omit<StoredList, "id" | "importKey">;
      }) => {
        const list = { ...data, id: `server-${++idSequence}`, importKey: null };
        lists.push(list);
        return list;
      },
      createMany: async ({ data }: { data: Omit<StoredList, "id"> }) => {
        if (
          lists.some(
            (list) =>
              list.ownerId === data.ownerId &&
              list.importKey === data.importKey,
          )
        ) {
          return { count: 0 };
        }
        lists.push({
          ...data,
          id: `server-${++idSequence}`,
          comment: data.comment ?? null,
        });
        return { count: 1 };
      },
      findUniqueOrThrow: async ({
        where,
      }: {
        where: { ownerId_importKey: { ownerId: string; importKey: string } };
      }) => {
        const found = lists.find(
          (list) =>
            list.ownerId === where.ownerId_importKey.ownerId &&
            list.importKey === where.ownerId_importKey.importKey,
        );
        if (!found) throw new Error("List not found");
        return { id: found.id };
      },
    },
    todoItem: {
      createMany: async ({ data }: { data: StoredItem[] }) => {
        items.push(
          ...data.map((item) => ({ ...item, comment: item.comment ?? null })),
        );
        return { count: data.length };
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  } as unknown as PrismaService;
  return { controller: new ListsController(prisma), profiles, lists, items };
}

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  claims: { user_metadata: { name: "Guest turned member" } },
};
const guestList = {
  clientId: "device-list-1",
  title: "Groceries",
  comment: "Weekend",
  position: 2,
  items: [
    {
      clientId: "device-item-1",
      title: "Milk",
      comment: "Oat",
      completed: true,
      position: 3,
    },
    {
      clientId: "device-item-2",
      title: "Bread",
      completed: false,
      position: 4,
    },
  ],
};

test("guest import creates profile and appends full list once across retries", async () => {
  const store = controllerWithMemoryStore();
  const existing = await store.controller.createList(user, {
    title: "Cloud list",
  });
  const first = await store.controller.importLists(user, {
    lists: [guestList],
  });
  const second = await store.controller.importLists(user, {
    lists: [guestList],
  });

  assert.equal(store.profiles.get(user.id)?.displayName, "Guest turned member");
  assert.equal(store.lists.length, 2);
  assert.equal(store.lists[0]?.id, existing.id);
  assert.equal(store.lists[1]?.position, 1);
  assert.equal(store.lists[1]?.comment, "Weekend");
  assert.equal(store.lists[1]?.colorKey, "neutral");
  assert.deepEqual(
    store.items.map(({ title, comment, completed, position }) => ({
      title,
      comment,
      completed,
      position,
    })),
    [
      { title: "Milk", comment: "Oat", completed: true, position: 3 },
      { title: "Bread", comment: null, completed: false, position: 4 },
    ],
  );
  assert.deepEqual(first, {
    lists: [
      { clientId: guestList.clientId, id: store.lists[1]?.id, imported: true },
    ],
  });
  assert.deepEqual(second, {
    lists: [
      { clientId: guestList.clientId, id: store.lists[1]?.id, imported: false },
    ],
  });
});

test("list colors are saved on creation and retained during guest import", async () => {
  const store = controllerWithMemoryStore();
  await store.controller.createList(user, {
    title: "Ideas",
    colorKey: "lavender",
  });
  await store.controller.importLists(user, {
    lists: [{ ...guestList, colorKey: "sage" }],
  });
  assert.equal(store.lists[0]?.colorKey, "lavender");
  assert.equal(store.lists[1]?.colorKey, "sage");
});

test("list color updates accept palette values and reject unknown ones", async () => {
  let savedColor: unknown;
  const prisma = {
    todoList: {
      updateMany: async ({ data }: { data: { colorKey?: string } }) => {
        savedColor = data.colorKey;
        return { count: 1 };
      },
      findUnique: async () => ({
        id: guestList.clientId,
        colorKey: savedColor,
      }),
    },
  } as unknown as PrismaService;
  const controller = new ListsController(prisma);
  const listId = "00000000-0000-4000-8000-000000000002";
  await controller.updateList(user, listId, { colorKey: "coral" });
  assert.equal(savedColor, "coral");
  await assert.rejects(
    controller.updateList(user, listId, { colorKey: "unexpected" }),
    BadRequestException,
  );
  assert.equal(savedColor, "coral");
});

test("a clientId is scoped to its account", async () => {
  const store = controllerWithMemoryStore();
  const otherUser = {
    ...user,
    id: "00000000-0000-4000-8000-000000000002",
  };
  await store.controller.importLists(user, { lists: [guestList] });
  await store.controller.importLists(otherUser, { lists: [guestList] });
  assert.equal(store.lists.length, 2);
  assert.notEqual(store.lists[0]?.ownerId, store.lists[1]?.ownerId);
});

test("duplicate clientIds in one payload are rejected before any writes", async () => {
  const store = controllerWithMemoryStore();
  await assert.rejects(
    store.controller.importLists(user, { lists: [guestList, guestList] }),
    BadRequestException,
  );
  assert.equal(store.lists.length, 0);
});
