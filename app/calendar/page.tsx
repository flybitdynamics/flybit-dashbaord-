import { CalendarView } from "../components/calendar/CalendarView";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Calendar — FlyBit" };

export default function CalendarPage() {
  return <RequireAccess module="calendar">
      <CalendarView />
    </RequireAccess>;
}
