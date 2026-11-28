import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The zone-check map image reads its caption font from disk at run time,
     so the font has to travel with that route when it is deployed. */
  outputFileTracingIncludes: {
    "/api/zone-check/image": ["./assets/fonts/**/*"],
    /* The permission zip reads its Word templates and the certificate PDFs
       (templates/attachments) from disk too. */
    "/api/permission-docs": ["./templates/*.docx", "./templates/pdf/**/*", "./templates/attachments/**/*"],
  },
};

export default nextConfig;
