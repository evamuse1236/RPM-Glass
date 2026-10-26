package com.rpm.prototype;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class ModelStreamTest {
    private static String event(JSONObject value){return "data: "+value+"\n\n";}
    @Test public void claudeDeltasReachThePageAndFinalResponseKeepsUsage()throws Exception{
        String stream=event(new JSONObject("{type:'message_start',message:{model:'claude-haiku-5-5',usage:{input_tokens:12}}}"))
            +event(new JSONObject("{type:'content_block_start',index:0,content_block:{type:'text',text:''}}"))
            +event(new JSONObject("{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'hé'}}"))
            +event(new JSONObject("{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:3}}"))
            +event(new JSONObject("{type:'message_stop'}"));
        List<String> chunks=new ArrayList<>();JSONObject result=ModelStream.read(new ByteArrayInputStream(stream.getBytes(StandardCharsets.UTF_8)),true,chunks::add);
        assertEquals(List.of("hé"),chunks);assertEquals("hé",result.getJSONArray("content").getJSONObject(0).getString("text"));
        assertEquals("end_turn",result.getString("stop_reason"));assertEquals(12,result.getJSONObject("usage").getInt("input_tokens"));assertEquals(3,result.getJSONObject("usage").getInt("output_tokens"));
    }
    @Test public void openRouterKeepsMetadataAndRejectsTruncation()throws Exception{
        String stream=event(new JSONObject("{model:'anthropic/claude-haiku-5.5',provider:'Anthropic',choices:[{delta:{content:'{}'},finish_reason:null}]}"))
            +event(new JSONObject("{choices:[{delta:{},finish_reason:'stop'}],usage:{completion_tokens:2}}"));
        try{ModelStream.read(new ByteArrayInputStream(stream.getBytes(StandardCharsets.UTF_8)),false,s->{});fail();}catch(IOException expected){}
        JSONObject result=ModelStream.read(new ByteArrayInputStream((stream+"data: [DONE]\n\n").getBytes(StandardCharsets.UTF_8)),false,s->{});
        assertEquals("Anthropic",result.getString("provider"));assertEquals("{}",result.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content"));
        assertEquals("stop",result.getJSONArray("choices").getJSONObject(0).getString("finish_reason"));
    }
}
