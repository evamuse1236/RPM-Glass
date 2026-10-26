package com.rpm.prototype;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;
import org.json.*;

final class ModelStream {
    static Consumer<String> sink(android.webkit.WebView web,java.util.function.BooleanSupplier closed,String id){
        return chunk->{if(web!=null)web.post(()->{if(!closed.getAsBoolean())web.evaluateJavascript("window.rpmBridgeChunk?.("+JSONObject.quote(id)+","+JSONObject.quote(chunk)+")",null);});};
    }
    private static void copy(JSONObject source,JSONObject target)throws JSONException{
        for(java.util.Iterator<String> keys=source.keys();keys.hasNext();){String key=keys.next();target.put(key,source.get(key));}
    }
    static JSONObject read(InputStream input,boolean claude,Consumer<String> chunks)throws Exception{
        JSONObject result=new JSONObject(),usage=new JSONObject(),message=new JSONObject();
        JSONArray content=new JSONArray();StringBuilder text=new StringBuilder();boolean complete=false;
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(input,StandardCharsets.UTF_8))){
            String line;StringBuilder data=new StringBuilder();
            while((line=reader.readLine())!=null){
                if(line.startsWith("data:")){if(data.length()>0)data.append('\n');data.append(line.substring(5).stripLeading());continue;}
                if(!line.isEmpty()||data.length()==0)continue;
                String payload=data.toString();data.setLength(0);
                if(payload.equals("[DONE]")){complete=true;break;}
                JSONObject event=new JSONObject(payload);if(event.has("error"))throw new IOException("AI stream failed; your thought is saved.");
                String delta="";
                if(claude){
                    String type=event.optString("type");
                    if(type.equals("message_start")){result=event.getJSONObject("message");usage=result.optJSONObject("usage");if(usage==null)usage=new JSONObject();}
                    if(type.equals("content_block_start")){JSONObject block=event.getJSONObject("content_block");if(block.optString("type").equals("text"))delta=block.optString("text");}
                    if(type.equals("content_block_delta")){JSONObject block=event.getJSONObject("delta");if(block.optString("type").equals("text_delta"))delta=block.optString("text");}
                    if(type.equals("message_delta")){JSONObject change=event.getJSONObject("delta");copy(change,result);JSONObject counts=event.optJSONObject("usage");if(counts!=null)copy(counts,usage);}
                    if(type.equals("message_stop")){complete=true;break;}
                }else{
                    for(String key:new String[]{"id","model","provider","usage"})if(event.has(key))result.put(key,event.get(key));
                    JSONArray choices=event.optJSONArray("choices");JSONObject choice=choices==null?null:choices.optJSONObject(0);
                    if(choice!=null){JSONObject change=choice.optJSONObject("delta");if(change!=null){delta=change.optString("content","");if(change.has("refusal")&&!change.isNull("refusal"))message.put("refusal",change.get("refusal"));}
                        if(choice.has("finish_reason")&&!choice.isNull("finish_reason"))result.put("finish_reason",choice.get("finish_reason"));}
                }
                if(!delta.isEmpty()){text.append(delta);if(text.length()>ModelLimits.MAX_BODY_CHARS)throw new IOException("AI response is too large; your thought is saved.");chunks.accept(delta);}
            }
        }
        if(!complete)throw new IOException("AI stream was interrupted; your thought is saved.");
        if(claude)return result.put("content",content.put(new JSONObject().put("type","text").put("text",text.toString()))).put("usage",usage);
        message.put("content",text.toString());Object finish=result.opt("finish_reason");result.remove("finish_reason");
        return result.put("choices",new JSONArray().put(new JSONObject().put("message",message).put("finish_reason",finish==null?JSONObject.NULL:finish)));
    }
}
