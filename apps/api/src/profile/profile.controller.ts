import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
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

  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() user: { id: string }): Promise<void> {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (
      !url ||
      !secretKey ||
      secretKey === process.env.SUPABASE_PUBLISHABLE_KEY
    )
      throw new ServiceUnavailableException("Account deletion is unavailable.");

    try {
      const admin = createClient(url, secretKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          fetch: (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
        },
      });
      const { error } = await admin.auth.admin.deleteUser(user.id);
      // A concurrent request may have completed the deletion already.
      if (!error || (error.status === 404 && error.code === "user_not_found"))
        return;
    } catch {
      // Do not expose Supabase errors or server credentials to the client.
    }
    throw new ServiceUnavailableException(
      "Account deletion could not be completed.",
    );
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
