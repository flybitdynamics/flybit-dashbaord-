import { initializeApp } from "firebase/app";
import { getFirestore, doc, writeBatch, getDoc } from "firebase/firestore";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = getFirestore(initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
}));

const P = "ZZTEST-";
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const TEST_PLACE = "gujarat__zztestville__alkapuri";

if (process.argv[2] === "clean") {
  const b = writeBatch(db);
  for (const [c, ids] of Object.entries({
    pilots: ["p1", "p2"], clients: ["c1"], shows: ["s1", "s2"],
  })) ids.forEach((id) => b.delete(doc(db, c, P + id)));
  b.delete(doc(db, "places", TEST_PLACE));
  await b.commit();
  console.log("test rows removed");
  process.exit(0);
}

const b = writeBatch(db);
b.set(doc(db, "pilots", P + "p1"), {
  name: "ZZ Test Pilot Valid", phone: "90000 00001", email: "valid@test.local",
  rpcNumber: "DGCA-RPC-TEST01", rpcValidUntil: iso(400), qualification: "Senior Pilot",
  status: "active", notes: "",
});
b.set(doc(db, "pilots", P + "p2"), {
  name: "ZZ Test Pilot Expiring", phone: "90000 00002", email: "",
  rpcNumber: "DGCA-RPC-TEST02", rpcValidUntil: iso(10), qualification: "Pilot",
  status: "active", notes: "",
});
b.set(doc(db, "clients", P + "c1"), {
  name: "ZZ Test Agency", type: "b2b", contactName: "Test Contact", contactPhone: "90000 00009",
  email: "agency@test.local", gstin: "", state: "Gujarat", city: "ZZTestville", address: "", notes: "",
});
b.set(doc(db, "shows", P + "s1"), {
  showStatus: "inquiry", clientId: P + "c1", client: "ZZ Test Agency",
  contactName: "Test Contact", contactPhone: "90000 00009", pilotIds: [P + "p1"],
  state: "Gujarat", location: "ZZTestville", area: "Alkapuri", venueAddress: "Test Ground, ZZTestville",
  coordinates: "22.300000, 73.180000", zone: "yellow", bookingDate: iso(0), showDate: iso(12),
  showStartTime: "20:00", showEndTime: "21:00", droneCount: 200, showAmount: 250000,
  commission: 15000, permission: "na", notes: "seeded by tmp-seed-flow",
});
b.set(doc(db, "shows", P + "s2"), {
  showStatus: "confirmed", clientId: P + "c1", client: "ZZ Test Agency",
  contactName: "Test Contact", contactPhone: "90000 00009", pilotIds: [P + "p2"],
  state: "Gujarat", location: "ZZTestville", area: "Alkapuri", venueAddress: "Test Ground, ZZTestville",
  coordinates: "22.300000, 73.180000", zone: "red", bookingDate: iso(-3), showDate: iso(20),
  showStartTime: "20:30", showEndTime: "21:30", droneCount: 300, showAmount: 400000,
  commission: 0, permission: "applied", notes: "seeded by tmp-seed-flow",
});
b.set(doc(db, "places", TEST_PLACE), { state: "Gujarat", city: "ZZTestville", area: "Alkapuri" });
await b.commit();

const real = await getDoc(doc(db, "shows", "a2c4e0f3-placeholder"));
void real;
console.log("test rows written: 2 pilots, 1 B2B client, 2 shows (inquiry + confirmed), 1 place");
process.exit(0);
