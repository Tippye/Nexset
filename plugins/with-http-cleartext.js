const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Allow Android to reach self-hosted WebDAV servers over HTTP.
 * Runtime URL validation restricts cleartext requests to local-network hosts.
 */
module.exports = function withHttpCleartext(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      androidConfig.modResults,
    );
    application.$['android:usesCleartextTraffic'] = 'true';
    return androidConfig;
  });
};
