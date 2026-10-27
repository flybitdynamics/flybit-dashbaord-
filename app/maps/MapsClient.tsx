"use client";

import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import "./aerogrid/index.css";
import "./aerogrid-base.css";

/* Leaflet reaches for `window` as soon as it is imported, so the planner
   only ever loads in the browser. */
const AeroGrid = dynamic(() => import("./aerogrid/App.jsx"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center text-sm text-neutral-500">Loading maps…</div>
  ),
});

export function MapsClient() {
  return (
    <>
      {/* The planner's own typefaces. React places these in the document head. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- these fonts are for this page alone */}
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap"
      />
      {/* Its stylesheet sizes everything from #root, as in the original app. */}
      <div id="root" className="h-screen w-screen">
        <AeroGrid />
      </div>
    </>
  );
}
