import { cronJobs, makeFunctionReference } from "convex/server";
const crons=cronJobs();
crons.hourly("Expire diagnostic logs",{minuteUTC:17},makeFunctionReference<"mutation">("diagnostics:prune"),{});
crons.interval("Recover server captures",{minutes:5},makeFunctionReference<"mutation">("captures:recover"),{});
export default crons;
