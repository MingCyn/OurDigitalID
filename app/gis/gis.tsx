import { AppText } from "@/components/common/AppText";
import { useAppContext } from "@/context/AppContext";
import { db } from "@/services/firebase";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";

interface FloodStation {
  id: string;
  station_name: string;
  district: string;
  state: string;
  status: string;
  latitude: number;
  longitude: number;
}

const DEFAULT_REGION: Region = {
  latitude: 4.2105,
  longitude: 101.9758,
  latitudeDelta: 7,
  longitudeDelta: 7,
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const startLatitude = toRadians(first.latitude);
  const endLatitude = toRadians(second.latitude);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2) *
      Math.cos(startLatitude) *
      Math.cos(endLatitude);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function GISMap() {
  const router = useRouter();
  const { colors } = useAppContext();
  const [stations, setStations] = useState<FloodStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState<FloodStation | null>(
    null,
  );

  useEffect(() => {
    const loadStations = async () => {
      try {
        const snapshot = await getDocs(collection(db, "flood_stations"));
        const loadedStations: FloodStation[] = snapshot.docs
          .map((document) => {
            const data = document.data();
            const location = data.location;

            if (
              !location ||
              typeof location.latitude !== "number" ||
              typeof location.longitude !== "number"
            ) {
              return null;
            }

            return {
              id: document.id,
              station_name: data.station_name ?? document.id,
              district: data.district ?? "",
              state: data.state ?? "",
              status: data.status ?? "UNKNOWN",
              latitude: location.latitude,
              longitude: location.longitude,
            };
          })
          .filter((station): station is FloodStation => station !== null);

        setStations(loadedStations);
        setSelectedStation(loadedStations[0] ?? null);
      } catch (error) {
        console.error("Error loading flood stations:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStations();
  }, []);

  const nearbyStations = useMemo(() => {
    if (!selectedStation) {
      return [];
    }

    return stations.filter(
      (station) => distanceKm(selectedStation, station) <= 120,
    );
  }, [selectedStation, stations]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <AppText
            size={18}
            style={{ fontWeight: "700", color: colors.textPrimary }}
          >
            GIS
          </AppText>
          <AppText size={12} style={{ color: colors.textSecondary }}>
            Flood station overview
          </AppText>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View
            style={[
              styles.mapCard,
              { backgroundColor: colors.backgroundGrouped },
            ]}
          >
            <MapView
              style={styles.map}
              initialRegion={
                selectedStation
                  ? {
                      latitude: selectedStation.latitude,
                      longitude: selectedStation.longitude,
                      latitudeDelta: 2.5,
                      longitudeDelta: 2.5,
                    }
                  : DEFAULT_REGION
              }
            >
              {stations.map((station) => (
                <Marker
                  key={station.id}
                  coordinate={{
                    latitude: station.latitude,
                    longitude: station.longitude,
                  }}
                  title={station.station_name}
                  description={`${station.district}, ${station.state}`}
                  pinColor={
                    selectedStation?.id === station.id ? "#FF8A00" : "#1E88E5"
                  }
                  onPress={() => setSelectedStation(station)}
                />
              ))}
            </MapView>
          </View>

          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.backgroundGrouped },
            ]}
          >
            <AppText
              size={16}
              style={{
                fontWeight: "700",
                color: colors.textPrimary,
                marginBottom: 8,
              }}
            >
              Selected Station
            </AppText>
            {selectedStation ? (
              <>
                <AppText
                  size={15}
                  style={{ fontWeight: "600", color: colors.textPrimary }}
                >
                  {selectedStation.station_name}
                </AppText>
                <AppText
                  size={13}
                  style={{ color: colors.textSecondary, marginTop: 4 }}
                >
                  {selectedStation.district}, {selectedStation.state}
                </AppText>
                <AppText
                  size={13}
                  style={{ color: colors.textSecondary, marginTop: 4 }}
                >
                  Status: {selectedStation.status}
                </AppText>
                <AppText
                  size={13}
                  style={{ color: colors.textSecondary, marginTop: 4 }}
                >
                  Lat {selectedStation.latitude.toFixed(4)}, Lng{" "}
                  {selectedStation.longitude.toFixed(4)}
                </AppText>
              </>
            ) : (
              <AppText size={13} style={{ color: colors.textSecondary }}>
                No station available yet.
              </AppText>
            )}
          </View>

          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.backgroundGrouped },
            ]}
          >
            <AppText
              size={16}
              style={{
                fontWeight: "700",
                color: colors.textPrimary,
                marginBottom: 8,
              }}
            >
              Nearby Stations
            </AppText>
            {nearbyStations.length > 0 ? (
              nearbyStations.map((station) => (
                <View key={station.id} style={styles.stationRow}>
                  <AppText
                    size={14}
                    style={{ fontWeight: "600", color: colors.textPrimary }}
                  >
                    {station.station_name}
                  </AppText>
                  <AppText size={12} style={{ color: colors.textSecondary }}>
                    {station.district}, {station.state}
                  </AppText>
                </View>
              ))
            ) : (
              <AppText size={13} style={{ color: colors.textSecondary }}>
                No nearby stations found.
              </AppText>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: "center",
    marginRight: 24,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  mapCard: {
    borderRadius: 20,
    overflow: "hidden",
    height: 320,
    marginBottom: 16,
  },
  map: {
    flex: 1,
  },
  sectionCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  stationRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
});
