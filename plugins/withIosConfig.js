// Config plugin that durably captures the manual edits previously made to
// ios/DareVocem/Info.plist by hand. Without this plugin, `expo prebuild --clean`
// regenerates Info.plist from app.json + plugins only, dropping:
//   - The `fun.zkhowes.darevocem` URL scheme (Google/Apple Sign-In reverse-DNS)
//   - UIBackgroundModes: ["audio"] (ElevenLabs voice playback)
//   - LSMinimumSystemVersion 12.0
//   - UIRequiresFullScreen false
//   - NSAppTransportSecurity tightening (no arbitrary loads, allow local net)
//
// Run order is `app.json plugins` order, so this should be registered AFTER
// any plugin that creates the CFBundleURLTypes array (currently none — Expo
// Router creates it via the `scheme` field). The merge below tolerates either
// case: pre-existing types are preserved; we append our scheme block.

const { withInfoPlist } = require('expo/config-plugins');

const REVERSE_DNS_SCHEME = 'fun.zkhowes.darevocem';

function withInfoPlistPatches(config) {
  return withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults;

    // --- URL scheme: add fun.zkhowes.darevocem if not already present ---
    plist.CFBundleURLTypes = plist.CFBundleURLTypes ?? [];
    const hasReverseDns = plist.CFBundleURLTypes.some((entry) =>
      Array.isArray(entry.CFBundleURLSchemes) &&
      entry.CFBundleURLSchemes.includes(REVERSE_DNS_SCHEME),
    );
    if (!hasReverseDns) {
      // Merge into the first existing URL type block if present (Expo writes
      // the scheme=darevocem block first), otherwise append.
      const firstBlock = plist.CFBundleURLTypes[0];
      if (firstBlock && Array.isArray(firstBlock.CFBundleURLSchemes)) {
        firstBlock.CFBundleURLSchemes.push(REVERSE_DNS_SCHEME);
      } else {
        plist.CFBundleURLTypes.unshift({ CFBundleURLSchemes: [REVERSE_DNS_SCHEME] });
      }
    }

    // --- Background audio (ElevenLabs voice playback) ---
    const bg = new Set(plist.UIBackgroundModes ?? []);
    bg.add('audio');
    plist.UIBackgroundModes = Array.from(bg);

    // --- Minimum iOS version override ---
    plist.LSMinimumSystemVersion = '12.0';

    // --- Allow rotation: requires UIRequiresFullScreen false ---
    plist.UIRequiresFullScreen = false;

    // --- App Transport Security: no arbitrary loads, allow local networking
    //     (Expo dev launcher needs the local-network exception). ---
    plist.NSAppTransportSecurity = {
      ...(plist.NSAppTransportSecurity ?? {}),
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
    };

    return cfg;
  });
}

module.exports = withInfoPlistPatches;
