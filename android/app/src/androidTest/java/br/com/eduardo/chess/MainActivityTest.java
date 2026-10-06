package br.com.eduardo.chess;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class MainActivityTest {
    @Test public void bundledAppLoadsBoardAndWasmWithoutInternetPermission() throws Exception {
        try (InputStream wasm = InstrumentationRegistry.getInstrumentation()
                .getTargetContext().getAssets()
                .open("engine/stockfish-18-lite-single.wasm")) {
            assertTrue(wasm.available() > 1024);
        }

        PackageInfo packageInfo = InstrumentationRegistry.getInstrumentation()
            .getTargetContext()
            .getPackageManager()
            .getPackageInfo("br.com.eduardo.chess", PackageManager.GET_PERMISSIONS);
        String[] permissions = packageInfo.requestedPermissions == null
            ? new String[0]
            : packageInfo.requestedPermissions;
        assertFalse(Arrays.asList(permissions).contains("android.permission.INTERNET"));

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView webView = activity.findViewById(R.id.webview);
                assertNotNull(webView);
                webView.postDelayed(() -> webView.evaluateJavascript(
                    "location.host+'|'+document.querySelectorAll('#board .square').length",
                    result -> {
                        value.set(result);
                        latch.countDown();
                    }
                ), 1500);
            });

            assertTrue("WebView did not become ready", latch.await(15, TimeUnit.SECONDS));
            assertEquals("\"appassets.androidplatform.net|64\"", value.get());
        }
    }
}
