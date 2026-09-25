import { useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { TodoItem } from "@/api/client";
import { NativeIcon } from "@/components/native-icon";
import { colors, spacing } from "@/theme/tokens";
import { t } from "@/i18n";

type Props = {
  item: TodoItem;
  selected: boolean;
  selectionMode: boolean;
  onToggleComplete: () => void;
  onToggleSelection: () => void;
  onDelete: () => void;
};

export function TaskRow({
  item,
  selected,
  selectionMode,
  onToggleComplete,
  onToggleSelection,
  onDelete,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !selectionMode &&
          gesture.dx > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderMove: (_event, gesture) =>
          translateX.setValue(Math.min(105, Math.max(0, gesture.dx))),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > 88) onDelete();
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 22,
            bounciness: 4,
          }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start(),
      }),
    [onDelete, selectionMode, translateX],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.deleteBackground}>
        <NativeIcon name="delete" size={20} />
        <Text style={styles.deleteLabel}>{t("deleteAction")}</Text>
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={selectionMode ? onToggleSelection : onToggleComplete}
          onLongPress={onToggleSelection}
          delayLongPress={350}
          style={styles.row}
        >
          <View style={styles.checkbox}>
            {selectionMode ? (
              <View
                style={[
                  styles.selectionCircle,
                  selected && styles.selectionCircleActive,
                ]}
              >
                {selected ? <Text style={styles.tick}>✓</Text> : null}
              </View>
            ) : (
              <NativeIcon
                name={item.completed ? "check" : "circle"}
                size={24}
              />
            )}
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, item.completed && styles.completed]}>
              {item.title}
            </Text>
            {item.comment ? (
              <Text style={styles.comment}>{item.comment}</Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", overflow: "hidden" },
  deleteBackground: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 90,
    borderRadius: 10,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FCE9EA",
  },
  deleteLabel: { fontSize: 11, color: colors.destructive, fontWeight: "700" },
  row: {
    minHeight: 68,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  checkbox: { width: 27, alignItems: "center", justifyContent: "center" },
  selectionCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderColor: colors.secondaryText,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionCircleActive: {
    backgroundColor: colors.tint,
    borderColor: colors.tint,
  },
  tick: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 17,
  },
  copy: { flex: 1 },
  title: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  completed: {
    color: colors.secondaryText,
    textDecorationLine: "line-through",
  },
  comment: {
    color: colors.secondaryText,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
});
