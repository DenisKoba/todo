import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { PrismaService } from "../src/prisma/prisma.service";
import { ProfileController } from "../src/profile/profile.controller";

const currentUserId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";

@Module({
  controllers: [ProfileController],
  providers: [{ provide: PrismaService, useValue: {} }],
})
class ProfileTestModule {}

test("DELETE /v1/me deletes only the authenticated account", async (t) => {
  const previous = {
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    fetch: globalThis.fetch,
  };
  process.env.SUPABASE_URL = "https://project.supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

  const adminRequests: { url: string; key: string | null; body: unknown }[] =
    [];
  let adminResponse = () => Response.json({ id: currentUserId });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.endsWith("/auth/v1/user")) {
      return headers.get("authorization") === "Bearer valid-session"
        ? Response.json({ id: currentUserId })
        : Response.json({ msg: "Invalid token" }, { status: 401 });
    }
    if (url.includes("/auth/v1/admin/users/")) {
      adminRequests.push({
        url,
        key: headers.get("apikey"),
        body: JSON.parse(String(init?.body)),
      });
      return adminResponse();
    }
    throw new Error(`Unexpected Supabase request: ${url}`);
  };

  const app = await NestFactory.create<NestFastifyApplication>(
    ProfileTestModule,
    new FastifyAdapter(),
    { logger: false },
  );
  app.setGlobalPrefix("v1");
  await app.init();
  t.after(async () => {
    await app.close();
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [
      ["SUPABASE_URL", previous.url],
      ["SUPABASE_PUBLISHABLE_KEY", previous.publishableKey],
      ["SUPABASE_SECRET_KEY", previous.secretKey],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const unauthorized = await app.inject({ method: "DELETE", url: "/v1/me" });
  assert.equal(unauthorized.statusCode, 401);
  const invalidSession = await app.inject({
    method: "DELETE",
    url: "/v1/me",
    headers: { authorization: "Bearer invalid-session" },
  });
  assert.equal(invalidSession.statusCode, 401);
  assert.equal(adminRequests.length, 0);

  const deleted = await app.inject({
    method: "DELETE",
    url: "/v1/me",
    headers: { authorization: "Bearer valid-session" },
    payload: { id: otherUserId },
  });
  assert.equal(deleted.statusCode, 204);
  assert.equal(deleted.body, "");
  assert.deepEqual(adminRequests, [
    {
      url: `https://project.supabase.test/auth/v1/admin/users/${currentUserId}`,
      key: "sb_secret_test",
      body: { should_soft_delete: false },
    },
  ]);

  delete process.env.SUPABASE_SECRET_KEY;
  const unconfigured = await app.inject({
    method: "DELETE",
    url: "/v1/me",
    headers: { authorization: "Bearer valid-session" },
  });
  assert.equal(unconfigured.statusCode, 503);
  assert.equal(adminRequests.length, 1);
  process.env.SUPABASE_SECRET_KEY = "sb_publishable_test";
  const wrongKey = await app.inject({
    method: "DELETE",
    url: "/v1/me",
    headers: { authorization: "Bearer valid-session" },
  });
  assert.equal(wrongKey.statusCode, 503);
  assert.equal(adminRequests.length, 1);
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

  adminResponse = () => Response.json({ msg: "Unavailable" }, { status: 500 });
  const failed = await app.inject({
    method: "DELETE",
    url: "/v1/me",
    headers: { authorization: "Bearer valid-session" },
  });
  assert.equal(failed.statusCode, 503);
  assert.doesNotMatch(failed.body, /sb_secret_test/);

  adminResponse = () =>
    Response.json({ msg: "Unknown route" }, { status: 404 });
  const unexpectedNotFound = await app.inject({
    method: "DELETE",
    url: "/v1/me",
    headers: { authorization: "Bearer valid-session" },
  });
  assert.equal(unexpectedNotFound.statusCode, 503);

  adminResponse = () =>
    Response.json(
      { error_code: "user_not_found", msg: "User not found" },
      { status: 404 },
    );
  const alreadyDeleted = await app.inject({
    method: "DELETE",
    url: "/v1/me",
    headers: { authorization: "Bearer valid-session" },
  });
  assert.equal(alreadyDeleted.statusCode, 204);
});
