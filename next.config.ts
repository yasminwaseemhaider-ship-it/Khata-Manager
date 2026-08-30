import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * The client router cache kept nothing by default (`dynamic` is 0s since
     * Next 15), so returning to a tab you were just on replayed the entire
     * server render. Thirty seconds is long enough to make flicking between
     * tabs feel instant and short enough that figures never look stale — and
     * every mutation calls revalidatePath, which clears this cache anyway.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    /**
     * Both are barrel packages: importing three icons used to pull the whole
     * module graph into the bundle.
     */
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;
