/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Secrets are read only in server code (route handlers / server components).
  // Nothing sensitive is exposed to the client bundle.
};

export default nextConfig;
