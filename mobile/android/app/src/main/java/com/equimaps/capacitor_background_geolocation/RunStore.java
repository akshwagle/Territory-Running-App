package com.equimaps.capacitor_background_geolocation;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** App-owned transactional ciphertext journal. Dependency files are unmodified. */
public final class RunStore extends SQLiteOpenHelper {
    private static final int VERSION = 1;
    private static final String PREFIX = "territory.run.v1.";
    private final KeyStore keys;
    boolean failWritesForTest;

    public RunStore(Context context) throws Exception {
        super(context.getApplicationContext(), "territory-runs-v1.db", null, VERSION);
        keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
        getWritableDatabase();
    }
    @Override public void onConfigure(SQLiteDatabase db) {
        db.execSQL("PRAGMA synchronous=FULL");
        db.setForeignKeyConstraintsEnabled(true);
    }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE records(owner TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,payload BLOB NOT NULL,PRIMARY KEY(owner,kind,id))");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Additive future upgrades only; never drop a recoverable journal.
        if (oldVersion != newVersion) throw new IllegalStateException("RUN_STORE_UPGRADE_REQUIRED");
    }
    @Override public void onDowngrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("RUN_STORE_DOWNGRADE_BLOCKED");
    }
    public static String namespace(String ownerId) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(ownerId.getBytes(StandardCharsets.UTF_8));
        StringBuilder text = new StringBuilder();
        for (byte b : hash) text.append(String.format(java.util.Locale.ROOT, "%02x", b));
        return text.toString();
    }
    private boolean hasRows(String owner) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM records WHERE owner=? LIMIT 1", new String[]{owner})) { return c.moveToFirst(); }
    }
    private SecretKey key(String owner, boolean creating) throws Exception {
        SecretKey key = (SecretKey) keys.getKey(PREFIX + owner, null);
        if (key == null) {
            if (!creating || hasRows(owner)) throw new IllegalStateException("RUN_KEY_UNAVAILABLE");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(PREFIX + owner, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());
            key = generator.generateKey();
        }
        return key;
    }
    private byte[] aad(String owner, String kind, String id) {
        return ("territory-run-record-v1|" + owner + "|" + kind + "|" + id).getBytes(StandardCharsets.UTF_8);
    }
    byte[] seal(String owner, String kind, String id, JSONObject value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(owner, true));
        cipher.updateAAD(aad(owner, kind, id));
        byte[] iv = cipher.getIV(), ciphertext = cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8));
        if (iv.length != 12) throw new IllegalStateException("INVALID_GCM_NONCE");
        return ByteBuffer.allocate(iv.length + ciphertext.length).put(iv).put(ciphertext).array();
    }
    JSONObject open(String owner, String kind, String id, byte[] payload) throws Exception {
        if (payload.length < 28) throw new IllegalStateException("INVALID_ENCRYPTED_RECORD");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(owner, false), new GCMParameterSpec(128, payload, 0, 12));
        cipher.updateAAD(aad(owner, kind, id));
        return new JSONObject(new String(cipher.doFinal(payload, 12, payload.length - 12), StandardCharsets.UTF_8));
    }
    public synchronized JSONObject get(String owner, String kind, String id) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT payload FROM records WHERE owner=? AND kind=? AND id=?", new String[]{owner, kind, id})) {
            return c.moveToFirst() ? open(owner, kind, id, c.getBlob(0)) : null;
        }
    }
    public synchronized void put(String owner, String kind, String id, JSONObject value) throws Exception {
        if (failWritesForTest) throw new IllegalStateException("SIMULATED_STORAGE_FAILURE");
        byte[] encrypted = seal(owner, kind, id, value);
        getWritableDatabase().execSQL("INSERT OR REPLACE INTO records(owner,kind,id,payload) VALUES(?,?,?,?)", new Object[]{owner, kind, id, encrypted});
    }
    public interface Work { void run() throws Exception; }
    public synchronized void transaction(Work work) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try { work.run(); db.setTransactionSuccessful(); } finally { db.endTransaction(); }
    }
    public synchronized List<JSONObject> points(String owner, String run, int after, int before, int limit) throws Exception {
        List<JSONObject> values = new ArrayList<>();
        String kind = "point:" + run;
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id,payload FROM records WHERE owner=? AND kind=? AND id>? AND id<? ORDER BY id LIMIT ?",
            new String[]{owner, kind, seq(after), seq(before), Integer.toString(limit)})) {
            while (c.moveToNext()) values.add(open(owner, kind, c.getString(0), c.getBlob(1)));
        }
        return values;
    }
    public static String seq(int value) { return String.format(java.util.Locale.ROOT, "%010d", value); }
    public synchronized List<JSONObject> runs(String owner) throws Exception {
        List<JSONObject> values = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id,payload FROM records WHERE owner=? AND kind='run'", new String[]{owner})) {
            while (c.moveToNext()) values.add(open(owner, "run", c.getString(0), c.getBlob(1)));
        }
        return values;
    }
    public synchronized int countAll() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT count(*) FROM records WHERE kind IN ('run','intent')", null)) { c.moveToFirst(); return c.getInt(0); }
    }
    public synchronized void remove(String owner,String kind,String id) { getWritableDatabase().delete("records","owner=? AND kind=? AND id=?",new String[]{owner,kind,id}); }
    public synchronized void removeRun(String owner, String run) {
        getWritableDatabase().delete("records", "owner=? AND ((kind='run' AND id=?) OR kind=?)", new String[]{owner, run, "point:" + run});
    }
    public synchronized void erase(String owner) throws Exception {
        getWritableDatabase().delete("records", "owner=?", new String[]{owner});
        keys.deleteEntry(PREFIX + owner);
    }
}
