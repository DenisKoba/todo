import { Host, Icon } from "@expo/ui";
import { MenuView } from "@expo/ui/community/menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BlurTargetView, BlurView } from "expo-blur";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import type { TodoList } from "@/api/client";
import { useAuth } from "@/auth/auth-context";
import { NativeIcon } from "@/components/native-icon";
import { ListColorPicker } from "@/components/list-color-picker";
import {
  createList as saveList,
  getLists,
  listQueryKey,
  removeList,
} from "@/data/todo-repository";
import { t } from "@/i18n";
import {
  DEFAULT_LIST_COLOR,
  getListColor,
  type ListColorKey,
} from "@/theme/list-colors";

const palette = {
  background: "#F7F7F7",
  white: "#FFFFFF",
  black: "#111111",
  muted: "#929292",
  border: "#E5E5E5",
  error: "#C43F48",
} as const;

const icons = {
  search: Icon.select({
    ios: "magnifyingglass",
    android: import("@expo/material-symbols/search.xml"),
  }),
  chevron: Icon.select({
    ios: "chevron.right",
    android: import("@expo/material-symbols/chevron_right.xml"),
  }),
  document: Icon.select({
    ios: "doc.on.doc.fill",
    android: import("@expo/material-symbols/content_copy.xml"),
  }),
} as const;

