import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "purge expired deleted cards",
  { hours: 1 },
  internal.cards.purgeExpiredDeletedCards,
  {},
);

export default crons;

