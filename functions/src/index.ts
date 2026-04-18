import axios from "axios";
import * as admin from "firebase-admin";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCallGenkit } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as nodemailer from "nodemailer";
import { handleDocument } from "./agents/document.js";
import { handleGeneral } from "./agents/general.js";
import { routeIntent } from "./agents/router.js";
import { ai } from "./genkit.js";
import { sendPushToAllUsers, sendPushToUser } from "./notifications.js";
import { ChatInputSchema, ChatOutputSchema } from "./schemas.js";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// ── Chat Cloud Function (router-based multi-agent) ──

const chatFlow = ai.defineFlow(
  {
    name: "chat",
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async (input) => {
    const intent = await routeIntent(input);

    if (intent === "document") {
      return handleDocument(input);
    }
    return handleGeneral(input);
  },
);

export const chat = onCallGenkit(
  {
    region: "asia-southeast1",
    authPolicy: () => true,
  },
  chatFlow,
);

// ── OTP Email Cloud Function ──

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

export const sendOtpOnCreate = onDocumentCreated(
  {
    document: "users/{docId}",
    secrets: ["GMAIL_PASS"],
  },
  async (event) => {
    const data = event.data?.data();
    const email = data?.email;

    if (!email) {
      console.log("No email found in document, skipping.");
      return;
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    await event.data?.ref.update({
      otp: otpCode,
      otpCreatedAt: new Date(),
    });

    const mailOptions = {
      from: `"OurDigitalID" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "Your Verification Code",
      text: `Your 6-digit verification code is: ${otpCode}`,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`OTP ${otpCode} successfully sent to ${email}`);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  },
);

// ── Flood Data Scraper Cloud Function ──

async function scrapeData() {
  // Use the main landing page or the specific state page as the target
  // We use the main landing page URL which is more stable
  const url = "https://publicinfobanjir.water.gov.my/view/state?stateid=ALL";

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://publicinfobanjir.water.gov.my/",
      },
    });
    // If the PHP endpoint continues to 404, we must parse the HTML table from this URL
    return response.data;
  } catch (error) {
    console.error(
      "Scraper 404 Error: The website blocked the direct data request.",
    );
    throw error;
  }
}

export const updateFloodData = onSchedule(
  { schedule: "*/15 * * * *", region: "asia-southeast1" },
  async () => {
    const db = admin.firestore();
    const data = await scrapeData();

    const dangerStations: string[] = [];
    const batch = db.batch();

    data.forEach((station: any) => {
      const stationId = station.station_name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");
      const docRef = db.collection("flood_stations").doc(stationId);
      const lat = parseFloat(station.lat);
      const lng = parseFloat(station.lng);

      const status = (station.status ?? "").toUpperCase();
      if (status === "DANGER" || status === "WARNING") {
        dangerStations.push(station.station_name);
      }

      batch.set(
        docRef,
        {
          station_name: station.station_name,
          status: station.status,
          location: new admin.firestore.GeoPoint(lat, lng),
          last_updated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    await batch.commit();

    // Send flood alert push notification if danger stations found
    if (dangerStations.length > 0) {
      const stationList = dangerStations.slice(0, 3).join(", ");
      const suffix = dangerStations.length > 3 ? ` and ${dangerStations.length - 3} more` : "";
      await sendPushToAllUsers({
        title: "Flood Alert",
        body: `Danger/Warning level at: ${stationList}${suffix}. Stay safe.`,
        data: { type: "flood", screen: "/gis/gis" },
      });
    }
  },
);

// ── Disaster Alerts (Earthquake + Severe Weather) ──

export const checkDisasterAlerts = onSchedule(
  { schedule: "*/15 * * * *", region: "asia-southeast1" },
  async () => {
    // --- Earthquake monitoring via USGS ---
    try {
      const usgsUrl =
        "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson" +
        "&minlatitude=1&maxlatitude=7&minlongitude=99&maxlongitude=119" +
        "&minmagnitude=4&orderby=time&limit=5" +
        `&starttime=${new Date(Date.now() - 15 * 60_000).toISOString()}`;

      const resp = await axios.get(usgsUrl);
      const features = resp.data?.features ?? [];

      for (const quake of features) {
        const props = quake.properties;
        const mag = props.mag;
        const place = props.place ?? "SEA region";

        await sendPushToAllUsers({
          title: `Earthquake Alert (M${mag})`,
          body: `Magnitude ${mag} earthquake detected near ${place}. Take precautions.`,
          data: { type: "earthquake", screen: "/gis/gis" },
        });
      }
    } catch (err) {
      console.error("Failed to fetch earthquake data:", err);
    }

    // --- Severe weather via Open-Meteo ---
    try {
      // Check Kuala Lumpur area for severe weather
      const weatherUrl =
        "https://api.open-meteo.com/v1/forecast?latitude=3.14&longitude=101.69" +
        "&current=weather_code,wind_speed_10m&timezone=Asia/Kuala_Lumpur";

      const resp = await axios.get(weatherUrl);
      const current = resp.data?.current;

      if (current) {
        const weatherCode = current.weather_code;
        const windSpeed = current.wind_speed_10m;

        // WMO weather codes: 95-99 = thunderstorm, 65-67 = heavy rain, 75-77 = heavy snow
        const isSevere =
          weatherCode >= 95 ||
          (weatherCode >= 65 && weatherCode <= 67) ||
          windSpeed > 80;

        if (isSevere) {
          await sendPushToAllUsers({
            title: "Severe Weather Warning",
            body: "Severe weather conditions detected in your area. Stay indoors and stay safe.",
            data: { type: "weather", screen: "/gis/gis" },
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch weather data:", err);
    }
  },
);

// ── Queue Status Change Notifications ──

export const onQueueStatusChange = onDocumentUpdated(
  { document: "queue_tickets/{ticketId}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;
    if (before.status === after.status) return;

    const uid = after.uid as string | undefined;
    if (!uid) return;

    let title = "Queue Update";
    let body = `Your queue ticket status changed to: ${after.status}`;

    if (after.status === "next") {
      title = "Your Turn is Next!";
      body = "Please proceed to the counter. Your number will be called shortly.";
    } else if (after.status === "completed") {
      title = "Queue Complete";
      body = "Your queue session has been completed. Thank you for your patience.";
    } else if (after.status === "serving") {
      title = "Now Serving You";
      body = `You are now being served at counter ${after.counter ?? ""}.`.trim();
    }

    await sendPushToUser(uid, {
      title,
      body,
      data: { type: "queue", screen: "/service/service-page" },
    });
  },
);

// ── Document Expiry Reminder (runs daily at 9 AM MYT) ──

export const checkDocumentExpiry = onSchedule(
  { schedule: "0 1 * * *", region: "asia-southeast1" }, // 1:00 UTC = 9:00 MYT
  async () => {
    const db = admin.firestore();
    const usersSnap = await db.collection("users").get();
    const now = Date.now();

    const THRESHOLDS_DAYS = [30, 7, 1];

    for (const userDoc of usersSnap.docs) {
      const docsSnap = await userDoc.ref.collection("documents").get();

      for (const docSnap of docsSnap.docs) {
        const data = docSnap.data();
        const expiryDate = data.expiryDate as string | undefined;
        if (!expiryDate) continue;

        const expiryMs = new Date(expiryDate).getTime();
        const daysUntilExpiry = Math.floor((expiryMs - now) / 86_400_000);

        if (THRESHOLDS_DAYS.includes(daysUntilExpiry)) {
          const docName = (data.name as string) ?? "document";
          const urgency =
            daysUntilExpiry === 1
              ? "expires TOMORROW"
              : `expires in ${daysUntilExpiry} days`;

          await sendPushToUser(userDoc.id, {
            title: "Document Expiry Reminder",
            body: `Your ${docName} ${urgency}. Renew it soon to avoid issues.`,
            data: { type: "document", screen: "/profile/profile" },
          });
        }
      }
    }
  },
);
