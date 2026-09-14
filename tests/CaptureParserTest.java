package com.rpm.prototype;
import java.time.*;
public class CaptureParserTest {
    static int checks;
    static void check(boolean good,String name){checks++;if(!good)throw new AssertionError(name);}
    public static void main(String[] args){
        ZonedDateTime now=ZonedDateTime.of(2026,9,8,14,0,0,0,ZoneId.of("Asia/Kolkata"));
        CaptureParser.Parsed p=CaptureParser.parse("Tomorrow at 7 am, go for a run",now);
        check(p.plannedAt==now.plusDays(1).withHour(7).toInstant().toEpochMilli(),"tomorrow local 7 am");
        check(p.minutes==30&&!p.explicitDuration,"default is an estimate");
        p=CaptureParser.parse("today at 7 pm run for 20 minutes",now);check(p.minutes==20&&p.explicitDuration,"duration explicit");check(p.plannedAt==now.withHour(19).toInstant().toEpochMilli(),"pm");
        check(CaptureParser.parse("today at 9:32 pm",now).plannedAt==now.withHour(21).withMinute(32).toInstant().toEpochMilli(),"pm with minutes must not match 24-hour prefix");
        check(CaptureParser.parse("tomorrow at 12:15 am",now).plannedAt==now.plusDays(1).withHour(0).withMinute(15).toInstant().toEpochMilli(),"midnight with minutes");
        check(CaptureParser.parse("tomorrow at 12:15 pm",now).plannedAt==now.plusDays(1).withHour(12).withMinute(15).toInstant().toEpochMilli(),"noon with minutes");
        check(CaptureParser.parse("today at 21:32",now).plannedAt==now.withHour(21).withMinute(32).toInstant().toEpochMilli(),"24-hour with at prefix");
        check(CaptureParser.parse("today at 7 am run",now).plannedAt==null,"past time not rolled forward");
        check(CaptureParser.parse("next Friday at 7 am run",now).plannedAt==null,"unsupported weekday not today");
        check(CaptureParser.parse("tomorrow at 25:90 run",now).plannedAt==null,"invalid clock");
        check(CaptureParser.parse("tomorrow",now).plannedAt==null,"date alone not midnight");
        check(CaptureParser.parse("7 am",now).plannedAt==null,"time alone not date");
        check(CaptureParser.parse("2026-09-10 18:30 walk for 2 hours",now).minutes==120,"hours");
        check(CaptureParser.parse("2026-99-40 18:30",now).plannedAt==null,"invalid date");
        check(CaptureParser.parse("tomorrow at 12 am",now).plannedAt==now.plusDays(1).withHour(0).toInstant().toEpochMilli(),"midnight");
        check(CaptureParser.correctionMinutes("Actually, twenty")==20,"approved correction");
        check(CaptureParser.correctionMinutes("Actually, make it 45 minutes")==45,"explicit correction");
        check(CaptureParser.correctionMinutes("Actually, twenty things to buy")==null,"unrelated sentence not correction");
        check(CaptureParser.correctionMinutes("20")==null,"number without intent not correction");
        check(CaptureParser.correctionMinutes("Actually 0")==null,"reject zero");
        check(CaptureParser.correctionMinutes("Actually 9999")==null,"reject unreasonable duration");
        ZonedDateTime dst=ZonedDateTime.of(2026,3,7,10,0,0,0,ZoneId.of("America/New_York"));
        check(CaptureParser.parse("tomorrow at 2:30 am",dst).plannedAt==null,"DST gap requires review");
        System.out.println("PASS: "+checks+" parser and correction checks");
    }
}
