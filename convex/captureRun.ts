"use node";
import { v } from "convex/values";
import { internalAction } from "./functions";
import { executeCapture } from "./captureWorker";
import { interpret } from "./captureModel";
export const run=internalAction({args:{captureId:v.id("captures")},handler:(ctx,{captureId})=>executeCapture(ctx,captureId,interpret)});
