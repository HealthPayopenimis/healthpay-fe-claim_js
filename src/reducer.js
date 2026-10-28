import {
  parseData,
  dispatchMutationReq,
  dispatchMutationResp,
  pageInfo,
  formatServerError,
  formatGraphQLError,
} from "@openimis/fe-core";

function reducer(
  state = {
    currentClaimAdmin: null,
    claimAdminContext: {
      isLoading: false,
      fetched: false,
      error: null,
      retry: 0,
      scopeUuid: null,
      username: null,
      adminUuid: null,
    },
    fetchingClaimAttachments: false,
    fetchedClaimAttachments: false,
    errorClaimAttachments: null,
    claimAttachments: null,
    fetchingClaims: false,
    fetchedClaims: false,
    errorClaims: null,
    claims: null,
    claimsPageInfo: { totalCount: 0 },
    fetchingClaim: false,
    fetchedClaim: false,
    errorClaim: null,
    claim: {},
    fetchingLastClaimAt: false,
    fetchedLastClaimAt: false,
    errorLastClaimAt: null,
    lastClaimAt: {},
    fetchingSameDiagnosisClaim: false,
    fetchedSameDiagnosisClaim: false,
    sameDiagnosisClaim: null,
    errorSameDiagnosisClaim: null,
    submittingMutation: false,
    mutation: {},
    mutationError: null,
    fetchingClaimCodeCount: false,
    fetchedClaimCodeCount: false,
    claimCodeCount: null,
    errorClaimCodeCount: null,
    healthFacilities: {
      availableHealthFacilities: [],
      isFetching: false,
      isFetched: false,
      error: null,
    },
    claimOfficers: {
      items: [],
      isFetching: false,
      isFetched: false,
      pageInfo: {
        totalCount: 0,
      },
      error: null,
    },
    fetchingHistory: false,
    fetchedHistory: false,
    errorHistory: null,
    history: null,
  },
  action,
) {
  switch (action.type) {
    case "CLAIM_CLAIM_ATTACHMENTS_REQ":
      return {
        ...state,
        fetchingClaimAttachments: true,
        fetchedClaimAttachments: false,
        claimAttachments: null,
        errorClaimAttachments: null,
      };
    case "CLAIM_CLAIM_ATTACHMENTS_RESP":
      return {
        ...state,
        fetchingClaimAttachments: false,
        fetchedClaimAttachments: true,
        claimAttachments: parseData(action.payload.data.claimAttachments),
        errorClaimAttachments: formatGraphQLError(action.payload),
      };
    case "CLAIM_CLAIM_ATTACHMENTS_ERR":
      return {
        ...state,
        fetchingClaimAttachments: false,
        errorClaimAttachments: formatServerError(action.payload),
      };
    case "CLAIM_CLAIM_ADMIN_SELECTED":
      var claimAdmin = action.payload;
      var s = { ...state, claimAdmin };
      if (claimAdmin) {
        s.claimHealthFacility = claimAdmin.healthFacility;
        s.claimDistrict = s.claimHealthFacility.location;
        s.claimRegion = s.claimDistrict.parent;
      }
      return s;
    case "CLAIM_SET_CURRENT_CLAIM_ADMIN": {
      const currentClaimAdmin = action.payload;
      s = { ...state, currentClaimAdmin };
      return s;
    }
    case "CLAIM_CLAIM_ADMIN_CONTEXT_SET":
      return {
        ...state,
        claimAdminContext: {
          ...state.claimAdminContext,
          ...action.payload,
        },
      };
    case "CLAIM_CLAIM_CONTEXT_RETRY":
      return {
        ...state,
        currentClaimAdmin: null,
        claimAdminContext: {
          ...state.claimAdminContext,
          isLoading: true,
          fetched: false,
          error: null,
          retry: (state.claimAdminContext?.retry || 0) + 1,
        },
      };
    case "CLAIM_CLAIM_HEALTH_FACILITY_SELECTED":
      var claimHealthFacility = action.payload;
      var s = { ...state, claimHealthFacility };
      if (claimHealthFacility) {
        s.claimDistrict = s.claimHealthFacility.location;
        s.claimRegion = s.claimDistrict.parent;
      } else {
        delete s.claimAdmin;
      }
      return s;
    case "CLAIM_CLAIM_DISTRICT_SELECTED":
      var claimDistrict = action.payload;
      var s = { ...state, claimDistrict };
      if (claimDistrict) {
        s.claimRegion = claimDistrict.parent;
      } else {
        delete s.claimHealthFacility;
        delete s.claimAdmin;
      }
      return s;
    case "CLAIM_CLAIM_REGION_SELECTED":
      var claimRegion = action.payload;
      var s = { ...state, claimRegion };
      if (!claimRegion) {
        delete s.claimDistrict;
        delete s.claimHealthFacility;
        delete s.claimAdmin;
      }
      return s;
    case "CLAIM_CLAIM_SEARCHER_REQ":
      return {
        ...state,
        fetchingClaims: true,
        fetchedClaims: false,
        claims: null,
        claimsPageInfo: { totalCount: 0 },
        errorClaims: null,
      };
    case "CLAIM_CLAIM_SEARCHER_RESP":
      return {
        ...state,
        fetchingClaims: false,
        fetchedClaims: true,
        claims: parseData(action.payload.data.claims),
        claimsPageInfo: pageInfo(action.payload.data.claims),
        errorClaims: formatGraphQLError(action.payload),
      };
    case "CLAIM_CLAIM_SEARCHER_ERR":
      return {
        ...state,
        fetchingClaims: false,
        errorClaims: formatServerError(action.payload),
      };
    case "CLAIM_CLAIM_CLEAR":
      return {
        ...state,
        fetchingClaim: false,
        fetchedClaim: false,
        claim: null,
        errorClaim: null,
      };
    case "CLAIM_CLAIM_REQ":
      return {
        ...state,
        fetchingClaim: true,
        fetchedClaim: false,
        claim: null,
        errorClaim: null,
      };
    case "CLAIM_CLAIM_RESP":
      return {
        ...state,
        fetchingClaim: false,
        fetchedClaim: true,
        claim: action.payload.data.claim,
        errorClaim: formatGraphQLError(action.payload),
      };
    case "CLAIM_CLAIM_ERR":
      return {
        ...state,
        fetchingClaim: false,
        errorClaim: formatServerError(action.payload),
      };
    case "CLAIM_LAST_CLAIM_AT_REQ":
      return {
        ...state,
        fetchingLastClaimAt: true,
        fetchedLastClaimAt: false,
        lastClaimAt: null,
        errorLastClaimAt: null,
      };
    case "CLAIM_LAST_CLAIM_AT_RESP":
      var claims = parseData(action.payload.data.claims);
      return {
        ...state,
        fetchingLastClaimAt: false,
        fetchedLastClaimAt: true,
        lastClaimAt: !!claims && claims.length > 0 ? claims[0] : null,
        errorCLastClaimAt: formatGraphQLError(action.payload),
      };
    case "CLAIM_LAST_CLAIM_AT_ERR":
      return {
        ...state,
        fetchingLastClaimAt: false,
        errorLastClaimAt: formatServerError(action.payload),
      };
    case "CLEAR_CLAIM_LAST_CLAIM_AT_REQ":
      return {
        ...state,
        fetchingLastClaimAt: false,
        fetchedLastClaimAt: false,
        lastClaimAt: null,
        errorLastClaimAt: null,
      };
    case "CLAIM_SAME_DIAGNOSIS_REQ":
      return {
        ...state,
        fetchingSameDiagnosisClaim: true,
        fetchedSameDiagnosisClaim: false,
        sameDiagnosisClaim: null,
        errorSameDiagnosisClaim: null,
      };
    case "CLAIM_SAME_DIAGNOSIS_RESP":
      var claims = parseData(action.payload.data.claimWithSameDiagnosis);
      return {
        ...state,
        fetchingSameDiagnosisClaim: false,
        fetchedSameDiagnosisClaim: true,
        sameDiagnosisClaim: !!claims && claims.length > 0 ? claims[0] : null,
        errorSameDiagnosisClaim: formatGraphQLError(action.payload),
      };
    case "CLAIM_SAME_DIAGNOSIS_ERR":
      return {
        ...state,
        fetchingSameDiagnosisClaim: false,
        errorSameDiagnosisClaim: formatServerError(action.payload),
      };
    case "CLEAR_CLAIM_SAME_DIAGNOSIS_REQ":
      return {
        ...state,
        fetchingSameDiagnosisClaim: false,
        fetchedSameDiagnosisClaim: false,
        sameDiagnosisClaim: null,
        errorSameDiagnosisClaim: null,
      };
    case "CLAIM_CLAIM_CODE_COUNT_REQ":
      return {
        ...state,
        fetchingClaimCodeCount: true,
        fetchedClaimCodeCount: false,
        claimCodeCount: null,
        errorClaimCodeCount: null,
      };
    case "CLAIM_CLAIM_CODE_COUNT_RESP":
      return {
        ...state,
        fetchingClaimCodeCount: false,
        fetchedClaimCodeCount: true,
        claimCodeCount: action.payload.data.claims.totalCount,
      };
    case "CLAIM_CLAIM_CODE_COUNT_ERR":
      return {
        ...state,
        fetchingClaimCodeCount: false,
        errorClaimCodeCount: formatServerError(action.payload),
      };
    case "CLAIM_ENROLMENT_OFFICERS_REQ":
      return {
        ...state,
        claimOfficers: {
          ...state.claimOfficers,
          isFetching: true,
        },
      };
    case "CLAIM_ENROLMENT_OFFICERS_RESP":
      return {
        ...state,
        claimOfficers: {
          ...state.claimOfficers,
          isFetching: false,
          isFetched: true,
          pageInfo: pageInfo(action.payload.data.claimOfficers),
          items: parseData(action.payload.data.claimOfficers),
        },
      };
    case "CLAIM_ENROLMENT_OFFICERS_ERR":
      return {
        ...state,
        claimOfficers: {
          ...state.claimOfficers,
          isFetching: false,
          isFetched: false,
          error: formatGraphQLError(action.payload),
        },
      };
    case "CLAIM_CODE_FIELDS_VALIDATION_REQ":
      return {
        ...state,
        validationFields: {
          ...state.validationFields,
          claimCode: {
            isValidating: true,
            isValid: false,
            validationError: null,
          },
        },
      };
    case "CLAIM_CODE_FIELDS_VALIDATION_RESP":
      return {
        ...state,
        validationFields: {
          ...state.validationFields,
          claimCode: {
            isValidating: false,
            isValid: action.payload?.data.isValid,
            validationError: formatGraphQLError(action.payload),
          },
        },
      };
    case "CLAIM_CODE_FIELDS_VALIDATION_ERR":
      return {
        ...state,
        validationFields: {
          ...state.validationFields,
          claimCode: {
            isValidating: false,
            isValid: false,
            validationError: formatServerError(action.payload),
          },
        },
      };
    case "CLAIM_CODE_FIELDS_VALIDATION_CLEAR":
      return {
        ...state,
        validationFields: {
          ...state.validationFields,
          claimCode: {
            isValidating: true,
            isValid: false,
            validationError: null,
          },
        },
      };
    case "CLAIM_CODE_FIELDS_VALIDATION_SET_VALID":
      return {
        ...state,
        validationFields: {
          ...state.validationFields,
          claimCode: {
            isValidating: false,
            isValid: true,
            validationError: null,
          },
        },
      };
    case "CLAIM_MUTATION_REQ":
      return { ...dispatchMutationReq(state, action), mutationError: null };
    case "CLAIM_MUTATION_ERR":
      return {
        ...state,
        submittingMutation: false,
        mutation: { ...(action.meta || state.mutation || {}), error: true },
        mutationError: action.payload,
        alert: JSON.stringify(action.payload),
      };
    case "CLAIM_CREATE_CLAIM_RESP":
      return { ...dispatchMutationResp(state, "createClaim", action), mutationError: null };
    case "CLAIM_UPDATE_CLAIM_RESP":
      return { ...dispatchMutationResp(state, "updateClaim", action), mutationError: null };
    case "CLAIM_SUBMIT_CLAIMS_RESP":
      return dispatchMutationResp(state, "submitClaims", action);
    case "CLAIM_DELETE_CLAIMS_RESP":
      return dispatchMutationResp(state, "deleteClaims", action);
    case "CLAIM_SELECT_CLAIMS_FOR_FEEDBACK_RESP":
      return dispatchMutationResp(state, "selectClaimsForFeedback", action);
    case "CLAIM_BYPASS_CLAIMS_FEEDBACK_RESP":
      return dispatchMutationResp(state, "bypassClaimsFeedback", action);
    case "CLAIM_SKIP_CLAIMS_FEEDBACK_RESP":
      return dispatchMutationResp(state, "skipClaimsFeedback", action);
    case "CLAIM_DELIVER_CLAIM_FEEDBACK_RESP":
      return dispatchMutationResp(state, "deliverClaimFeedback", action);
    case "CLAIM_SELECT_CLAIMS_FOR_REVIEW_RESP":
      return dispatchMutationResp(state, "selectClaimsForReview", action);
    case "CLAIM_BYPASS_CLAIMS_REVIEW_RESP":
      return dispatchMutationResp(state, "bypassClaimsReview", action);
    case "CLAIM_SKIP_CLAIMS_REVIEW_RESP":
      return dispatchMutationResp(state, "skipClaimsReview", action);
    case "CLAIM_SAVE_CLAIM_REVIEW_RESP":
      return dispatchMutationResp(state, "saveClaimReview", action);
    case "CLAIM_DELIVER_CLAIMS_REVIEW_RESP":
      return dispatchMutationResp(state, "deliverClaimsReview", action);
    case "CLAIM_PROCESS_CLAIMS_RESP":
      return dispatchMutationResp(state, "processClaims", action);
    case "CLAIM_CREATE_CLAIM_ATTACHMENT_RESP":
      return dispatchMutationResp(state, "createClaimAttachment", action);
    case "CLAIM_UPDATE_CLAIM_ATTACHMENT_RESP":
      return dispatchMutationResp(state, "updateClaimAttachment", action);
    case "CLAIM_DELETE_CLAIM_ATTACHMENT_RESP":
      return dispatchMutationResp(state, "deleteClaimAttachment", action);
    case "CORE_ALERT_CLEAR":
      var s = { ...state };
      delete s.alert;
      return s;
    case "CLAIM_PRINT":
      return {
        ...state,
        generating: true,
      };
    case "CLAIM_PRINT_DONE":
      return {
        ...state,
        generating: false,
      };
    case "CLAIM_HISTORY_FETCH_REQ":
      return {
        ...state,
        fetchingHistory: true,
        fetchedHistory: false,
        errorHistory: null,
        history: null,
      };
    case "CLAIM_HISTORY_FETCH_RESP":
      return {
        ...state,
        fetchingHistory: false,
        fetchedHistory: true,
        history: parseData(action.payload.data?.claimHistory),
        pageInfo: pageInfo(action.payload.data?.claimHistory?.pageInfo),
      };
    case "CLAIM_HISTORY_FETCH_ERR":
      return {
        ...state,
        fetchingHistory: false,
        errorHistory: formatGraphQLError(action.payload?.response?.errors),
      };
    default:
      return state;
  }
}

export default reducer;
