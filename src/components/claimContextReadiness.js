export const CLAIM_CONTEXT_READY = "ready";
export const CLAIM_CONTEXT_LOADING = "loading";
export const CLAIM_CONTEXT_MISSING = "missing";
export const CLAIM_CONTEXT_ERROR = "error";

const uuidOf = (value) => value?.uuid || null;

export const sameFacility = (left, right) => {
  const leftUuid = uuidOf(left);
  const rightUuid = uuidOf(right);
  return !!leftUuid && !!rightUuid && leftUuid === rightUuid;
};

export const getClaimContextReadiness = ({
  facility,
  admin,
  username = null,
  fetchingFacility = false,
  fetchedFacility = false,
  facilityError = null,
  claimAdminContext = {},
} = {}) => {
  const context = claimAdminContext || {};
  const facilityUuid = uuidOf(facility);
  const adminUuid = uuidOf(admin);

  if (facilityError || context.error) {
    return {
      status: CLAIM_CONTEXT_ERROR,
      reason: facilityError || context.error,
    };
  }

  if (fetchingFacility || context.isLoading) return { status: CLAIM_CONTEXT_LOADING };

  if (!facility || !facilityUuid) {
    return {
      status: fetchedFacility ? CLAIM_CONTEXT_MISSING : CLAIM_CONTEXT_LOADING,
      reason: "facility",
    };
  }

  if (!admin || !adminUuid) {
    return {
      status: context.fetched ? CLAIM_CONTEXT_MISSING : CLAIM_CONTEXT_LOADING,
      reason: "admin",
    };
  }

  if (!context.fetched) return { status: CLAIM_CONTEXT_LOADING, reason: "admin" };

  if (
    (context.scopeUuid && context.scopeUuid !== facilityUuid) ||
    (context.username && username && context.username !== username) ||
    (context.adminUuid && context.adminUuid !== adminUuid)
  ) {
    return { status: CLAIM_CONTEXT_LOADING, reason: "stale" };
  }

  if (!sameFacility(admin.healthFacility, facility)) {
    return {
      status: context.fetched ? CLAIM_CONTEXT_ERROR : CLAIM_CONTEXT_LOADING,
      reason: "scope",
    };
  }

  return {
    status: CLAIM_CONTEXT_READY,
    facility,
    admin,
  };
};

export const isClaimContextReady = (context) =>
  getClaimContextReadiness(context).status === CLAIM_CONTEXT_READY;
