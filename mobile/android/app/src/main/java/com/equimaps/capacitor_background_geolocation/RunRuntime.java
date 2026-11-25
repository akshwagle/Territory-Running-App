package com.equimaps.capacitor_background_geolocation;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import com.territoryrunning.app.R;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.TimeZone;
import java.util.Arrays;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Application-lifetime recorder. Collection is the unmodified community service.
 * Only committed ciphertext records are returned to the JS upload adapter. */
public final class RunRuntime implements SensorEventListener {
    static final int NOTICE = 28351; // Exact pinned community-service notification ID.
    static final String CHANNEL = "com.equimaps.capacitor_background_geolocation";
    private static RunRuntime singleton;
    public static synchronized RunRuntime get(Context context) throws Exception {
        if (singleton == null) singleton = new RunRuntime(context.getApplicationContext());
        return singleton;
    }
    final RunStore store;
    final Context context;
    final String process = UUID.randomUUID().toString();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private static final class PendingFix {
        final JSONObject point,meta;
        PendingFix(JSONObject point,JSONObject meta) throws Exception {this.point=copy(point);this.meta=copy(meta);}
    }
    private final ArrayDeque<PendingFix> rescue = new ArrayDeque<>();
    private BackgroundGeolocationService.LocalBinder binder;
    private boolean watching, foreground = true, sessionAllowed, autoGps, storageFailed;
    private String owner, watcher, message = "";
    private JSONObject run, lastFix;
    boolean externalFeed;
    private double stepBase = -1;
    private long stepTotal, lastSync;
    private Runnable observer, syncObserver;

