package com.equimaps.capacitor_background_geolocation;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
/** Non-exported immutable notification actions; never carries positions/tokens. */
public final class RunActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        try { RunRuntime.get(context).notificationAction(intent.getAction()); } catch(Exception ignored) { /* Recovery remains in the encrypted journal. */ }
    }
}
