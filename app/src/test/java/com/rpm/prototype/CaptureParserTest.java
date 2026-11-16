package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.junit.Test;

/** The earlier Capture screen's own time rule (Settings, earlier RPM screens). */
public class CaptureParserTest {
    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    private static final ZonedDateTime NOW = ZonedDateTime.of(2026, 11, 16, 19, 0, 0, 0, ZONE);

    private static LocalDateTime planned(String words) {
        CaptureParser.Parsed parsed = CaptureParser.parse(words, NOW);
        assertNotNull(words + " -> " + parsed.notice, parsed.plannedAt);
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(parsed.plannedAt), ZONE);
    }

    private static LocalDateTime nov17(int h, int m) { return LocalDateTime.of(2026, 11, 17, h, m); }

    @Test
    public void aRangeEndingInPmReadsItsStartAsPm() {
        assertEquals(nov17(14, 30), planned("Tomorrow 2:30-3:30 pm study"));
        assertEquals(nov17(14, 30), planned("Tomorrow 2:30 to 3:30 pm study"));
        assertEquals(nov17(14, 30), planned("Tomorrow 2:30 \u2013 3:30pm study"));
        assertEquals(nov17(14, 30), planned("Tomorrow 2:30 until 3:30 PM study"));
    }

    @Test
    public void timesThatAlreadyReadRightKeepTheirReading() {
        assertEquals(nov17(14, 30), planned("tomorrow 14:30"));
        assertEquals(nov17(14, 30), planned("Tomorrow 2:30 pm"));
        assertEquals(nov17(7, 0), planned("Tomorrow at 7 am"));
        assertEquals(nov17(2, 30), planned("tomorrow 2:30-3:30 am"));
        assertEquals(nov17(2, 30), planned("tomorrow 2:30"));
        assertEquals(nov17(14, 0), planned("tomorrow 14:00-15:30 pm"));
        assertEquals(30, CaptureParser.parse("Tomorrow at 7 am", NOW).minutes);
    }

    @Test
    public void aRangeThatCrossesNoonKeepsItsMorningStart() {
        assertEquals(nov17(11, 30), planned("tomorrow 11:30-12:30 pm lunch"));
        assertEquals(nov17(9, 0), planned("tomorrow 9:00 to 5 pm work"));
        assertEquals(nov17(10, 0), planned("tomorrow 10:00-2 pm meeting"));
        assertEquals(nov17(12, 30), planned("tomorrow 12:30-1:30 pm lunch"));
    }

    @Test
    public void aRangeThatStartsAfterItEndsEitherWayAsksInsteadOfGuessing() {
        CaptureParser.Parsed parsed = CaptureParser.parse("tomorrow 10:00-9 am run", NOW);
        assertNull(parsed.plannedAt);
        assertEquals("Time needs review \u00b7 original text preserved", parsed.notice);
    }
}
