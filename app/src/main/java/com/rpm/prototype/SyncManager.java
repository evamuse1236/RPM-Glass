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

final class SyncManager {
    static final ExecutorService EXECUTOR=Executors.newSingleThreadExecutor();
    private static final java.util.concurrent.atomic.AtomicBoolean QUEUED=new java.util.concurrent.atomic.AtomicBoolean();
    private static final int ON_CHANGE=7401, PERIODIC=7402;
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("convex_sync",0);}
    static boolean configured(Context c){return !prefs(c).getString("url","").isEmpty()&&prefs(c).contains("token");}
    static String generation(Context c){return prefs(c).getString("generation","legacy");}
    static final class Connection {
        final String url,encrypted;
        Connection(Map<String,?> saved){url=validateUrl((String)saved.getOrDefault("url",null));encrypted=(String)saved.get("token");}
        void check(Context c)throws IOException{Map<String,?> current=prefs(c).getAll();if(Thread.currentThread().isInterrupted()||!url.equals(current.get("url"))||!Objects.equals(encrypted,current.get("token")))throw new IOException("Connection changed");}
    }
    static String validateUrl(String raw){return validateUrl(raw,BuildConfig.DEBUG);}
    static String validateUrl(String raw,boolean allowEmulatorHost){
        String value=raw.trim().replaceAll("/+$","");
        try{URI uri=new URI(value);
            boolean deployment="https".equals(uri.getScheme())&&uri.getHost()!=null&&uri.getHost().matches("[a-z0-9-]+\\.convex\\.site")&&uri.getPort()==-1;
            boolean emulatorHost=allowEmulatorHost&&"http".equals(uri.getScheme())&&"10.0.2.2".equals(uri.getHost())&&uri.getPort()>0;
            if(!(deployment||emulatorHost)||uri.getRawQuery()!=null||uri.getRawFragment()!=null||uri.getUserInfo()!=null||!(uri.getPath()==null||uri.getPath().isEmpty()))throw new IllegalArgumentException();
        }catch(Exception e){throw new IllegalArgumentException("Use the HTTPS .convex.site deployment URL");}
        return value;
    }
    static void request(Context c){
        if(!configured(c)||prefs(c).getBoolean("auth_error",false))return;
        JobScheduler scheduler=c.getSystemService(JobScheduler.class);ComponentName service=new ComponentName(c,SyncJob.class);
        if(scheduler.getPendingJob(ON_CHANGE)==null)scheduler.schedule(new JobInfo.Builder(ON_CHANGE,service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(PlannerSyncProtocol.DEBOUNCE_MS).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).setPersisted(true).build());
        if(scheduler.getPendingJob(PERIODIC)==null)scheduler.schedule(new JobInfo.Builder(PERIODIC,service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(PlannerSyncProtocol.BACKGROUND_MS).setPersisted(true).build());
    }
    static void now(Context c,Runnable finished){Context app=c.getApplicationContext();request(app);if(!QUEUED.compareAndSet(false,true))return;EXECUTOR.execute(()->{try{sync(app);}finally{QUEUED.set(false);if(finished!=null)new android.os.Handler(android.os.Looper.getMainLooper()).post(finished);}});}
    /** @return whether pending work should be retried by the job scheduler. */
    static boolean sync(Context c){
        if(!configured(c)||prefs(c).getBoolean("auth_error",false))return false;
        try{
            Connection connection=new Connection(prefs(c).getAll());String token=unlock(connection.encrypted,SyncManager::decrypt);
            PlannerSyncProtocol.Guard guard=()->connection.check(c);boolean plannerRetry=false;
            try(PlannerCommandHost host=new PlannerCommandHost(c,guard,(action,payload)->PlannerSyncProtocol.exchange(connection.url,token,action,payload,guard))){PlannerSyncProtocol.sync(host,guard);}
            catch(Unauthorized revoked){throw revoked;}
            catch(Exception failure){plannerRetry=true;}
            try(Store store=new Store(c)){
            long deadline=android.os.SystemClock.elapsedRealtime()+25000;
            for(int batches=0;batches<8&&android.os.SystemClock.elapsedRealtime()<deadline;batches++){
                guard.check();
                JSONArray batch=store.pendingBatch();if(batch.length()==0){status(c,plannerRetry?"Waiting to sync · data is saved on this phone":"Up to date",!plannerRetry);return plannerRetry;}
                JSONObject response=post(connection.url+"/v1/sync",new JSONObject().put("events",batch),token);
                guard.check();
                JSONArray ack=response.getJSONArray("ack");validateAck(batch,ack);
                // Delete only the exact acknowledged IDs; newer local edits remain queued.
                store.acknowledge(ack);status(c,plannerRetry?"Waiting to sync · data is saved on this phone":"Up to date",!plannerRetry);
            }
            return plannerRetry||store.pendingCount()>0;
            }
        }catch(Unauthorized ex){prefs(c).edit().putBoolean("auth_error",true).apply();status(c,"Connection revoked or invalid · pair again",false);return false;}
        catch(Rejected ex){status(c,"Cloud rejected a batch · data remains on phone",false);return false;}
        catch(LostKey ex){prefs(c).edit().putBoolean("auth_error",true).apply();status(c,"This phone lost its sync key · pair again",false);return false;}
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
        if(!prefs(c).edit().putString("url",url).putString("token",encrypted).putString("generation",UUID.randomUUID().toString()).remove("planner_revision").putBoolean("auth_error",false).putString("status","Connected · waiting to sync").commit())throw new IOException("Could not store connection");
        try(Store store=new Store(c)){store.queueAll();}
        request(c);
    }
    static void disconnect(Context c){prefs(c).edit().clear().commit();c.getSystemService(JobScheduler.class).cancel(ON_CHANGE);c.getSystemService(JobScheduler.class).cancel(PERIODIC);}
    private static void status(Context c,String text,boolean success){if(!configured(c))return;SharedPreferences.Editor edit=prefs(c).edit().putString("status",text);if(success)edit.putLong("last_success",System.currentTimeMillis());edit.apply();}
    static final class Unauthorized extends IOException{}
    static final class Rejected extends IOException{}
    static final class LostKey extends IOException{}
    interface Unlocker{String open(String encrypted)throws Exception;}
    static String unlock(String encrypted,Unlocker unlocker)throws IOException{
        try{return unlocker.open(encrypted);}
        catch(java.security.GeneralSecurityException|IllegalArgumentException lost){throw new LostKey();}
        catch(IOException e){throw e;}
        catch(Exception e){throw new IOException(e);}
    }
    static JSONObject web(Context c,String method,String path,JSONObject payload)throws Exception{
        if(!configured(c))throw new IOException("Pair this phone with Convex first");
        Connection connection=new Connection(prefs(c).getAll());JSONObject result=request(connection.url+path,method,payload,unlock(connection.encrypted,SyncManager::decrypt));connection.check(c);return result;
    }
    static JSONObject post(String url,JSONObject payload,String token)throws Exception{
        return request(url,"POST",payload,token);
    }
    static JSONObject request(String url,String method,JSONObject payload,String token)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();
        try{
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setRequestMethod(method);connection.setRequestProperty("Content-Type","application/json");
            if(token!=null)connection.setRequestProperty("Authorization","Bearer "+token);
            if(payload!=null){connection.setDoOutput(true);byte[] bytes=payload.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}}
            int status=connection.getResponseCode();if(status==401||status==403)throw new Unauthorized();if(status==400||status==413)throw new Rejected();if(status!=200)throw new IOException("Cloud unavailable");
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>8*1024*1024)throw new IOException("Response too large");out.write(buffer,0,n);}return new JSONObject(out.toString("UTF-8"));
            }
        }finally{connection.disconnect();}
    }
    private static SecretKey key()throws Exception{
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(ks.containsAlias("rpm-convex-token"))return (SecretKey)ks.getKey("rpm-convex-token",null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder("rpm-convex-token",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return generator.generateKey();
    }
    static String encrypt(String token)throws Exception{
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());return Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
    }
    static String decrypt(String encrypted)throws Exception{
        String[] parts=encrypted.split(":");if(parts.length!=2)throw new IOException("Connection needs pairing");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
    }
}
