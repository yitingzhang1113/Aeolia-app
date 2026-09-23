import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors as c } from "./theme";
import { mediaSource } from "./api";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  size = 22,
  color = c.teal,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconButton,
        { opacity: disabled ? 0.35 : pressed ? 0.55 : 1 },
      ]}
    >
      <Icon name={name} />
    </Pressable>
  );
}
const outfitOrder = ["teal", "apricot", "sage", "navy"];
// Four equal columns in the source atlas. Crop at render time so one asset serves
// both full-body illustrations and round head-and-shoulders avatars.
export function Avatar({
  outfit = "teal",
  size = 52,
  uri,
}: {
  outfit?: string;
  size?: number;
  uri?: string | null;
}) {
  const column = Math.max(0, outfitOrder.indexOf(outfit));
  return (
    <View
      accessibilityLabel={`${outfit} agent avatar`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: c.soft,
      }}
    >
      <Image
        source={uri ? mediaSource(uri) : require("../assets/agent-outfits.png")}
        style={
          uri
            ? {
                position: "absolute",
                width: size * 2,
                height: size * 3,
                left: -size / 2,
                top: -size * 0.12,
              }
            : {
                position: "absolute",
                width: size * 6.4,
                height: size * 3.2,
                left: -size * (column * 1.6 + 0.3),
                top: -size * 0.03,
              }
        }
        resizeMode="stretch"
      />
    </View>
  );
}
export function AgentArt({
  outfit = "teal",
  uri,
}: {
  outfit?: string;
  uri?: string | null;
}) {
  const [height, setHeight] = React.useState(0);
  const column = Math.max(0, outfitOrder.indexOf(outfit));
  return (
    <View
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={{
        flex: 1,
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        accessibilityLabel={`${outfit} agent outfit`}
        style={{
          height,
          width: height / 2,
          overflow: "hidden",
          maxWidth: "100%",
        }}
      >
        <Image
          source={
            uri ? mediaSource(uri) : require("../assets/agent-outfits.png")
          }
          resizeMode="stretch"
          style={
            uri
              ? { height, width: (height * 2) / 3, left: -height / 12 }
              : {
                  position: "absolute",
                  height,
                  width: height * 2,
                  left: (-column * height) / 2,
                }
          }
        />
      </View>
    </View>
  );
}
export function Brand() {
  return (
    <View style={s.brand}>
      <Image
        source={require("../assets/logo.png")}
        style={{ width: 36, height: 36 }}
      />
      <View>
        <Text style={{ color: c.ink, fontSize: 22, fontWeight: "700" }}>
          Aeolia
        </Text>
        <Text style={{ color: c.muted, fontSize: 11 }}>
          Real people. A brighter you.
        </Text>
      </View>
    </View>
  );
}
export function Pill({
  label,
  onPress,
  active = false,
  icon,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
  icon?: IconName;
}) {
  const content = (
    <>
      {icon && <Icon name={icon} size={15} color={active ? c.white : c.teal} />}
      <Text
        style={{
          color: active ? c.white : c.teal,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        s.pill,
        active && { backgroundColor: c.teal },
        pressed && { opacity: 0.65 },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={s.tag}>{content}</View>
  );
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? c.teal : c.white} />
      ) : (
        icon && (
          <Icon name={icon} color={secondary ? c.teal : c.white} size={17} />
        )
      )}
      <Text
        style={{
          color: secondary ? c.teal : c.white,
          fontWeight: "600",
          fontSize: 13,
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12, marginBottom: 24 }}>
      <View style={s.sectionHeader}>
        <Text style={styles.heading}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}
export function Field(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      accessibilityLabel={props.accessibilityLabel || props.placeholder}
      placeholderTextColor={c.muted}
      {...props}
      style={[styles.field, props.style]}
    />
  );
}
export function Header({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.header}>
      <IconButton name="chevron-back" label="Go back" onPress={onBack} />
      <Text style={[styles.heading, { flex: 1, textAlign: "center" }]}>
        {title}
      </Text>
      {right || <View style={{ width: 44 }} />}
    </View>
  );
}
export function EmptyState({
  icon = "sparkles-outline",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon name={icon} size={27} />
      </View>
      <Text style={styles.heading}>{title}</Text>
      <Text style={[styles.muted, { textAlign: "center" }]}>{body}</Text>
      {action}
    </View>
  );
}
export function Skeleton() {
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={{ gap: 12, paddingVertical: 12 }}
    >
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.card, { gap: 12 }]}>
          <View
            style={{
              height: 16,
              width: "45%",
              backgroundColor: c.line,
              borderRadius: 8,
            }}
          />
          <View
            style={{
              height: 12,
              width: "90%",
              backgroundColor: c.soft,
              borderRadius: 8,
            }}
          />
          <View
            style={{
              height: 12,
              width: "70%",
              backgroundColor: c.soft,
              borderRadius: 8,
            }}
          />
        </View>
      ))}
    </View>
  );
}
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Couldn't load this yet"
      body={message}
      action={<Button label="Try again" onPress={onRetry} secondary />}
    />
  );
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.bg },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  title: { fontSize: 29, fontWeight: "700", color: c.ink },
  heading: { fontSize: 18, fontWeight: "600", color: c.ink },
  text: { color: c.ink, fontSize: 15, lineHeight: 23 },
  muted: { color: c.muted, fontSize: 12, lineHeight: 18 },
  card: {
    backgroundColor: c.white,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  field: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 13,
    padding: 13,
    backgroundColor: c.white,
    color: c.ink,
    fontSize: 15,
    marginBottom: 12,
  },
});
const s = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 5 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: c.mint,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  tag: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: c.mint,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  button: {
    minHeight: 44,
    backgroundColor: c.teal,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 13,
    flexDirection: "row",
    gap: 7,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#90B9BA",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  header: {
    minHeight: 56,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.bg,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 18,
    gap: 12,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.mint,
  },
});