function ScreenIcon({
  name,
  size,
  color = palette.black,
}: {
  name: keyof typeof icons;
  size: number;
  color?: string;
}) {
  return (
    <Host style={{ width: size, height: size }} pointerEvents="none">
      <Icon name={icons[name]} size={size} color={color} />
    </Host>
  );
}

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = (windowWidth - insets.left - insets.right - 56) / 2;
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = listQueryKey(session);
  const [search, setSearch] = useState("");
  const [listTitle, setListTitle] = useState("");
  const [listComment, setListComment] = useState("");
  const [listColor, setListColor] = useState<ListColorKey>(DEFAULT_LIST_COLOR);
  const [isCreateListOpen, setCreateListOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(160 + insets.top);
  const [footerHeight, setFooterHeight] = useState(82 + insets.bottom);
  const blurTarget = useRef<View>(null);
  const cardPressStartedAt = useRef(new Map<string, number>());

  const listsQuery = useQuery({
    queryKey,
    queryFn: () => getLists(session),
  });
  const lists = listsQuery.data ?? [];
  const filteredLists = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return lists;
    return lists.filter(
      (list) =>
        list.title.toLocaleLowerCase().includes(term) ||
        list.items.some((item) =>
          item.title.toLocaleLowerCase().includes(term),
        ),
    );
  }, [lists, search]);

  const createList = useMutation({
    mutationFn: () =>
      saveList(session, {
        title: listTitle.trim(),
        comment: listComment.trim() || null,
        colorKey: listColor,
      }),
    onSuccess: (list) => {
      setListTitle("");
      setListComment("");
      setListColor(DEFAULT_LIST_COLOR);
      setCreateListOpen(false);
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.some((entry) => entry.id === list.id)
          ? current
          : [...(current ?? []), { ...list, items: list.items ?? [] }],
      );
      void queryClient.invalidateQueries({ queryKey });
      router.push({ pathname: "/(app)/list/[id]", params: { id: list.id } });
    },
  });

  const deleteList = useMutation({
    mutationFn: (listId: string) => removeList(session, listId),
    onSuccess: (_result, listId) => {
      queryClient.setQueryData<TodoList[]>(queryKey, (current) =>
        current?.filter((list) => list.id !== listId),
      );
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => Alert.alert(t("error"), error.message),
  });

  const confirmDeleteList = (list: TodoList) => {
    Alert.alert(t("delete"), t("deleteList"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => deleteList.mutate(list.id),
      },
    ]);
  };

  const openCreateList = () => {
    setListTitle("");
    setListComment("");
    setListColor(DEFAULT_LIST_COLOR);
    createList.reset();
    setCreateListOpen(true);
  };
  const closeCreateList = () => {
    if (createList.isPending) return;
    setCreateListOpen(false);
    createList.reset();
  };
  const openProfile = () => router.push("/(app)/profile");

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.screen}>
          <BlurTargetView ref={blurTarget} style={styles.scroll}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingTop: headerHeight + 8,
                  paddingBottom: footerHeight + 12,
                  paddingLeft: 20 + insets.left,
                  paddingRight: 20 + insets.right,
                },
                lists.length === 0 && styles.emptyScrollContent,
              ]}
              keyboardShouldPersistTaps="handled"
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
              ) : lists.length === 0 ? (
                <Text style={styles.statusText}>{t("noLists")}</Text>
              ) : filteredLists.length === 0 ? (
                <Text style={styles.statusText}>No matching lists.</Text>
              ) : (
                <View style={styles.grid}>
                  {filteredLists.map((list) => (
                    <View key={list.id} style={{ width: cardWidth }}>
                      <MenuView
                        style={{ width: cardWidth }}
                        shouldOpenOnLongPress
                        actions={[
                          {
                            id: "delete",
                            title: t("delete"),
                            image: "trash",
                            attributes: {
                              destructive: true,
                              disabled: deleteList.isPending,
                            },
                          },
                        ]}
                        onPressAction={({ nativeEvent }) => {
                          if (nativeEvent.event === "delete")
                            confirmDeleteList(list);
                        }}
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${list.title}, ${list.items.length} tasks`}
                          accessibilityHint={t("listCardHint")}
                          onPressIn={() =>
                            cardPressStartedAt.current.set(list.id, Date.now())
                          }
                          onLongPress={() =>
                            cardPressStartedAt.current.set(list.id, 1)
                          }
                          onPress={() => {
                            const startedAt = cardPressStartedAt.current.get(
                              list.id,
                            );
                            cardPressStartedAt.current.delete(list.id);
                            if (startedAt && Date.now() - startedAt >= 300)
                              return;
                            router.push({
                              pathname: "/(app)/list/[id]",
                              params: { id: list.id },
                            });
                          }}
                          style={({ pressed }) => [
                            styles.card,
                            { width: cardWidth },
                            {
                              backgroundColor: getListColor(list.colorKey).base,
                              borderColor:
                                getListColor(list.colorKey).key ===
                                DEFAULT_LIST_COLOR
                                  ? palette.border
                                  : "rgba(0,0,0,0.08)",
                            },
                            pressed && styles.cardPressed,
                          ]}
                        >
                          <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle} numberOfLines={1}>
                              {list.title}
                            </Text>
                            <Text style={styles.cardCount}>
                              {list.items.length}
                            </Text>
                            <ScreenIcon
                              name="chevron"
                              size={17}
                              color={palette.muted}
                            />
                          </View>
                          <View
                            style={[
                              styles.cardDivider,
                              { backgroundColor: "rgba(0,0,0,0.12)" },
                            ]}
                          />
                          <View style={styles.cardPreview}>
                            {list.items.slice(0, 4).map((item) => (
                              <Text
                                key={item.id}
                                style={styles.previewText}
                                numberOfLines={1}
                              >
                                {item.title}
                              </Text>
                            ))}
                          </View>
                        </Pressable>
                      </MenuView>
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
              intensity={70}
              tint="light"
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
                accessibilityLabel={t("profile")}
                onPress={openProfile}
                style={styles.circleButton}
              >
                <NativeIcon name="person" size={23} color={palette.black} />
              </Pressable>
              <View style={styles.toolbarActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("addList")}
                  onPress={openCreateList}
                  style={styles.circleButton}
                >
                  <NativeIcon name="add" size={28} color={palette.black} />
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
              {t("myLists")}
            </Text>
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
              intensity={70}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.glassTint} />
            <View
              style={[
                styles.searchArea,
                {
                  paddingBottom: insets.bottom + 18,
                  paddingLeft: 24 + insets.left,
                  paddingRight: 24 + insets.right,
                },
              ]}
            >
              <View style={styles.searchBar}>
                <ScreenIcon name="search" size={22} />
                <TextInput
                  accessibilityLabel="Search lists and tasks"
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search"
                  placeholderTextColor={palette.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  style={styles.searchInput}
                />
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={isCreateListOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeCreateList}
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
                disabled={createList.isPending}
                onPress={closeCreateList}
                style={styles.modalToolbarAction}
              >
                <Text style={styles.cancelText}>{t("cancel")}</Text>
              </Pressable>
              <Text style={styles.modalTitle}>{t("addList")}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add"
                disabled={!listTitle.trim() || createList.isPending}
                onPress={() => createList.mutate()}
                style={styles.modalToolbarAction}
              >
                <Text
                  style={[
                    styles.addText,
                    (!listTitle.trim() || createList.isPending) &&
                      styles.addTextDisabled,
                  ]}
                >
                  Add
                </Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalBody}
            >
              <View
                style={[
                  styles.listIconCircle,
                  { backgroundColor: getListColor(listColor).base },
                ]}
              >
                <ScreenIcon name="document" size={40} />
              </View>
              <TextInput
                accessibilityLabel={t("listName")}
                value={listTitle}
                onChangeText={setListTitle}
                placeholder={t("listName")}
                placeholderTextColor={palette.muted}
                style={styles.listNameInput}
                returnKeyType="next"
                autoFocus
              />
              <TextInput
                accessibilityLabel={t("listComment")}
                value={listComment}
                onChangeText={setListComment}
                placeholder={t("listComment")}
                placeholderTextColor={palette.muted}
                style={styles.listCommentInput}
                multiline
              />
              <ListColorPicker
                value={listColor}
                onChange={setListColor}
                disabled={createList.isPending}
              />
              {createList.isError ? (
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {createList.error.message}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(180,180,180,0.35)",
  },
  footerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(180,180,180,0.35)",
  },
  glassTint: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(247,247,247,0.32)",
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
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "#DCDCDC",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  title: {
    color: palette.black,
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1.3,
    marginTop: 22,
    marginBottom: 23,
    marginHorizontal: 20,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 30 },
  emptyScrollContent: { flexGrow: 1, justifyContent: "center" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 16,
  },
  card: {
    minHeight: 180,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    paddingHorizontal: 15,
    paddingTop: 17,
    paddingBottom: 14,
  },
  cardPressed: { opacity: 0.65 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardTitle: {
    color: palette.black,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.4,
    flex: 1,
  },
  cardCount: { color: palette.muted, fontSize: 16 },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#DADADA",
    marginTop: 12,
    marginBottom: 9,
  },
  cardPreview: { gap: 4 },
  previewText: { color: palette.black, fontSize: 15, lineHeight: 22 },
  statusText: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    alignSelf: "center",
    marginVertical: 24,
  },
  errorText: { color: palette.error, fontSize: 14, marginTop: 14 },
  loadError: { alignItems: "center", paddingHorizontal: 20 },
  retryText: {
    color: palette.black,
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
    backgroundColor: "rgba(255,255,255,0.72)",
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
    color: palette.black,
    fontSize: 16,
    paddingVertical: 0,
  },
  modalSafe: { flex: 1, backgroundColor: palette.background },
  modalToolbar: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalToolbarAction: {
    width: 72,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: palette.black, fontSize: 16, textAlign: "center" },
  modalTitle: { color: palette.black, fontSize: 17, fontWeight: "700" },
  addText: {
    color: palette.black,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  addTextDisabled: { color: palette.muted },
  modalBody: { paddingHorizontal: 20, paddingTop: 25 },
  listIconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    marginBottom: 28,
  },
  listNameInput: {
    minHeight: 92,
    borderRadius: 20,
    backgroundColor: palette.white,
    color: palette.black,
    fontSize: 28,
    fontWeight: "600",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  listCommentInput: {
    minHeight: 82,
    borderRadius: 20,
    backgroundColor: palette.white,
    color: palette.black,
    fontSize: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    textAlignVertical: "top",
  },
});
