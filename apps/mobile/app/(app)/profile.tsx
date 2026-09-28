import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type Profile } from "@/api/client";
import { useAuth } from "@/auth/auth-context";
import { NativeIcon } from "@/components/native-icon";
import { pauseGuestImportsForAccountDeletion } from "@/data/todo-repository";
import { deleteImportedGuestLists } from "@/local/guest-store";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/tokens";
import { t } from "@/i18n";

const palette = {
  background: "#F7F7F7",
  white: "#FFFFFF",
  black: "#111111",
  muted: "#929292",
  border: "#E5E5E5",
} as const;

export default function ProfileScreen() {
  const { user, session, signOut, clearDeletedSession } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(session),
    queryFn: () => api<Profile>("/me", session!),
  });
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  useEffect(() => {
    if (profileQuery.data) {
      setName(profileQuery.data.displayName ?? "");
      setAvatarUrl(profileQuery.data.avatarUrl ?? "");
    }
  }, [profileQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      api<Profile>("/me", session!, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: name.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
        }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] }),
  });

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/(app)");
    } catch (cause) {
      Alert.alert(
        t("error"),
        cause instanceof Error ? cause.message : t("error"),
      );
    } finally {
      setSigningOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!session || deletingAccount) return;
    const accountId = session.user.id;
    const usedApple =
      session.user.app_metadata.provider === "apple" ||
      session.user.app_metadata.providers?.includes("apple");
    let resumeGuestImports: (() => void) | undefined;
    let deletionError: unknown;
    let serverDeleted = false;
    setDeletingAccount(true);
    try {
      // Imports are server writes. Drain them before deleting the server user.
      resumeGuestImports = await pauseGuestImportsForAccountDeletion(accountId);
      await api<void>("/me", session, { method: "DELETE" });
      serverDeleted = true;
    } catch (cause) {
      deletionError = cause;
      // The API may have deleted the user even if its response was lost.
      // Only an explicit user_not_found response is proof of that outcome.
      try {
        const { error } =
          (await supabase?.auth.getUser(session.access_token)) ?? {};
        serverDeleted = error?.code === "user_not_found";
      } catch {
        // An offline or unknown result is not proof of deletion.
      }
    }
    if (!serverDeleted) {
      Alert.alert(
        t("deleteAccountFailed"),
        deletionError instanceof Error ? deletionError.message : t("error"),
      );
      resumeGuestImports?.();
      setDeletingAccount(false);
      return;
    }

    // A confirmed server deletion must always close the now-invalid session.
    let localCleanupFailed = false;
    try {
      await deleteImportedGuestLists(accountId);
    } catch {
      localCleanupFailed = true;
    }
    try {
      await clearDeletedSession();
    } catch {
      localCleanupFailed = true;
    } finally {
      resumeGuestImports?.();
      setDeletingAccount(false);
      router.replace("/(app)");
    }

    Alert.alert(
      t("accountDeleted"),
      [
        localCleanupFailed ? t("accountDeletedLocalWarning") : null,
        usedApple ? t("appleRevokeHint") : null,
      ]
        .filter(Boolean)
        .join("\n\n") || undefined,
    );
  };

  if (!session) {
    return (
      <SafeAreaView
        style={styles.safe}
        edges={["top", "bottom", "left", "right"]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("back")}
            onPress={() => router.back()}
            style={styles.back}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>{t("profile")}</Text>
        <View style={styles.guestBody}>
          <View style={styles.avatar}>
            <NativeIcon name="person" size={42} color={palette.black} />
          </View>
          <Text style={styles.guestMessage}>{t("guestProfile")}</Text>
          <Text style={styles.guestDescription}>{t("saveYourLists")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("signIn")}
            onPress={() => router.push("/(auth)")}
            style={styles.guestSignIn}
          >
            <Text style={styles.guestSignInText}>{t("signIn")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "bottom", "left", "right"]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>{t("profile")}</Text>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.avatar}>
          {profileQuery.data?.avatarUrl ? (
            <Image
              source={{ uri: profileQuery.data.avatarUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <NativeIcon name="person" size={42} color={palette.black} />
          )}
        </View>
        <Text style={styles.displayName}>
          {profileQuery.data?.displayName || name || user?.email}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
        {profileQuery.isLoading ? (
          <ActivityIndicator color={palette.black} />
        ) : null}
        {profileQuery.isError ? (
          <Text style={styles.error}>{profileQuery.error.message}</Text>
        ) : null}
        <View style={styles.card}>
          <Text style={styles.label}>{t("fullName")}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("fullName")}
            placeholderTextColor={colors.secondaryText}
            style={styles.input}
          />
          <Text style={styles.label}>{t("photoUrl")}</Text>
          <TextInput
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
            placeholderTextColor={colors.secondaryText}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("save")}
            disabled={save.isPending || deletingAccount}
            onPress={() => save.mutate()}
            style={styles.save}
          >
            {save.isPending ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Text style={styles.saveText}>{t("save")}</Text>
            )}
          </Pressable>
          {save.isError && (
            <Text style={styles.error}>{save.error.message}</Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("signOut")}
          disabled={signingOut || deletingAccount}
          onPress={() =>
            Alert.alert(t("signOut"), t("signOutConfirm"), [
              { text: t("cancel"), style: "cancel" },
              {
                text: t("signOut"),
                style: "destructive",
                onPress: () => void handleSignOut(),
              },
            ])
          }
          style={styles.signOut}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.destructive} />
          ) : (
            <Text style={styles.signOutText}>{t("signOut")}</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("deleteAccount")}
          disabled={signingOut || deletingAccount || save.isPending}
          onPress={() =>
            Alert.alert(t("deleteAccount"), t("deleteAccountConfirm"), [
              { text: t("cancel"), style: "cancel" },
              {
                text: t("deleteAccount"),
                style: "destructive",
                onPress: () => void handleDeleteAccount(),
              },
            ])
          }
          style={styles.deleteAccount}
        >
          {deletingAccount ? (
            <ActivityIndicator color={colors.destructive} />
          ) : (
            <Text style={styles.deleteAccountText}>{t("deleteAccount")}</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  guestBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 120,
  },
  guestMessage: {
    color: palette.black,
    fontSize: 21,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  guestDescription: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  guestSignIn: {
    minHeight: 52,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: palette.black,
  },
  guestSignInText: { color: palette.white, fontSize: 16, fontWeight: "700" },
  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  back: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: "#DCDCDC",
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  backText: {
    color: palette.black,
    fontSize: 35,
    lineHeight: 39,
    marginTop: -3,
  },
  title: {
    color: palette.black,
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1.3,
    marginTop: 4,
    marginBottom: 14,
    marginHorizontal: 20,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    alignItems: "stretch",
  },
  avatar: {
    alignSelf: "center",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  displayName: {
    color: palette.black,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 6,
  },
  email: {
    color: palette.muted,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 30,
  },
  card: {
    backgroundColor: palette.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
  },
  label: {
    color: palette.black,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 9,
    marginLeft: 4,
  },
  input: {
    minHeight: 56,
    backgroundColor: "#FBFBFB",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.black,
    paddingHorizontal: 17,
    fontSize: 16,
    marginBottom: 18,
  },
  save: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.black,
    marginTop: 2,
  },
  saveText: { color: palette.white, fontSize: 16, fontWeight: "700" },
  error: { color: colors.destructive, fontSize: 14, marginTop: 10 },
  signOut: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    marginTop: "auto",
    marginBottom: 2,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
  },
  signOutText: { color: palette.black, fontSize: 16, fontWeight: "600" },
  deleteAccount: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    marginTop: 12,
    marginBottom: 2,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
  },
  deleteAccountText: {
    color: colors.destructive,
    fontSize: 16,
    fontWeight: "600",
  },
});
