package com.suemubai.sporttery;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int PRIMARY_STATUS_BAR = Color.rgb(114, 174, 255);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep the WebView below the phone status bar. Android 15 enables
        // edge-to-edge by default, which previously placed the page title
        // underneath the clock, signal and battery indicators.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setNavigationBarColor(Color.WHITE);
        applyPrimaryStatusBar(false);
        bridge.getWebView().addJavascriptInterface(new StatusBarBridge(), "NativeStatusBar");
    }

    private void applyPrimaryStatusBar(boolean primary) {
        getWindow().setStatusBarColor(primary ? PRIMARY_STATUS_BAR : Color.WHITE);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(
                getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(!primary);
        bars.setAppearanceLightNavigationBars(true);
    }

    private class StatusBarBridge {
        @JavascriptInterface
        public void setPrimary(boolean primary) {
            runOnUiThread(() -> applyPrimaryStatusBar(primary));
        }
    }
}
