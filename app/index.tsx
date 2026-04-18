import { useAppContext } from "@/context/AppContext";
import { auth, db } from "@/services/firebase";
import { fetchUserDocuments } from "@/services/documentService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

const ONBOARDING_COMPLETE_KEY = "onboarding_complete";

export default function Index() {
  const { setUserProfile, setSavedDocuments } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    // Check onboarding status from AsyncStorage
    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then((value) => {
      setOnboardingDone(value === "true");
    }).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const profileDoc = await getDoc(doc(db, "users", user.uid));
          if (profileDoc.exists()) {
            const data = profileDoc.data();
            setUserProfile({
              uid: user.uid,
              email: data.email || user.email || "",
              fullName: data.fullName || "",
              icNumber: data.icNumber || "",
              address: data.address || "",
              mykadPhotoUrl: data.mykadPhotoUrl || "",
            });
          }
          // Load saved documents
          try {
            const docs = await fetchUserDocuments(user.uid);
            setSavedDocuments(docs);
          } catch (docErr) {
            console.warn("[index] Failed to load documents:", docErr);
          }
        } catch (err) {
          console.warn("[index] Failed to load profile:", err);
        }
        setLoggedIn(true);
      } else {
        setLoggedIn(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (loggedIn) {
    return <Redirect href="/home/Home" />;
  }

  // First-time user → full onboarding; returning user → straight to login/showcase
  return onboardingDone ? (
    <Redirect href="/onboarding/showcase" />
  ) : (
    <Redirect href="/onboarding/language" />
  );
}
