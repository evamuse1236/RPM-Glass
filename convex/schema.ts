import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  diagnosticPairingCodes: defineTable({codeHash:v.string(),label:v.string(),expiresAt:v.number(),usedAt:v.optional(v.number())}).index("by_hash",["codeHash"]),
  diagnosticDevices: defineTable({installationId:v.string(),tokenHash:v.string(),label:v.string(),pairedAt:v.number(),revoked:v.boolean()})
    .index("by_token",["tokenHash"]).index("by_installation",["installationId"]),
  diagnostics: defineTable({device:v.union(v.id("devices"),v.id("diagnosticDevices")),installationId:v.string(),eventId:v.string(),sessionId:v.string(),operationId:v.string(),operation:v.string(),kind:v.string(),level:v.string(),outcome:v.string(),appVersion:v.string(),occurredAt:v.number(),receivedAt:v.number(),payload:v.any()})
    .index("by_device_event",["device","eventId"]).index("by_received",["receivedAt"])
    .index("by_session",["sessionId","receivedAt"]).index("by_operation",["operationId","receivedAt"]),
  pairingCodes: defineTable({codeHash:v.string(),label:v.string(),expiresAt:v.number(),usedAt:v.optional(v.number())}).index("by_hash",["codeHash"]),
  devices: defineTable({installationId:v.string(),tokenHash:v.string(),label:v.string(),pairedAt:v.number(),revoked:v.boolean(),lastSyncAt:v.optional(v.number())})
    .index("by_token",["tokenHash"]).index("by_installation",["installationId"]),
  events: defineTable({device:v.id("devices"),eventId:v.string(),sequence:v.number(),collection:v.string(),localId:v.string(),payload:v.any(),receivedAt:v.number()})
    .index("by_device_event",["device","eventId"]).index("by_device_sequence",["device","sequence"]),
  records: defineTable({device:v.id("devices"),collection:v.string(),localId:v.string(),sequence:v.number(),payload:v.any(),updatedAt:v.number()})
    .index("by_device_record",["device","collection","localId"]),
});
