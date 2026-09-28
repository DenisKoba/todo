import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAuth } from "@/auth/auth-context";
import { exchangeCodeForSessionOnce } from "@/auth/exchange-code";
import { t } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/tokens";

export default function AuthCallback() {
  const { code, error, error_description } = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const router = useRouter();
  const { session } = useAuth();
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const exchange = useRef<{ code: string; promise: Promise<void> } | null>(null);

  useEffect(() => {
    if (!code || !supabase || error || error_description || session) return;

    // Keep the same exchange across effect re-runs: a PKCE code can be used only once.
    if (exchange.current?.code !== code) {
      exchange.current = {
        code,
        promise: exchangeCodeForSessionOnce(code),
      };
    }

    let active = true;
    exchange.current.promise.catch((cause: unknown) => {
      if (active) {
        setExchangeError(
          cause instanceof Error ? cause.message : t("emailConfirmError"),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [code, error, error_description, session]);

  if (session) return <Redirect href="/(app)" />;

  const message =
    error_description ||
    error ||
    exchangeError ||
    (!code ? t("confirmationCodeMissing") : null) ||
    (!supabase ? t("signInUnavailable") : null);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        backgroundColor: colors.background,
      }}
    >
      {message ? (
        <>
          <Text
            accessibilityRole="alert"
            style={{ color: colors.destructive, textAlign: "center", marginBottom: 16 }}
          >
            {message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(auth)")}
          >
            <Text style={{ color: colors.tint }}>{t("returnToSignIn")}</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={colors.tint} />
      )}
    </View>
  );
}
