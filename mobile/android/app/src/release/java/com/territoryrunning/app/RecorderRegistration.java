package com.territoryrunning.app;
import com.getcapacitor.BridgeActivity;
import com.equimaps.capacitor_background_geolocation.TerritoryRecorderPlugin;
public final class RecorderRegistration { public static void register(BridgeActivity activity){activity.registerPlugin(TerritoryRecorderPlugin.class);} }
