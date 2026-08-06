/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Secrets are read only in server code (route handlers / server components).
  // Nothing sensitive is exposed to the client bundle.

  webpack: (config) => {
    // webpack hashes module content with a WebAssembly xxhash64 by default. On
    // Node 24 that wasm memory can grow mid-build, detaching the typed-array
    // view webpack cached, and every build dies with
    //   TypeError: Cannot read properties of undefined (reading 'length')
    //     at WasmHash._updateWithBuffer
    // Node's own sha256 keeps no such state. It costs a few hundred ms on a
    // project this size and makes the build independent of the host's Node.
    config.output.hashFunction = "sha256";
    return config;
  },
};

export default nextConfig;
