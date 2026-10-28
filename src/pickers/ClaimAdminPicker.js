import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";

import {
  useModulesManager,
  useTranslations,
  Autocomplete,
  useGraphqlQuery,
} from "@openimis/fe-core";
import { DEFAULT } from "../constants";
import { setCurrentClaimAdmin } from "../actions";


const ClaimAdminPicker = (props) => {
  const {
    onChange,
    readOnly,
    required,
    withLabel = true,
    withPlaceholder,
    value,
    label,
    filterOptions,
    filterSelectedOptions,
    placeholder,
    multiple,
    extraFragment,
    hfFilter,
    region,
    district,
    ownsContext = true,
  } = props;
  const userHealthFacilityId = useSelector((state) => state?.loc?.userHealthFacilityFullPath?.uuid);
  const contextRetry = useSelector((state) => state?.claim?.claimAdminContext?.retry || 0);
  const i_user = useSelector((state) =>
    state?.core?.user?.username
  );

  const modulesManager = useModulesManager();
  const { formatMessage } = useTranslations("claim", modulesManager);
  const [searchString, setSearchString] = useState("");
  const renderLastNameFirst = modulesManager.getConf(
    "fe-insuree",
    "renderLastNameFirst",
    DEFAULT.RENDER_LAST_NAME_FIRST,
  );

  const scopedFacilityId = userHealthFacilityId || hfFilter?.uuid;
  const query = `
      query ClaimAdminPicker ($search: String, $hf: String, $region_uuid: String, $district_uuid: String) {
          claimAdmins(search: $search, first: 20, healthFacility_Uuid: $hf, regionUuid: $region_uuid, districtUuid: $district_uuid) {
              edges {
                  node {
                      id
                      uuid
                      code
                      lastName
                      otherNames
                      healthFacility {
                          id uuid code name level
                          servicesPricelist{id, uuid}, itemsPricelist{id, uuid}
                          location {
                              id
                              uuid
                              code
                              name
                              parent {
                                code name id uuid
                              }
                          }
                      }
                      ${extraFragment ?? ""}
                    }
                }
            }
        }
        # Context retry ${contextRetry}
        # Facility scope ${scopedFacilityId || "none"}
      `;
  const { isLoading, data, error } = useGraphqlQuery(
    query,
    {
      hf: scopedFacilityId,
      search: searchString,
      region_uuid: region?.uuid,
      district_uuid: district?.uuid
    },
    { skip: !scopedFacilityId },
  );

  const dispatch = useDispatch();
  const formatClaimAdmin = (claimAdmin) => {
    return renderLastNameFirst
      ? `${claimAdmin.code} ${claimAdmin.lastName} ${claimAdmin.otherNames}`
      : `${claimAdmin.code} ${claimAdmin.otherNames} ${claimAdmin.lastName}`;
  };
  const claimAdmins = useMemo(
    () => data?.claimAdmins?.edges.map((edge) => edge.node).filter(Boolean) || [],
    [data],
  );
  const scopedClaimAdmins = useMemo(
    () => claimAdmins.filter((admin) => !scopedFacilityId || admin?.healthFacility?.uuid === scopedFacilityId),
    [claimAdmins, scopedFacilityId],
  );
  const currentAdmin = useMemo(
    () => scopedClaimAdmins.find((admin) => admin.code === i_user) || null,
    [scopedClaimAdmins, i_user],
  );
  const contextSignature = [
    scopedFacilityId || "",
    i_user || "",
    isLoading ? "loading" : "idle",
    data ? "data" : "none",
    error ? String(error) : "",
    currentAdmin?.uuid || "",
  ].join("|");
  const lastContextSignature = useRef(null);
  const lastAdminSignature = useRef(null);

  useEffect(() => {
    if (!ownsContext) return;
    if (lastContextSignature.current === contextSignature) return;
    lastContextSignature.current = contextSignature;
    dispatch({
      type: "CLAIM_CLAIM_ADMIN_CONTEXT_SET",
      payload: {
        isLoading: !!scopedFacilityId && (isLoading || !data),
        fetched: !!scopedFacilityId && !isLoading && !!data,
        error: error || null,
        scopeUuid: scopedFacilityId || null,
        username: i_user || null,
        adminUuid: currentAdmin?.uuid || null,
      },
    });
  }, [contextSignature, currentAdmin, data, dispatch, error, i_user, isLoading, ownsContext, scopedFacilityId]);

  useEffect(() => {
    if (!ownsContext) return;
    const adminSignature = [
      scopedFacilityId || "",
      i_user || "",
      isLoading ? "loading" : "idle",
      error ? String(error) : "",
      currentAdmin?.uuid || "none",
    ].join("|");
    if (lastAdminSignature.current === adminSignature) return;
    lastAdminSignature.current = adminSignature;
    if (isLoading || error || !scopedFacilityId || !data) {
      dispatch(setCurrentClaimAdmin(null));
      return;
    }
    dispatch(setCurrentClaimAdmin(currentAdmin));
  }, [currentAdmin, data, dispatch, error, i_user, isLoading, ownsContext, scopedFacilityId]);

  return (
    <Autocomplete
      multiple={multiple}
      required={required}
      placeholder={placeholder ?? formatMessage("ClaimAdminPicker.placeholder")}
      label={label ?? formatMessage("ClaimAdminPicker.label")}
      error={error}
      withLabel={withLabel}
      withPlaceholder={withPlaceholder}
      readOnly={readOnly}
      options={scopedClaimAdmins}
      isLoading={isLoading}
      value={value}
      getOptionLabel={(option) => formatClaimAdmin(option)}
      onChange={(option) => onChange(option, option ? `${option.code} ${option.lastName} ${option.otherNames}` : null)}
      filterOptions={filterOptions}
      filterSelectedOptions={filterSelectedOptions}
      onInputChange={setSearchString}
    />
  );
};

export default ClaimAdminPicker;
