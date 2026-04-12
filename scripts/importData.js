const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const stations = require("./stations.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function importMasterList() {
  const batch = db.batch();

  stations.forEach((station) => {
    // Generate a clean ID (e.g., "Sg. Klang di Tmn Sri Muda 1" -> "sg_klang_di_tmn_sri_muda_1")
    const docId = station.station_name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_") // replaces spaces and special chars with underscores
      .replace(/_+/g, "_"); // removes double underscores

    const docRef = db.collection("flood_stations").doc(docId);

    batch.set(docRef, {
      station_name: station.station_name,
      district: station.district,
      state: station.state,
      status: station.status,
      // Store as a GeoPoint for Firebase Map queries
      location: new admin.firestore.GeoPoint(
        station.latitude,
        station.longitude,
      ),
      water_level: 0, // Default starting value
      trend: "Steady", // Default starting value
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  try {
    await batch.commit();
    console.log(
      `✅ Success! ${stations.length} stations imported to 'flood_stations'.`,
    );
  } catch (error) {
    console.error("❌ Error importing data: ", error);
  }
}

importMasterList();
