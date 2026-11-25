package com.equimaps.capacitor_background_geolocation;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
/** Debug source set only. The release plugin has no simulator methods. */
@CapacitorPlugin(name="TerritoryRecorder",permissions={
 @com.getcapacitor.annotation.Permission(alias="location",strings={android.Manifest.permission.ACCESS_COARSE_LOCATION,android.Manifest.permission.ACCESS_FINE_LOCATION}),
 @com.getcapacitor.annotation.Permission(alias="background",strings={android.Manifest.permission.ACCESS_BACKGROUND_LOCATION}),
 @com.getcapacitor.annotation.Permission(alias="notifications",strings={android.Manifest.permission.POST_NOTIFICATIONS}),
 @com.getcapacitor.annotation.Permission(alias="activity",strings={android.Manifest.permission.ACTIVITY_RECOGNITION})
})
public class DebugTerritoryRecorderPlugin extends TerritoryRecorderPlugin {
    private final android.os.Handler feedHandler=new android.os.Handler(android.os.Looper.getMainLooper());
    private Runnable feed;
    private int sample;
    private String mode;
    // Synthetic desk route: never changes Android's system mock provider or
    // another app's location. Every delivered fix has the native mock bit set.
    @PluginMethod public void debugFeed(PluginCall call){execute(call,()->{
        if(android.os.Build.VERSION.SDK_INT<31)throw new IllegalStateException("DEBUG_REQUIRES_ANDROID_12");
        String requested=call.getString("mode","walk");
        if(!java.util.Arrays.asList("walk","still","stop").contains(requested))throw new IllegalStateException("INVALID_DEBUG_MODE");
        if(!requested.equals("stop")&&!runtime.snapshot().optBoolean("simulated"))throw new IllegalStateException("SIMULATED_RUN_REQUIRED");
        if(feed!=null)feedHandler.removeCallbacks(feed); mode=requested;runtime.externalFeed=!mode.equals("stop");
        if(!mode.equals("stop")){
            feed=new Runnable(){@Override public void run(){try{
                String state=runtime.snapshot().optString("state");
                if(!state.equals("ACTIVE")&&!state.equals("PAUSED"))return;
                if(mode.equals("walk"))sample++;
                android.location.Location point=new android.location.Location("gps");
                point.setLatitude(18.5+sample*0.000018);point.setLongitude(73.8);point.setAccuracy(4);
                point.setSpeed(mode.equals("walk")?2:0);point.setBearing(0);point.setAltitude(500);
                point.setTime(System.currentTimeMillis());point.setElapsedRealtimeNanos(android.os.SystemClock.elapsedRealtimeNanos());point.setMock(true);
                runtime.accept(point);feedHandler.postDelayed(this,1000);
            }catch(Exception ignored){/* Runtime shows storage failures; no location diagnostics. */}}};
            feedHandler.postDelayed(feed,1000);
        }
        return runtime.snapshot();
    });}
    @Override protected void handleOnDestroy(){if(feed!=null)feedHandler.removeCallbacks(feed);super.handleOnDestroy();}

    @PluginMethod public void debugStorageFault(PluginCall call){execute(call,()->{
        if(!runtime.snapshot().optBoolean("simulated"))throw new IllegalStateException("SIMULATED_RUN_REQUIRED");
        runtime.store.failWritesForTest=true;return runtime.snapshot();
    });}
    @Override @PluginMethod public void retryStorage(PluginCall call){execute(call,()->{runtime.store.failWritesForTest=false;return runtime.retryStorage();});}
    @PluginMethod public void debugCapability(PluginCall call){execute(call,()->new JSONObject().put("enabled",true));}
}
