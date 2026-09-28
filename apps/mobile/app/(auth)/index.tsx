import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/auth/auth-context";
import { isSupabaseConfigured } from "@/lib/supabase";
import { colors } from "@/theme/tokens";
import { t } from "@/i18n";

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, signInWithApple } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let active = true;
    void AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setAppleAvailable(available);
      })
      .catch(() => {
        if (active) setAppleAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      if (mode === "sign-in") {
        await signIn(email.trim(), password);
        router.replace("/(app)");
      } else {
        const hasSession = await signUp(email.trim(), password, name);
        if (hasSession) router.replace("/(app)");
        else setNotice(t("checkEmail"));
      }
    });

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandMark}>
            <Text style={styles.brandCheck}>✓</Text>
          </View>
          <Text style={styles.brand}>{t("appName")}</Text>
          <Text style={styles.tagline}>{t("tagline")}</Text>

          <View style={styles.card}>
            <Text style={styles.heading}>
              {mode === "sign-in" ? t("welcome") : t("createAccount")}
            </Text>
            {mode === "sign-up" && (
              <Field
                label={t("fullName")}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            )}
            <Field
              label={t("email")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label={t("password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy || !isSupabaseConfigured}
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                (!isSupabaseConfigured || busy) && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryText}>
                  {mode === "sign-in" ? t("signIn") : t("signUp")}
                </Text>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.or}>{t("or")}</Text>
              <View style={styles.line} />
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={busy || !isSupabaseConfigured}
              onPress={() => run(signInWithGoogle)}
              style={({ pressed }) => [
                styles.googleButton,
                pressed && styles.pressed,
                (!isSupabaseConfigured || busy) && styles.disabled,
              ]}
            >
              <Text style={styles.googleG}>G</Text>
              <Text style={styles.googleText}>{t("google")}</Text>
            </Pressable>

            {appleAvailable && (
              <View
                pointerEvents={busy || !isSupabaseConfigured ? "none" : "auto"}
                style={[
                  styles.appleButtonContainer,
                  (busy || !isSupabaseConfigured) && styles.disabled,
                ]}
              >
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={18}
                  style={styles.appleButton}
                  onPress={() => void run(signInWithApple)}
                />
              </View>
            )}

            {!isSupabaseConfigured && (
              <Text style={styles.setup}>{t("configuration")}</Text>
            )}
            <Pressable
              onPress={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError("");
                setNotice("");
              }}
            >
              <Text style={styles.switchText}>
                {mode === "sign-in" ? t("switchToSignUp") : t("switchToSignIn")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/(app)")}
              style={styles.guestButton}
            >
              <Text style={styles.guestText}>{t("continueAsGuest")}</Text>
            </Pressable>
          </View>

          <Text style={styles.footnote}>{t("footnote")}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "email-address";
  autoCapitalize?: "none" | "words";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secureTextEntry}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize ?? "none"}
        autoCorrect={false}
        placeholder={props.label}
        placeholderTextColor={colors.secondaryText}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: "#F7F7F7" },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 32,
  },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DFDFDF",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  brandCheck: {
    color: "#111111",
    fontSize: 28,
    fontWeight: "600",
    marginTop: -2,
  },
  brand: {
    color: "#090909",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1.6,
  },
  tagline: {
    color: "#777777",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 36,
  },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#E3E3E3",
    shadowColor: "#000000",
    shadowOpacity: 0.025,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  heading: {
    color: "#101010",
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -0.6,
    marginBottom: 26,
  },
  field: { marginBottom: 18 },
  label: {
    color: "#303030",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 9,
    marginLeft: 4,
  },
  input: {
    minHeight: 56,
    borderRadius: 17,
    borderColor: "#E3E3E3",
    borderWidth: 1,
    backgroundColor: "#FBFBFB",
    paddingHorizontal: 17,
    color: "#111111",
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#151515",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  googleButton: {
    minHeight: 56,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E1E1E1",
    backgroundColor: "#FFFFFF",
  },
  googleG: { color: "#111111", fontSize: 19, fontWeight: "800" },
  googleText: { color: "#111111", fontSize: 15, fontWeight: "600" },
  appleButtonContainer: { marginTop: 12 },
  appleButton: { width: "100%", height: 56 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 21,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#E7E7E7",
  },
  or: { color: "#8A8A8A", fontSize: 13 },
  notice: { color: colors.success, fontSize: 14, marginBottom: 14 },
  error: { color: colors.destructive, fontSize: 14, marginBottom: 12 },
  setup: {
    color: "#777777",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 16,
  },
  switchText: {
    color: "#171717",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 24,
  },
  guestButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 8,
  },
  guestText: { color: "#777777", fontSize: 15, fontWeight: "600" },
  footnote: {
    color: "#929292",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: "auto",
    paddingTop: 28,
    paddingHorizontal: 16,
  },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
});
