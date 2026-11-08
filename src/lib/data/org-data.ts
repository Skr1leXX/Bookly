import { cache } from "react";
import { loadOrgData } from "./load";
import { getSession } from "./session";

export type { OrgData } from "./load";

/** Everything the pages need, loaded once per request. */
export const getOrgData = cache(async () => {
  const { supabase, orgId, timezone } = await getSession();
  return loadOrgData(supabase, orgId, timezone);
});
