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
import { PrismaService } from "../prisma/prisma.service";

const listInput = z.object({
  title: z.string().trim().min(1).max(120),
  comment: z.string().max(2000).nullable().optional(),
});
const itemInput = z.object({
  title: z.string().trim().min(1).max(240),
  comment: z.string().max(2000).nullable().optional(),
});
const itemPatch = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  comment: z.string().max(2000).nullable().optional(),
  completed: z.boolean().optional(),
});
const idSchema = z.string().uuid();

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
  async createList(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parse(listInput, body);
    const count = await this.prisma.todoList.count({
      where: { ownerId: user.id },
    });
    return this.prisma.todoList.create({
      data: { ...input, ownerId: user.id, position: count },
    });
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
    const position = await this.prisma.todoItem.count({ where: { listId } });
    return this.prisma.todoItem.create({
      data: { ...input, listId, position },
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
