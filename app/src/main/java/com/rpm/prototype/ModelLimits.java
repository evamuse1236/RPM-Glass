package com.rpm.prototype;

import java.util.Map;

/** Which chat models the phone may call on each AI service, how many tokens each may ask for, and how long it may take. */
final class ModelLimits {
    static final String HAIKU="anthropic/claude-haiku-5.5",SONNET="anthropic/claude-sonnet-5.5";
    static final String CLAUDE_HAIKU="claude-haiku-5-5",CLAUDE_SONNET="claude-sonnet-5-5";
    static final int MAX_BODY_CHARS=2000000;
    private static final class Limit {final int maxTokens,readTimeoutMs;Limit(int maxTokens,int readTimeoutMs){this.maxTokens=maxTokens;this.readTimeoutMs=readTimeoutMs;}}
    private static final Limit HAIKU_LIMIT=new Limit(16000,95000),SONNET_LIMIT=new Limit(16000,95000);
    private static final Map<String,Limit> OPENROUTER=Map.of(
        HAIKU,HAIKU_LIMIT,
        SONNET,SONNET_LIMIT,
        "openai/gpt-6-luna",new Limit(3500,30000),
        "openai/gpt-5.6-luna",new Limit(3500,30000));
    private static final Map<String,Limit> CLAUDE=Map.of(CLAUDE_HAIKU,HAIKU_LIMIT,CLAUDE_SONNET,SONNET_LIMIT);
    private ModelLimits(){}

    /** The read timeout for an allowed request, or -1 when the service, model, token count or size is not allowed. */
    static int readTimeoutMs(CompanionKey.Service service,String model,int maxTokens,int bodyChars){
        Limit limit=model==null||service==null?null:(service==CompanionKey.Service.CLAUDE?CLAUDE:OPENROUTER).get(model);
        if(limit==null||maxTokens<1||maxTokens>limit.maxTokens||bodyChars<1||bodyChars>MAX_BODY_CHARS)return -1;
        return limit.readTimeoutMs;
    }
}
