import type { Metadata } from "next";
import { MapsClient } from "./MapsClient";

export const metadata: Metadata = {
  title: "Maps — FlyBit AeroGrid Pro",
  description: "Plan a drone show layout on the map: formation grid, barricades, operator station and a mission PDF.",
};

/** AeroGrid Pro, the show-layout planner. It fills the whole window and opens
 *  in its own tab, so the desk's sidebar is left out here (see AppShell). */
export default function Page() {
  return <MapsClient />;
}
