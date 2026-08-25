# Responsive Store Distribution Policy

Khushu supports phones, foldables, tablets, Chromebooks, and iPads with a
responsive, portrait, single-column layout. Content grows moderately with the
available width and remains centered inside readable width caps on larger
screens. Do not add screen-size filters or an in-app device-type block.

The repository-side policy is:

- `ios.supportsTablet` is `true` in `app.json`, enabling native iPad support.
- Android declares no `<supports-screens>` or `<compatible-screens>` filter, so
  Google Play can distribute it to all compatible Android devices.
- Web builds may be used locally, but `dist/` and `web-build/` are ignored and
  must not be deployed as a public production site.

## App Store Connect: iPad and other Apple platforms

These controls require the Account Holder, Admin, or App Manager role.

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com/).
2. Open **Apps**, then select **Khushu**.
3. In the sidebar, open **Pricing and Availability** (under **Monetization** if
   App Store Connect displays section headings).
4. Scroll to **iPhone and iPad Apps on Apple Silicon Mac**.
5. Clear **Make this app available** / **Make this app available on Mac**.
6. Click **Save** in the top-right corner.
7. On the same page, find **iPhone and iPad Apps on Apple Vision Pro**.
8. Clear **Make this app available on Apple Vision Pro** and click **Save**.

Because Khushu runs natively on iPad, App Store Connect requires iPad screenshots.
Upload at least one compliant portrait screenshot for the 13-inch iPad display
class before submission. Keep the app portrait-only unless the product explicitly
adopts a landscape layout in a later release.

Repeat the Mac and Vision Pro availability check before the first public release
and after any transfer, new platform addition, or major App Store Connect change.

## Google Play: keep all compatible devices available

Play Console does not provide an app-wide exclusion rule for the Tablet or PC
form-factor filters. **Manage devices** applies only to the selected models, and
the available automatic rules target RAM, system-on-chip, or Android Go. Do not
attempt to maintain thousands of per-model exclusions.

Google Play determines device eligibility primarily from the uploaded Android
manifest. The solid, future-facing way to restrict distribution by screen class
is a `<compatible-screens>` allowlist containing every density for only the
`small` and `normal` screen classes. Google Play then hides the app from every
unlisted `large` and `xlarge` screen configuration, including future models.

This filter cannot preserve every device marketed as a phone. For example, Play
Console currently classifies the Google Pixel Fold family as **Tablet**, while a
large slab phone such as the Galaxy S25 Ultra is a phone configuration. A strict
small/normal allowlist therefore keeps conventional large phones but can exclude
foldables and other phone/tablet hybrids.

The selected policy is to leave Android screen configurations unrestricted.
Phones, foldables, tablets, and Chromebooks can therefore discover and install
Khushu when they satisfy its other Android compatibility requirements. Do not
manually exclude models in the device catalogue.

Do not use fake touchscreen, telephony, GPS, RAM, or system-on-chip requirements
to approximate a phone. They either retain some tablets or exclude legitimate
phones, and hardware requirements should reflect actual app functionality.

## Laptop and web checks

- Do not opt in to a separate desktop, ChromeOS, or Google Play Games on PC
  release if Play Console offers one in **Setup** -> **Advanced settings** ->
  **Form factors**.
- Do not add a macOS platform to the Khushu App Store Connect record.
- Do not run a production web deployment from `dist/` or `web-build/` and do not
  add a hosting provider or public web URL for the application bundle.
- Privacy-policy, terms, support, and marketing pages may remain public; they are
  not the application itself.

## Release verification

Before each production release:

- Install from TestFlight on a small and large iPhone and on a supported iPad.
- Upload and verify at least one 13-inch portrait iPad screenshot in App Store Connect.
- Install from a Play test track on a small Android phone, a large Android phone,
  and any phone/foldable intended to remain supported.
- Confirm the Mac and Vision Pro checkboxes remain cleared in App Store Connect.
- Confirm the Play supported-device catalogue still includes phones, foldables,
  tablets, and Chromebooks; no screen-class exclusion should appear.
- Confirm no public web application deployment exists.

Store targeting controls affect discovery and installation through the official
stores. They cannot prevent an Android package obtained elsewhere from being
sideloaded, and previously installed apps can remain usable after a store
availability change.

## Official references

- [Apple: manage iPhone and iPad app availability on Apple silicon Macs](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-macs-with-apple-silicon)
- [Apple: manage availability on Apple Vision Pro](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-apple-vision-pro/)
- [Apple: screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [Google: view and restrict compatible devices](https://support.google.com/googleplay/android-developer/answer/7353455)
- [Google: export the supported-device catalog](https://support.google.com/googleplay/android-developer/answer/9859371)
- [Android: compatible screen manifest filtering](https://developer.android.com/guide/topics/manifest/compatible-screens-element)
