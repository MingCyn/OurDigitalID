import { Stack } from "expo-router";

export default function GISLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="gis" />
    </Stack>
  );
}
