import SplashScreen from "@/components/SplashScreen/SplashScreen";
import { AppProvider, useAppContext } from "@/context/AppContext";
import "@/services/flood-alerts";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";

// Configure how incoming notifications are displayed when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Inner component that uses AppContext (must be inside AppProvider). */
function RootNavigator() {
  const { addNotification } = useAppContext();
  const router = useRouter();
  const [splashDone, setSplashDone] = useState(false);

  // Listen for incoming notifications → add to AppContext
  useEffect(() => {
    const notifSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const { title, body, data } = notification.request.content;
        addNotification({
          type: (data?.type as any) ?? "system",
          message: body ?? title ?? "",
          userName: (data?.userName as string) ?? undefined,
          screen: (data?.screen as string) ?? undefined,
        });
      },
    );

    // Listen for notification taps → deep-link to relevant screen
    const responseSub =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (data?.screen && typeof data.screen === "string") {
          router.push(data.screen as any);
        }
      });

    return () => {
      notifSub.remove();
      responseSub.remove();
    };
  }, []);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="home" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="service" />
        <Stack.Screen name="chatbot" />
        <Stack.Screen name="gis" />
        <Stack.Screen name="notifications" />
      </Stack>
      {!splashDone && <SplashScreen onFinish={() => setSplashDone(true)} />}
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <RootNavigator />
    </AppProvider>
  );
}
