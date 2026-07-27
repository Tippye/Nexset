// expo-sqlite web support needs the wasm asset and cross-origin isolation headers.
// https://docs.expo.dev/versions/latest/sdk/sqlite/#web-setup
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

config.server = config.server || {};
const prevEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const wrapped = prevEnhance ? prevEnhance(middleware, server) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    return wrapped(req, res, next);
  };
};

module.exports = config;
