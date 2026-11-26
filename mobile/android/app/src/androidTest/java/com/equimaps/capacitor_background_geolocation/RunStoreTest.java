package com.equimaps.capacitor_background_geolocation;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Uses only fresh, random fixture namespaces. Never resets the app database. */
@RunWith(AndroidJUnit4.class)
public class RunStoreTest {
    private RunStore store;
    private Context context;
    private String owner,other;
    @Before public void setup() throws Exception {
        context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        owner=RunStore.namespace(UUID.randomUUID().toString());other=RunStore.namespace(UUID.randomUUID().toString());store=new RunStore(context);
    }
    @After public void cleanup() throws Exception {store.failWritesForTest=false;store.erase(owner);store.erase(other);store.close();}
    @Test public void LIFE_07_pointsAreAuthenticatedCiphertextWithFreshNonces() throws Exception {
        JSONObject point=new JSONObject().put("lat",18.123456).put("lng",73.234567).put("seq",0);
        byte[] first=store.seal(owner,"point:r","0",point),second=store.seal(owner,"point:r","0",point);
        assertFalse(java.util.Arrays.equals(first,second));
        assertFalse(new String(first,StandardCharsets.ISO_8859_1).contains("18.123456"));
        assertEquals(point.toString(),store.open(owner,"point:r","0",first).toString());
        try {store.open(owner,"point:r","1",first);fail("AAD transplant accepted");}catch(javax.crypto.AEADBadTagException expected){}
        first[first.length-1]^=1;
        try {store.open(owner,"point:r","0",first);fail("Tampered ciphertext accepted");}catch(javax.crypto.AEADBadTagException expected){}
    }
    @Test public void LIFE_04_failedWriteRollsBackPointAndAcknowledgementTogether() throws Exception {
        store.put(owner,"run","r",new JSONObject().put("uploadedSeq",-1));
        try {store.transaction(()->{
            store.put(owner,"point:r",RunStore.seq(0),new JSONObject().put("seq",0));
            store.failWritesForTest=true;store.put(owner,"run","r",new JSONObject().put("uploadedSeq",0));
        });fail("Write failure was swallowed");}catch(IllegalStateException expected){}finally{store.failWritesForTest=false;}
        assertNull(store.get(owner,"point:r",RunStore.seq(0)));assertEquals(-1,store.get(owner,"run","r").getInt("uploadedSeq"));
    }
    @Test public void LIFE_03_and_LIFE_05_committedPointsSurviveProcessStyleReopen() throws Exception {
        store.transaction(()->{for(int seq=0;seq<205;seq++)store.put(owner,"point:r",RunStore.seq(seq),new JSONObject().put("seq",seq));store.put(owner,"run","r",new JSONObject().put("nextSeq",205));});
        store.close();store=new RunStore(context);
        assertEquals(205,store.get(owner,"run","r").getInt("nextSeq"));
        assertEquals(200,store.points(owner,"r",-1,205,200).size());assertEquals(5,store.points(owner,"r",199,205,200).size());
    }
    @Test public void PRIV_04_erasureRemovesOnlyTheDeletedOwnerAndItsKey() throws Exception {
        JSONObject value=new JSONObject().put("fixture","private");
        byte[] sealed=store.seal(owner,"run","r",value);
        store.put(owner,"run","r",value);store.put(other,"run","r",value);store.put(owner,"intent","start",value);
        store.erase(owner);
        assertNull(store.get(owner,"run","r"));assertNull(store.get(owner,"intent","start"));assertNotNull(store.get(other,"run","r"));
        try {store.open(owner,"run","r",sealed);fail("Erased key remained readable");}catch(IllegalStateException expected){}
    }
    @Test public void LIFE_07_malformedAcknowledgementsNeverAuthorizeJournalErasure() throws Exception {
        JSONObject pointAck=new JSONObject().put("highestSeq",500).put("recordingAllowed",true);
        UploadAcknowledgement.verify("points","run",199,pointAck);
        for(JSONObject bad:new JSONObject[]{new JSONObject(),new JSONObject().put("highestSeq",198).put("recordingAllowed",true),new JSONObject().put("highestSeq","500").put("recordingAllowed",true)}){
            try{UploadAcknowledgement.verify("points","run",199,bad);fail("Invalid acknowledgement accepted");}catch(IllegalStateException expected){}
        }
        try{UploadAcknowledgement.verify("finish","run",199,new JSONObject().put("message","ok"));fail("Missing result accepted");}catch(IllegalStateException expected){}
        JSONObject result=new JSONObject().put("run",new JSONObject().put("id","run").put("status","PENDING_VALIDATION").put("endedAt","2026-11-14T00:00:30.000Z").put("durationS",30).put("distanceM",10));
        UploadAcknowledgement.verify("finish","run",199,result);
        try{UploadAcknowledgement.verify("finish","other-run",199,result);fail("Another run acknowledged");}catch(IllegalStateException expected){}
    }

}
