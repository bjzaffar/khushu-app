# Native Google Sign-In Setup

Khushu now uses the native Google account picker. The app sends the Google ID
token and a cryptographically bound nonce directly to Supabase; it no longer
opens the Supabase project URL in a browser for Google sign-in.

The application IDs are:

- Android package: `com.khushuai.app`
- iOS bundle ID: `com.khushuai.app`

## 1. Configure the Google consent screen

In the Google Cloud project that owns Khushu's OAuth credentials, open Google
Auth Platform. Set the app name to `Khushu`, add the support/developer email,
upload the Khushu logo, and add the privacy-policy and terms URLs. Only the
standard OpenID, email, and profile scopes are needed.

If the app is in Testing mode, add every tester as a test user. Move it to
Production when the branding and policy information are ready.

## 2. Create the Web OAuth client

Create an OAuth client of type **Web application**. Its client ID ends in
`.apps.googleusercontent.com`. No redirect URI is needed for the native token
exchange.

Copy the client ID (not the client secret) into:

```text
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

This exact web client ID is the token audience used by both mobile platforms.
Do not put the web client secret in the app or in an `EXPO_PUBLIC_` variable.

## 3. Create Android OAuth clients for every signing certificate

Create an OAuth client of type **Android** for each certificate that signs a
Khushu build. Every client uses package name `com.khushuai.app` and one SHA-1:

- Google Play App Signing SHA-1 for closed-test/production Play builds.
- EAS development/preview keystore SHA-1 for directly installed builds.
- A local debug SHA-1 if local `expo run:android` builds are used.

Find the Play SHA-1 in Play Console under **Setup > App integrity > App signing
key certificate**. Find EAS credentials with `eas credentials -p android`, or in
the EAS project's Credentials page.

Android OAuth client IDs are associations between the package and signing
certificate. The app still receives the Web client ID in
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; do not substitute an Android client ID there.

## 4. Enable Google in Supabase

In **Supabase Dashboard > Authentication > Providers > Google**:

1. Enable Google.
2. Put the Web OAuth client ID in **Client IDs**. It must be first if multiple
   IDs are entered.
3. Put the Web OAuth client secret in **Client Secret** in Supabase only.
4. Save the provider.

The secret stays on Supabase and is never bundled into Khushu.

## 5. Add EAS environment variables

Add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to every EAS environment used by Android
(`development`, `preview`, and `production`). For local work, put it in the
gitignored `.env.local` file.

Environment variables are compiled into native builds. Rebuild after adding or
changing a client ID; updating Metro alone does not update an installed build.

## 6. Configure iOS when building it

Create an OAuth client of type **iOS** with bundle ID `com.khushuai.app`, then
add both variables to the iOS EAS environments:

```text
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
```

`app.config.js` automatically converts the iOS client ID into the required
`com.googleusercontent.apps...` URL scheme and applies the native config plugin.
No Firebase configuration files are required by this implementation.

## 7. Build and test

Google sign-in cannot run in Expo Go because it contains native code. Make a new
development build or store build after completing the credentials:

```text
eas build --profile development --platform android
eas build --profile production --platform android
```

Test at least these cases:

1. A new Google user chooses an account and reaches the app.
2. An existing email/password user signs in with Google using the same verified
   email and retains the same Supabase user/data.
3. A guest who starts Premium, signs in with Google, and returns to the paywall.
4. Sign out returns to the app homepage, then another Google account can be
   selected.
5. Canceling the account picker leaves the account screen usable and shows no
   error.
6. A Play closed-test build works with the Play App Signing SHA-1, not merely a
   directly installed development build.

If Android reports a developer/configuration error, the usual cause is a
missing SHA-1 + `com.khushuai.app` Android OAuth client, or placing the Android
client ID in the web-client environment variable.
