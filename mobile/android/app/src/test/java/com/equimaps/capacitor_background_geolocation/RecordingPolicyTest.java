package com.equimaps.capacitor_background_geolocation;
import static org.junit.Assert.*;
import org.junit.Test;
public class RecordingPolicyTest {
 @Test public void PERM_01_permanentDenialDoesNotRequestAgain(){assertEquals("blocked",RecordingPolicy.location(false,false,true,false));assertEquals("denied",RecordingPolicy.location(false,false,false,false));}
 @Test public void PERM_03_actualGrantOverridesPreviousPromptHistory(){assertEquals("precise",RecordingPolicy.location(true,true,true,false));assertEquals("denied",RecordingPolicy.location(false,false,false,true));}
 @Test public void PERM_06_approximateGrantRemainsDistinctFromPrecise(){assertEquals("approximate",RecordingPolicy.location(false,true,true,false));}
 @Test public void LIFE_01_processDeathRequiresAnExplicitRecoveryChoice(){assertEquals("RESUME_OR_FINISH",RecordingPolicy.recovery(true,true));assertEquals("LIVE",RecordingPolicy.recovery(false,true));}
 @Test public void LIFE_03_rebootOrUnknownBootAllowsOnlyFinish(){assertEquals("FINISH_ONLY",RecordingPolicy.recovery(true,false));}
 @Test public void LIFE_08_inactivityBoundariesDoNotFinishEarly(){assertEquals("KEEP",RecordingPolicy.stationary(299999,true));assertEquals("PAUSE",RecordingPolicy.stationary(300000,true));assertEquals("KEEP",RecordingPolicy.stationary(1799999,false));assertEquals("FINISH",RecordingPolicy.stationary(1800000,false));}
 @Test public void GPS_01_coldFixWaitsForAccuracyOrFifteenSeconds(){assertFalse(RecordingPolicy.coldFix(26,14999));assertTrue(RecordingPolicy.coldFix(25,0));assertTrue(RecordingPolicy.coldFix(100,15000));}
 @Test public void GPS_06_invalidNumbersAndNegativeSpeedAreRejected(){assertFalse(RunMath.valid(Double.NaN,1,2,null));assertFalse(RunMath.valid(1,2,3,-1.0));assertFalse(RunMath.valid(0,0,3,null));assertTrue(RunMath.valid(0,1,3,null));}
 @Test public void GPS_04_staleFixBoundaryAndUnitsAreExact(){assertFalse(RecordingPolicy.weakFix(10000));assertTrue(RecordingPolicy.weakFix(10001));assertEquals("1.00 mi",RunMath.distanceLabel(1609.344,true));assertEquals("1:01",RunMath.duration(61000));}
}
