import type { Session } from "@supabase/supabase-js";
import { t } from "@/i18n";

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  session: Session,
  init: RequestInit = {},
): Promise<T> {
  if (!apiUrl) throw new Error("Set EXPO_PUBLIC_API_URL in .env first.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
        ...init.headers,
      },
    });
  } catch (cause) {
    if (controller.signal.aborted) throw new Error(t("serverTimeout"));
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.message;
    throw new ApiError(
      response.status,
      typeof message === "string"
        ? message
        : Array.isArray(message)
          ? message.join("\n")
          : `Request failed (${response.status}).`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type TodoItem = {
  id: string;
  title: string;
  comment: string | null;
  completed: boolean;
  position: number;
};

export type TodoList = {
  id: string;
  title: string;
  comment: string | null;
  items: TodoItem[];
};

export type Profile = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  locale: string;
};
