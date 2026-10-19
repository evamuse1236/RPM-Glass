package com.rpm.prototype;

import static com.rpm.prototype.CompanionKey.Service.CLAUDE;
import static com.rpm.prototype.CompanionKey.Service.OPENROUTER;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ModelLimitsTest {
    @Test public void captureModelsAreAllowedWithTheirOwnBudgets() {
        for (CompanionKey.Service service : CompanionKey.Service.values()) {
            String haikuId = service == CLAUDE ? ModelLimits.CLAUDE_HAIKU : ModelLimits.HAIKU;
            String sonnetId = service == CLAUDE ? ModelLimits.CLAUDE_SONNET : ModelLimits.SONNET;
            int haiku = ModelLimits.readTimeoutMs(service, haikuId, 4000, 20000);
            int sonnet = ModelLimits.readTimeoutMs(service, sonnetId, 16000, 20000);
            assertTrue(service + " Haiku", haiku > 0);
            assertTrue(service + ": Sonnet at high effort gets at least as long to answer", sonnet >= haiku);
            assertEquals(95000, ModelLimits.readTimeoutMs(service, haikuId, 6000, 20000));
            assertEquals(-1, ModelLimits.readTimeoutMs(service, haikuId, 6001, 20000));
        }
    }

    @Test public void claudeApiIdsMatchAnthropicsModelList() {
        assertEquals("claude-haiku-5-5", ModelLimits.CLAUDE_HAIKU);
        assertEquals("claude-sonnet-5-5", ModelLimits.CLAUDE_SONNET);
    }

    @Test public void eachServiceTakesOnlyItsOwnModelIds() {
        assertEquals(-1, ModelLimits.readTimeoutMs(CLAUDE, ModelLimits.HAIKU, 4000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs(OPENROUTER, ModelLimits.CLAUDE_HAIKU, 4000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs(CLAUDE, "openai/gpt-6-luna", 3500, 20000));
    }

    @Test public void tokenCapsFollowTheModel() {
        assertEquals(-1, ModelLimits.readTimeoutMs(OPENROUTER, ModelLimits.HAIKU, 16000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs(CLAUDE, ModelLimits.CLAUDE_HAIKU, 16000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs(OPENROUTER, ModelLimits.SONNET, 16001, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs(CLAUDE, ModelLimits.CLAUDE_SONNET, 0, 20000));
    }

    @Test public void unknownModelsAndOversizedBodiesAreRefused() {
        assertEquals(-1, ModelLimits.readTimeoutMs(OPENROUTER, "anthropic/claude-opus-5.5", 1000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs(CLAUDE, "claude-opus-5-5", 1000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs(OPENROUTER, null, 1000, 20000));
        assertEquals(-1, ModelLimits.readTimeoutMs(CLAUDE, ModelLimits.CLAUDE_HAIKU, 1000, ModelLimits.MAX_BODY_CHARS + 1));
    }

    @Test public void plannerSuggestionsKeepTheirModel() {
        assertTrue(ModelLimits.readTimeoutMs(OPENROUTER, "openai/gpt-6-luna", 3500, 20000) > 0);
    }

    @Test public void eachKeySlotTakesOnlyItsOwnKind() {
        String claude = "sk-ant-api03-" + "x".repeat(40), openRouter = "sk-or-v1-" + "y".repeat(40);
        assertNull(CompanionKey.problem(CLAUDE, claude));
        assertNull(CompanionKey.problem(OPENROUTER, openRouter));
        assertNotNull(CompanionKey.problem(CLAUDE, openRouter));
        assertNotNull(CompanionKey.problem(OPENROUTER, claude));
        assertNotNull(CompanionKey.problem(CLAUDE, "sk-ant-short"));
        assertNotNull(CompanionKey.problem(CLAUDE, claude + " extra"));
    }
}
