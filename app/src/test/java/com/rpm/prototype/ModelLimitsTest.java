package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ModelLimitsTest {
    @Test public void captureModelsAreAllowedWithTheirOwnBudgets() {
        int haiku = ModelLimits.readTimeoutMs("anthropic/claude-haiku-5.5", 4000, 20000);
        int sonnet = ModelLimits.readTimeoutMs("anthropic/claude-sonnet-5.5", 16000, 20000);
        assertTrue(haiku > 0);
        assertTrue("Sonnet at high effort gets longer to answer", sonnet > haiku);
    }

    @Test public void tokenCapsFollowTheModel() {
        assertEquals(-1, ModelLimits.readTimeoutMs("anthropic/claude-haiku-5.5", 16000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs("anthropic/claude-sonnet-5.5", 16001, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs("anthropic/claude-sonnet-5.5", 0, 20000));
    }

    @Test public void unknownModelsAndOversizedBodiesAreRefused() {
        assertEquals(-1, ModelLimits.readTimeoutMs("anthropic/claude-opus-5.5", 1000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs(null, 1000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs("anthropic/claude-haiku-5.5", 1000, ModelLimits.MAX_BODY_CHARS + 1));
    }

    @Test public void plannerSuggestionsKeepTheirModel() {
        assertTrue(ModelLimits.readTimeoutMs("openai/gpt-6-luna", 3500, 20000) > 0);
    }
}
