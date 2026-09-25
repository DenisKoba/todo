import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

const profilePatch = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  avatarUrl: z.string().url().max(1000).nullable().optional(),
  locale: z.string().trim().min(2).max(20).optional(),
});

@Controller()
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  async getProfile(
    @CurrentUser()
    user: {
      id: string;
      claims: { user_metadata?: Record<string, unknown> };
    },
  ) {
    const metadata = user.claims.user_metadata ?? {};
    const displayName =
      stringValue(metadata.display_name) ??
      stringValue(metadata.full_name) ??
      stringValue(metadata.name);
    const avatarUrl =
      stringValue(metadata.avatar_url) ?? stringValue(metadata.picture);
    return this.prisma.profile.upsert({
      where: { id: user.id },
      create: { id: user.id, displayName, avatarUrl },
      update: {},
    });
  }

  @Patch("me")
  async updateProfile(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const result = profilePatch.safeParse(body);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    const current = await this.prisma.profile.findUnique({
      where: { id: user.id },
    });
    if (!current)
      throw new BadRequestException(
        "Profile is not initialized; request GET /me first.",
      );
    return this.prisma.profile.update({
      where: { id: user.id },
      data: result.data,
    });
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
