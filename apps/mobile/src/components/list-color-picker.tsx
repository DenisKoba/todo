import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeIcon } from "@/components/native-icon";
import { t } from "@/i18n";
import {
  getListColor,
  LIST_COLORS,
  type ListColorKey,
} from "@/theme/list-colors";

export function ListColorPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ListColorKey;
  onChange: (value: ListColorKey) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{t("listColor")}</Text>
      <View style={styles.swatches}>
        {LIST_COLORS.map((color) => {
          const selected = value === color.key;
          return (
            <Pressable
              key={color.key}
              accessibilityRole="radio"
              accessibilityLabel={t(color.labelKey)}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(color.key)}
              style={[styles.outline, selected && styles.selectedOutline]}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: getListColor(color.key).base },
                ]}
              >
                {selected ? (
                  <NativeIcon name="check" size={21} color="#222222" />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 22, marginBottom: 28 },
  label: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 14,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  outline: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedOutline: { borderColor: "#111111" },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
