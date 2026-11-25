package com.equimaps.capacitor_background_geolocation;
import org.json.JSONObject;
/** A successful HTTP status alone cannot advance or erase the durable journal. */
final class UploadAcknowledgement {
    static void verify(String action,String runId,int lastSeq,JSONObject response) throws Exception {
        boolean valid;
        if(action.equals("delete"))return;
        if(action.equals("points")){
            Object highest=response.opt("highestSeq");
            valid=highest instanceof Number&&Double.isFinite(((Number)highest).doubleValue())&&((Number)highest).doubleValue()==((Number)highest).intValue()&&((Number)highest).intValue()>=lastSeq&&response.opt("recordingAllowed") instanceof Boolean;
        } else if(action.equals("signals"))valid=Boolean.TRUE.equals(response.opt("accepted"));
        else {
            JSONObject run=response.optJSONObject("run");valid=run!=null&&runId.equals(run.optString("id"));
            if(valid&&action.equals("finish"))valid=!run.optString("status","ACTIVE").equals("ACTIVE")&&!run.isNull("endedAt")&&run.optDouble("durationS",0)>0&&Double.isFinite(run.optDouble("distanceM",Double.NaN))&&run.optDouble("distanceM",-1)>=0;
        }
        if(!valid)throw new IllegalStateException("BATCH_ACK_MISMATCH");
    }
}
