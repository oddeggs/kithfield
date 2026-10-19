// Metro loads this file with Node's CommonJS loader, so it uses require and module.exports.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, see above */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * The web build only: modules with no browser side resolve to the app's stand-ins in `src/web/`,
 * which offer the same calls. The phone never sees these.
 */
const WEB_MODULES = {
  'expo-secure-store': 'secure-store.ts',
  '@livekit/react-native': 'livekit-react-native.tsx',
  'expo-file-system': 'expo-file-system.ts',
  'expo-file-system/legacy': 'expo-file-system-legacy.ts',
  '@react-native-documents/viewer': 'documents-viewer.ts',
};
const shim = (file) => path.resolve(__dirname, 'src/web/shims', file);

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && Object.hasOwn(WEB_MODULES, moduleName)) {
    return { type: 'sourceFile', filePath: shim(WEB_MODULES[moduleName]) };
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
