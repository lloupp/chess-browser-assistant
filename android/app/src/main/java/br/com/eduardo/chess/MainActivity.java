package br.com.eduardo.chess;

import android.app.Activity;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;

public final class MainActivity extends Activity {
    private WebView webView;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setId(R.id.webview);
        webView.setBackgroundColor(0xff101c1b);
        setContentView(webView);

        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                );
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(
                    insets.getSystemWindowInsetLeft(),
                    insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(),
                    insets.getSystemWindowInsetBottom()
                );
            }
            return insets;
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(
                WebView view,
                WebResourceRequest request
            ) {
                WebResourceResponse local = loader.shouldInterceptRequest(request.getUrl());
                if (local != null && request.getUrl().getPath() != null
                    && request.getUrl().getPath().endsWith(".wasm")) {
                    local.setMimeType("application/wasm");
                }
                return local != null
                    ? local
                    : new WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        403,
                        "Blocked",
                        java.util.Collections.emptyMap(),
                        new java.io.ByteArrayInputStream(new byte[0])
                    );
            }

            @Override public boolean shouldOverrideUrlLoading(
                WebView view,
                WebResourceRequest request
            ) {
                return !"appassets.androidplatform.net".equals(request.getUrl().getHost());
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl("https://appassets.androidplatform.net/assets/play.html");
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
