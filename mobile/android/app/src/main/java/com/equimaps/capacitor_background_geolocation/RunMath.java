package com.equimaps.capacitor_background_geolocation;

/** Pure math shared by native capture/notification tests; no Android or storage. */
public final class RunMath {
    public static final long MAX_MS = 24L * 60 * 60 * 1000;
    public static double distance(double a, double b, double c, double d) {
        double lat = Math.toRadians(c-a), lng = Math.toRadians(d-b);
        double h = Math.pow(Math.sin(lat/2),2) + Math.cos(Math.toRadians(a))*Math.cos(Math.toRadians(c))*Math.pow(Math.sin(lng/2),2);
        return 6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,h)), Math.sqrt(Math.max(0,1-h)));
    }
    public static boolean valid(double lat, double lng, double accuracy, Double speed) {
        return Double.isFinite(lat)&&Double.isFinite(lng)&&Double.isFinite(accuracy)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180&&(lat!=0||lng!=0)&&accuracy>=0&&(speed==null||Double.isFinite(speed)&&speed>=0);
    }
    public static String duration(long millis) {
        long seconds=Math.max(0,millis/1000); return String.format(java.util.Locale.ROOT, "%d:%02d",seconds/60,seconds%60);
    }
    public static String distanceLabel(double meters, boolean miles) { return String.format(java.util.Locale.ROOT,"%.2f %s",meters/(miles?1609.344:1000),miles?"mi":"km"); }
}
