package com.rpm.prototype;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.util.*;

final class SyncStamps {
    private static JSONObject kinds;

    static synchronized void load(Context context)throws Exception {
        if(kinds==null)try(InputStream in=context.getAssets().open("sync/records.json")){load(in);}
    }
    static synchronized void load(InputStream in)throws Exception {
        kinds=new JSONObject(CompanionStore.readText(in));
    }
    static void stamp(JSONObject old,JSONObject next,String at)throws JSONException {
        if(kinds==null)throw new IllegalStateException("Sync record contract is not loaded.");
        JSONObject sync=object(next,"sync"),previousSync=old==null?null:old.optJSONObject("sync");
        if(previousSync!=null&&previousSync.optJSONObject("stamps")!=null)sync.put("stamps",new JSONObject(previousSync.getJSONObject("stamps").toString()));
        JSONObject stamps=object(sync,"stamps");
        for(Iterator<String> it=kinds.keys();it.hasNext();){
            String kind=it.next();JSONObject spec=kinds.getJSONObject(kind),groups=spec.getJSONObject("groups");
            Map<String,Object> before=records(old,spec),after=records(next,spec);
            for(Map.Entry<String,Object> record:after.entrySet()){
                String id=record.getKey(),key=kind+":"+id;Object previous=before.get(id),value=record.getValue();
                for(Iterator<String> names=groups.keys();names.hasNext();){
                    String group=names.next();JSONArray fields=groups.getJSONArray(group);
                    if(!before.containsKey(id)||!equal(group(previous,fields,spec),group(value,fields,spec)))object(stamps,key).put(group,at);
                }
            }
        }
    }
    private static JSONObject object(JSONObject parent,String key)throws JSONException {
        JSONObject value=parent.optJSONObject(key);if(value==null){value=new JSONObject();parent.put(key,value);}return value;
    }
    private static Object read(JSONObject store,JSONArray path)throws JSONException {
        Object value=store;
        for(int i=0;i<path.length();i++)value=value instanceof JSONObject?((JSONObject)value).opt(path.getString(i)):null;
        return value;
    }
    private static Map<String,Object> records(JSONObject store,JSONObject spec)throws JSONException {
        Map<String,Object> found=new LinkedHashMap<>();collect(store,spec,spec,found);
        JSONObject alternate=spec.optJSONObject("alternate");if(alternate!=null)collect(store,alternate,spec,found);
        return found;
    }
    private static void collect(JSONObject store,JSONObject location,JSONObject spec,Map<String,Object> found)throws JSONException {
        Object container=read(store,location.getJSONArray("path"));if(container==null)return;
        JSONObject rule=spec.getJSONObject("key");String shape=location.getString("shape");
        if(shape.equals("single")){found.put(rule.getString("constant"),container);return;}
        if(shape.equals("map")){
            if(container instanceof JSONObject)for(Iterator<String> it=((JSONObject)container).keys();it.hasNext();){String id=it.next();found.put(id,((JSONObject)container).get(id));}
            return;
        }
        if(!(container instanceof JSONArray))return;
        JSONArray list=(JSONArray)container;Map<String,Integer> counts=new HashMap<>();
        for(int i=0;i<list.length();i++){
            Object value=list.get(i);JSONObject filter=spec.optJSONObject("filter");
            if(filter!=null){
                if(!(value instanceof JSONObject))continue;
                Object field=((JSONObject)value).opt(filter.getString("field"));
                if(field==null||field==JSONObject.NULL)field=filter.get("default");
                if(!equal(field,filter.get("equals")))continue;
            }
            Object keyValue=value;
            if(rule.has("indexBase")){
                String instant=String.valueOf(value);int n=counts.getOrDefault(instant,rule.getInt("indexBase"));counts.put(instant,n+1);
                keyValue=new JSONObject().put("instant",value).put("n",n);
            }
            if(!(keyValue instanceof JSONObject))continue;
            JSONArray fields=rule.getJSONArray("fields");List<String> parts=new ArrayList<>();
            for(int j=0;j<fields.length();j++)parts.add(String.valueOf(((JSONObject)keyValue).get(fields.getString(j))));
            found.put(String.join(rule.optString("separator",""),parts),value);
        }
    }
    private static Object group(Object value,JSONArray fields,JSONObject spec)throws JSONException {
        if(fields.length()==0)return value;
        JSONObject result=new JSONObject(),aliases=spec.optJSONObject("fieldAliases");
        if(value instanceof JSONObject)for(int i=0;i<fields.length();i++){
            String field=fields.getString(i),raw=aliases==null?field:aliases.optString(field,field);
            if(((JSONObject)value).has(raw))result.put(field,((JSONObject)value).get(raw));
        }
        return result;
    }
    private static boolean equal(Object a,Object b)throws JSONException {
        if(a==b)return true;if(a==null||b==null)return false;
        if(a instanceof JSONObject&&b instanceof JSONObject){
            JSONObject left=(JSONObject)a,right=(JSONObject)b;if(left.length()!=right.length())return false;
            for(Iterator<String> it=left.keys();it.hasNext();){String key=it.next();if(!right.has(key)||!equal(left.get(key),right.get(key)))return false;}return true;
        }
        if(a instanceof JSONArray&&b instanceof JSONArray){
            JSONArray left=(JSONArray)a,right=(JSONArray)b;if(left.length()!=right.length())return false;
            for(int i=0;i<left.length();i++)if(!equal(left.get(i),right.get(i)))return false;return true;
        }
        if(a instanceof Number&&b instanceof Number)return new java.math.BigDecimal(a.toString()).compareTo(new java.math.BigDecimal(b.toString()))==0;
        return a.equals(b);
    }
}
