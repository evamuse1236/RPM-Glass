package com.rpm.prototype;

import java.util.Map;

/** Which OpenRouter chat models the phone may call, how many tokens each may ask for, and how long it may take. */
final class ModelLimits {
    static final String HAIKU="anthropic/claude-haiku-5.5",SONNET="anthropic/claude-sonnet-5.5";
    static final int MAX_BODY_CHARS=2000000;
    private static final class Limit {final int maxTokens,readTimeoutMs;Limit(int maxTokens,int readTimeoutMs){this.maxTokens=maxTokens;this.readTimeoutMs=readTimeoutMs;}}
    private static final Map<String,Limit> CHAT=Map.of(
        HAIKU,new Limit(6000,40000),
        SONNET,new Limit(16000,95000),
        "openai/gpt-6-luna",new Limit(3500,30000),
        "openai/gpt-5.6-luna",new Limit(3500,30000));
    private ModelLimits(){}

    /** The read timeout for an allowed request, or -1 when the model, token count or size is not allowed. */
    static int readTimeoutMs(String model,int maxTokens,int bodyChars){
        Limit limit=model==null?null:CHAT.get(model);
        if(limit==null||maxTokens<1||maxTokens>limit.maxTokens||bodyChars<1||bodyChars>MAX_BODY_CHARS)return -1;
        return limit.readTimeoutMs;
    }
}
