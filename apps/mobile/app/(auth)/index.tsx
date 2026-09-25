import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
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
import { gradients, colors, radius, spacing } from "@/theme/tokens";
import { t } from "@/i18n";

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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
      if (mode === "sign-in") await signIn(email.trim(), password);
      else {
        const hasSession = await signUp(email.trim(), password, name);
        if (!hasSession) setNotice(t("checkEmail"));
      }
    });

  return (
    <LinearGradient colors={[...gradients.auth]} style={styles.gradient}>
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
          </View>

          <Text style={styles.footnote}>{t("footnote")}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
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
  gradient: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 56,
  },
  brandMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.tint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    shadowColor: colors.tint,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  brandCheck: {
    color: colors.white,
    fontSize: 29,
    fontWeight: "700",
    marginTop: -2,
  },
  brand: {
    color: colors.text,
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -1.2,
  },
  tagline: {
    color: colors.secondaryText,
    fontSize: 16,
    marginTop: 5,
    marginBottom: 30,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    shadowColor: "#262A38",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  heading: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  field: { marginBottom: spacing.md },
  label: {
    color: colors.secondaryText,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 7,
    marginLeft: 2,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderColor: colors.separator,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.field,
    paddingHorizontal: 15,
    color: colors.text,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.tint,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  googleButton: {
    minHeight: 52,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
    marginTop: 4,
  },
  googleG: { color: "#4285F4", fontSize: 19, fontWeight: "800" },
  googleText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 19,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  or: { color: colors.secondaryText, fontSize: 13 },
  notice: { color: colors.success, fontSize: 14, marginBottom: 12 },
  error: { color: colors.destructive, fontSize: 14, marginBottom: 12 },
  setup: {
    color: colors.secondaryText,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 14,
  },
  switchText: {
    color: colors.tint,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 20,
  },
  footnote: {
    color: colors.secondaryText,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 16,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
