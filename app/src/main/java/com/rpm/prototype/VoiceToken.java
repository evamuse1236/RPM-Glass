package com.rpm.prototype;

import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import okhttp3.MediaType;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Mints a one-use Gemini Live token for voice mode. The page sends the session setup; this class checks it,
 * locks the model, and asks Google for a token bound to that setup. The key never leaves Java, and neither
 * the key nor the token is logged. Every failure is a plain sentence the page can show.
 */
final class VoiceToken {
    static final String ENDPOINT="https://generativelanguage.googleapis.com/v1alpha/auth_tokens";
    static final String ORIGIN="https://generativelanguage.googleapis.com/";
    static final String LIVE_URL="wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";
    static final String MODEL="models/gemini-3.8-live";
    static final int MAX_SETUP_BYTES=64*1024;
    static final long GAP_MS=3000;
    private static final Set<String> FIELDS=Set.of("model","generationConfig","systemInstruction","tools","inputAudioTranscription","outputAudioTranscription","realtimeInputConfig");
    private static long last=Long.MIN_VALUE/2;
    private VoiceToken(){}

    /** The setup to bind, with the model set by Java, or an IllegalArgumentException with a plain sentence. */
    static JSONObject check(Object raw)throws Exception{
        if(!(raw instanceof JSONObject))throw new IllegalArgumentException("Voice setup is missing.");
        JSONObject setup=(JSONObject)raw;
        if(setup.toString().getBytes(StandardCharsets.UTF_8).length>MAX_SETUP_BYTES)throw new IllegalArgumentException("Voice setup is too large.");
        for(Iterator<String> keys=setup.keys();keys.hasNext();)if(!FIELDS.contains(keys.next()))throw new IllegalArgumentException("Voice setup has a field the phone does not allow.");
        if(setup.has("realtimeInputConfig")&&!detectionAllowed(setup.opt("realtimeInputConfig")))throw new IllegalArgumentException("Voice setup has a field the phone does not allow.");
        JSONObject config=setup.optJSONObject("generationConfig");
        JSONArray modalities=config==null?null:config.optJSONArray("responseModalities");
        if(modalities==null||modalities.length()!=1||!"AUDIO".equals(modalities.opt(0)))throw new IllegalArgumentException("Voice setup must answer in audio.");
        JSONObject copy=new JSONObject(setup.toString());copy.put("model",MODEL);return copy;
    }

    /** Manual turns (the website's one ramble) or the phone's open line; nothing else. */
    static boolean detectionAllowed(Object raw){
        if(!(raw instanceof JSONObject))return false;
        JSONObject config=(JSONObject)raw;
        if(config.length()!=1||!(config.opt("automaticActivityDetection") instanceof JSONObject))return false;
        JSONObject d=config.optJSONObject("automaticActivityDetection");
        if(d.length()==1)return Boolean.TRUE.equals(d.opt("disabled"));
        Object silence=d.opt("silenceDurationMs");
        return d.length()==3&&Boolean.FALSE.equals(d.opt("disabled"))&&"END_SENSITIVITY_HIGH".equals(d.opt("endOfSpeechSensitivity"))
            &&(silence instanceof Integer||silence instanceof Long)&&((Number)silence).longValue()==500;
    }

    static JSONObject body(JSONObject setup,long now)throws Exception{
        return new JSONObject().put("uses",1).put("expireTime",iso(now+10*60_000L)).put("newSessionExpireTime",iso(now+60_000L)).put("bidiGenerateContentSetup",setup);
    }

    /** True and records the time when a token may be minted now; false within {@link #GAP_MS} of the last one. */
    static synchronized boolean claim(long now){if(now-last<GAP_MS)return false;last=now;return true;}
    static synchronized void resetForTest(){last=Long.MIN_VALUE/2;}

    /** Opens TLS to Gemini on a background thread. Sends no key and does not count as a mint. */
    static void warm(){warm(ORIGIN);}
    static java.util.concurrent.CompletableFuture<Void> warm(String endpoint){return ModelHttpClient.warm(endpoint);}

    /** {token,url} for a checked setup, or {missingKey:true} when the phone has no Gemini key. The key is read only after the setup passes. */
    static JSONObject mint(java.util.concurrent.Callable<String> keys,Object rawSetup,String endpoint,long now)throws Exception{
        JSONObject setup=check(rawSetup);
        String key=keys.call();
        if(key==null||key.isEmpty())return new JSONObject().put("missingKey",true);
        if(!claim(now))throw new IllegalStateException("Voice is starting. Try again in a few seconds.");
        Request request=new Request.Builder().url(endpoint).header("x-goog-api-key",key).post(RequestBody.create(body(setup,now).toString(),MediaType.get("application/json"))).build();
        String name;
        try(Response response=ModelHttpClient.call(request,15000).execute()){
            if(!response.isSuccessful()||response.body()==null)throw new IllegalStateException(response.code()==400||response.code()==401||response.code()==403?"Gemini refused the key. Check it in Settings.":"Voice is unavailable right now.");
            name=new JSONObject(response.body().string()).optString("name","");
        }catch(java.io.IOException e){throw new IllegalStateException("Voice needs the internet. Check the connection.");}
        catch(org.json.JSONException e){throw new IllegalStateException("Voice is unavailable right now.");}
        if(!name.startsWith("auth_tokens/"))throw new IllegalStateException("Voice is unavailable right now.");
        return new JSONObject().put("token",name).put("url",LIVE_URL);
    }

    private static String iso(long at){SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(new Date(at));}
}
