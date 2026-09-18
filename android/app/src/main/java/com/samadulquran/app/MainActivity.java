package com.samadulquran.app;
import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

/**
 * Single-activity WebView shell for the academy portal.
 *
 * There are two ways this app can be shipped, and both are supported:
 *
 *   1. ONLINE (recommended). Build with -PSAMAD_WEB_URL=https://your-domain and
 *      the app loads the live website. Site and API share an origin, so sessions,
 *      uploads and Jitsi all behave exactly as they do in a mobile browser, and
 *      the app picks up website updates without a new release.
 *
 *   2. BUNDLED. Ship the copy of the site in assets/site (kept in sync by
 *      tools/sync-android.sh) and point it at a remote API with
 *      -PSAMAD_API_BASE_URL=https://your-domain/api.
 *
 * The bundled pages are served through WebViewAssetLoader rather than being
 * loaded as file:// URLs. That matters: a file:// page has an opaque origin, so
 * web fonts are refused by the CORS check, localStorage is unavailable, and the
 * saved session cannot survive navigation. WebViewAssetLoader serves the same
 * files over https://appassets.androidplatform.net/, a real, private, secure
 * origin, which fixes all three. When configuring the server for a bundled
 * build, add that origin to ALLOWED_ORIGINS in server/.env.
 */
public class MainActivity extends Activity {
    private static final int PERMISSION_CODE = 77;
    /** Reserved by androidx.webkit; never resolves on the public internet. */
    private static final String ASSET_ORIGIN = "https://appassets.androidplatform.net";

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private PermissionRequest pending;

    @Override public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);

        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/site/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // The bundled site is reached through the asset loader, so the WebView
        // itself never needs direct file:// access. Leaving these off keeps a
        // compromised page from reading app-private files.
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return assetLoader.shouldInterceptRequest(req.getUrl());
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    // Keep our own pages inside the app; hand anything else
                    // (the academy's WhatsApp link, an external Jitsi room, a
                    // policy PDF on another host) to the system browser.
                    if (isInternal(u)) { view.loadUrl(u.toString()); return true; }
                }
                // tel:, mailto:, whatsapp:, intent: and third-party https links.
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (granted(Manifest.permission.CAMERA) && granted(Manifest.permission.RECORD_AUDIO)) {
                        request.grant(request.getResources());
                    } else {
                        pending = request;
                        ActivityCompat.requestPermissions(MainActivity.this,
                                new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO},
                                PERMISSION_CODE);
                    }
                });
            }
        });

        if (!granted(Manifest.permission.CAMERA) || !granted(Manifest.permission.RECORD_AUDIO)) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO},
                    PERMISSION_CODE);
        }

        webView.loadUrl(startUrl());
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** True for the academy's own site, whichever way it is being served. */
    private boolean isInternal(Uri u) {
        String host = u.getHost();
        if (host == null) return false;
        if (host.equals("appassets.androidplatform.net")) return true;
        String configured = Uri.parse(configuredWebUrl()).getHost();
        if (configured == null) return false;
        return host.equals(configured) || host.endsWith("." + configured);
    }

    private static boolean isSet(String value) {
        return value != null && !value.isEmpty() && !value.contains("YOUR-SAMAD-DOMAIN");
    }

    private String configuredWebUrl() {
        return isSet(BuildConfig.WEB_URL) ? BuildConfig.WEB_URL : "";
    }

    /**
     * Decide what to open on launch.
     *
     * With SAMAD_WEB_URL set we go straight to the live site. Otherwise we serve
     * the bundled copy through the asset loader, passing the configured API
     * origin as ?api=... — assets/site/js/config.js reads it and stores it so
     * later in-app navigation keeps talking to the same backend. With no API
     * origin configured the pages still render and each API-backed panel shows
     * its normal error state, which is a truthful "not configured yet" rather
     * than a blank screen.
     */
    private String startUrl() {
        String live = configuredWebUrl();
        if (!live.isEmpty()) return live;

        String bundled = ASSET_ORIGIN + "/site/index.html";
        String api = BuildConfig.API_BASE_URL;
        if (isSet(api)) return bundled + "?api=" + Uri.encode(api);
        return bundled;
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != PERMISSION_CODE || pending == null) return;
        boolean allGranted = grantResults.length > 0;
        for (int result : grantResults) {
            if (result != PackageManager.PERMISSION_GRANTED) { allGranted = false; break; }
        }
        if (allGranted) pending.grant(pending.getResources());
        else pending.deny();
        pending = null;
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
