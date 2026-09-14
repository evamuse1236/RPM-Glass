import { internalMutationGeneric, internalQueryGeneric, internalActionGeneric, httpActionGeneric, type MutationBuilder, type QueryBuilder, type ActionBuilder, type DataModelFromSchemaDefinition } from "convex/server";
import type schema from "./schema";
type DataModel=DataModelFromSchemaDefinition<typeof schema>;
export const internalMutation:MutationBuilder<DataModel,"internal">=internalMutationGeneric;
export const internalQuery:QueryBuilder<DataModel,"internal">=internalQueryGeneric;
export const internalAction:ActionBuilder<DataModel,"internal">=internalActionGeneric;
export const httpAction=httpActionGeneric;
