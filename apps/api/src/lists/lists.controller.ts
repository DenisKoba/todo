import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const listInput = z.object({
  title: z.string().trim().min(1).max(120),
  comment: z.string().max(2000).nullable().optional(),
  colorKey: z
    .enum(["neutral", "coral", "peach", "butter", "sage", "sky", "lavender"])
    .optional(),
});
const itemInput = z.object({
  title: z.string().trim().min(1).max(240),
  comment: z.string().max(2000).nullable().optional(),
});
const batchItemInput = z.object({
  items: z.array(itemInput).min(1).max(100),
});
const itemPatch = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  comment: z.string().max(2000).nullable().optional(),
  completed: z.boolean().optional(),
});
const idSchema = z.string().uuid();
const clientId = z.string().trim().min(1).max(128);
const importItemInput = itemInput.extend({
  clientId,
  completed: z.boolean(),
  position: z.number().int().min(0).max(2_147_483_647),
});
const importListInput = listInput.extend({
  clientId,
  position: z.number().int().min(0).max(2_147_483_647).optional(),
  items: z.array(importItemInput),
});
const importInput = z
  .object({ lists: z.array(importListInput).max(100) })
  .superRefine(({ lists }, context) => {
    if (lists.reduce((count, list) => count + list.items.length, 0) > 5000) {
      context.addIssue({
        code: "custom",
        message: "Import cannot contain more than 5000 tasks.",
        path: ["lists"],
      });
    }
    const listIds = new Set<string>();
    for (const [listIndex, list] of lists.entries()) {
      if (listIds.has(list.clientId)) {
        context.addIssue({
          code: "custom",
          message: "Each imported list must have a unique clientId.",
          path: ["lists", listIndex, "clientId"],
        });
      }
      listIds.add(list.clientId);
      const itemIds = new Set<string>();
      for (const [itemIndex, item] of list.items.entries()) {
        if (itemIds.has(item.clientId)) {
          context.addIssue({
            code: "custom",
            message: "Each task in a list must have a unique clientId.",
            path: ["lists", listIndex, "items", itemIndex, "clientId"],
          });
        }
        itemIds.add(item.clientId);
      }
    }
  });

type AuthUser = {
  id: string;
  claims: { user_metadata?: Record<string, unknown> };
};

