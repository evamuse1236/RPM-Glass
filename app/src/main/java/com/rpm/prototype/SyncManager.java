package com.rpm.prototype;

import android.app.job.*;
import android.content.*;
import android.security.keystore.*;
import android.util.Base64;
import org.json.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.*;
import java.util.concurrent.*;

/** Authenticated upload-only Convex mirror; the local DB is always saved first. */
final class SyncManager {
    static final ExecutorService EXECUTOR=Executors.newSingleThreadExecutor();
    private static final int ON_CHANGE=7401, PERIODIC=7402;
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("convex_sync",0);}
    static boolean configured(Context c){return !prefs(c).getString("url","").isEmpty()&&prefs(c).contains("token");}
    static String validateUrl(String raw){
        String value=raw.trim().replaceAll("/+$","");
        try{URI uri=new URI(value);
            if(!"https".equals(uri.getScheme())||uri.getHost()==null||!uri.getHost().matches("[a-z0-9-]+\\.convex\\.site")||uri.getPort()!=-1||uri.getRawQuery()!=null||uri.getRawFragment()!=null||uri.getUserInfo()!=null||!(uri.getPath()==null||uri.getPath().isEmpty()))throw new IllegalArgumentException();
        }catch(Exception e){throw new IllegalArgumentException("Use the HTTPS .convex.site deployment URL");}
        return value;
    }
    static void request(Context c){
        if(!configured(c)||prefs(c).getBoolean("auth_error",false))return;
        JobScheduler scheduler=c.getSystemService(JobScheduler.class);ComponentName service=new ComponentName(c,SyncJob.class);
        if(scheduler.getPendingJob(ON_CHANGE)==null)scheduler.schedule(new JobInfo.Builder(ON_CHANGE,service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(1000).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).setPersisted(true).build());
        if(scheduler.getPendingJob(PERIODIC)==null)scheduler.schedule(new JobInfo.Builder(PERIODIC,service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000).setPersisted(true).build());
    }
    static void now(Context c,Runnable finished){Context app=c.getApplicationContext();request(app);EXECUTOR.execute(()->{sync(app);if(finished!=null)new android.os.Handler(android.os.Looper.getMainLooper()).post(finished);});}
    /** @return whether pending work should be retried by the job scheduler. */
    static boolean sync(Context c){
        if(!configured(c)||prefs(c).getBoolean("auth_error",false))return false;
        try(Store store=new Store(c)){
            String url=prefs(c).getString("url","");String token=decrypt(prefs(c).getString("token",""));
            long deadline=android.os.SystemClock.elapsedRealtime()+25000;
            for(int batches=0;batches<8&&android.os.SystemClock.elapsedRealtime()<deadline;batches++){
                if(Thread.currentThread().isInterrupted()||!configured(c))return true;
                JSONArray batch=store.pendingBatch();if(batch.length()==0){status(c,"Up to date",true);return false;}
                JSONObject response=post(url+"/v1/sync",new JSONObject().put("events",batch),token);
                JSONArray ack=response.getJSONArray("ack");validateAck(batch,ack);
                // Delete only the exact acknowledged IDs; newer local edits remain queued.
                store.acknowledge(ack);status(c,"Synced to Convex",true);
            }
            return store.pendingCount()>0;
        }catch(Unauthorized ex){prefs(c).edit().putBoolean("auth_error",true).apply();status(c,"Connection revoked or invalid · pair again",false);return false;}
        catch(Rejected ex){status(c,"Cloud rejected a batch · data remains on phone",false);return false;}
        catch(Exception ex){status(c,"Waiting to sync · data is saved on this phone",false);return true;}
    }
    static void validateAck(JSONArray sent,JSONArray ack)throws JSONException{
        HashSet<String> expected=new HashSet<>(),actual=new HashSet<>();
        for(int i=0;i<sent.length();i++)expected.add(sent.getJSONObject(i).getString("eventId"));
        for(int i=0;i<ack.length();i++)actual.add(ack.getString(i));
        if(ack.length()!=sent.length()||!expected.equals(actual))throw new JSONException("Incomplete acknowledgement");
    }
    static void pair(Context c,String url,String code)throws Exception{
        url=validateUrl(url);if(!code.trim().matches("[a-f0-9]{32}"))throw new IllegalArgumentException("Use the 32-character pairing code from Convex setup");
        String installation;try(Store s=new Store(c)){installation=s.installationId();}
        JSONObject result=post(url+"/v1/pair",new JSONObject().put("code",code.trim()).put("installationId",installation),null);
        String token=result.getString("token");if(!token.matches("[a-f0-9]{64}"))throw new IOException("Invalid pairing response");
        String encrypted=encrypt(token);
        if(!prefs(c).edit().putString("url",url).putString("token",encrypted).putBoolean("auth_error",false).putString("status","Connected · waiting to sync").commit())throw new IOException("Could not store connection");
        try(Store store=new Store(c)){store.queueAll();}
        request(c);
    }
    static void disconnect(Context c){prefs(c).edit().clear().commit();c.getSystemService(JobScheduler.class).cancel(ON_CHANGE);c.getSystemService(JobScheduler.class).cancel(PERIODIC);}
    private static void status(Context c,String text,boolean success){if(!configured(c))return;SharedPreferences.Editor edit=prefs(c).edit().putString("status",text);if(success)edit.putLong("last_success",System.currentTimeMillis());edit.apply();}
    private static final class Unauthorized extends IOException{}
    private static final class Rejected extends IOException{}
    private static JSONObject post(String url,JSONObject payload,String token)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();
        try{
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
            if(token!=null)connection.setRequestProperty("Authorization","Bearer "+token);
            byte[] bytes=payload.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);
            try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
            int status=connection.getResponseCode();if(status==401||status==403)throw new Unauthorized();if(status==400||status==413)throw new Rejected();if(status!=200)throw new IOException("Cloud unavailable");
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>65536)throw new IOException("Response too large");out.write(buffer,0,n);}return new JSONObject(out.toString("UTF-8"));
            }
        }finally{connection.disconnect();}
    }
    private static SecretKey key()throws Exception{
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(ks.containsAlias("rpm-convex-token"))return (SecretKey)ks.getKey("rpm-convex-token",null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder("rpm-convex-token",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return generator.generateKey();
    }
    private static String encrypt(String token)throws Exception{
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());return Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
    }
    private static String decrypt(String encrypted)throws Exception{
        String[] parts=encrypted.split(":");if(parts.length!=2)throw new IOException("Connection needs pairing");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
    }
}
