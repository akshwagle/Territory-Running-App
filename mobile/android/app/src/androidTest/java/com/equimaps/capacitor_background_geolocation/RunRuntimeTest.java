package com.equimaps.capacitor_background_geolocation;

import static org.junit.Assert.*;
import android.location.Location;
import android.os.Build;
import android.os.SystemClock;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.UUID;
import java.util.Date;
import java.util.TimeZone;
import java.util.Locale;
import java.text.SimpleDateFormat;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.Assume;
import org.junit.runner.RunWith;

/** Device-only runtime tests: random encrypted fixture namespaces, synthetic
 * mock fixes and a fake acknowledgement. No API calls or owner data are used.
 * Run after the guided mock run is finished; instrumentation restarts the app. */
@RunWith(AndroidJUnit4.class)
public class RunRuntimeTest {
    private RunRuntime runtime;
    private String owner,scope,runId,other;
    interface Work {void run() throws Exception;}
    private void main(Work work) throws Exception {
        AtomicReference<Throwable> error=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{try{work.run();}catch(Throwable failure){error.set(failure);}});
        if(error.get() instanceof Error)throw (Error)error.get();
        if(error.get() instanceof Exception)throw (Exception)error.get();
    }
    @Before public void setup() throws Exception {
        Assume.assumeTrue(Build.VERSION.SDK_INT>=31);
        owner=UUID.randomUUID().toString();scope=RunStore.namespace(owner);runId=UUID.randomUUID().toString();
        main(()->{runtime=RunRuntime.get(InstrumentationRegistry.getInstrumentation().getTargetContext());});
        Assume.assumeTrue(runtime.precise()&&runtime.locationEnabled());
        main(()->{runtime.store.failWritesForTest=false;runtime.setOwner(owner);});
    }
    @After public void cleanup() throws Exception {
        if(runtime!=null)main(()->{runtime.store.failWritesForTest=false;runtime.erase(owner);if(other!=null)runtime.erase(other);});
    }
    private static String iso(long millis){SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.ROOT);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(new Date(millis));}
    private void start(long ageMillis) throws Exception {
        long now=System.currentTimeMillis();
        JSONObject ack=new JSONObject().put("id",runId).put("clientRunId",UUID.randomUUID().toString()).put("status","ACTIVE").put("startedAt",iso(now-ageMillis));
        main(()->runtime.start(new JSONObject().put("run",ack).put("serverTime",iso(now-1000)).put("simulated",true)));
    }
    private Location fix(double lat){Location p=new Location("gps");p.setLatitude(lat);p.setLongitude(73.8);p.setAccuracy(4);p.setSpeed(2);p.setTime(System.currentTimeMillis());p.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());p.setMock(true);return p;}
    private JSONObject meta() throws Exception {return runtime.store.get(scope,"run",runId);}
    private void point(double lat) throws Exception {SystemClock.sleep(10);main(()->runtime.accept(fix(lat)));}

    @Test public void LIFE_04_failedFixIsHeldThenCommittedExactlyOnceAndTimeFreezes() throws Exception {
        start(1000);point(18.5);main(()->runtime.store.failWritesForTest=true);point(18.5001);
        final long[] elapsed={0};
        main(()->{JSONObject s=runtime.snapshot();assertEquals("PAUSED",s.getString("state"));assertTrue(s.getBoolean("storageFailed"));assertEquals(1,s.getInt("rescueCount"));assertEquals(1,s.getInt("pointCount"));elapsed[0]=s.getLong("elapsedMs");
            try{runtime.resume();fail("Resume accepted before storage recovery");}catch(IllegalStateException expected){}});
        SystemClock.sleep(30);main(()->assertEquals(elapsed[0],runtime.snapshot().getLong("elapsedMs")));
        main(()->{runtime.store.failWritesForTest=false;JSONObject s=runtime.retryStorage();assertEquals("PAUSED",s.getString("state"));assertFalse(s.getBoolean("storageFailed"));assertEquals(0,s.getInt("rescueCount"));assertEquals(2,s.getInt("pointCount"));assertEquals(2,runtime.store.points(scope,runId,-1,3,200).size());
            JSONObject job=runtime.nextUpload();assertEquals("points",job.getString("action"));assertEquals(1,job.getInt("lastSeq"));runtime.acknowledge(job.getString("id"),new JSONObject().put("highestSeq",1).put("recordingAllowed",true));assertEquals("pause",runtime.nextUpload().getString("action"));});
    }
    @Test public void LIFE_09_explicitDiscardClearsTheRescueAndRetryCannotResurrectIt() throws Exception {
        start(1000);point(18.5);main(()->runtime.store.failWritesForTest=true);point(18.5001);
        main(()->{assertEquals(1,runtime.snapshot().getInt("rescueCount"));runtime.store.failWritesForTest=false;
            JSONObject s=runtime.discard();assertEquals("DISCARDING",s.getString("state"));assertEquals(0,s.getInt("rescueCount"));assertFalse(s.getBoolean("storageFailed"));assertTrue(runtime.store.points(scope,runId,-1,10,200).isEmpty());
            assertEquals("DISCARDING",runtime.retryStorage().getString("state"));JSONObject job=runtime.nextUpload();assertEquals("delete",job.getString("action"));runtime.acknowledge(job.getString("id"),new JSONObject());assertEquals("IDLE",runtime.retryStorage().getString("state"));assertNull(meta());});
    }
    @Test public void GPS_07_aCachedPausedFixCannotEnterTheNewlyResumedSegment() throws Exception {
        start(1000);point(18.5);main(()->runtime.pause());Location cached=fix(18.5001);SystemClock.sleep(10);
        main(()->{runtime.resume();runtime.accept(cached);assertEquals(1,runtime.snapshot().getInt("pointCount"));assertEquals(0,meta().getInt("invalid"));});
        point(18.5002);main(()->assertEquals(2,runtime.snapshot().getInt("pointCount")));
    }
    @Test public void GPS_06_invalidPausedSamplesDoNotPenalizeTheRecordedRun() throws Exception {
        start(1000);point(18.5);main(()->runtime.pause());point(Double.NaN);
        main(()->{assertEquals(0,meta().getInt("invalid"));runtime.resume();});point(Double.NaN);
        main(()->{assertEquals(1,meta().getInt("invalid"));assertEquals(1,runtime.snapshot().getInt("pointCount"));});
    }
    @Test public void LIFE_08_explicitResumeResetsAnOldStationaryDeadline() throws Exception {
        start(2400000);point(18.5);main(()->runtime.pause());other=UUID.randomUUID().toString();
        main(()->{runtime.setOwner(other);JSONObject old=meta();long previous=old.getLong("start")+1;old.put("lastMoveTime",previous);runtime.store.put(scope,"run",runId,old);
            runtime.setOwner(owner);runtime.resume();JSONObject current=meta();assertEquals("ACTIVE",current.getString("state"));assertTrue(current.getLong("lastMoveTime")>previous+1200000);});
    }
}
