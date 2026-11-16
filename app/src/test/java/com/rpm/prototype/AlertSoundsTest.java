package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.io.IOException;
import org.junit.Test;

public class AlertSoundsTest {
    private static final String UNPLAYABLE="That audio file could not be played. Try MP3, WAV or OGG.";

    @Test public void aFileTheDecoderCannotPrepareShowsTheUnplayableMessageNotTheFrameworkText(){
        IOException e=assertThrows(IOException.class,()->AlertSounds.checkPlayable(path->{throw new IOException("Prepare failed.: status=0x1");},"/x.audio"));
        assertEquals(UNPLAYABLE,e.getMessage());
    }
    @Test public void aRuntimeFailureShowsTheSameMessage(){
        IOException e=assertThrows(IOException.class,()->AlertSounds.checkPlayable(path->{throw new IllegalStateException("bad state");},"/x.audio"));
        assertEquals(UNPLAYABLE,e.getMessage());
    }
    @Test public void aDecodedFileWithNoLengthKeepsItsOwnMessage(){
        IOException e=assertThrows(IOException.class,()->AlertSounds.checkPlayable(path->0,"/x.audio"));
        assertEquals("Choose a playable audio file.",e.getMessage());
    }
    @Test public void aPlayableFilePasses()throws IOException{AlertSounds.checkPlayable(path->1200,"/x.audio");}
}