@Controller()
@UseGuards(AuthGuard)
export class ListsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("lists")
  getLists(@CurrentUser() user: { id: string }) {
    return this.prisma.todoList.findMany({
      where: { ownerId: user.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      },
    });
  }

  @Post("lists")
  async createList(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parse(listInput, body);
    return this.prisma.$transaction(async (tx) => {
      await ensureProfile(tx, user);
      const tail = await tx.todoList.aggregate({
        where: { ownerId: user.id },
        _max: { position: true },
      });
      return tx.todoList.create({
        data: {
          ...input,
          ownerId: user.id,
          position: (tail._max.position ?? -1) + 1,
        },
      });
    });
  }

  @Post("lists/import")
  async importLists(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { lists } = parse(importInput, body);
    return this.prisma.$transaction(
      async (tx) => {
        await ensureProfile(tx, user);
        const tail = await tx.todoList.aggregate({
          where: { ownerId: user.id },
          _max: { position: true },
        });
        let nextPosition = (tail._max.position ?? -1) + 1;
        const results = new Map<
          string,
          { clientId: string; id: string; imported: boolean }
        >();
        const ordered = lists
          .map((list, index) => ({ list, index }))
          .sort(
            (left, right) =>
              (left.list.position ?? left.index) -
                (right.list.position ?? right.index) ||
              left.index - right.index,
          );

        for (const { list } of ordered) {
          const inserted = await tx.todoList.createMany({
            data: {
              ownerId: user.id,
              importKey: list.clientId,
              title: list.title,
              comment: list.comment,
              colorKey: list.colorKey ?? "neutral",
              position: nextPosition,
            },
            skipDuplicates: true,
          });
          const stored = await tx.todoList.findUniqueOrThrow({
            where: {
              ownerId_importKey: {
                ownerId: user.id,
                importKey: list.clientId,
              },
            },
            select: { id: true },
          });
          if (inserted.count) {
            if (list.items.length) {
              await tx.todoItem.createMany({
                data: list.items.map((item) => ({
                  listId: stored.id,
                  title: item.title,
                  comment: item.comment,
                  completed: item.completed,
                  position: item.position,
                })),
              });
            }
            nextPosition += 1;
          }
          results.set(list.clientId, {
            clientId: list.clientId,
            id: stored.id,
            imported: inserted.count === 1,
          });
        }

        return { lists: lists.map((list) => results.get(list.clientId)!) };
      },
      {
        maxWait: 10_000,
        timeout: 120_000,
      },
    );
  }

  @Patch("lists/:id")
  async updateList(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    assertId(id);
    const input = parse(listInput.partial(), body);
    const result = await this.prisma.todoList.updateMany({
      where: { id, ownerId: user.id },
      data: input,
    });
    if (!result.count) throw new NotFoundException("List not found.");
    return this.prisma.todoList.findUnique({
      where: { id },
      include: { items: { orderBy: { position: "asc" } } },
    });
  }

  @Delete("lists/:id")
  async deleteList(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
  ) {
    assertId(id);
    const result = await this.prisma.todoList.deleteMany({
      where: { id, ownerId: user.id },
    });
    if (!result.count) throw new NotFoundException("List not found.");
    return { ok: true };
  }

  @Post("lists/:id/items")
  async createItem(
    @CurrentUser() user: { id: string },
    @Param("id") listId: string,
    @Body() body: unknown,
  ) {
    assertId(listId);
    const input = parse(itemInput, body);
    const list = await this.prisma.todoList.findFirst({
      where: { id: listId, ownerId: user.id },
      select: { id: true },
    });
    if (!list) throw new NotFoundException("List not found.");
    const tail = await this.prisma.todoItem.aggregate({
      where: { listId },
      _max: { position: true },
    });
    return this.prisma.todoItem.create({
      data: { ...input, listId, position: (tail._max.position ?? -1) + 1 },
    });
  }

  @Post("lists/:id/items/batch")
  async createItemsBatch(
    @CurrentUser() user: { id: string },
    @Param("id") listId: string,
    @Body() body: unknown,
  ) {
    assertId(listId);
    const { items } = parse(batchItemInput, body);
    return this.prisma.$transaction(async (tx) => {
      const list = await tx.todoList.findFirst({
        where: { id: listId, ownerId: user.id },
        select: { id: true },
      });
      if (!list) throw new NotFoundException("List not found.");

      const tail = await tx.todoItem.aggregate({
        where: { listId },
        _max: { position: true },
      });
      const nextPosition = (tail._max.position ?? -1) + 1;
      const created = await tx.todoItem.createManyAndReturn({
        data: items.map((item, index) => ({
          ...item,
          listId,
          position: nextPosition + index,
        })),
      });
      return created.sort((left, right) => left.position - right.position);
    });
  }

  @Patch("items/:id")
  async updateItem(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    assertId(id);
    const input = parse(itemPatch, body);
    const result = await this.prisma.todoItem.updateMany({
      where: { id, list: { ownerId: user.id } },
      data: input,
    });
    if (!result.count) throw new NotFoundException("Task not found.");
    return this.prisma.todoItem.findUnique({ where: { id } });
  }

  @Delete("items/:id")
  async deleteItem(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
  ) {
    assertId(id);
    const result = await this.prisma.todoItem.deleteMany({
      where: { id, list: { ownerId: user.id } },
    });
    if (!result.count) throw new NotFoundException("Task not found.");
    return { ok: true };
  }
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

function assertId(value: string) {
  if (!idSchema.safeParse(value).success)
    throw new BadRequestException("ID must be a UUID.");
}

async function ensureProfile(tx: Prisma.TransactionClient, user: AuthUser) {
  const metadata = user.claims.user_metadata ?? {};
  const displayName =
    metadataText(metadata.display_name, 80) ??
    metadataText(metadata.full_name, 80) ??
    metadataText(metadata.name, 80);
  const avatarUrl =
    metadataText(metadata.avatar_url, 1000) ??
    metadataText(metadata.picture, 1000);
  await tx.profile.upsert({
    where: { id: user.id },
    create: { id: user.id, displayName, avatarUrl },
    update: {},
  });
}

function metadataText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}
