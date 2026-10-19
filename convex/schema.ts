import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  accounts: defineTable({device:v.id("devices"),cursor:v.number(),createdAt:v.number()}),
  webSessions: defineTable({account:v.id("accounts"),device:v.id("devices"),tokenHash:v.string(),label:v.string(),createdAt:v.number(),lastSeenAt:v.number(),revoked:v.boolean()})
    .index("by_token",["tokenHash"]).index("by_account",["account"]),
  webLinkCodes: defineTable({account:v.id("accounts"),device:v.id("devices"),codeHash:v.string(),expiresAt:v.number(),usedAt:v.optional(v.number())})
    .index("by_hash",["codeHash"]).index("by_device",["device"]),
  plannerSnapshots: defineTable({account:v.id("accounts"),revision:v.number(),payload:v.any(),identity:v.string()})
    .index("by_account_revision",["account","revision"]),
  webCommands: defineTable({account:v.id("accounts"),session:v.id("webSessions"),device:v.id("devices"),commandId:v.string(),payload:v.any(),identity:v.string(),status:v.union(v.literal("pending"),v.literal("applied"),v.literal("rejected"),v.literal("conflict")),message:v.string(),newRevision:v.union(v.number(),v.null()),cursor:v.number(),queuedAt:v.number()})
    .index("by_account_id",["account","commandId"]).index("by_session_cursor",["session","cursor"])
    .index("by_session_status",["session","status"])
    .index("by_device_status",["device","status","queuedAt"]),
  webRateLimits: defineTable({key:v.string(),window:v.number(),count:v.number()}).index("by_key",["key"]),
  diagnosticPairingCodes: defineTable({codeHash:v.string(),label:v.string(),expiresAt:v.number(),usedAt:v.optional(v.number())}).index("by_hash",["codeHash"]),
  diagnosticDevices: defineTable({installationId:v.string(),tokenHash:v.string(),label:v.string(),pairedAt:v.number(),revoked:v.boolean()})
    .index("by_token",["tokenHash"]).index("by_installation",["installationId"]),
  diagnostics: defineTable({device:v.union(v.id("devices"),v.id("diagnosticDevices")),installationId:v.string(),eventId:v.string(),sessionId:v.string(),operationId:v.string(),operation:v.string(),kind:v.string(),level:v.string(),outcome:v.string(),appVersion:v.string(),occurredAt:v.number(),receivedAt:v.number(),payload:v.any()})
    .index("by_device_event",["device","eventId"]).index("by_received",["receivedAt"])
    .index("by_session",["sessionId","receivedAt"]).index("by_operation",["operationId","receivedAt"]),
  pairingCodes: defineTable({codeHash:v.string(),label:v.string(),expiresAt:v.number(),usedAt:v.optional(v.number())}).index("by_hash",["codeHash"]),
  devices: defineTable({installationId:v.string(),tokenHash:v.string(),label:v.string(),pairedAt:v.number(),revoked:v.boolean(),lastSyncAt:v.optional(v.number()),account:v.optional(v.id("accounts"))})
    .index("by_token",["tokenHash"]).index("by_installation",["installationId"]),
  events: defineTable({device:v.id("devices"),eventId:v.string(),sequence:v.number(),collection:v.string(),localId:v.string(),payload:v.any(),receivedAt:v.number()})
    .index("by_device_event",["device","eventId"]).index("by_device_sequence",["device","sequence"]),
  records: defineTable({device:v.id("devices"),collection:v.string(),localId:v.string(),sequence:v.number(),payload:v.any(),updatedAt:v.number()})
    .index("by_device_record",["device","collection","localId"]),
});
