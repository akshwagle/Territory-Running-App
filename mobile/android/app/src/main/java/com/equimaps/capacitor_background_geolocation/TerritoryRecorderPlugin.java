package com.equimaps.capacitor_background_geolocation;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Debug;
import android.os.StatFs;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.security.MessageDigest;
import java.util.TimeZone;
import org.json.JSONObject;

@CapacitorPlugin(name="TerritoryRecorder",permissions={
    @Permission(alias="location",strings={Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION}),
    @Permission(alias="background",strings={Manifest.permission.ACCESS_BACKGROUND_LOCATION}),
    @Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS}),
    @Permission(alias="activity",strings={Manifest.permission.ACTIVITY_RECOGNITION})
})
public class TerritoryRecorderPlugin extends Plugin {
    protected RunRuntime runtime;
    private String initializationError;
    interface Task { JSONObject run() throws Exception; }
    @Override public void load(){
        try { runtime=RunRuntime.get(getContext());runtime.observe(()->{try{updateWindow();notifyListeners("stateChanged",new JSObject(runtime.snapshot().toString()));}catch(Exception ignored){}},()->notifyListeners("syncDue",new JSObject())); }
        catch(Exception ignored){initializationError="RUN_STORAGE_UNAVAILABLE";}
    }
    protected void execute(PluginCall call,Task task){
        getActivity().runOnUiThread(()->{try{if(runtime==null)throw new IllegalStateException(initializationError==null?"RUN_STORAGE_UNAVAILABLE":initializationError);call.resolve(new JSObject(task.run().toString()));updateWindow();}
            catch(Exception failure){String code=failure.getMessage();if(code==null||!code.matches("[A-Z_]+"))code="RUN_STORAGE_UNAVAILABLE";call.reject(message(code),code);}});
    }
    private String message(String code){
        switch(code){
            case "BATCH_ACK_MISMATCH":return "The server did not confirm this saved batch. Nothing was removed. Reconnect and Retry sync.";
            case "PRECISE_LOCATION_REQUIRED":return "Run recording needs Precise location. Open Android app settings to enable it.";
            case "GPS_DISABLED":return "Turn on Location services, then try again.";
            case "FINISH_AFTER_REBOOT":return "Your phone restarted. Finish the saved run at its last point.";
            case "SAVED_RUN_EXISTS":return "Resume or finish your saved run before starting another.";
            case "SERVER_ACK_REQUIRED":return "Reconnect to confirm a new run before recording.";
            default:return "Saved run storage is unavailable. Keep this app installed, free space if needed, and Retry.";
        }
    }
    private JSONObject permissionState() throws Exception {
        JSONObject installation=runtime.installation();boolean precise=runtime.precise(),coarse=runtime.granted(Manifest.permission.ACCESS_COARSE_LOCATION);
        boolean permanent=!precise&&!coarse&&installation.optBoolean("asked:location")&&!ActivityCompat.shouldShowRequestPermissionRationale(getActivity(),Manifest.permission.ACCESS_FINE_LOCATION)&&!ActivityCompat.shouldShowRequestPermissionRationale(getActivity(),Manifest.permission.ACCESS_COARSE_LOCATION);
        return new JSONObject().put("location",RecordingPolicy.location(precise,coarse,permanent,false))
            .put("background",runtime.background()).put("notifications",Build.VERSION.SDK_INT<33||runtime.granted(Manifest.permission.POST_NOTIFICATIONS))
            .put("activity",Build.VERSION.SDK_INT<29||runtime.granted(Manifest.permission.ACTIVITY_RECOGNITION)).put("gps",runtime.locationEnabled())
            .put("storageBytes",new StatFs(getContext().getFilesDir().getAbsolutePath()).getAvailableBytes())
            .put("backgroundLabel",Build.VERSION.SDK_INT>=30?getContext().getPackageManager().getBackgroundPermissionOptionLabel().toString():"Allow all the time");
    }
    @PluginMethod public void permissions(PluginCall call){execute(call,()->permissionState());}
    @PluginMethod public void requestLocation(PluginCall call){
        executePermission(call,"location",Build.VERSION.SDK_INT>=23);
    }
    @PluginMethod public void requestNotifications(PluginCall call){executePermission(call,"notifications",Build.VERSION.SDK_INT>=33);}
    @PluginMethod public void requestActivity(PluginCall call){executePermission(call,"activity",Build.VERSION.SDK_INT>=29);}
    private void executePermission(PluginCall call,String alias,boolean needed){getActivity().runOnUiThread(()->{
        try{if(!needed){call.resolve(new JSObject(permissionState().toString()));return;}if(alias.equals("location")&&permissionState().getString("location").equals("blocked")){call.resolve(new JSObject(permissionState().toString()));return;}
            runtime.asked(alias);requestPermissionForAlias(alias,call,"permissionResult");}
        catch(Exception ignored){call.reject("Permission status could not be read. Reopen the app and try again.","PERMISSION_CHECK_FAILED");}
    });}
    @PermissionCallback private void permissionResult(PluginCall call){execute(call,()->permissionState());}
    @PluginMethod public void requestBackground(PluginCall call){
        if(Build.VERSION.SDK_INT<29){execute(call,()->permissionState());return;}
        if(Build.VERSION.SDK_INT>=30){openSettings(call);return;}
        executePermission(call,"background",true);
    }
    @PluginMethod public void openSettings(PluginCall call){execute(call,()->{getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName())));return permissionState();});}
    @PluginMethod public void batterySettings(PluginCall call){execute(call,()->{getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));return new JSONObject();});}
    @PluginMethod public void setOwner(PluginCall call){execute(call,()->{String id=call.getString("ownerId");if(id==null||!id.matches("[0-9a-fA-F-]{36}"))throw new IllegalStateException("SIGN_IN_REQUIRED");return runtime.setOwner(id);});}
    @PluginMethod public void snapshot(PluginCall call){execute(call,()->runtime.snapshot());}
    @PluginMethod public void intent(PluginCall call){execute(call,()->runtime.intent());}
    @PluginMethod public void prepareIntent(PluginCall call){execute(call,()->runtime.prepareIntent(call.getObject("body")));}
    @PluginMethod public void clearIntent(PluginCall call){execute(call,()->{runtime.clearIntent();return new JSONObject();});}
    @PluginMethod public void start(PluginCall call){execute(call,()->runtime.start(call.getData()));}
    @PluginMethod public void pause(PluginCall call){execute(call,()->runtime.pause());}
    @PluginMethod public void resume(PluginCall call){execute(call,()->runtime.resume());}
    @PluginMethod public void finish(PluginCall call){execute(call,()->runtime.finish());}
    @PluginMethod public void suspend(PluginCall call){execute(call,()->{runtime.suspend(call.getString("reason","session-ended"));return runtime.snapshot();});}
    @PluginMethod public void retryStorage(PluginCall call){execute(call,()->runtime.retryStorage());}
    @PluginMethod public void nextUpload(PluginCall call){execute(call,()->runtime.nextUpload());}
    @PluginMethod public void acknowledge(PluginCall call){execute(call,()->runtime.acknowledge(call.getString("id"),call.getObject("response",new JSObject())));}
    @PluginMethod public void discard(PluginCall call){execute(call,()->runtime.discard());}
    @PluginMethod public void erase(PluginCall call){execute(call,()->{runtime.erase(call.getString("ownerId"));return new JSONObject();});}
    @PluginMethod public void count(PluginCall call){execute(call,()->new JSONObject().put("count",runtime.count(call.getString("ownerId"))));}
    @PluginMethod public void countAll(PluginCall call){execute(call,()->new JSONObject().put("count",runtime.store.countAll()));}
    @PluginMethod public void deviceInfo(PluginCall call){execute(call,()->{
        JSONObject result=new JSONObject().put("installId",runtime.installation().getString("installId"));
        String androidId=Settings.Secure.getString(getContext().getContentResolver(),Settings.Secure.ANDROID_ID);
        result.put("androidIdHash",androidId==null?JSONObject.NULL:RunStore.namespace(androidId));
        PackageManager pm=getContext().getPackageManager();PackageInfo info=pm.getPackageInfo(getContext().getPackageName(),Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES);
        byte[] certificate=Build.VERSION.SDK_INT>=28?info.signingInfo.getApkContentsSigners()[0].toByteArray():info.signatures[0].toByteArray();
        StringBuilder sha=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(certificate))sha.append(String.format(java.util.Locale.ROOT,"%02x",b));
        result.put("versionCode",Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode).put("appVersion",info.versionName).put("signingCertificateSha256",sha.toString())
            .put("model",Build.MODEL).put("androidVersion",Build.VERSION.RELEASE).put("timeZone",TimeZone.getDefault().getID())
            .put("mockAppSelected",JSONObject.NULL).put("emulator",Build.FINGERPRINT.startsWith("generic")||Build.MODEL.contains("Emulator")||Build.MODEL.contains("sdk"))
            .put("debugger",Debug.isDebuggerConnected());return result;
    });}
    private void updateWindow(){try{boolean awake=runtime.snapshot().optString("state").equals("ACTIVE");if(awake)getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}catch(Exception ignored){}}
    @Override protected void handleOnPause(){if(runtime!=null)runtime.foreground(false);super.handleOnPause();}
    @Override protected void handleOnResume(){if(runtime!=null)runtime.foreground(true);super.handleOnResume();}
    @Override protected void handleOnDestroy(){if(runtime!=null)runtime.unobserve();super.handleOnDestroy();}
}
