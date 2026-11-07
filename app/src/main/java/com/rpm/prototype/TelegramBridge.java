package com.rpm.prototype;

import java.io.IOException;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The voice agent's Telegram action. It forwards send and read to the owner's bridge on the home PC, reached over
 * Tailscale HTTPS, and copies only the fields the bridge takes. Every failure comes back as {error} in plain words.
 */
final class TelegramBridge {
    static final OkHttpClient CLIENT=new OkHttpClient.Builder().connectTimeout(5,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build();
    static final String NOT_ALLOWED="This phone is not allowed to use Telegram.";
    static final String NO_ANSWER="Telegram did not answer. Try again.";
    static final String OFFLINE="Telegram needs the home PC and Tailscale. Check the connection.";
    private TelegramBridge(){}

    static JSONObject call(JSONObject p,String base)throws Exception{return call(p,base,CLIENT);}

    static JSONObject call(JSONObject p,String base,Call.Factory transport)throws Exception{
        String op=p.optString("op");
        switch(op){
            case "connected":return new JSONObject().put("connected",usable(base));
            case "send":{
                JSONObject body=new JSONObject().put("to",p.optString("to")).put("text",p.optString("text"));
                if(p.optBoolean("dry",false))body.put("dry",true);
                return post(base,"/send",body,transport);
            }
            case "read":{
                JSONObject body=new JSONObject();
                if(p.has("chat"))body.put("chat",p.optString("chat"));
                if(p.has("limit"))body.put("limit",p.optInt("limit"));
                if(p.has("waitSeconds"))body.put("waitSeconds",p.optInt("waitSeconds"));
                return post(base,"/read",body,transport);
            }
            default:throw new IllegalArgumentException("Unsupported phone action.");
        }
    }

    static boolean usable(String base){
        if(base==null||!base.startsWith("https://"))return false;
        HttpUrl url=HttpUrl.parse(base);
        return url!=null&&!url.host().isEmpty();
    }

    private static JSONObject post(String base,String path,JSONObject body,Call.Factory transport)throws JSONException{
        if(!usable(base))return new JSONObject().put("missing",true);
        String root=base.endsWith("/")?base.substring(0,base.length()-1):base;
        Request request=new Request.Builder().url(root+path).post(RequestBody.create(body.toString(),MediaType.get("application/json"))).build();
        try(Response response=transport.newCall(request).execute()){
            String text=response.body()==null?"":response.body().string();
            JSONObject json=parse(text);
            if(response.isSuccessful())return json==null?error(NO_ANSWER):json;
            String said=json==null?"":json.optString("error","");
            if(!said.isEmpty())return error(said);
            return error(response.code()==403?NOT_ALLOWED:NO_ANSWER);
        }catch(IOException e){return error(OFFLINE);}
    }

    private static JSONObject parse(String text){try{return new JSONObject(text);}catch(JSONException e){return null;}}
    private static JSONObject error(String message)throws JSONException{return new JSONObject().put("error",message);}
}
