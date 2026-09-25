import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/auth-context";
import { colors } from "@/theme/tokens";

export default function AuthCallback() {
  const { session, loading } = useAuth();
  if (session) return <Redirect href="/(app)" />;
  if (!loading) return <Redirect href="/(auth)" />;
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={colors.tint} />
    </View>
  );
}
