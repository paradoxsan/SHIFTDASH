/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Secrets are read only in server code (route handlers / server components).
  // Nothing sensitive is exposed to the client bundle.

  webpack: (config) => {
    // webpack hashes module content with a WebAssembly xxhash64 by default. On
    // Node 23+ that wasm memory can grow mid-build, detaching the typed-array
    // view webpack cached, and the build dies with
    //   TypeError: Cannot read properties of undefined (reading 'length')
    //     at WasmHash._updateWithBuffer
    // Node's own sha256 keeps no such state — but webpack's filesystem cache
    // stores entries hashed the wasm way, so mixing the two makes every
    // INCREMENTAL build fail with a different error ("data argument must be of
    // type string… Received undefined") until .next is deleted. The two changes
    // only make sense together, and only where they are needed: CI, Railway and
    // Vercel all build on the Node 22 pinned in engines/.nvmrc, and keep the
    // fast cached path untouched.
    if (Number(process.versions.node.split(".")[0]) >= 23) {
      config.output.hashFunction = "sha256";
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
