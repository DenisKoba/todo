import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";
import { removePersistedSupabaseSession, supabase } from "@/lib/supabase";
import { exchangeCodeForSessionOnce } from "@/auth/exchange-code";

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  clearDeletedSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const appleSignInInProgress = useRef(false);
  const pendingAppleSession = useRef<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let authEventSeen = false;
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventSeen = true;
      if (appleSignInInProgress.current && nextSession) {
        // Wait for first-time Apple name metadata before opening account data.
        pendingAppleSession.current = nextSession;
      } else {
        setSession(nextSession);
      }
      setLoading(false);
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    void supabase.auth
      .getSession()
      .then(({ data: sessionData }) => {
        if (!authEventSeen) setSession(sessionData.session);
      })
      .catch(() => {
        if (!authEventSeen) setSession(null);
      })
      .finally(() => setLoading(false));
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured yet.");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      if (!supabase) throw new Error("Supabase is not configured yet.");
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name.trim() },
          emailRedirectTo: Linking.createURL("auth/callback"),
        },
      });
      if (error) throw error;
      return Boolean(data.session);
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error("Supabase is not configured yet.");
    const redirectTo = Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data.url)
      throw new Error("Supabase did not return an authorization URL.");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") {
      if (result.type === "cancel") return;
      throw new Error("Google sign-in was not completed.");
    }
    const callbackUrl = new URL(result.url);
    const code = callbackUrl.searchParams.get("code");
    if (!code)
      throw new Error(
        "The sign-in callback did not contain an authorization code.",
      );
    await exchangeCodeForSessionOnce(code);
    router.replace("/(app)");
  }, []);

  const signInWithApple = useCallback(async () => {
    if (!supabase) throw new Error("Supabase is not configured yet.");
    if (
      Platform.OS !== "ios" ||
      !(await AppleAuthentication.isAvailableAsync())
    ) {
      throw new Error("Sign in with Apple is not available on this device.");
    }

    const rawNonce = Array.from(await Crypto.getRandomBytesAsync(32), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (cause) {
      if (
        cause &&
        typeof cause === "object" &&
        "code" in cause &&
        cause.code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }
      throw cause;
    }

    if (!credential.identityToken) {
      throw new Error("Apple did not return an identity token.");
    }
    appleSignInInProgress.current = true;
    let authenticatedSession: Session | null = null;
    try {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) throw error;
      if (!data.session)
        throw new Error("Apple sign-in did not create a session.");
      authenticatedSession = data.session;

      // Apple supplies the name only on first consent. A profile update failure
      // must not turn an already-successful sign-in into an apparent failure.
      try {
        const fullName = credential.fullName
          ? AppleAuthentication.formatFullName(credential.fullName).trim()
          : "";
        const metadata = data.user?.user_metadata;
        if (fullName && !metadata?.display_name && !metadata?.full_name) {
          const { error: profileError } = await supabase.auth.updateUser({
            data: { display_name: fullName, full_name: fullName },
          });
          if (profileError) throw profileError;
        }
      } catch {
        // The user is signed in and can edit their profile later.
      }
    } finally {
      appleSignInInProgress.current = false;
      const sessionToPublish =
        pendingAppleSession.current ?? authenticatedSession;
      if (sessionToPublish) setSession(sessionToPublish);
      pendingAppleSession.current = null;
    }

    router.replace("/(app)");
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    queryClient.clear();
    setSession(null);
  }, [queryClient]);

  const clearDeletedSession = useCallback(async () => {
    try {
      if (supabase) await supabase.auth.signOut({ scope: "local" });
    } finally {
      // The server account is already gone; never keep its data on screen.
      try {
        await removePersistedSupabaseSession();
      } finally {
        queryClient.clear();
        setSession(null);
      }
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      signOut,
      clearDeletedSession,
    }),
    [
      session,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      signOut,
      clearDeletedSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
