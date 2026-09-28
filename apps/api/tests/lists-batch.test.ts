import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ListsController } from "../src/lists/lists.controller";
import type { PrismaService } from "../src/prisma/prisma.service";

const listId = "00000000-0000-4000-8000-000000000010";
const owner = { id: "00000000-0000-4000-8000-000000000001" };
const otherOwner = { id: "00000000-0000-4000-8000-000000000002" };

type ItemData = {
  listId: string;
  title: string;
  comment?: string | null;
  position: number;
};

function controllerWithMemoryStore(positions: number[] = []) {
  const items: ItemData[] = positions.map((position) => ({
    listId,
    title: `Existing ${position}`,
    position,
  }));
  let transactionCount = 0;
  const todoList = {
    findFirst: async ({ where }: { where: { id: string; ownerId: string } }) =>
      where.id === listId && where.ownerId === owner.id ? { id: listId } : null,
  };
  const todoItem = {
    aggregate: async ({ where }: { where: { listId: string } }) => ({
      _max: {
        position: items
          .filter((item) => item.listId === where.listId)
          .reduce<number | null>(
            (highest, item) => Math.max(highest ?? -1, item.position),
            null,
          ),
      },
    }),
    createManyAndReturn: async ({ data }: { data: ItemData[] }) => {
      items.push(...data);
      // The database does not promise the order of returned rows.
      return [...data].reverse();
    },
    create: async ({ data }: { data: ItemData }) => {
      items.push(data);
      return data;
    },
  };
  const tx = { todoList, todoItem };
  const prisma = {
    todoList,
    todoItem,
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => {
      transactionCount += 1;
      return callback(tx);
    },
  } as unknown as PrismaService;
  return {
    controller: new ListsController(prisma),
    items,
    get transactionCount() {
      return transactionCount;
    },
  };
}

test("batch append uses the highest position and returns input order", async () => {
  const store = controllerWithMemoryStore([2, 7]);
  const created = await store.controller.createItemsBatch(owner, listId, {
    items: [{ title: "  Milk  ", comment: "Oat" }, { title: "Bread" }],
  });

  assert.deepEqual(
    created.map(({ title, position }) => ({ title, position })),
    [
      { title: "Milk", position: 8 },
      { title: "Bread", position: 9 },
    ],
  );
  assert.equal(store.transactionCount, 1);
  assert.equal(store.items.length, 4);

  const single = await store.controller.createItem(owner, listId, {
    title: "Eggs",
  });
  assert.equal(single.position, 10);
});

test("batch validation rejects empty, oversized, and invalid items before writes", async () => {
  const store = controllerWithMemoryStore();
  const invalidBodies = [
    { items: [] },
    { items: Array.from({ length: 101 }, () => ({ title: "Task" })) },
    { items: [{ title: "   " }] },
    { items: [{ title: "x".repeat(241) }] },
    { items: [{ title: "Task", comment: "x".repeat(2001) }] },
  ];
  for (const body of invalidBodies) {
    await assert.rejects(
      store.controller.createItemsBatch(owner, listId, body),
      BadRequestException,
    );
  }
  assert.equal(store.transactionCount, 0);
  assert.equal(store.items.length, 0);
});

test("batch creation checks the list UUID and owner", async () => {
  const store = controllerWithMemoryStore();
  const body = { items: [{ title: "Task" }] };
  await assert.rejects(
    store.controller.createItemsBatch(owner, "not-a-uuid", body),
    BadRequestException,
  );
  await assert.rejects(
    store.controller.createItemsBatch(otherOwner, listId, body),
    NotFoundException,
  );
  assert.equal(store.items.length, 0);
});
