import { cronJobs, makeFunctionReference } from "convex/server";
const crons=cronJobs();
crons.hourly("Expire diagnostic logs",{minuteUTC:17},makeFunctionReference<"mutation">("diagnostics:prune"),{});
export default crons;
