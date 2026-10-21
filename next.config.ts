import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its font metrics from loose .afm files; without this Vercel
  // leaves them out and the sales PDF (Statistics → Export) falls over.
  outputFileTracingIncludes: {
    "/statistics/pdf": ["./node_modules/pdfkit/js/data/*.afm"],
  },
};

export default nextConfig;
