// electron-builder configuration. A script rather than YAML so that signing
// follows the available credentials: release builds without secrets are
// unsigned (ad-hoc on macOS, which Apple Silicon requires to run at all),
// and adding the secrets in CI switches on real signing and notarization.

/** Set by CI from repository secrets; see the README's "Signing" section. */
const hasMacCertificate = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const canNotarize = Boolean(process.env.APPLE_TEAM_ID && ((process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD) || process.env.APPLE_API_KEY));

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "org.beeblio.desktop",
  productName: "Beeblio",
  copyright: "Beeblio contributors",
  directories: { output: "release", buildResources: "build-resources" },
  // The main process is bundled (scripts/build.mjs), so it needs nothing from node_modules.
  files: ["dist/**", "static/**", "package.json", "!**/*.map"],
  // Spawned as separate processes and full of native modules, so kept outside the asar archive.
  extraResources: [{ from: "build/bundle", to: "bundle" }],
  // The servers run on the bundled Node.js, so Electron itself never needs to act as Node.
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  mac: {
    // Apple Silicon only: the bundled Node.js and native modules are built for the Mac that builds the app.
    target: [{ target: "dmg", arch: ["arm64"] }],
    minimumSystemVersion: "12.0",
    category: "public.app-category.productivity",
    // "-" signs ad hoc; null would leave the app unsigned, which Apple Silicon refuses to open.
    identity: hasMacCertificate ? undefined : "-",
    // The hardened runtime needs a real certificate; with an ad-hoc signature it blocks loading Electron's own frameworks.
    hardenedRuntime: hasMacCertificate,
    entitlements: "build-resources/entitlements.mac.plist",
    entitlementsInherit: "build-resources/entitlements.mac.plist",
    notarize: hasMacCertificate && canNotarize,
  },
  dmg: { writeUpdateInfo: false },
  win: { target: [{ target: "nsis", arch: ["x64"] }] },
  // Per-user install: no administrator rights needed, and data stays in %APPDATA%.
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false },
  // Not released; lets the packaged app be tested on Linux, as CI and contributors' containers are.
  linux: { target: ["dir"], category: "Office" },
};
