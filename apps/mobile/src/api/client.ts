import type { Session } from "@supabase/supabase-js";

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

export async function api<T>(
  path: string,
  session: Session,
  init: RequestInit = {},
): Promise<T> {
  if (!apiUrl) throw new Error("Set EXPO_PUBLIC_API_URL in .env first.");
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? `Request failed (${response.status}).`);
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
