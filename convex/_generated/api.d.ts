/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as captureModel from "../captureModel.js";
import type * as captureRun from "../captureRun.js";
import type * as captureState from "../captureState.js";
import type * as captureWorker from "../captureWorker.js";
import type * as captures from "../captures.js";
import type * as crons from "../crons.js";
import type * as diagnosticRedaction from "../diagnosticRedaction.js";
import type * as diagnostics from "../diagnostics.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as phoneReceipts from "../phoneReceipts.js";
import type * as phoneSync from "../phoneSync.js";
import type * as planner from "../planner.js";
import type * as plannerAuth from "../plannerAuth.js";
import type * as plannerHttp from "../plannerHttp.js";
import type * as plannerProtocol from "../plannerProtocol.js";
import type * as plannerWrite from "../plannerWrite.js";
import type * as records from "../records.js";
import type * as security from "../security.js";
import type * as sync from "../sync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  captureModel: typeof captureModel;
  captureRun: typeof captureRun;
  captureState: typeof captureState;
  captureWorker: typeof captureWorker;
  captures: typeof captures;
  crons: typeof crons;
  diagnosticRedaction: typeof diagnosticRedaction;
  diagnostics: typeof diagnostics;
  functions: typeof functions;
  http: typeof http;
  phoneReceipts: typeof phoneReceipts;
  phoneSync: typeof phoneSync;
  planner: typeof planner;
  plannerAuth: typeof plannerAuth;
  plannerHttp: typeof plannerHttp;
  plannerProtocol: typeof plannerProtocol;
  plannerWrite: typeof plannerWrite;
  records: typeof records;
  security: typeof security;
  sync: typeof sync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
