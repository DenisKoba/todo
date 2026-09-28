import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// Match supabase-js's default project-scoped auth storage key.
const authStorageKey = url
  ? `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
  : null;

/** Also remove the persisted token if the SDK cannot finish local sign-out. */
export async function removePersistedSupabaseSession(): Promise<void> {
  if (!authStorageKey) return;
  await secureStorage.removeItem(authStorageKey);
  await secureStorage.removeItem(`${authStorageKey}-user`);
}

export const isSupabaseConfigured = Boolean(url && publishableKey);
export const supabase =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          storage: secureStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      })
    : null;
