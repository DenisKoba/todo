import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  userId: string;
  userClaims: { user_metadata?: Record<string, unknown> };
};

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!token)
      throw new UnauthorizedException("A valid Supabase session is required.");
    if (!baseUrl || !apiKey)
      throw new ServiceUnavailableException("Supabase Auth is not configured.");

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/v1/user`, {
        headers: {
          apikey: apiKey,
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException("Supabase Auth is unavailable.");
    }

    if (response.status === 401 || response.status === 403)
      throw new UnauthorizedException(
        "The Supabase access token is invalid or expired.",
      );
    if (!response.ok)
      throw new ServiceUnavailableException("Supabase Auth is unavailable.");

    let user: unknown;
    try {
      user = await response.json();
    } catch {
      throw new ServiceUnavailableException(
        "Supabase Auth returned invalid data.",
      );
    }
    if (!isRecord(user) || typeof user.id !== "string" || !user.id)
      throw new ServiceUnavailableException(
        "Supabase Auth returned no user ID.",
      );

    request.userId = user.id;
    request.userClaims = {
      user_metadata: isRecord(user.user_metadata)
        ? user.user_metadata
        : undefined,
    };
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
