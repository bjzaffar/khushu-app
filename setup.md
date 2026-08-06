# Khushu Store and RevenueCat Setup

Use one legal entity consistently across Apple, Google Play, bank, and tax details. If operating personally as a sole trader, use personal details. If the Ltd company will own the app and receive revenue, use the company details and organisation accounts.

## 1. Finish Apple payments setup

In App Store Connect, open **Business**.

1. Select **Add Bank Account**.
   - Add an account owned by the individual or company that accepted the Paid Apps Agreement.
   - The account-holder name must match Apple’s contract and tax details.
2. Select **Add Tax Info** for the US Tax Questionnaire.
   - As a UK individual, answer as a non-US individual and provide truthful tax-residency details.
   - Do not guess where the form asks for a tax ID or treaty claim; use an accountant if needed.
3. Wait for the bank and tax information to be accepted. Continue with the remaining setup while Apple verifies them.

## 2. Create or complete the Apple app record

In **App Store Connect → Apps → + → New App**:

- Platform: iOS
- Name: `Khushu`
- Bundle ID: `com.khushuai.app`
- SKU: `khushu-ios-001`
- Primary language: English (UK)

The widget does not require its own App Store record.

Complete these sections in the app record:

- **App Information:** category, age rating, and content-rights declaration.
- **App Privacy:** declare all data actually collected by the app and services it uses.
- **App Review Information:** contact details and a working reviewer account/login, because Khushu has account-based features.
- **Version 1.0.0:** description, keywords, support URL, public privacy-policy URL, and iPhone screenshots.
- **DSA status:** complete it for the entity and territories used for distribution.

Apple requires this app record before a TestFlight build is uploaded.

## 3. Create Apple subscription products

Open **Apps → Khushu → Monetization → Subscriptions**.

Create a subscription group:

- Internal reference name: `Khushu Premium`
- Customer-facing display name: `Khushu Premium`

Create these auto-renewable subscriptions:

| Plan | Apple product ID | Duration |
| --- | --- | --- |
| Monthly | `com.khushuai.app.premium.monthly` | 1 month |
| Yearly | `com.khushuai.app.premium.yearly` | 1 year |

For each subscription add a reference name, customer-facing display name and description, price, country/region availability, and review screenshot. Add introductory offers or free trials later, after the normal purchase flow works.

Treat product IDs as permanent. The first auto-renewable subscriptions must be submitted with the first app version.

## 4. Create Apple credentials for RevenueCat

In **App Store Connect → Users and Access → Integrations**:

1. Under **In-App Purchase**, generate an In-App Purchase Key.
2. Download the `.p8` file immediately and save it securely; Apple allows only one download.
3. Copy its Key ID and Issuer ID.
4. Under **Khushu → App Information**, generate the app-specific shared secret if RevenueCat requests it.
5. Under **App Store Connect API**, create an API key with at least App Manager access. Save its `.p8` file, Key ID, and Issuer ID. RevenueCat can use this to import products and prices.

Never commit `.p8` files or any Apple secret to the repository.

## 5. Set up Google Play payments and subscriptions

In Play Console:

1. Go to **Monetize with Play → Payments profile**.
2. Create or complete the merchant payments profile using the same legal entity as the Play developer account.
3. Add and verify the payout method when prompted.

Then go to **Monetize with Play → Products → Subscriptions**.

Create one subscription:

- Subscription ID: `khushu_premium`

Add and activate these auto-renewing base plans:

| Base plan ID | Billing period |
| --- | --- |
| `monthly` | Monthly |
| `yearly` | Yearly |

Set their prices and country/region availability. Add trials later as offers once the core flow works.

RevenueCat represents these Google products as:

```text
khushu_premium:monthly
khushu_premium:yearly
```

## 6. Create and connect the RevenueCat project

Create one RevenueCat project named `Khushu`.

Add an Apple App Store app:

- Bundle ID: `com.khushuai.app`
- Upload the In-App Purchase Key and enter the Issuer ID.
- Add the shared secret if requested.
- Upload the App Store Connect API key so products and prices can be imported.

Add a Google Play app:

- Package name: `com.khushuai.app`

### Google Play service credentials

1. Create or select a Google Cloud project.
2. Enable Google Play Android Developer API, Google Play Developer Reporting API, and Pub/Sub.
3. Create a service account and JSON key.
4. In **Play Console → Users and permissions**, invite the service-account email and grant it access to Khushu with these permissions:
   - View app information and download bulk reports
   - View financial data, orders, and cancellation survey responses
   - Manage orders and subscriptions
5. Upload the JSON key to RevenueCat.

New Google credentials can take up to 36 hours to work.

## 7. Import products and configure RevenueCat access

In RevenueCat’s product catalog, import or add all four store products:

- Apple monthly and yearly subscriptions
- Google monthly and yearly base plans

Then:

1. Create an entitlement with ID `premium`.
2. Attach all four products to the `premium` entitlement.
3. Create an offering, for example `default`, and mark it Current.
4. Add two packages to the offering:
   - Monthly package: Apple monthly product and Google monthly product
   - Annual package: Apple yearly product and Google yearly product
5. Configure RevenueCat Customer Center if the app’s subscription-management screen will use it.

The app already unlocks paid access only when RevenueCat returns an active entitlement named `premium`.

## 8. Add RevenueCat public SDK keys to the build environment

Set these EAS/CI environment values:

```text
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=...
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=...
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://...
EXPO_PUBLIC_TERMS_OF_USE_URL=https://...
```

The app already reads these exact variables. Use RevenueCat’s public platform SDK keys only. Never place a RevenueCat `sk_` secret key, Apple secret, Apple `.p8` file, or Google service-account JSON in the app or repository.

Build new iOS and Android release builds after setting the keys; already-installed builds do not receive new environment values.

## 9. Configure store server notifications

In RevenueCat’s iOS app settings, use **Apply in App Store Connect** for Apple Server Notifications. Confirm it populates both Sandbox and Production URLs.

For Google, finish RevenueCat’s Real-Time Developer Notifications/Pub/Sub setup while configuring its Play service credentials.

These notifications promptly send subscription renewals, cancellations, refunds, and billing problems to RevenueCat.

## 10. Test purchases

### Android

1. Keep the test account on the Play closed-testing list.
2. Add the same Google account under **Play Console → Settings → License testing**.
3. Install the release from the Play closed-test link, not a local APK.
4. Test monthly purchase, yearly purchase, restore, cancellation, and sign-out/sign-in.
5. Confirm the transaction and `premium` entitlement appear in RevenueCat with Sandbox Data enabled.

### iOS

1. Upload a production iOS archive to TestFlight.
2. Add yourself as an internal TestFlight tester.
3. Test Apple Sandbox/TestFlight purchases.
4. Confirm purchase, restore, and entitlement behavior in RevenueCat.

## 11. Submit for review

- **Google Play:** continue the closed test while its release is reviewed. RevenueCat purchases can be tested on the closed track.
- **Apple:** after TestFlight purchases work, submit version `1.0.0` and select both subscriptions in that first submission.

## References

- [Apple: Create an app record](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)
- [Apple: Submit an In-App Purchase](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase)
- [RevenueCat: Apple In-App Purchase Key](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration)
- [RevenueCat: Google Play product setup](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)
- [RevenueCat: Google Play service credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)
- [RevenueCat: Apple server notifications](https://www.revenuecat.com/docs/platform-resources/server-notifications/apple-server-notifications)
