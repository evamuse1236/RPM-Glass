package com.rpm.prototype;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import javax.net.ssl.HttpsURLConnection;

/** The only path from the bundled pages to an AI service: an allowlisted model or Jev request, posted with that service's encrypted key. */
final class ModelGateway {
    private static final String CHAT_ENDPOINT="https://openrouter.ai/api/v1/chat/completions",DECISION_ENDPOINT="https://openrouter.ai/api/alpha/decisions",CLAUDE_ENDPOINT="https://api.anthropic.com/v1/messages";
    private final Context context;
    ModelGateway(Context context){this.context=context;}
    /** Posts {@code body} to {@code service}. Answers {@code missingKey:true} instead of calling when that service has no key, so the page can try the next one. */
    JSONObject model(JSONObject body,CompanionKey.Service service,ModelRequests.Request request)throws Exception{
        request.check();
        int readTimeout=ModelLimits.readTimeoutMs(service,body.optString("model"),body.optInt("max_tokens"),body.toString().length());
        if(readTimeout<0)throw new IllegalArgumentException("Unsupported AI request.");
        String key=CompanionKey.get(context,service);
        if(key==null)return new JSONObject().put("status",0).put("missingKey",true).put("service",service.id);
        return post(service==CompanionKey.Service.CLAUDE?CLAUDE_ENDPOINT:CHAT_ENDPOINT,service,key,body,request,readTimeout).put("service",service.id);
    }
    JSONObject decision(JSONObject body,ModelRequests.Request request)throws Exception{
        request.check();validateDecision(body);String key=CompanionKey.get(context,CompanionKey.Service.OPENROUTER);if(key==null)throw new IllegalStateException("Connect an OpenRouter key in Settings.");return post(DECISION_ENDPOINT,CompanionKey.Service.OPENROUTER,key,body,request,12000);
    }
    private static void validateDecision(JSONObject body)throws Exception{
        if(!body.optString("model").equals("typesafe/jev-1.13")||body.toString().length()>500000)throw new IllegalArgumentException("Unsupported Jev request.");
        Set<String> top=Set.of("model","state","questions");for(Iterator<String> keys=body.keys();keys.hasNext();)if(!top.contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev request field.");
        JSONObject state=body.getJSONObject("state"),questions=body.getJSONObject("questions");JSONArray tasks=state.getJSONArray("tasks"),blocks=state.getJSONArray("blocks");if(tasks.length()<1||tasks.length()>24||blocks.length()<1||blocks.length()>12||questions.length()!=tasks.length())throw new IllegalArgumentException("Unsupported Jev grouping size.");
        for(Iterator<String> keys=state.keys();keys.hasNext();)if(!Set.of("tasks","blocks").contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev state field.");
        for(int i=0;i<tasks.length();i++){JSONObject task=tasks.getJSONObject(i);for(Iterator<String> keys=task.keys();keys.hasNext();)if(!Set.of("id","title").contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev task field.");if(task.getLong("id")<=0||task.getString("title").isBlank()||task.getString("title").length()>200)throw new IllegalArgumentException("Unsupported Jev task.");if(!questions.has("assignment_"+i))throw new IllegalArgumentException("Missing Jev task decision.");}
        for(int i=0;i<blocks.length();i++){JSONObject block=blocks.getJSONObject(i);for(Iterator<String> keys=block.keys();keys.hasNext();)if(!Set.of("id","title","purpose","projectTitle").contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev block field.");if(block.getString("id").isBlank()||block.getString("id").length()>160||block.getString("title").isBlank()||block.getString("title").length()>200||block.getString("purpose").length()>2000||block.getString("projectTitle").length()>200)throw new IllegalArgumentException("Unsupported Jev block.");}
        for(Iterator<String> ids=questions.keys();ids.hasNext();){String id=ids.next();if(!id.matches("assignment_[0-9]{1,2}"))throw new IllegalArgumentException("Unsupported Jev question.");JSONObject question=questions.getJSONObject(id);for(Iterator<String> keys=question.keys();keys.hasNext();)if(!Set.of("type","instructions","criteria").contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev question field.");if(!"choice".equals(question.optString("type"))||question.optString("instructions").length()<20||question.optString("instructions").length()>1000)throw new IllegalArgumentException("Unsupported Jev question type.");JSONObject criteria=question.getJSONObject("criteria");if(criteria.length()!=blocks.length()+1||!criteria.has("keep_unsorted"))throw new IllegalArgumentException("Unsupported Jev choices.");for(int i=0;i<blocks.length();i++)if(!criteria.has("block_"+i))throw new IllegalArgumentException("Missing Jev block choice.");for(Iterator<String> choices=criteria.keys();choices.hasNext();){String choice=choices.next();if(!choice.equals("keep_unsorted")&&!choice.matches("block_[0-9]{1,2}"))throw new IllegalArgumentException("Unsupported Jev choice.");String description=criteria.getString(choice);if(description.isBlank()||description.length()>1000)throw new IllegalArgumentException("Unsupported Jev choice description.");}}
    }
    private JSONObject post(String endpoint,CompanionKey.Service service,String key,JSONObject body,ModelRequests.Request request,int readTimeout)throws Exception{
        HttpsURLConnection connection=(HttpsURLConnection)new URL(endpoint).openConnection();connection.setConnectTimeout(8000);connection.setReadTimeout(readTimeout);connection.setInstanceFollowRedirects(false);connection.setRequestMethod("POST");connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
        if(service==CompanionKey.Service.CLAUDE){connection.setRequestProperty("x-api-key",key);connection.setRequestProperty("anthropic-version","2023-06-01");}
        else connection.setRequestProperty("Authorization","Bearer "+key);
        try{request.attach(connection);request.check();try(OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}int code=connection.getResponseCode();request.check();if(code<200||code>=300)return new JSONObject().put("status",code).put("body",new JSONObject());try(InputStream in=connection.getInputStream()){return new JSONObject().put("status",code).put("body",new JSONObject(CompanionStore.readText(in)));}}finally{connection.disconnect();}
    }
}
