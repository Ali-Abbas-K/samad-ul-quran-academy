# Samad Ul Quran Android App

This Android app intentionally uses the same website UI inside a controlled WebView so the app and website can share one backend and one design. Android's official documentation supports WebView for displaying web content inside an app, including JavaScript and media use. The project uses AndroidX WebKit 1.17.0.

## Before building
1. Deploy the `server/` folder and `web/` folder to an HTTPS domain.
2. In `gradle.properties`, replace `SAMAD_WEB_URL=https://YOUR-SAMAD-DOMAIN.example` with the real HTTPS website URL.
3. Build a signed Android App Bundle (`.aab`) for Play Store release.

If the URL is still the placeholder, the app opens the bundled website as a local preview; server-backed login/enrollment/class data requires the real deployed API.

## Online classroom
Camera and microphone permissions are included because the classroom uses a web meeting provider. For a production private classroom, use authenticated Jitsi/JWT or your own WebRTC backend rather than relying only on an email-derived room name.
