package com.rpm.prototype;

import org.json.*;
import org.junit.*;
import java.nio.file.*;
import java.util.*;
import static org.junit.Assert.*;

public class SyncStampsTest {
    static final String AT="2026-10-27T10:00:00Z";
    static Path repo(String path){Path p=Paths.get(path);return Files.exists(p)?p:Paths.get("..",path);}
    static JSONObject json(String path)throws Exception{return new JSONObject(new String(Files.readAllBytes(repo(path)),java.nio.charset.StandardCharsets.UTF_8));}
    @BeforeClass public static void contract()throws Exception{try(var in=Files.newInputStream(repo("web/contract/records.json"))){SyncStamps.load(in);}}
    static JSONObject copy(JSONObject value)throws Exception{return new JSONObject(value.toString());}
    static JSONObject task()throws Exception{return new JSONObject("{entries:[{id:1,title:'Before',raw:'Before',revisions:[],alertIntent:{type:'reminder',private:{nested:1}}}]}");}
    static JSONObject stamps(JSONObject store)throws Exception{return store.getJSONObject("sync").getJSONObject("stamps");}

    static Set<String> keys(JSONObject value){Set<String> result=new TreeSet<>();value.keys().forEachRemaining(result::add);return result;}
    static Object tree(Object value)throws Exception {
        if(value instanceof JSONObject){Map<String,Object> result=new TreeMap<>();for(String key:keys((JSONObject)value))result.put(key,tree(((JSONObject)value).get(key)));return result;}
        if(value instanceof JSONArray){List<Object> result=new ArrayList<>();for(int i=0;i<((JSONArray)value).length();i++)result.add(tree(((JSONArray)value).get(i)));return result;}
        return value;
    }
    static void assertJson(JSONObject a,JSONObject b)throws Exception{assertEquals(tree(a),tree(b));}

    @Test public void seedKeysAndAllGroupsMatchTheGoldenFixture()throws Exception {
        JSONObject seed=json("web/fixtures/snapshot.json"),golden=json("fixtures/record-keys.json");
        SyncStamps.stamp(new JSONObject(),seed,AT);
        JSONObject actual=stamps(seed);TreeSet<String> expected=new TreeSet<>();
        for(int i=0;i<golden.getJSONArray("keys").length();i++)expected.add(golden.getJSONArray("keys").getString(i));
        assertEquals(expected,keys(actual));
        for(String key:keys(actual)){
            JSONObject groups=golden.getJSONObject("groups").getJSONObject(key.substring(0,key.indexOf(':')));
            assertEquals(key,keys(groups),keys(actual.getJSONObject(key)));
            for(String group:keys(groups))assertEquals(AT,actual.getJSONObject(key).getString(group));
        }

    }
    @Test public void onlyChangedGroupsAreStampedAndPriorStampsSurvive()throws Exception {
        JSONObject old=task();SyncStamps.stamp(new JSONObject(),old,"earlier");JSONObject next=copy(old);
        next.getJSONArray("entries").getJSONObject(0).put("title","After").put("plannedDate","2026-10-28");
        SyncStamps.stamp(old,next,AT);JSONObject groups=stamps(next).getJSONObject("task:1");
        assertEquals(AT,groups.getString("title"));assertEquals(AT,groups.getString("schedule"));
        for(String group:keys(groups))if(!Set.of("title","schedule").contains(group))assertEquals("earlier",groups.getString(group));
    }
    @Test public void comparesRawNestedValuesAndDistinguishesAbsentFromNull()throws Exception {
        JSONObject old=task(),next=copy(old);JSONObject entry=next.getJSONArray("entries").getJSONObject(0);
        entry.getJSONObject("alertIntent").getJSONObject("private").put("nested",2);entry.put("notes",JSONObject.NULL);
        SyncStamps.stamp(old,next,AT);
        assertEquals(Set.of("alertIntent","notes"),keys(stamps(next).getJSONObject("task:1")));
        JSONObject reordered=copy(next);reordered.getJSONArray("entries").getJSONObject(0).put("alertIntent",new JSONObject("{private:{nested:2},type:'reminder'}"));
        next.remove("sync");reordered.remove("sync");SyncStamps.stamp(next,reordered,AT);assertEquals(0,stamps(reordered).length());
    }
    @Test public void checkinsAndDeletedRecordsAreNeverStamped()throws Exception {
        JSONObject old=task(),next=new JSONObject("{entries:[{id:2,kind:'checkin',title:'Private'}]}");
        SyncStamps.stamp(old,next,AT);assertEquals(0,stamps(next).length());
    }
    @Test public void nullKindIsAPlanAndOtherKindsAreExcluded()throws Exception {
        JSONObject next=new JSONObject("{entries:[{id:1,kind:null},{id:2,kind:'other'}]}");
        SyncStamps.stamp(null,next,AT);assertEquals(Set.of("task:1"),keys(stamps(next)));
    }
    @Test public void duplicateGlassesUseOccurrenceKeys()throws Exception {
        JSONObject next=new JSONObject("{planner:{body:{water:{glasses:['instant','instant']}}}}");
        SyncStamps.stamp(new JSONObject(),next,AT);assertEquals(Set.of("glass:instant#0","glass:instant#1"),keys(stamps(next)));
    }
    @Test public void captureAliasesAndAlternateDraftsCompareTheirRawFields()throws Exception {
        JSONObject old=new JSONObject("{planner:{drafts:[{id:'d',title:'Stale'}]},intentV2:{captures:{c:{messageId:'c',raw:'Words',at:'then'}},drafts:{d:{id:'d',title:'Current',receipt:{private:1}}}}}"),next=copy(old);
        next.getJSONObject("intentV2").getJSONObject("captures").getJSONObject("c").put("raw","New words");
        next.getJSONObject("intentV2").getJSONObject("drafts").getJSONObject("d").getJSONObject("receipt").put("private",2);
        SyncStamps.stamp(old,next,AT);assertEquals(Set.of("text"),keys(stamps(next).getJSONObject("capture:c")));
        assertEquals(Set.of("receipt"),keys(stamps(next).getJSONObject("draft:d")));
    }
}
