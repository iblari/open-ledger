/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // One address for search engines: www.voteunbiased.org used to serve the
  // same site, so Google indexed both and split them. Send www to the apex.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.voteunbiased.org" }],
        destination: "https://voteunbiased.org/:path*",
        permanent: true,
      },
    ];
  },
}

export default nextConfig
