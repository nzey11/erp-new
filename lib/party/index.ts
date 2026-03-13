// =============================================
// PARTY MODULE: Barrel Export
// =============================================

// Types
export type {
  PartyHints,
  ResolvedParty,
  ActivityInput,
  OwnerRole,
  AssignOwnerOptions,
  MergeStatus,
  CreateMergeRequestInput,
  ActivityType,
} from "./types";

export { ACTIVITY_TYPES } from "./types";

// Services
export {
  resolveParty,
  resolveFinalPartyId,
  resolveFinalParty,
  getPartyById,
  getPartyByCustomer,
  getPartyByCounterparty,
  getPartyByTelegramId,
} from "./services/party-resolver";

export {
  recordActivity,
  recordOrderPlaced,
  recordPaymentReceived,
  recordManagerInteraction,
  getPartyActivities,
  getRecentActivities,
} from "./services/activity-ingest";

export {
  getOwner,
  getOwners,
  getOwnershipHistory,
  assignOwner,
  removeOwner,
  getPartiesByOwner,
  getPartyCountByOwner,
} from "./services/party-owner";

export {
  createMergeRequest,
  executeMerge,
  approveMergeRequest,
  rejectMergeRequest,
  getPendingMergeRequests,
  getMergeHistory,
} from "./services/party-merge";

// DTOs
export type {
  PartyListItemDto,
  PartyListFilter,
  PartyListResult,
  PartyProfileDto,
  PartyProfileLinkDto,
  PartyProfileActivityDto,
  PartyProfileOwnerDto,
} from "./dto";

// Queries
export { listParties, listPartiesWithoutOwner, getPartyProfile } from "./queries";

// Mappers
export { mapPartyToListItem, mapPartiesToListResult, mapPartyToProfile } from "./mappers";
