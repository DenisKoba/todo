import { Host, Icon } from "@expo/ui";

export type NativeIconName =
  "add" | "check" | "delete" | "person" | "share" | "circle";

const icons = {
  add: Icon.select({
    ios: "plus",
    android: import("@expo/material-symbols/add.xml"),
  }),
  check: Icon.select({
    ios: "checkmark.circle.fill",
    android: import("@expo/material-symbols/check_circle.xml"),
  }),
  delete: Icon.select({
    ios: "trash",
    android: import("@expo/material-symbols/delete.xml"),
  }),
  person: Icon.select({
    ios: "person.crop.circle.fill",
    android: import("@expo/material-symbols/person.xml"),
  }),
  share: Icon.select({
    ios: "square.and.arrow.up",
    android: import("@expo/material-symbols/ios_share.xml"),
  }),
  circle: Icon.select({
    ios: "circle",
    android: import("@expo/material-symbols/radio_button_unchecked.xml"),
  }),
} satisfies Record<NativeIconName, ReturnType<typeof Icon.select>>;

export function NativeIcon({
  name,
  size = 22,
  color,
}: {
  name: NativeIconName;
  size?: number;
  color?: string;
}) {
  return (
    <Host style={{ width: size, height: size }} pointerEvents="none">
      <Icon
        name={icons[name]}
        size={size}
        color={color}
        accessibilityLabel={name}
      />
    </Host>
  );
}
