import { Host, Icon } from "@expo/ui";
import { BlurTargetView, BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import type { TodoItem, TodoList } from "@/api/client";
import { useAuth } from "@/auth/auth-context";
import { NativeIcon } from "@/components/native-icon";
import { ListColorPicker } from "@/components/list-color-picker";
import { TaskRow } from "@/components/task-row";
import {
  PartialBatchCreateError,
  createItem,
  createItems,
  getLists,
  listQueryKey,
  removeItem,
  removeItems,
  removeList,
  setItemCompleted,
  updateList,
} from "@/data/todo-repository";
import { t } from "@/i18n";
import {
  DEFAULT_LIST_COLOR,
  getListColor,
  getListGradient,
  type ListColorKey,
} from "@/theme/list-colors";

const palette = {
  background: "#F7F7F7",
  surface: "#FFFFFF",
  text: "#111111",
  secondary: "#929292",
  border: "#E4E4E4",
  destructive: "#C43F48",
} as const;

const icons = {
  back: Icon.select({
    ios: "chevron.left",
    android: import("@expo/material-symbols/arrow_back_ios_new.xml"),
  }),
  more: Icon.select({
    ios: "ellipsis",
    android: import("@expo/material-symbols/more_horiz.xml"),
  }),
  search: Icon.select({
    ios: "magnifyingglass",
    android: import("@expo/material-symbols/search.xml"),
  }),
} as const;

function ScreenIcon({
  name,
  size = 22,
}: {
  name: keyof typeof icons;
  size?: number;
}) {
  return (
    <Host style={{ width: size, height: size }} pointerEvents="none">
      <Icon name={icons[name]} size={size} color={palette.text} />
    </Host>
  );
}

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const listId = typeof id === "string" ? id : "";
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = listQueryKey(session);
  const [search, setSearch] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskComment, setTaskComment] = useState("");
  const [bulkTaskText, setBulkTaskText] = useState("");
  const [createMode, setCreateMode] = useState<"single" | "bulk">("single");
  const [isCreateTaskOpen, setCreateTaskOpen] = useState(false);
  const [isEditListOpen, setEditListOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editColor, setEditColor] = useState<ListColorKey>(DEFAULT_LIST_COLOR);
  const [isSelecting, setSelecting] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [headerHeight, setHeaderHeight] = useState(160 + insets.top);
  const [footerHeight, setFooterHeight] = useState(82 + insets.bottom);
  const blurTarget = useRef<View>(null);
  const isScrolling = useRef(false);
  const lastScrollStep = useRef(0);
  const lastHapticTime = useRef(0);

  const listsQuery = useQuery({
    queryKey,
    queryFn: () => getLists(session),
  });
  const list = listsQuery.data?.find((entry) => entry.id === listId);
  const listGradient = getListGradient(list?.colorKey);
  const visibleTasks = useMemo(() => {
    if (!list) return [];
    const term = search.trim().toLocaleLowerCase();
    if (!term) return list.items;
    return list.items.filter(
      (item) =>
        item.title.toLocaleLowerCase().includes(term) ||
        item.comment?.toLocaleLowerCase().includes(term),
    );
  }, [list, search]);
  const bulkDraft = useMemo(() => {
    const titles: string[] = [];
    let firstLongLine = 0;
    bulkTaskText.split(/\r\n?|\n/).forEach((line, index) => {
      const title = line.trim();
      if (!title) return;
      if (!firstLongLine && title.length > 240) firstLongLine = index + 1;
      titles.push(title);
    });
    return { titles, firstLongLine };
  }, [bulkTaskText]);
  const bulkValidationError =
    bulkDraft.titles.length > 100
      ? t("bulkTooManyTasks")
      : bulkDraft.firstLongLine
        ? t("bulkTaskTooLong").replace(
            "{line}",
            String(bulkDraft.firstLongLine),
          )
        : null;
  const isBulkCreate = createMode === "bulk";
  const bulkCount = bulkDraft.titles.length;
  const bulkSubmitLabel = t(
    bulkCount === 1 ? "addBulkTask" : "addBulkTasks",
  ).replace("{count}", String(bulkCount));
  const bulkCountLabel = t(
    bulkCount === 1 ? "bulkSingleTaskCount" : "bulkTaskCount",
  ).replace("{count}", String(bulkCount));
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const createTask = useMutation({
    mutationFn: () =>
      createItem(session, listId, {
        title: taskTitle.trim(),
        comment: taskComment.trim() || null,
      }),
    onSuccess: (newTask) => {
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.map((entry) =>
          entry.id === listId
            ? { ...entry, items: [...entry.items, newTask] }
            : entry,
        ),
      );
      setTaskTitle("");
      setTaskComment("");
      setCreateTaskOpen(false);
      void refresh();
    },
  });

  const createTasks = useMutation({
    mutationFn: (items: { title: string; comment: null }[]) =>
      createItems(session, listId, items),
    onSuccess: (newTasks) => {
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.map((entry) =>
          entry.id === listId
            ? { ...entry, items: [...entry.items, ...newTasks] }
            : entry,
        ),
      );
      setBulkTaskText("");
      setCreateMode("single");
      setCreateTaskOpen(false);
      void refresh();
    },
    onError: (error) => {
      if (!(error instanceof PartialBatchCreateError)) return;
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.map((entry) =>
          entry.id === listId
            ? { ...entry, items: [...entry.items, ...error.created] }
            : entry,
        ),
      );
      setBulkTaskText((current) => {
        let saved = error.created.length;
        return current
          .split(/\r\n?|\n/)
          .filter((line) => {
            if (!line.trim()) return false;
            if (saved > 0) {
              saved -= 1;
              return false;
            }
            return true;
          })
          .join("\n");
      });
      void refresh();
    },
  });

  const setCompleted = useMutation({
    mutationFn: ({ item, completed }: { item: TodoItem; completed: boolean }) =>
      setItemCompleted(session, item.id, completed),
    onSuccess: (updated) => {
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.map((entry) =>
          entry.id === listId
            ? {
                ...entry,
                items: entry.items.map((item) =>
                  item.id === updated.id ? { ...item, ...updated } : item,
                ),
              }
            : entry,
        ),
      );
      void refresh();
    },
    onError: (error) => Alert.alert(t("error"), error.message),
  });

  const deleteTask = useMutation({
    mutationFn: (itemId: string) => removeItem(session, itemId),
    onSuccess: (_data, itemId) => {
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.map((entry) =>
          entry.id === listId
            ? {
                ...entry,
                items: entry.items.filter((item) => item.id !== itemId),
              }
            : entry,
        ),
      );
      setSelectedTaskIds((previous) =>
        previous.filter((selectedId) => selectedId !== itemId),
      );
      void refresh();
    },
    onError: (error) => Alert.alert(t("error"), error.message),
  });

  const deleteSelectedTasks = useMutation({
    mutationFn: (taskIds: string[]) => removeItems(session, taskIds),
    onSuccess: (taskIds) => {
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.map((entry) =>
          entry.id === listId
            ? {
                ...entry,
                items: entry.items.filter((item) => !taskIds.includes(item.id)),
              }
            : entry,
        ),
      );
      setSelectedTaskIds([]);
      setSelecting(false);
      void refresh();
    },
    onError: (error) => {
      setSelectedTaskIds([]);
      setSelecting(false);
      void refresh();
      Alert.alert(t("error"), error.message);
    },
  });

  const deleteList = useMutation({
    mutationFn: () => removeList(session, listId),
    onSuccess: () => {
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.filter((entry) => entry.id !== listId),
      );
      router.replace("/(app)");
      void refresh();
    },
    onError: (error) => Alert.alert(t("error"), error.message),
  });

  const saveListChanges = useMutation({
    mutationFn: () =>
      updateList(session, listId, {
        title: editTitle.trim(),
        comment: editComment.trim() || null,
        colorKey: editColor,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.map((entry) =>
          entry.id === listId
            ? { ...entry, ...updated, items: updated.items ?? entry.items }
            : entry,
        ),
      );
      setEditListOpen(false);
      void refresh();
    },
  });

  const openEditList = () => {
    if (!list) return;
    setEditTitle(list.title);
    setEditComment(list.comment ?? "");
    setEditColor(getListColor(list.colorKey).key);
    saveListChanges.reset();
    setEditListOpen(true);
  };
  const closeEditList = () => {
    if (saveListChanges.isPending) return;
    setEditListOpen(false);
    saveListChanges.reset();
  };

  const askToDeleteTask = (item: TodoItem) =>
    Alert.alert(t("delete"), t("deleteTask"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => deleteTask.mutate(item.id),
      },
    ]);

  const askToDeleteList = () =>
    Alert.alert(t("delete"), t("deleteList"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => deleteList.mutate(),
      },
    ]);

  const askToDeleteSelected = () => {
    if (selectedTaskIds.length === 0) return;
    Alert.alert(
      t("delete"),
      `${t("deleteSelected")} (${selectedTaskIds.length})?`,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: () => deleteSelectedTasks.mutate(selectedTaskIds),
        },
      ],
    );
  };

  const shareList = async () => {
    if (!list) return;
    const message = [
      list.title,
      list.comment,
      ...list.items.map(
        (item) =>
          `${item.completed ? "✓" : "○"} ${item.title}${item.comment ? ` — ${item.comment}` : ""}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await Share.share({ title: list.title, message });
    } catch (error) {
      Alert.alert(
        t("error"),
        error instanceof Error ? error.message : t("error"),
      );
    }
  };

  const showMoreOptions = () => {
    const options = [
      t("editList"),
      t("share"),
      t("selectTasks"),
      t("delete"),
      t("cancel"),
    ];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 4,
          destructiveButtonIndex: 3,
        },
        (index) => {
          if (index === 0) openEditList();
          if (index === 1) void shareList();
          if (index === 2) setSelecting(true);
          if (index === 3) askToDeleteList();
        },
      );
      return;
    }
    Alert.alert(list?.title ?? t("myLists"), undefined, [
      { text: t("editList"), onPress: openEditList },
      { text: t("share"), onPress: () => void shareList() },
      { text: t("selectTasks"), onPress: () => setSelecting(true) },
      { text: t("delete"), style: "destructive", onPress: askToDeleteList },
      { text: t("cancel"), style: "cancel" },
    ]);
  };

  const toggleSelection = (itemId: string) => {
    setSelecting(true);
    setSelectedTaskIds((previous) =>
      previous.includes(itemId)
        ? previous.filter((selectedId) => selectedId !== itemId)
        : [...previous, itemId],
    );
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isScrolling.current) return;
    const step = Math.floor(
      Math.max(0, event.nativeEvent.contentOffset.y) / 72,
    );
    if (step === lastScrollStep.current) return;
    lastScrollStep.current = step;
    const now = Date.now();
    if (now - lastHapticTime.current < 85) return;
    lastHapticTime.current = now;
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const openCreateTask = () => {
    setTaskTitle("");
    setTaskComment("");
    setBulkTaskText("");
    setCreateMode("single");
    createTask.reset();
    createTasks.reset();
    setCreateTaskOpen(true);
  };

  const closeCreateTask = () => {
    if (createTask.isPending || createTasks.isPending) return;
    setCreateTaskOpen(false);
    createTask.reset();
    createTasks.reset();
  };

  return (
    <View style={styles.safe}>
      {listGradient ? (
        <LinearGradient
          pointerEvents="none"
          colors={listGradient}
          locations={[0, 0.53, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.screen}>
          <BlurTargetView ref={blurTarget} style={styles.scroll}>
            {listGradient ? (
              <LinearGradient
                pointerEvents="none"
                colors={listGradient}
                locations={[0, 0.53, 1]}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingTop: headerHeight,
                  paddingBottom: footerHeight + 30,
                  paddingLeft: 20 + insets.left,
                  paddingRight: 20 + insets.right,
                },
                (!list || list.items.length === 0) && styles.emptyScrollContent,
              ]}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScrollBeginDrag={(event) => {
                isScrolling.current = true;
                lastScrollStep.current = Math.floor(
                  Math.max(0, event.nativeEvent.contentOffset.y) / 72,
                );
              }}
              onScrollEndDrag={() => {
                isScrolling.current = false;
              }}
              onMomentumScrollBegin={() => {
                isScrolling.current = true;
              }}
              onMomentumScrollEnd={() => {
                isScrolling.current = false;
              }}
              onScroll={handleScroll}
            >
              {listsQuery.isLoading ? (
                <Text style={styles.statusText}>{t("loading")}</Text>
              ) : listsQuery.isError ? (
                <View style={styles.loadError}>
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {listsQuery.error.message}
                  </Text>
                  <Pressable onPress={() => void listsQuery.refetch()}>
                    <Text style={styles.retryText}>{t("retry")}</Text>
                  </Pressable>
                </View>
              ) : !list ? (
                <Text style={styles.statusText}>{t("listNotFound")}</Text>
              ) : list.items.length === 0 ? (
                <Text style={styles.statusText}>{t("noTasks")}</Text>
              ) : visibleTasks.length === 0 ? (
                <Text style={styles.statusText}>{t("noMatchingTasks")}</Text>
              ) : (
                <View style={styles.taskGroup}>
                  {visibleTasks.map((item, index) => (
                    <View key={item.id} style={styles.taskRowWrap}>
                      {index > 0 ? <View style={styles.separator} /> : null}
                      <TaskRow
                        item={item}
                        selected={selectedTaskIds.includes(item.id)}
                        selectionMode={isSelecting}
                        onToggleComplete={() =>
                          setCompleted.mutate({
                            item,
                            completed: !item.completed,
                          })
                        }
                        onToggleSelection={() => toggleSelection(item.id)}
                        onDelete={() => askToDeleteTask(item)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </BlurTargetView>

          <View
            style={styles.headerOverlay}
            onLayout={(event) =>
              setHeaderHeight(event.nativeEvent.layout.height)
            }
          >
            <BlurView
              pointerEvents="none"
              blurTarget={blurTarget}
              blurMethod="dimezisBlurViewSdk31Plus"
              tint="light"
              intensity={70}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.glassTint} />
            <View
              style={[
                styles.toolbar,
                {
                  paddingTop: insets.top + 18,
                  paddingLeft: 20 + insets.left,
                  paddingRight: 20 + insets.right,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("back")}
                onPress={() => router.back()}
                style={styles.circleButton}
              >
                <ScreenIcon name="back" size={22} />
              </Pressable>
              <View style={styles.toolbarActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("addTask")}
                  disabled={!list}
                  onPress={openCreateTask}
                  style={styles.circleButton}
                >
                  <NativeIcon name="add" size={27} color={palette.text} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("moreOptions")}
                  disabled={!list}
                  onPress={showMoreOptions}
                  style={styles.circleButton}
                >
                  <ScreenIcon name="more" size={25} />
                </Pressable>
              </View>
            </View>

            <Text
              style={[
                styles.title,
                {
                  marginLeft: 20 + insets.left,
                  marginRight: 20 + insets.right,
                },
              ]}
            >
              {list?.title ?? t("myLists")}
            </Text>
            {list?.comment ? (
              <Text
                style={[
                  styles.listComment,
                  {
                    marginLeft: 20 + insets.left,
                    marginRight: 20 + insets.right,
                  },
                ]}
              >
                {list.comment}
              </Text>
            ) : null}
          </View>

          <View
            style={styles.footerOverlay}
            onLayout={(event) =>
              setFooterHeight(event.nativeEvent.layout.height)
            }
          >
            <BlurView
              pointerEvents="none"
              blurTarget={blurTarget}
              blurMethod="dimezisBlurViewSdk31Plus"
              tint="light"
              intensity={70}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.glassTint} />
            {isSelecting ? (
              <View
                style={[
                  styles.selectionBar,
                  {
                    paddingBottom: 18 + insets.bottom,
                    paddingLeft: 20 + insets.left,
                    paddingRight: 20 + insets.right,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSelecting(false);
                    setSelectedTaskIds([]);
                  }}
                  style={styles.selectionCancel}
                >
                  <Text style={styles.selectionCancelText}>{t("cancel")}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={
                    selectedTaskIds.length === 0 ||
                    deleteSelectedTasks.isPending
                  }
                  onPress={askToDeleteSelected}
                  style={styles.selectionDelete}
                >
                  <Text
                    style={[
                      styles.selectionDeleteText,
                      selectedTaskIds.length === 0 && styles.disabledText,
                    ]}
                  >
                    {t("deleteSelected")} ({selectedTaskIds.length})
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View
                style={[
                  styles.searchArea,
                  {
                    paddingBottom: 18 + insets.bottom,
                    paddingLeft: 24 + insets.left,
                    paddingRight: 24 + insets.right,
                  },
                ]}
              >
                <View style={styles.searchBar}>
                  <ScreenIcon name="search" size={22} />
                  <TextInput
                    accessibilityLabel={t("searchTasks")}
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t("searchTasks")}
                    placeholderTextColor={palette.secondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    style={styles.searchInput}
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={isCreateTaskOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeCreateTask}
      >
        <SafeAreaView
          style={styles.modalSafe}
          edges={["top", "bottom", "left", "right"]}
        >
          <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.modalToolbar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("cancel")}
                disabled={createTask.isPending || createTasks.isPending}
                onPress={closeCreateTask}
                style={styles.modalAction}
              >
                <Text style={styles.modalActionText}>{t("cancel")}</Text>
              </Pressable>
              <Text style={styles.modalTitle}>
                {t(isBulkCreate ? "addMultiple" : "newTask")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isBulkCreate ? bulkSubmitLabel : t("addAction")
                }
                disabled={
                  isBulkCreate
                    ? bulkCount === 0 ||
                      !!bulkValidationError ||
                      createTasks.isPending
                    : !taskTitle.trim() || createTask.isPending
                }
                onPress={() => {
                  if (isBulkCreate) {
                    createTasks.mutate(
                      bulkDraft.titles.map((title) => ({
                        title,
                        comment: null,
                      })),
                    );
                  } else {
                    createTask.mutate();
                  }
                }}
                style={styles.modalAction}
              >
                <Text
                  style={[
                    styles.modalAddText,
                    (isBulkCreate
                      ? bulkCount === 0 ||
                        !!bulkValidationError ||
                        createTasks.isPending
                      : !taskTitle.trim() || createTask.isPending) &&
                      styles.disabledText,
                  ]}
                >
                  {isBulkCreate ? bulkSubmitLabel : t("addAction")}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalBody}
            >
              {isBulkCreate ? (
                <>
                  <Text style={styles.bulkInstructions}>
                    {t("bulkTaskInstructions")}
                  </Text>
                  <TextInput
                    accessibilityLabel={t("bulkTaskInput")}
                    autoFocus
                    editable={!createTasks.isPending}
                    value={bulkTaskText}
                    onChangeText={(value) => {
                      setBulkTaskText(value);
                      if (createTasks.isError) createTasks.reset();
                    }}
                    placeholder={t("bulkTaskPlaceholder")}
                    placeholderTextColor={palette.secondary}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    style={styles.bulkTaskInput}
                  />
                  <Text style={styles.bulkCount}>{bulkCountLabel}</Text>
                  {bulkValidationError ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {bulkValidationError}
                    </Text>
                  ) : null}
                  {createTasks.isError ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {createTasks.error.message}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <View style={styles.modalIconCircle}>
                    <NativeIcon name="check" size={38} color={palette.text} />
                  </View>
                  <TextInput
                    accessibilityLabel={t("taskTitle")}
                    autoFocus
                    value={taskTitle}
                    onChangeText={setTaskTitle}
                    placeholder={t("taskTitle")}
                    placeholderTextColor={palette.secondary}
                    returnKeyType="next"
                    style={styles.modalTaskInput}
                  />
                  <TextInput
                    accessibilityLabel={t("taskComment")}
                    value={taskComment}
                    onChangeText={setTaskComment}
                    placeholder={t("taskComment")}
                    placeholderTextColor={palette.secondary}
                    multiline
                    style={styles.modalCommentInput}
                  />
                  {createTask.isError ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {createTask.error.message}
                    </Text>
                  ) : null}
                </>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={createTask.isPending || createTasks.isPending}
                onPress={() => {
                  setCreateMode(isBulkCreate ? "single" : "bulk");
                  createTask.reset();
                  createTasks.reset();
                }}
                style={styles.modalModeButton}
              >
                <Text style={styles.modalModeText}>
                  {t(isBulkCreate ? "addOneTask" : "addMultiple")}
                </Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={isEditListOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditList}
      >
        <SafeAreaView
          style={styles.modalSafe}
          edges={["top", "bottom", "left", "right"]}
        >
          <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.modalToolbar}>
              <Pressable
                accessibilityRole="button"
                disabled={saveListChanges.isPending}
                onPress={closeEditList}
                style={styles.modalAction}
              >
                <Text style={styles.modalActionText}>{t("cancel")}</Text>
              </Pressable>
              <Text style={styles.modalTitle}>{t("editList")}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={!editTitle.trim() || saveListChanges.isPending}
                onPress={() => saveListChanges.mutate()}
                style={styles.modalAction}
              >
                <Text
                  style={[
                    styles.modalAddText,
                    (!editTitle.trim() || saveListChanges.isPending) &&
                      styles.disabledText,
                  ]}
                >
                  {t("save")}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalBody}
            >
              <View
                style={[
                  styles.modalIconCircle,
                  { backgroundColor: getListColor(editColor).base },
                ]}
              >
                <NativeIcon name="check" size={38} color={palette.text} />
              </View>
              <TextInput
                accessibilityLabel={t("listName")}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder={t("listName")}
                placeholderTextColor={palette.secondary}
                style={styles.modalTaskInput}
              />
              <TextInput
                accessibilityLabel={t("listComment")}
                value={editComment}
                onChangeText={setEditComment}
                placeholder={t("listComment")}
                placeholderTextColor={palette.secondary}
                multiline
                style={styles.modalCommentInput}
              />
              <ListColorPicker
                value={editColor}
                onChange={setEditColor}
                disabled={saveListChanges.isPending}
              />
              {saveListChanges.isError ? (
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {saveListChanges.error.message}
                </Text>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  screen: { flex: 1 },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  footerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  glassTint: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(247, 247, 247, 0.42)",
  },
  toolbar: {
    paddingHorizontal: 20,
    paddingTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toolbarActions: { flexDirection: "row", gap: 12 },
  circleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DCDCDC",
    backgroundColor: "rgba(255, 255, 255, 0.58)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  title: {
    marginHorizontal: 20,
    marginTop: 22,
    marginBottom: 22,
    color: palette.text,
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1.3,
  },
  listComment: {
    marginHorizontal: 20,
    marginTop: -12,
    marginBottom: 20,
    color: palette.secondary,
    fontSize: 16,
    lineHeight: 22,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  emptyScrollContent: { flexGrow: 1, justifyContent: "center" },
  taskGroup: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  taskRowWrap: { backgroundColor: palette.surface },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
  },
  statusText: {
    alignSelf: "center",
    color: palette.secondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    marginVertical: 24,
  },
  errorText: { color: palette.destructive, fontSize: 14, marginTop: 14 },
  loadError: { alignItems: "center", paddingHorizontal: 20 },
  retryText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 18,
  },
  searchArea: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 18,
  },
  searchBar: {
    height: 52,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#D9D9D9",
    backgroundColor: "rgba(255, 255, 255, 0.62)",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  selectionBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    flexDirection: "row",
    gap: 12,
  },
  selectionCancel: {
    minHeight: 50,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.62)",
    justifyContent: "center",
  },
  selectionCancelText: { color: palette.text, fontSize: 16 },
  selectionDelete: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.62)",
    justifyContent: "center",
    alignItems: "center",
  },
  selectionDeleteText: {
    color: palette.destructive,
    fontSize: 16,
    fontWeight: "600",
  },
  disabledText: { color: "#BEBEBE" },
  modalSafe: { flex: 1, backgroundColor: palette.background },
  modalToolbar: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalAction: {
    minWidth: 72,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionText: { color: palette.text, fontSize: 16, textAlign: "center" },
  modalTitle: { color: palette.text, fontSize: 17, fontWeight: "700" },
  modalAddText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  modalBody: { paddingHorizontal: 20, paddingTop: 25 },
  modalIconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 28,
  },
  modalTaskInput: {
    minHeight: 92,
    borderRadius: 20,
    backgroundColor: palette.surface,
    color: palette.text,
    fontSize: 27,
    fontWeight: "600",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalCommentInput: {
    minHeight: 82,
    borderRadius: 20,
    backgroundColor: palette.surface,
    color: palette.text,
    fontSize: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    textAlignVertical: "top",
  },
  modalModeButton: {
    alignSelf: "center",
    minHeight: 44,
    paddingHorizontal: 18,
    justifyContent: "center",
    marginTop: 22,
  },
  modalModeText: { color: palette.text, fontSize: 16, fontWeight: "600" },
  bulkInstructions: {
    color: palette.secondary,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 16,
  },
  bulkTaskInput: {
    minHeight: 220,
    maxHeight: 380,
    borderRadius: 20,
    backgroundColor: palette.surface,
    color: palette.text,
    fontSize: 18,
    lineHeight: 26,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  bulkCount: {
    color: palette.secondary,
    fontSize: 14,
    marginTop: 12,
  },
});
