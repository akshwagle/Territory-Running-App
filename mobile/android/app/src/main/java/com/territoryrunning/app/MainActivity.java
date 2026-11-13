package com.territoryrunning.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.os.Build;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import android.graphics.Color;
import android.webkit.WebSettings;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // One inset owner: Capacitor SystemBars passes safe areas to CSS and
        // resizes for the IME. EdgeToEdge also opts older Android versions in.
        // AndroidX's automatic style adds a scrim on API 26-28. Request
        // transparent light bars explicitly. API 24-25 cannot render dark
        // navigation icons, so only those versions retain a deep-pine fallback.
        EdgeToEdge.enable(this,
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            SystemBarStyle.light(Color.TRANSPARENT, 0xFF14392C));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getBridge().getWebView().getSettings().setAlgorithmicDarkeningAllowed(false);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getBridge().getWebView().getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        // The local Capacitor page uses HTTPS. Only debug builds may call an
        // HTTP development API on the Mac's LAN address.
        if (BuildConfig.DEBUG) {
            getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }
}
