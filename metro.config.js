const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Workaround: pretty-format's exports map doesn't expose internal plugins,
// causing Metro to fail resolving ./plugins/Immutable etc.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
