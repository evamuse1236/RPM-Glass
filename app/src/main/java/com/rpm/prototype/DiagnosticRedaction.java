package com.rpm.prototype;

import org.json.*;
import java.util.*;
import java.util.regex.Pattern;

final class DiagnosticRedaction {
    private static final Pattern SECRET=Pattern.compile("^(authorization|proxy.?authorization|cookie|set.?cookie|.*password.*|.*secret.*|.*api[_-]?key.*|.*private[_-]?key.*|.*credential.*|access[_-]?token|refresh[_-]?token|client[_-]?token|session[_-]?token|token|pairing[_-]?code)$",Pattern.CASE_INSENSITIVE);
    static String text(String value,String...known){
        for(String key:known)if(key!=null&&key.length()>=8)value=value.replace(key,"[REDACTED]");
        return value.replaceAll("(?i)\\bBearer\\s+[^\\s\"'<>]+","Bearer [REDACTED]")
            .replaceAll("\\bsk-[a-zA-Z0-9_-]{12,}","[REDACTED]")
            .replaceAll("\\beyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+","[REDACTED]")
            .replaceAll("(?i)((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie|pairing[_-]?code)[\"']?\\s*[:=]\\s*[\"']?)[^\\s,;&\"'<>}]+","$1[REDACTED]")
            .replaceAll("(?i)(https?://)[^\\s/@]+:[^\\s/@]+@","$1[REDACTED]@");
    }
    static Object value(Object input,int depth,String...known)throws JSONException{
        if(depth>20)return "[Depth limit]";
        if(input instanceof String)return text((String)input,known);
        if(input instanceof JSONObject){JSONObject out=new JSONObject(),obj=(JSONObject)input;for(Iterator<String> it=obj.keys();it.hasNext();){String key=it.next();out.put(key,SECRET.matcher(key).matches()?"[REDACTED]":value(obj.get(key),depth+1,known));}return out;}
        if(input instanceof JSONArray){JSONArray out=new JSONArray(),array=(JSONArray)input;for(int i=0;i<array.length();i++)out.put(value(array.get(i),depth+1,known));return out;}
        return input;
    }
}
