package com.suemubai.sporttery;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(this));
        }
        PyObject module = Python.getInstance().getModule("mobile_server");
        module.callAttr("start", getFilesDir().getAbsolutePath());
        super.onCreate(savedInstanceState);

        // Keep the WebView below the phone status bar. Android 15 enables
        // edge-to-edge by default, which previously placed the page title
        // underneath the clock, signal and battery indicators.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.parseColor("#72AEFF"));
        getWindow().setNavigationBarColor(Color.WHITE);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(
                getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(true);
    }
}
