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
import { colors, radius, spacing } from "@/theme/tokens";
import { t } from "@/i18n";

export default function ProfileScreen() {
  const { user, session, signOut } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(session),
    queryFn: () => api<Profile>("/me", session!),
  });
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{t("profile")}</Text>
        <View style={styles.spacer} />
      </View>
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
            <NativeIcon name="person" size={38} />
          )}
        </View>
        <Text style={styles.displayName}>
          {profileQuery.data?.displayName || name || user?.email}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
        {profileQuery.isLoading ? (
          <ActivityIndicator color={colors.tint} />
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
            disabled={save.isPending}
            onPress={() => save.mutate()}
            style={styles.save}
          >
            <Text style={styles.saveText}>{t("save")}</Text>
          </Pressable>
          {save.isError && (
            <Text style={styles.error}>{save.error.message}</Text>
          )}
        </View>
        <Pressable
          onPress={() =>
            Alert.alert(t("signOut"), t("signOutConfirm"), [
              { text: t("cancel"), style: "cancel" },
              {
                text: t("signOut"),
                style: "destructive",
                onPress: () => void signOut(),
              },
            ])
          }
          style={styles.signOut}
        >
          <Text style={styles.signOutText}>{t("signOut")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  backText: { color: colors.text, fontSize: 33, lineHeight: 37, marginTop: -3 },
  title: {
    flex: 1,
    textAlign: "center",
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  spacer: { width: 40 },
  body: { padding: spacing.lg, alignItems: "stretch" },
  avatar: {
    alignSelf: "center",
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.tintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 16,
  },
  avatarImage: { width: 84, height: 84, borderRadius: 42 },
  displayName: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  email: {
    color: colors.secondaryText,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  label: {
    color: colors.secondaryText,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 7,
    marginLeft: 2,
  },
  input: {
    minHeight: 48,
    backgroundColor: colors.field,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: 13,
    fontSize: 15,
    marginBottom: 17,
  },
  save: {
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.tint,
  },
  saveText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  error: { color: colors.destructive, fontSize: 14, marginTop: 10 },
  signOut: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: 20,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
  },
  signOutText: { color: colors.destructive, fontSize: 15, fontWeight: "700" },
});