    private RunRuntime(Context context) throws Exception {
        this.context = context;
        store = new RunStore(context);
        LocalBroadcastManager.getInstance(context).registerReceiver(new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent intent) {
                if (watcher == null || !watcher.equals(intent.getStringExtra("id"))) return;
                Location location = intent.getParcelableExtra("location");
                if (location != null && !externalFeed && run != null && !run.optBoolean("simulated")) accept(location);
            }
        }, new IntentFilter(BackgroundGeolocationService.ACTION_BROADCAST));
        Intent service = new Intent(context, BackgroundGeolocationService.class);
        context.bindService(service, new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder value) {
                binder = (BackgroundGeolocationService.LocalBinder) value;
                try { if (run != null && sessionAllowed && !run.optBoolean("recovery")) collect(); } catch (Exception ignored) { fail("GPS could not start. Your saved run is safe. Try Resume."); }
            }
            @Override public void onServiceDisconnected(ComponentName name) { synchronized(RunRuntime.this){
                binder=null;watching=false;
                try{if(run!=null){pauseAt(normalizedNow(),"PROCESS_RECOVERY");run.put("recovery",true);event("PROCESS_RECOVERY",normalizedNow(),new JSONObject().put("reason","SERVICE_DISCONNECTED"));persist();}}
                catch(Exception ignored){/* persist exposes its storage warning. */}
                fail("GPS collection was interrupted. Your saved run is safe. Choose Resume or Finish.");
            }}
        }, Context.BIND_AUTO_CREATE);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Run recording", NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null, null); channel.enableVibration(false); manager.createNotificationChannel(channel);
        }
        handler.postDelayed(new Runnable() { @Override public void run() { tick(); handler.postDelayed(this, 1000); } }, 1000);
    }
    synchronized void observe(Runnable observer, Runnable syncObserver) { this.observer = observer; this.syncObserver = syncObserver; }
    synchronized void unobserve() { observer = null; syncObserver = null; }
    private static String iso(long millis) { SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.ROOT);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(new Date(millis)); }
    private static long stamp(String value) throws Exception { SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX",Locale.ROOT);f.setLenient(false);return f.parse(value).getTime(); }
    private static JSONObject copy(JSONObject object) throws Exception { return new JSONObject(object.toString()); }
    private long normalizedNow() {
        if (run == null) return 0;
        if (!boot().equals(run.optString("boot"))) return run.optLong("lastTime", run.optLong("start") + 1);
        return Math.min(run.optLong("start") + RunMath.MAX_MS, run.optLong("start") + Math.max(0, SystemClock.elapsedRealtime() - run.optLong("startMono")));
    }
    private String boot() {
        try { return Integer.toString(Settings.Global.getInt(context.getContentResolver(), "boot_count")); }
        catch (Exception ignored) { return "unknown"; }
    }
    synchronized JSONObject installation() throws Exception {
        JSONObject record = store.get("installation", "identity", "install");
        if (record == null) { record = new JSONObject().put("installId", UUID.randomUUID().toString()); store.put("installation", "identity", "install", record); }
        return record;
    }
    synchronized void asked(String permission) throws Exception {
        JSONObject record = installation(); record.put("asked:" + permission, true); store.put("installation", "identity", "install", record);
    }
    boolean granted(String permission) { return Build.VERSION.SDK_INT < 23 || ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED; }
    boolean precise() { return granted(Manifest.permission.ACCESS_FINE_LOCATION); }
    boolean background() { return Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION); }
    boolean locationEnabled() {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        return manager != null && (manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
    }
    synchronized JSONObject setOwner(String id) throws Exception {
        String next = RunStore.namespace(id);
        if (next.equals(owner)) return snapshot();
        if(storageFailed||!rescue.isEmpty())throw new IllegalStateException("RUN_STORAGE_UNAVAILABLE");
        suspend("account-change"); owner = next; run = null; lastFix = null; message = ""; sessionAllowed = true;
        List<JSONObject> records = store.runs(owner);
        if (records.size() > 1) throw new IllegalStateException("MULTIPLE_LOCAL_RUNS");
        if (!records.isEmpty()) {
            run = records.get(0);
            if (!process.equals(run.optString("process"))) {
                boolean reboot = boot().equals("unknown") || !boot().equals(run.optString("boot"));
                if ("ACTIVE".equals(run.optString("state"))) pauseAt(Math.max(run.optLong("start")+1,run.optLong("lastTime",run.optLong("start")+1)), "PROCESS_RECOVERY");
                run.put("recovery", true).put("reboot", reboot).put("process", process);
                event(reboot?"REBOOT_RECOVERY":"PROCESS_RECOVERY", Math.max(run.optLong("start")+1,run.optLong("lastTime",run.optLong("start")+1)), new JSONObject());
                persist();
            }
        }
        changed(); return snapshot();
    }
    synchronized void foreground(boolean value) {
        foreground = value;
        try { if (!value && run != null && run.optBoolean("foregroundOnly") && "ACTIVE".equals(run.optString("state"))) { pauseAt(normalizedNow(), "FOREGROUND_ONLY"); stopCollection(); message = "Foreground-only run paused. Keep the app visible and tap Resume."; } }
        catch (Exception ignored) { fail("Recording stopped. Saved points remain encrypted; retry storage before closing the app."); }
        changed();
    }
    synchronized JSONObject intent() throws Exception { if(owner==null)throw new IllegalStateException("SIGN_IN_REQUIRED");JSONObject value=store.get(owner,"intent","start");return value==null?new JSONObject():value; }
    synchronized JSONObject prepareIntent(JSONObject value) throws Exception {
        if(owner==null)throw new IllegalStateException("SIGN_IN_REQUIRED");if(run!=null)throw new IllegalStateException("SAVED_RUN_EXISTS");
        JSONObject existing=intent();if(existing.has("clientRunId"))return existing;store.put(owner,"intent","start",value);return value;
    }
    synchronized void clearIntent() throws Exception { if(owner!=null)store.remove(owner,"intent","start"); }
    synchronized JSONObject start(JSONObject input) throws Exception {
        if (owner == null) throw new IllegalStateException("SIGN_IN_REQUIRED");
        if (run != null || !store.runs(owner).isEmpty()) throw new IllegalStateException("SAVED_RUN_EXISTS");
        if (!precise()) throw new IllegalStateException("PRECISE_LOCATION_REQUIRED");
        if (!locationEnabled()) throw new IllegalStateException("GPS_DISABLED");
        JSONObject ack = input.getJSONObject("run");
        if (!"ACTIVE".equals(ack.optString("status"))) throw new IllegalStateException("SERVER_ACK_REQUIRED");
        long start = stamp(ack.getString("startedAt")), acknowledged=Math.max(start,stamp(input.optString("serverTime",ack.getString("startedAt")))),mono=SystemClock.elapsedRealtime();
        if(acknowledged-start>=RunMath.MAX_MS)throw new IllegalStateException("SAVED_RUN_EXPIRED");
        run = new JSONObject().put("runId", ack.getString("id")).put("clientRunId", ack.getString("clientRunId"))
            .put("start", start).put("startMono",mono-(acknowledged-start)).put("wallMono",mono).put("wallStart", System.currentTimeMillis())
            .put("boot",boot()).put("process",process).put("state","ACTIVE").put("segmentId",ack.getString("clientRunId"))
            .put("segmentStart",acknowledged).put("activeMs",0).put("nextSeq",0).put("uploadedSeq",-1)
            .put("controls",new JSONArray()).put("controlAck",0).put("events",new JSONArray()).put("eventsAck",0)
            .put("invalid",0).put("invalidSent",0).put("distance",0).put("lastMoveTime",Math.max(start+1,acknowledged)).put("lastMoveActive",0)
            .put("foregroundOnly",!background()).put("miles",input.optBoolean("miles")).put("simulated",input.optBoolean("simulated"));
        if(acknowledged-start>5000){
            control("pause",UUID.randomUUID().toString(),start+1,"PROCESS_RECOVERY");
            String segment=UUID.randomUUID().toString();control("resume",segment,acknowledged,"PROCESS_RECOVERY");run.put("segmentId",segment);
            event("PROCESS_RECOVERY",acknowledged,new JSONObject().put("reason","START_ACK_DELAY"));
        }
        try { store.transaction(()->{persist();store.remove(owner,"intent","start");}); } catch (Exception failure) { run = null; throw failure; }
        externalFeed = false; sessionAllowed = true; message = ""; stepBase = -1; stepTotal = 0; lastSync = SystemClock.elapsedRealtime(); collect(); changed(); return snapshot();
    }
    private void freezeForStorage(long time) {
        if(run!=null&&"ACTIVE".equals(run.optString("state")))try{
            long active=activeMs(time);run.put("activeMs",active).put("state","PAUSED").put("pauseReason","LOW_STORAGE");
        }catch(Exception ignored){/* The durable journal is unchanged; collection still stops. */}
    }
    private void persist() throws Exception { if(run!=null)try{store.put(owner,"run",run.getString("runId"),run);}catch(Exception failure){storageFailed=true;freezeForStorage(normalizedNow());stopCollection();message="Saved storage failed. Recording stopped; free space and Retry.";changed();throw failure;} }
    private void event(String type, long time, JSONObject data) throws Exception {
        run.getJSONArray("events").put(new JSONObject().put("id",UUID.randomUUID().toString()).put("type",type)
            .put("recordedAt",iso(time)).put("elapsedMs",Math.max(0,time-run.getLong("start"))).put("data",data));
    }
    private void collect() throws Exception {
        if (binder == null || run == null || watching || !sessionAllowed || !precise() || !locationEnabled() || run.optBoolean("recovery") || run.optBoolean("reboot") || storageFailed) return;
        String state = run.optString("state");
        if (!state.equals("ACTIVE") && !(state.equals("PAUSED") && (run.optString("pauseReason").equals("NO_MOVEMENT") || run.optString("pauseReason").equals("USER")))) return;
        if (run.optBoolean("foregroundOnly") && !foreground) return;
        watcher = UUID.randomUUID().toString(); binder.addWatcher(watcher, notification(),0); watching = true;
        SensorManager sensors = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        if ((Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACTIVITY_RECOGNITION)) && sensors != null) {
            Sensor sensor = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER); if (sensor != null) sensors.registerListener(this,sensor,SensorManager.SENSOR_DELAY_NORMAL);
        }
    }
    void stopCollection() {
        if (watching && binder != null) binder.removeWatcher(watcher);
        watching = false; watcher = null;
        ((SensorManager) context.getSystemService(Context.SENSOR_SERVICE)).unregisterListener(this);
    }
    private long activeMs(long time) { return run.optLong("activeMs") + ("ACTIVE".equals(run.optString("state"))?Math.max(0,time-run.optLong("segmentStart")):0); }
    synchronized void accept(Location location) {
        if (run == null || !sessionAllowed || storageFailed) return;
        try {
            long fixMono = location.getElapsedRealtimeNanos()/1000000, age = SystemClock.elapsedRealtime()-fixMono;
            Double speed = location.hasSpeed()?(double)location.getSpeed():null;
            long time = run.optLong("start")+fixMono-run.optLong("startMono");
            // A cached paused fix may cross the Resume callback boundary. It
            // belongs to the old inactive period, not the newly opened segment.
            if("ACTIVE".equals(run.optString("state"))&&time<run.optLong("segmentStart"))return;
            if (!RunMath.valid(location.getLatitude(),location.getLongitude(),location.hasAccuracy()?location.getAccuracy():Double.NaN,speed) || age < -1000 || age>60000 || location.getTime()<=0 || Math.abs(location.getTime()-System.currentTimeMillis())>60000 || (location.hasAltitude()&&!Double.isFinite(location.getAltitude())) || (location.hasBearing()&&(!Float.isFinite(location.getBearing())||location.getBearing()<0||location.getBearing()>=360)) || time<run.optLong("start") || time>run.optLong("start")+RunMath.MAX_MS || time<=run.optLong("lastTime",0)) {
                if("ACTIVE".equals(run.optString("state"))){run.put("invalid",run.optInt("invalid")+1);persist();}changed();return;
            }
            long clockDelta = System.currentTimeMillis()-run.optLong("wallStart")-(SystemClock.elapsedRealtime()-run.optLong("wallMono",run.optLong("startMono")));
            if (Math.abs(clockDelta-run.optLong("lastClockDelta"))>120000) { event("CLOCK_JUMP",time,new JSONObject().put("clockDeltaMs",clockDelta)); run.put("lastClockDelta",clockDelta); }
            String provider = location.getProvider(); if (!Arrays.asList("gps","network","fused","passive").contains(provider)) provider="unknown";
            JSONObject point = new JSONObject().put("seq",run.optInt("nextSeq")).put("lat",location.getLatitude()).put("lng",location.getLongitude())
                .put("recordedAt",iso(time)).put("deviceTimestamp",iso(location.getTime())).put("elapsedMs",time-run.optLong("start"))
                .put("accuracyM",location.getAccuracy()).put("altitudeM",location.hasAltitude()?location.getAltitude():JSONObject.NULL)
                .put("speedMps",speed==null?JSONObject.NULL:speed).put("bearingDeg",location.hasBearing()?location.getBearing():JSONObject.NULL)
                .put("provider",provider).put("isMock",location.isFromMockProvider()).put("segmentId",run.getString("segmentId"));
            lastFix = point;
            if ("PAUSED".equals(run.optString("state"))) {
                if ("NO_MOVEMENT".equals(run.optString("pauseReason")) && moved(point,15)) resumeAt(time,"NO_MOVEMENT"); else { if(moved(point,15)){run.put("moveAnchor",point).put("lastMoveTime",time).put("lastMoveActive",run.optLong("activeMs"));persist();} changed(); return; }
                point.put("segmentId",run.getString("segmentId"));
            }
            if (!"ACTIVE".equals(run.optString("state"))) return;
            JSONObject previous = copy(run),candidate = copy(run);
            if (location.getAccuracy()<=50 && (RecordingPolicy.coldFix(location.getAccuracy(),time-run.getLong("start")))) {
                JSONObject anchor=candidate.optJSONObject("anchor");
                if (anchor!=null && time-stamp(anchor.getString("recordedAt"))<=30000) {
                    double distance=RunMath.distance(anchor.getDouble("lat"),anchor.getDouble("lng"),point.getDouble("lat"),point.getDouble("lng"));
                    if (distance>=Math.max(8,Math.max(anchor.getDouble("accuracyM"),point.getDouble("accuracyM")))) { candidate.put("distance",candidate.optDouble("distance")+distance); candidate.put("anchor",point); }
                } else candidate.put("anchor",point);
                if (moved(point,15)) { candidate.put("moveAnchor",point).put("lastMoveTime",time).put("lastMoveActive",activeMs(time)); }
            }
            candidate.put("lastTime",time).put("lastFixMono",fixMono).put("nextSeq",candidate.optInt("nextSeq")+1);
            try {
                store.transaction(()->{store.put(owner,"point:"+candidate.getString("runId"),RunStore.seq(point.getInt("seq")),point);store.put(owner,"run",candidate.getString("runId"),candidate);});
                run=candidate;
            } catch(Exception failure) { run=previous; if(rescue.size()<64)rescue.addLast(new PendingFix(point,candidate)); storageFailed=true;freezeForStorage(time);stopCollection();message="Storage failed. Recording stopped; a fix is held in memory. Free space and Retry before closing the app."; }
            if(run.optInt("nextSeq")>=100000)finishAt(time,"LIMIT"); changed();
        } catch(Exception ignored) { storageFailed=true;stopCollection();message="Recording stopped because saved data could not be written. Keep this app open and Retry.";changed(); }
    }
    private boolean moved(JSONObject point,double threshold) throws Exception {
        JSONObject anchor=run.optJSONObject("moveAnchor");return point.optDouble("accuracyM",100)>50?false:anchor==null||RunMath.distance(anchor.getDouble("lat"),anchor.getDouble("lng"),point.getDouble("lat"),point.getDouble("lng"))>=threshold;
    }
    private JSONObject position() throws Exception { return lastFix==null?null:new JSONObject().put("lat",lastFix.getDouble("lat")).put("lng",lastFix.getDouble("lng")).put("accuracyM",lastFix.getDouble("accuracyM")); }
    private void control(String action,String id,long time,String reason) throws Exception {
        JSONObject body=new JSONObject().put("eventId",id).put("recordedAt",iso(time)).put("elapsedMs",Math.max(0,time-run.getLong("start"))).put("reason",reason);
        if(position()!=null)body.put("position",position());
        run.getJSONArray("controls").put(new JSONObject().put("id",id).put("action",action).put("beforeSeq",run.getInt("nextSeq")).put("body",body));
    }
    private void pauseAt(long time,String reason) throws Exception {
        if(run==null||!"ACTIVE".equals(run.optString("state")))return;
        time=Math.max(run.getLong("start")+1,time);long active=activeMs(time);
        control("pause",UUID.randomUUID().toString(),time,reason);run.put("activeMs",active).put("state","PAUSED").put("pauseReason",reason).remove("anchor");persist();changed();
    }
    private void resumeAt(long time,String reason) throws Exception {
        if(run==null||!"PAUSED".equals(run.optString("state")))return;
        String id=UUID.randomUUID().toString();control("resume",id,time,reason);
        run.put("segmentId",id).put("segmentStart",time).put("lastMoveTime",time).put("lastMoveActive",run.optLong("activeMs")).put("state","ACTIVE").put("recovery",false).put("pauseReason","");run.remove("anchor");persist();
    }
    synchronized JSONObject pause() throws Exception { pauseAt(normalizedNow(),"USER");changed();return snapshot(); }
    synchronized JSONObject resume() throws Exception {
        if(run==null)throw new IllegalStateException("SAVED_RUN_NOT_FOUND");
        if(storageFailed)throw new IllegalStateException("RUN_STORAGE_UNAVAILABLE");
        if(run.optBoolean("reboot"))throw new IllegalStateException("FINISH_AFTER_REBOOT");
        if(!precise())throw new IllegalStateException("PRECISE_LOCATION_REQUIRED");if(!locationEnabled())throw new IllegalStateException("GPS_DISABLED");
        sessionAllowed=true;long time=normalizedNow();if(time-run.getLong("start")>=RunMath.MAX_MS)return finishAt(time,"LIMIT");
        resumeAt(time,run.optBoolean("recovery")?"PROCESS_RECOVERY":"USER");run.put("recovery",false).put("foregroundOnly",!background());persist();message="";collect();changed();return snapshot();
    }
    synchronized void suspend(String reason) throws Exception {
        if("connection".equals(reason)||"initializing".equals(reason))return;
        try{if(run!=null) { pauseAt(normalizedNow(),reason.equals("consent-withdrawn")?"CONSENT_WITHDRAWN":"SESSION_END");if(reason.equals("consent-withdrawn"))event("CONSENT_WITHDRAWN",normalizedNow(),new JSONObject());persist(); }}
        finally{sessionAllowed=false;stopCollection();if(run!=null&&!storageFailed)message="Recording stopped. Unsent data stays encrypted for this account.";changed();}
    }
    synchronized JSONObject finish() throws Exception {
        if(storageFailed)throw new IllegalStateException("RUN_STORAGE_UNAVAILABLE");
        // Public synchronous broadcast drains already queued community fixes on
        // this same main looper before the finish boundary. The barrier has no
        // watcher id or location and is ignored by the receiver itself.
        LocalBroadcastManager.getInstance(context).sendBroadcastSync(new Intent(BackgroundGeolocationService.ACTION_BROADCAST));
        if(run==null)throw new IllegalStateException("SAVED_RUN_NOT_FOUND");
        return finishAt(run.optBoolean("reboot")?Math.max(run.getLong("start")+1,run.optLong("lastTime",run.getLong("start")+1)):normalizedNow(),run.optBoolean("reboot")?"RECOVERY":"USER");
    }
    private JSONObject finishAt(long time,String reason) throws Exception {
        if(run==null||Arrays.asList("FINISHING","UPLOADING","DISCARDING").contains(run.optString("state")))return snapshot();
        time=Math.max(run.getLong("start")+1,Math.min(run.getLong("start")+RunMath.MAX_MS,time));
        long finalActive=reason.equals("STATIONARY")?run.optLong("lastMoveActive"):activeMs(time);
        JSONObject body=new JSONObject().put("endedAt",iso(time)).put("lastSeq",run.getInt("nextSeq")-1).put("reason",reason).put("invalidDroppedTotal",run.optInt("invalid"));
        run.getJSONArray("controls").put(new JSONObject().put("id",UUID.randomUUID().toString()).put("action","finish").put("beforeSeq",run.getInt("nextSeq")).put("body",body));
        run.put("activeMs",finalActive).put("state","FINISHING").put("finishTime",time).put("recovery",false);persist();stopCollection();message="Run saved on this phone. Upload will finish when connected.";changed();return snapshot();
    }
    synchronized JSONObject retryStorage() throws Exception {
        storageFailed=false;
        try{
            if(run!=null){JSONObject saved=store.get(owner,"run",run.getString("runId"));if(saved==null)throw new IllegalStateException("RUN_STORAGE_UNAVAILABLE");run=saved;}
            while(!rescue.isEmpty()){
                PendingFix pending=rescue.peekFirst();
                if(run==null||!run.getString("runId").equals(pending.meta.getString("runId")))throw new IllegalStateException("RUN_STORAGE_UNAVAILABLE");
                store.transaction(()->{store.put(owner,"point:"+pending.meta.getString("runId"),RunStore.seq(pending.point.getInt("seq")),pending.point);store.put(owner,"run",pending.meta.getString("runId"),pending.meta);});
                run=copy(pending.meta);rescue.removeFirst();
            }
            if(run!=null&&!"DISCARDING".equals(run.optString("state"))){
                long pauseTime=Math.max(run.getLong("start")+1,Math.max(run.optLong("segmentStart"),run.optLong("lastTime",run.getLong("start")+1)));
                pauseAt(pauseTime,"LOW_STORAGE");event("LOW_STORAGE",pauseTime,new JSONObject().put("reason","STORAGE_RESTORED"));persist();
                message="Saved data is safe. Tap Resume when you are ready.";
            }else message="Saved storage is available again.";
            changed();return snapshot();
        }catch(Exception failure){
            storageFailed=true;freezeForStorage(normalizedNow());stopCollection();message="Storage is still unavailable. Keep this app open and Retry; saved data has not been removed.";changed();throw failure;
        }
    }
    synchronized JSONObject nextUpload() throws Exception {
        if(run==null||owner==null||storageFailed)return new JSONObject();
        if(run.has("inflight"))return run.getJSONObject("inflight");
        JSONObject job=new JSONObject();JSONArray controls=run.getJSONArray("controls"),events=run.getJSONArray("events");int acknowledged=run.optInt("controlAck"),uploaded=run.optInt("uploadedSeq",-1);
        if("DISCARDING".equals(run.optString("state")))job.put("action","delete").put("id","discard").put("body",new JSONObject());
        else if(events.length()-run.optInt("eventsAck")>1000){String id=UUID.randomUUID().toString();job.put("action","signals").put("id",id).put("body",new JSONObject().put("eventId",id));}
        else{
            JSONObject control=acknowledged<controls.length()?controls.getJSONObject(acknowledged):null;
            int until=control==null?run.getInt("nextSeq"):control.getInt("beforeSeq");
            List<JSONObject> points=store.points(owner,run.getString("runId"),uploaded,until,200);
            if(!points.isEmpty()){
                JSONArray batch=new JSONArray();for(JSONObject p:points)batch.put(p);
                boolean steps=Build.VERSION.SDK_INT<29||granted(Manifest.permission.ACTIVITY_RECOGNITION);
                BatteryManager battery=(BatteryManager)context.getSystemService(Context.BATTERY_SERVICE);int level=battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                JSONObject body=new JSONObject().put("batchKey",run.getString("runId")+":"+points.get(0).getInt("seq")).put("points",batch)
                    .put("batteryLevel",level>=0&&level<=100?level:JSONObject.NULL).put("stepDelta",steps&&stepBase>=0?Math.max(0,stepTotal-run.optLong("stepSent")):JSONObject.NULL)
                    .put("invalidDropped",run.optInt("invalid")-run.optInt("invalidSent"));
                job.put("action","points").put("id",body.getString("batchKey")).put("lastSeq",points.get(points.size()-1).getInt("seq")).put("body",body);
            }else if(control!=null)job=copy(control);else if(events.length()>run.optInt("eventsAck")){String id=UUID.randomUUID().toString();job.put("action","signals").put("id",id).put("body",new JSONObject().put("eventId",id));}else return new JSONObject();
        }
        int eventThrough=Math.min(events.length(),run.optInt("eventsAck")+1000);
        JSONArray included=new JSONArray();for(int i=run.optInt("eventsAck");i<eventThrough;i++)included.put(events.getJSONObject(i));
        if(!job.getString("action").equals("delete"))job.getJSONObject("body").put("events",included);
        if("FINISHING".equals(run.optString("state")))run.put("state","UPLOADING");
        job.put("runId",run.getString("runId")).put("eventsThrough",eventThrough).put("invalidThrough",run.optInt("invalid")).put("stepThrough",stepTotal);
        run.put("inflight",job);persist();return job;
    }
    synchronized JSONObject acknowledge(String id,JSONObject response) throws Exception {
        if(run==null||!run.has("inflight"))return snapshot();JSONObject job=run.getJSONObject("inflight");
        if(!id.equals(job.getString("id")))throw new IllegalStateException("BATCH_ACK_MISMATCH");
        String action=job.getString("action");
        UploadAcknowledgement.verify(action,run.getString("runId"),job.optInt("lastSeq",-1),response);
        if(action.equals("finish")||action.equals("delete")){
            String runId=run.getString("runId");store.removeRun(owner,runId);run=null;stopCollection();message=action.equals("delete")?"Run discarded.":"Run uploaded. Territory is calculated after upload.";changed();return new JSONObject().put("completedRunId",runId).put("discarded",action.equals("delete"));
        }
        if(action.equals("points"))run.put("uploadedSeq",job.getInt("lastSeq")).put("invalidSent",job.getInt("invalidThrough")).put("stepSent",job.optLong("stepThrough"));
        else if(!action.equals("signals"))run.put("controlAck",run.optInt("controlAck")+1);
        run.put("eventsAck",job.getInt("eventsThrough")).remove("inflight");persist();message="";changed();return snapshot();
    }
    synchronized JSONObject discard() throws Exception {
        if(run==null)return snapshot();stopCollection();String id=run.getString("runId");
        JSONObject tombstone=new JSONObject().put("runId",id).put("clientRunId",run.getString("clientRunId")).put("state","DISCARDING").put("nextSeq",0).put("uploadedSeq",-1).put("controls",new JSONArray()).put("events",new JSONArray()).put("start",run.optLong("start"));
        store.transaction(()->{store.removeRun(owner,id);store.put(owner,"run",id,tombstone);});run=tombstone;rescue.clear();lastFix=null;storageFailed=false;message="Points erased on this phone. Reconnect to finish discarding the server run.";changed();return snapshot();
    }
    synchronized void erase(String id) throws Exception { String target=RunStore.namespace(id);if(target.equals(owner)){stopCollection();run=null;owner=null;lastFix=null;rescue.clear();storageFailed=false;externalFeed=false;autoGps=false;message="";sessionAllowed=false;}store.erase(target);changed(); }
    synchronized int count(String id) throws Exception {String scope=RunStore.namespace(id);return store.runs(scope).size()+(store.get(scope,"intent","start")==null?0:1);}
    synchronized JSONObject snapshot() throws Exception {
        JSONObject value=new JSONObject().put("ownerScope",owner==null?JSONObject.NULL:owner).put("startPending",owner!=null&&store.get(owner,"intent","start")!=null).put("state",run==null?"IDLE":run.optString("state")).put("message",message).put("rescueCount",rescue.size()).put("storageFailed",storageFailed);
        if(run!=null){long now=normalizedNow(),elapsed=activeMs(now);value.put("runId",run.optString("runId")).put("distanceM",run.optDouble("distance")).put("elapsedMs",elapsed).put("pointCount",run.optInt("nextSeq"))
            .put("units",run.optBoolean("miles")?"mi":"km").put("pendingActions",run.optJSONArray("controls")==null?0:run.getJSONArray("controls").length()-run.optInt("controlAck"))
            .put("pendingPoints",Math.max(0,run.optInt("nextSeq")-run.optInt("uploadedSeq",-1)-1)).put("weakGps",!run.has("lastFixMono")||RecordingPolicy.weakFix(SystemClock.elapsedRealtime()-run.optLong("lastFixMono")))
            .put("gettingGps",!run.has("lastFixMono")||(now-run.optLong("start")<15000&&!run.has("anchor"))).put("recovery",run.optBoolean("recovery")).put("reboot",run.optBoolean("reboot")).put("foregroundOnly",run.optBoolean("foregroundOnly")).put("pauseReason",run.optString("pauseReason")).put("simulated",run.optBoolean("simulated"));}
        return value;
    }
    private void tick(){synchronized(this){try{
        if(run==null)return;
        if(storageFailed){changed();return;}
        String state=run.optString("state");
        if((state.equals("ACTIVE")||state.equals("PAUSED"))&&sessionAllowed&&!run.optBoolean("recovery")){
            if(!precise()){if(!run.optString("pauseReason").equals("PERMISSION_LOST")){pauseAt(normalizedNow(),"PERMISSION_LOST");run.put("pauseReason","PERMISSION_LOST");event("PERMISSION_LOST",normalizedNow(),new JSONObject());persist();}stopCollection();message="Location permission changed. Your run is saved. Enable Precise location, then Resume.";}
            else if(!locationEnabled()){if(state.equals("ACTIVE")){pauseAt(normalizedNow(),"GPS_OFF");event("GPS_OFF",normalizedNow(),new JSONObject());persist();autoGps=true;}stopCollection();message="Location services are off. Recording is paused.";}
            else if(autoGps){autoGps=false;event("GPS_ON",normalizedNow(),new JSONObject());resumeAt(normalizedNow(),"GPS_ON");persist();collect();message="";}
            long quiet=normalizedNow()-run.optLong("lastMoveTime",run.optLong("start"));
            if(RecordingPolicy.stationary(quiet,state.equals("ACTIVE")).equals("FINISH"))finishAt(run.optLong("lastMoveTime",run.optLong("start")+1),"STATIONARY");
            else if(RecordingPolicy.stationary(quiet,"ACTIVE".equals(run.optString("state"))).equals("PAUSE")){pauseAt(normalizedNow(),"NO_MOVEMENT");event("NO_MOVEMENT",normalizedNow(),new JSONObject());persist();message="Still running? Recording is paused because you have not moved.";}
            if(run!=null&&normalizedNow()-run.optLong("start")>=RunMath.MAX_MS)finishAt(run.optLong("start")+RunMath.MAX_MS,"LIMIT");
        }
        if(run!=null&&SystemClock.elapsedRealtime()-lastSync>=30000){lastSync=SystemClock.elapsedRealtime();if(syncObserver!=null)syncObserver.run();}
        changed();
    }catch(Exception ignored){fail("Recording stopped because saved data could not be updated. Keep the app open and Retry.");}}}
    private Notification notification() throws Exception {
        String state=run==null?"Recording":run.optString("state");boolean paused=state.equals("PAUSED");
        Intent open=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(context,CHANNEL):new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_notification_hex).setOngoing(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentTitle(paused&&"NO_MOVEMENT".equals(run.optString("pauseReason"))?"Still running?":"Territory Run · "+(paused?"Paused":"Recording"))
            .setContentText(run==null?"Starting GPS…":RunMath.distanceLabel(run.optDouble("distance"),run.optBoolean("miles"))+" · "+RunMath.duration(activeMs(normalizedNow())))
            .setContentIntent(PendingIntent.getActivity(context,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
        for(String action:new String[]{paused?"resume":"pause","finish"}){Intent intent=new Intent(context,RunActionReceiver.class).setAction(action);builder.addAction(new Notification.Action.Builder(null,action.equals("finish")?"Stop":paused?"Resume":"Pause",PendingIntent.getBroadcast(context,action.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE)).build());}
        return builder.build();
    }
    synchronized void notificationAction(String action){try{if(action.equals("pause"))pause();else if(action.equals("resume"))resume();else if(action.equals("finish"))finish();if(syncObserver!=null)syncObserver.run();}catch(Exception ignored){fail("Open Territory Run to finish this action. Saved data is safe.");}}
    private void changed(){
        try{if(run!=null&&watching)((NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE)).notify(NOTICE,notification());if(observer!=null)observer.run();}catch(Exception ignored){/* State stays in the encrypted journal; no location diagnostics. */}
    }
    private void fail(String text){stopCollection();message=text;changed();}
    @Override public synchronized void onSensorChanged(SensorEvent event){double value=event.values[0];if(stepBase<0)stepBase=value;stepTotal=Math.max(stepTotal,(long)Math.max(0,value-stepBase));}
    @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}
}
