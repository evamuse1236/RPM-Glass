package com.rpm.prototype;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The one registry of notch modules, in the order that breaks ties between them. */
final class NotchModules {
    static final List<NotchModule> ALL = List.of(
            new TasksModule(), new CalendarModule(), new RoutinesModule(), new WaterModule(), new MealsModule());

    private NotchModules() {}

    /** Asks every module for its offer; a module that throws is left out and named in the scene. */
    static Scene scene(Inputs base, Map<String, LocalState> local) {
        List<Owned<Offer>> offers = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        for (NotchModule m : ALL) {
            try {
                offers.add(new Owned<>(m.id(), m.offer(base.with(local.getOrDefault(m.id(), LocalState.EMPTY)))));
            } catch (RuntimeException e) {
                failed.add(m.id());
            }
        }
        return NotchArbiter.arrange(offers, failed);
    }

    static Map<String, LocalState> apply(Act.Local act, Inputs base, Map<String, LocalState> local) {
        NotchModule m = byId(act.module());
        LocalState next = m.apply(act.verb(), act.arg(), base.with(local.getOrDefault(m.id(), LocalState.EMPTY)));
        Map<String, LocalState> out = new HashMap<>(local);
        out.put(m.id(), next);
        return Map.copyOf(out);
    }

    static NotchModule byId(String id) {
        for (NotchModule m : ALL) if (m.id().equals(id)) return m;
        throw new IllegalArgumentException("No notch module " + id);
    }

    /** Reads the old notch's snooze map ("water", "meal:lunch", "routine:r1") into each module's local state. */
    static Map<String, LocalState> fromSnoozes(Map<String, Long> snoozes) {
        Map<String, LocalState> out = new HashMap<>();
        for (Map.Entry<String, Long> e : snoozes.entrySet()) {
            String key = e.getKey();
            String value = String.valueOf(e.getValue());
            if (key.equals("water")) put(out, WaterModule.ID, WaterModule.UNTIL, value);
            else if (key.startsWith("meal:")) put(out, MealsModule.ID, MealsModule.UNTIL + key.substring(5), value);
            else if (key.startsWith("routine:")) put(out, RoutinesModule.ID, RoutinesModule.UNTIL + key.substring(8), value);
        }
        return Map.copyOf(out);
    }

    private static void put(Map<String, LocalState> out, String module, String key, String value) {
        out.put(module, out.getOrDefault(module, LocalState.EMPTY).with(key, value));
    }
}
