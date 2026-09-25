import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  userId: string;
  userClaims: JWTPayload & { user_metadata?: Record<string, unknown> };
};

let jwksUrl = "";
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    if (!token || !baseUrl)
      throw new UnauthorizedException("A valid Supabase session is required.");

    try {
      const nextJwksUrl = `${baseUrl}/auth/v1/.well-known/jwks.json`;
      if (!jwks || jwksUrl !== nextJwksUrl) {
        jwksUrl = nextJwksUrl;
        jwks = createRemoteJWKSet(new URL(nextJwksUrl));
      }
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `${baseUrl}/auth/v1`,
        audience: "authenticated",
      });
      if (typeof payload.sub !== "string")
        throw new Error("Missing user subject");
      request.userId = payload.sub;
      request.userClaims = payload as AuthenticatedRequest["userClaims"];
      return true;
    } catch {
      throw new UnauthorizedException(
        "The Supabase access token is invalid or expired.",
      );
    }
  }
}
