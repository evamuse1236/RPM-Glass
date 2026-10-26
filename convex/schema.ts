import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  accounts: defineTable({device:v.id("devices"),cursor:v.number(),createdAt:v.number(),commandCursor:v.optional(v.number()),nextTaskId:v.optional(v.number()),seededAt:v.optional(v.number()),captureVersion:v.optional(v.number())}),
  webSessions: defineTable({account:v.id("accounts"),device:v.id("devices"),tokenHash:v.string(),label:v.string(),createdAt:v.number(),lastSeenAt:v.number(),revoked:v.boolean()})
    .index("by_token",["tokenHash"]).index("by_account",["account"]),
  webLinkCodes: defineTable({account:v.id("accounts"),device:v.id("devices"),codeHash:v.string(),expiresAt:v.number(),usedAt:v.optional(v.number())})
    .index("by_hash",["codeHash"]).index("by_device",["device"]),
  plannerRecords: defineTable({account:v.id("accounts"),key:v.string(),rev:v.number(),value:v.any(),stamps:v.record(v.string(),v.string())})
    .index("by_account_key",["account","key"]).index("by_account_rev",["account","rev"]),
  phoneSync: defineTable({account:v.id("accounts"),device:v.id("devices"),lastSeq:v.number(),receipts:v.array(v.object({seq:v.number(),part:v.number(),pages:v.array(v.id("phoneReceiptPages"))})),final:v.boolean()})
    .index("by_account_device",["account","device"]),
  phoneReceiptPages: defineTable({account:v.id("accounts"),rows:v.array(v.object({key:v.string(),rev:v.number(),value:v.any()}))}),
  captures: defineTable({account:v.id("accounts"),messageId:v.string(),text:v.string(),timezone:v.string(),status:v.string(),attempts:v.number(),claimedUntil:v.optional(v.number()),message:v.optional(v.string()),question:v.optional(v.any()),receipt:v.optional(v.any()),draftId:v.optional(v.string()),taskIds:v.optional(v.array(v.number())),inverse:v.optional(v.array(v.object({key:v.string(),rev:v.number(),before:v.any(),after:v.any()})))})
    .index("by_account_message",["account","messageId"]).index("by_status",["status"]),
  captureState: defineTable({account:v.id("accounts"),kind:v.union(v.literal("capture"),v.literal("draft"),v.literal("transaction")),id:v.string(),version:v.number(),value:v.any()})
    .index("by_account",["account"]).index("by_item",["account","kind","id"]),
  plannerSnapshots: defineTable({account:v.id("accounts"),revision:v.number(),payload:v.any(),identity:v.string()})
    .index("by_account_revision",["account","revision"]),
  webCommands: defineTable({account:v.id("accounts"),session:v.id("webSessions"),device:v.id("devices"),commandId:v.string(),payload:v.any(),identity:v.string(),status:v.union(v.literal("pending"),v.literal("applied"),v.literal("rejected"),v.literal("conflict")),message:v.string(),newRevision:v.union(v.number(),v.null()),cursor:v.number(),queuedAt:v.number(),inverse:v.optional(v.array(v.object({key:v.string(),rev:v.number(),before:v.any(),after:v.any()})))})
    .index("by_account_id",["account","commandId"]).index("by_session_cursor",["session","cursor"]),
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
