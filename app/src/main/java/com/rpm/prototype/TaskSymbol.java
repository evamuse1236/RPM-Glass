package com.rpm.prototype;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class TaskSymbol {
    static final class Entry {
        final String symbol;
        final int icon;
        final List<String> words;

        Entry(String symbol, int icon, String... words) {
            this.symbol = symbol;
            this.icon = icon;
            this.words = Arrays.asList(words);
        }
    }

    static final List<Entry> SYMBOLS = Arrays.asList(
            new Entry("groups", R.drawable.sym_groups, "group", "meet", "meeting", "sync", "interview", "team"),
            new Entry("call", R.drawable.sym_call, "call", "phone", "ring"),
            new Entry("school", R.drawable.sym_school, "study", "revise", "revision", "exam", "quiz", "paper", "lecture", "class", "lab", "homework", "assignment"),
            new Entry("edit_note", R.drawable.sym_edit_note, "write", "draft", "essay", "notes", "section", "edit"),
            new Entry("menu_book", R.drawable.sym_menu_book, "read", "book", "pages", "chapter"),
            new Entry("checklist", R.drawable.sym_checklist, "review", "check", "plan", "sort"),
            new Entry("directions_run", R.drawable.sym_directions_run, "gym", "run", "walk", "workout", "yoga", "exercise", "swim", "stretch"),
            new Entry("mail", R.drawable.sym_mail, "email", "mail", "reply", "message", "text"),
            new Entry("redeem", R.drawable.sym_redeem, "birthday", "gift", "card", "present"),
            new Entry("payments", R.drawable.sym_payments, "pay", "bank", "bill", "fee", "refund", "rent"),
            new Entry("shopping_bag", R.drawable.sym_shopping_bag, "buy", "shop", "shopping", "groceries", "order"),
            new Entry("medical_services", R.drawable.sym_medical_services, "doctor", "dentist", "medicine", "pharmacy", "hospital", "clinic"),
            new Entry("cleaning_services", R.drawable.sym_cleaning_services, "clean", "laundry", "wash", "tidy"),
            new Entry("skillet", R.drawable.sym_skillet, "cook", "bake"),
            new Entry("code", R.drawable.sym_code, "code", "bug", "deploy", "build"));
    static final String TASK = "task_alt";
    static final int TASK_ICON = R.drawable.sym_task_alt;
    static final int EVENT_ICON = R.drawable.sym_event;

    private static final Pattern WORD = Pattern.compile("\\p{L}+");

    private TaskSymbol() {
    }

    static String symbol(String title) {
        Entry e = entry(title);
        return e == null ? TASK : e.symbol;
    }

    static int icon(String title) {
        Entry e = entry(title);
        return e == null ? TASK_ICON : e.icon;
    }

    private static Entry entry(String title) {
        Set<String> said = new HashSet<>();
        Matcher m = WORD.matcher(title == null ? "" : title.toLowerCase(Locale.ROOT));
        while (m.find()) said.add(m.group());
        for (Entry e : SYMBOLS) for (String w : e.words) if (said.contains(w)) return e;
        return null;
    }
}
