import {
  RIGHT_ADD,
  RIGHT_CLAIMREVIEW,
  RIGHT_FEEDBACK,
  RIGHT_UPDATE,
} from "../constants";

export function claimFormRequiredRight({ forReview = false, forFeedback = false, isExistingEntry = false }) {
  if (forReview) return RIGHT_CLAIMREVIEW;
  if (forFeedback) return RIGHT_FEEDBACK;
  return isExistingEntry ? RIGHT_UPDATE : RIGHT_ADD;
}

export function isClaimFormReadOnly({
  rights = [],
  forReview = false,
  forFeedback = false,
  claim = {},
  claimUuid = null,
  lockNew = false,
  isSaved = false,
}) {
  const isExistingEntry = !!claimUuid || !!claim.uuid;
  const requiredRight = claimFormRequiredRight({ forReview, forFeedback, isExistingEntry });

  return (
    lockNew ||
    isSaved ||
    (!forReview && !forFeedback && claim.status !== 2) ||
    (forReview && (claim.reviewStatus >= 8 || claim.status !== 4)) ||
    (forFeedback && claim.status !== 4) ||
    !rights.includes(requiredRight)
  );
}

export function recoverClaimFormAfterSaveError(state) {
  const claim = { ...(state.claim || {}) };
  delete claim.clientMutationId;
  return { ...state, claim, lockNew: false, isSaved: false };
}

export function saveClaimWithRecovery(save, claim, onSaved, onError) {
  return Promise.resolve()
    .then(() => save(claim))
    .then((result) => {
      if (result?.error) return Promise.reject(result.payload || result);
      return result;
    })
    .then(onSaved)
    .catch((error) => onError(error));
}
