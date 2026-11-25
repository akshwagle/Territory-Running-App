package com.equimaps.capacitor_background_geolocation;
/** Deterministic decisions; Android effects stay in the runtime/permission UI. */
public final class RecordingPolicy {
    public static String stationary(long quietMillis, boolean active) {
        if (quietMillis >= 1800000) return "FINISH";
        if (active && quietMillis >= 300000) return "PAUSE";
        return "KEEP";
    }
    public static boolean weakFix(long ageMillis) { return ageMillis > 10000; }
    public static boolean coldFix(double accuracy,long elapsedMillis) { return accuracy<=25||elapsedMillis>=15000; }
    public static String location(boolean fine,boolean coarse,boolean asked,boolean rationale) {
        return fine?"precise":coarse?"approximate":asked&&!rationale?"blocked":"denied";
    }
    public static String recovery(boolean changedProcess,boolean knownSameBoot) {
        return !changedProcess?"LIVE":knownSameBoot?"RESUME_OR_FINISH":"FINISH_ONLY";
    }
}
