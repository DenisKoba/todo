import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type Profile, type TodoItem, type TodoList } from "@/api/client";
import { NativeIcon } from "@/components/native-icon";
import { useAuth } from "@/auth/auth-context";
import { t } from "@/i18n";
import { colors, radius, spacing } from "@/theme/tokens";
import { TaskRow } from "@/components/task-row";

export default function ListsScreen() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [listTitle, setListTitle] = useState("");
  const [listComment, setListComment] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskComment, setTaskComment] = useState("");

  const listsQuery = useQuery({
    queryKey: ["lists", user?.id],
    enabled: Boolean(session),
    queryFn: () => api<TodoList[]>("/lists", session!),
  });
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(session),
    queryFn: () => api<Profile>("/me", session!),
  });
  const lists = listsQuery.data ?? [];

  useEffect(() => {
    if (!selectedListId && lists.length) setSelectedListId(lists[0].id);
    if (
      selectedListId &&
      lists.length &&
      !lists.some((list) => list.id === selectedListId)
    ) {
      setSelectedListId(lists[0].id);
    }
  }, [lists, selectedListId]);

  const activeList = useMemo(
    () => lists.find((list) => list.id === selectedListId),
    [lists, selectedListId],
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["lists", user?.id] });

  const createList = useMutation({
    mutationFn: () =>
      api<TodoList>("/lists", session!, {
        method: "POST",
        body: JSON.stringify({
          title: listTitle.trim(),
          comment: listComment.trim() || null,
        }),
      }),
    onSuccess: (list) => {
      setListTitle("");
      setListComment("");
      setSelectedListId(list.id);
      void refresh();
    },
  });
  const createTask = useMutation({
    mutationFn: () =>
      api<TodoItem>(`/lists/${activeList!.id}/items`, session!, {
        method: "POST",
        body: JSON.stringify({
          title: taskTitle.trim(),
          comment: taskComment.trim() || null,
        }),
      }),
    onSuccess: () => {
      setTaskTitle("");
      setTaskComment("");
      void refresh();
    },
  });
  const setCompleted = useMutation({
    mutationFn: ({ item, completed }: { item: TodoItem; completed: boolean }) =>
      api(`/items/${item.id}`, session!, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),
    onSuccess: refresh,
  });
  const deleteTask = async (item: TodoItem) => {
    Alert.alert(t("delete"), t("deleteTask"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () =>
          void api(`/items/${item.id}`, session!, { method: "DELETE" }).then(
            refresh,
          ),
      },
    ]);
  };
  const deleteList = (list: TodoList) => {
    Alert.alert(t("delete"), t("deleteList"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () =>
          void api(`/lists/${list.id}`, session!, { method: "DELETE" }).then(
            refresh,
          ),
      },
    ]);
  };
  const bulkDelete = () => {
    Alert.alert(
      t("delete"),
      `${t("deleteSelected")} (${selectedTasks.length})?`,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: () => {
            void Promise.all(
              selectedTasks.map((id) =>
                api(`/items/${id}`, session!, { method: "DELETE" }),
              ),
            ).then(() => {
              setSelectedTasks([]);
              void refresh();
            });
          },
        },
      ],
    );
  };
  const toggleSelection = (itemId: string) =>
    setSelectedTasks((previous) =>
      previous.includes(itemId)
        ? previous.filter((id) => id !== itemId)
        : [...previous, itemId],
    );
  const shareList = async () => {
    if (!activeList) return;
    const text = [
      activeList.title,
      activeList.comment,
      ...activeList.items.map(
        (item) =>
          `${item.completed ? "✓" : "○"} ${item.title}${item.comment ? ` — ${item.comment}` : ""}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");
    await Share.share({ title: activeList.title, message: text });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            {profileQuery.data?.displayName
              ? `${t("hello")}, ${profileQuery.data.displayName}`
              : t("yourSpace")}
          </Text>
          <Text style={styles.title}>{t("myLists")}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("profile")}
          onPress={() => router.push("/(app)/profile")}
          style={styles.profileButton}
        >
          <NativeIcon name="person" size={25} />
        </Pressable>
      </View>

      {lists.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listStrip}
        >
          {lists.map((list) => (
            <Pressable
              key={list.id}
              onPress={() => {
                setSelectedListId(list.id);
                setSelectedTasks([]);
              }}
              onLongPress={() => deleteList(list)}
              style={[
                styles.listPill,
                list.id === selectedListId && styles.listPillActive,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.listPillText,
                  list.id === selectedListId && styles.listPillTextActive,
                ]}
              >
                {list.title}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("addList")}
            onPress={() => {
              setListTitle("");
              setListComment("");
            }}
            style={styles.addPill}
          >
            <NativeIcon name="add" size={20} />
          </Pressable>
        </ScrollView>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {listsQuery.isLoading && (
          <Text style={styles.muted}>{t("loading")}</Text>
        )}
        {listsQuery.isError && (
          <Text style={styles.error}>{listsQuery.error.message}</Text>
        )}

        {activeList ? (
          <>
            <View style={styles.listTitleRow}>
              <View style={styles.flex}>
                <Text style={styles.listTitle}>{activeList.title}</Text>
                {activeList.comment ? (
                  <Text style={styles.listNote}>{activeList.comment}</Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("share")}
                onPress={() => void shareList()}
                style={styles.iconButton}
              >
                <NativeIcon name="share" />
              </Pressable>
            </View>
            {activeList.items.length === 0 ? (
              <Text style={styles.empty}>{t("noTasks")}</Text>
            ) : (
              <View style={styles.taskCard}>
                {activeList.items.map((item, index) => (
                  <View
                    key={item.id}
                    style={index > 0 ? styles.taskBorder : undefined}
                  >
                    <TaskRow
                      item={item}
                      selected={selectedTasks.includes(item.id)}
                      selectionMode={selectedTasks.length > 0}
                      onToggleComplete={() =>
                        setCompleted.mutate({
                          item,
                          completed: !item.completed,
                        })
                      }
                      onToggleSelection={() => toggleSelection(item.id)}
                      onDelete={() => void deleteTask(item)}
                    />
                  </View>
                ))}
              </View>
            )}
            <View style={styles.formCard}>
              <Text style={styles.formHeading}>{t("addTask")}</Text>
              <TextInput
                value={taskTitle}
                onChangeText={setTaskTitle}
                placeholder={t("taskTitle")}
                placeholderTextColor={colors.secondaryText}
                style={styles.input}
                returnKeyType="done"
              />
              <TextInput
                value={taskComment}
                onChangeText={setTaskComment}
                placeholder={t("taskComment")}
                placeholderTextColor={colors.secondaryText}
                style={styles.input}
              />
              <Pressable
                disabled={!taskTitle.trim() || createTask.isPending}
                onPress={() => createTask.mutate()}
                style={[
                  styles.actionButton,
                  (!taskTitle.trim() || createTask.isPending) &&
                    styles.disabled,
                ]}
              >
                <Text style={styles.actionText}>{t("addTask")}</Text>
              </Pressable>
            </View>
          </>
        ) : lists.length === 0 &&
          !listsQuery.isLoading &&
          !listsQuery.isError ? (
          <Text style={styles.empty}>{t("noLists")}</Text>
        ) : null}

        <View style={[styles.formCard, styles.newListForm]}>
          <Text style={styles.formHeading}>{t("addList")}</Text>
          <TextInput
            value={listTitle}
            onChangeText={setListTitle}
            placeholder={t("listName")}
            placeholderTextColor={colors.secondaryText}
            style={styles.input}
          />
          <TextInput
            value={listComment}
            onChangeText={setListComment}
            placeholder={t("listComment")}
            placeholderTextColor={colors.secondaryText}
            style={styles.input}
          />
          <Pressable
            disabled={!listTitle.trim() || createList.isPending}
            onPress={() => createList.mutate()}
            style={[
              styles.actionButton,
              (!listTitle.trim() || createList.isPending) && styles.disabled,
            ]}
          >
            <Text style={styles.actionText}>{t("addList")}</Text>
          </Pressable>
          {createList.isError && (
            <Text style={styles.error}>{createList.error.message}</Text>
          )}
        </View>
        {selectedTasks.length > 0 && (
          <Pressable style={styles.bulkButton} onPress={bulkDelete}>
            <NativeIcon name="delete" />
            <Text style={styles.bulkText}>
              {t("deleteSelected")} · {selectedTasks.length}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: colors.secondaryText,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  profileButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  listStrip: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 16,
    gap: 8,
    alignItems: "center",
  },
  listPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    maxWidth: 180,
  },
  listPillActive: { backgroundColor: colors.tintSoft },
  listPillText: {
    color: colors.secondaryText,
    fontSize: 14,
    fontWeight: "600",
  },
  listPillTextActive: { color: colors.tint },
  addPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: 44 },
  listTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    marginBottom: 18,
    gap: 12,
  },
  flex: { flex: 1 },
  listTitle: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  listNote: { color: colors.secondaryText, fontSize: 14, marginTop: 5 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  taskBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  empty: {
    color: colors.secondaryText,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    paddingVertical: 25,
  },
  muted: { color: colors.secondaryText, fontSize: 15, marginVertical: 20 },
  error: { color: colors.destructive, fontSize: 14, marginTop: 10 },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 16,
  },
  newListForm: { marginTop: 16 },
  formHeading: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 13,
  },
  input: {
    minHeight: 47,
    borderRadius: radius.sm,
    backgroundColor: colors.field,
    paddingHorizontal: 13,
    color: colors.text,
    fontSize: 15,
    marginBottom: 10,
  },
  actionButton: {
    minHeight: 46,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.tint,
    marginTop: 2,
  },
  actionText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  bulkButton: {
    minHeight: 48,
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.tintSoft,
  },
  bulkText: { color: colors.destructive, fontSize: 15, fontWeight: "700" },
});
