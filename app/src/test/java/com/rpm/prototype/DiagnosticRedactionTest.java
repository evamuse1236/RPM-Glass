package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class DiagnosticRedactionTest {
    private static Path fixture() {
        for (Path dir = Paths.get("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path file = dir.resolve("fixtures/redaction-cases.json");
            if (Files.isRegularFile(file)) return file;
        }
        throw new AssertionError("Cannot find fixtures/redaction-cases.json from " + Paths.get("").toAbsolutePath());
    }

    @Test
    public void nativeRedactionPassesTheSharedSecretSamples() throws Exception {
        JSONArray cases = new JSONObject(new String(Files.readAllBytes(fixture()), StandardCharsets.UTF_8)).getJSONArray("cases");
        assertTrue(cases.length() >= 10);
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            assertEquals(c.getString("input"), c.getString("expected"), DiagnosticRedaction.text(c.getString("input")));
        }
    }
}
