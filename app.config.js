const baseConfig = require('./app.json').expo;

const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

function iosUrlSchemeFromClientId(clientId) {
  const cleaned = clientId.trim();
  if (!cleaned.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must end in ${GOOGLE_CLIENT_ID_SUFFIX}.`,
    );
  }

  const identifier = cleaned.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length);
  return `com.googleusercontent.apps.${identifier}`;
}

module.exports = () => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const plugins = [...(baseConfig.plugins ?? []), 'expo-localization'];

  // Android uses the explicit web client ID at runtime and does not need the
  // Google Services Gradle plugin. iOS additionally needs its reversed client
  // ID registered as a URL scheme, which this plugin adds when the ID exists.
  if (iosClientId) {
    plugins.push([
      'react-native-nitro-google-signin',
      { iosUrlScheme: iosUrlSchemeFromClientId(iosClientId) },
    ]);
  }

  return {
    ...baseConfig,
    plugins,
  };
};
