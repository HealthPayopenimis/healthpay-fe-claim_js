const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const childProcess = require("child_process");

const TOOLCHAIN = "/home/ubuntu/healthpay-v3-execution/module-toolchain/node_modules";
const MODULE_PATHS = [TOOLCHAIN, path.join(__dirname, "../node_modules")];
const resolveModule = (name) => require.resolve(name, { paths: MODULE_PATHS });
const babel = require(resolveModule("@babel/core"));
const presetEnv = require(resolveModule("@babel/preset-env"));
const presetReact = require(resolveModule("@babel/preset-react"));
const classProperties = require(resolveModule("@babel/plugin-proposal-class-properties"));

const repoRoot = path.join(__dirname, "..");
const RIGHT_ADD = 111002;
const BASELINE = "15587e2961f59ab26e1d21cdef97ef12a5182309";
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  checks += 1;
  assert.strictEqual(actual, expected, message);
}

function makeReact() {
  class Component {
    constructor(props) {
      this.props = props;
    }

    setState(update, callback) {
      const next = typeof update === "function" ? update(this.state, this.props) : update;
      this.state = { ...this.state, ...next };
      if (callback) callback();
    }

    forceUpdate() {}
  }
  const createElement = (type, props, ...children) => ({
    type,
    props: { ...(props || {}), ...(children.length ? { children } : {}) },
  });
  return {
    Component,
    Fragment: "Fragment",
    createElement,
    useState: () => [null, () => {}],
    useMemo: (factory) => factory(),
    useRef: (current) => ({ current }),
    useEffect: () => {},
  };
}

const identity = (value) => value;
const facility = (uuid, code = uuid) => ({ uuid, code, name: `Facility ${code}` });
const admin = (uuid, code, healthFacility) => ({ uuid, code, lastName: "Admin", otherNames: code, healthFacility });

function makeCore(overrides = {}) {
  return {
    Contributions: "Contributions",
    Form: "Form",
    Helmet: "Helmet",
    ProgressOrError: "ProgressOrError",
    PublishedComponent: "PublishedComponent",
    formatMessage: (_intl, _module, key) => key,
    formatMessageWithValues: (_intl, _module, key) => key,
    journalize: () => {},
    toISODate: (date) => date.toISOString(),
    withHistory: identity,
    withModulesManager: identity,
    fetchMutation: () => Promise.resolve({}),
    parseData: (value) => value,
    coreAlert: () => {},
    historyPush: (_mm, history, route) => history?.push?.(route),
    dispatchMutationReq: (type) => ({ type }),
    dispatchMutationResp: (type) => ({ type }),
    dispatchMutationErr: (type) => ({ type }),
    pageInfo: () => ({}),
    formatServerError: (value) => value,
    formatGraphQLError: (value) => value,
    ...overrides,
  };
}

function transpile(source, filename) {
  return babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    presets: [[presetEnv, { modules: "commonjs" }], presetReact],
    plugins: [classProperties],
  }).code;
}

function loadModule(filename, requireFactory, exportNames = [], sourceOverride = null) {
  const source = sourceOverride || fs.readFileSync(filename, "utf8");
  const transformed = transpile(source, filename);
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: requireFactory,
    console,
    Promise,
    Error,
    JSON,
    Date,
    Math,
    parseFloat,
    Number,
    isNaN,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  const suffix = exportNames.length ? `\nmodule.exports.__classes = { ${exportNames.join(", ")} };` : "";
  new vm.Script(`${transformed}${suffix}`, { filename }).runInContext(context);
  return module.exports;
}

function makeRequire({ React = makeReact(), core = makeCore(), reactRedux, actions = {} } = {}) {
  const components = new Proxy({}, { get: (_target, name) => name });
  const actionStubs = {
    claimHealthFacilitySet: () => {},
    selectClaimAdmin: () => {},
    selectHealthFacility: () => {},
    fetchClaim: () => {},
    generate: () => {},
    print: () => {},
    ...actions,
  };
  return (request) => {
    if (request === "react") return React;
    if (request === "redux") return { bindActionCreators: (value) => value };
    if (request === "react-redux") return reactRedux || { connect: () => identity };
    if (request === "react-intl") return { injectIntl: identity };
    if (request === "moment") return () => ({ toDate: () => new Date("2026-01-01T00:00:00.000Z") });
    if (request === "@openimis/fe-core") return core;
    if (request === "../constants") return {
      RIGHT_ADD,
      RIGHT_LOAD: 111005,
      RIGHT_SUBMIT: 111011,
      RIGHT_DELETE: 111012,
      RIGHT_PRINT: 111006,
      RIGHT_RESTORE: 111012,
      STATUS_REJECTED: 1,
      STORAGE_KEY_ADMIN: "admin",
      STORAGE_KEY_CLAIM_HEALTH_FACILITY: "claimHealthFacility",
      DEFAULT: {
        AUTOGENERATE_CLAIM_CODE: false,
        EXPLANATION_REQUIRED_IF_ABOVE_THRESHOLD: false,
        QUANTITY_EXPLANATION_THRESHOLD: 1,
        QUANTITY_MAX_VALUE: 10000,
        RENDER_LAST_NAME_FIRST: false,
      },
      REFERRAL: "R",
      SERVICE_TYPE_PP_S: "S",
      CARE_TYPE_STATUS: ["IPD", "OPD"],
      IN_PATIENT_STRING: "IPD",
    };
    if (request === "../actions") return actionStubs;
    if (request === "./claimFormPermissions") {
      return loadModule(path.join(repoRoot, "src/components/claimFormPermissions.js"), makeRequire({ React, core, actions: actionStubs }));
    }
    if (request === "./claimContextReadiness" || request === "../components/claimContextReadiness") {
      return loadModule(path.join(repoRoot, "src/components/claimContextReadiness.js"), makeRequire({ React, core, actions: actionStubs }));
    }
    if (request === "../pickers/ClaimAdminPicker") return { __esModule: true, default: "ClaimAdminPicker" };
    if (request.startsWith("./") || request.startsWith("../")) return components;
    if (request.startsWith("@material-ui")) {
      if (request === "@material-ui/core") return { Fab: "Fab", Badge: "Badge", Button: "Button", Grid: "Grid", Tooltip: "Tooltip" };
      if (request === "@material-ui/core/styles") return { withStyles: () => identity, withTheme: () => identity };
      return { default: "Icon" };
    }
    if (request === "prop-types") return {};
    return {};
  };
}

function loadClass(relativePath, className, options = {}) {
  return loadModule(
    path.join(repoRoot, relativePath),
    options.require || makeRequire(options),
    [className],
    options.source || null,
  ).__classes[className];
}

function findElement(tree, type) {
  if (!tree || typeof tree !== "object") return null;
  if (tree.type === type) return tree;
  const props = tree.props || {};
  const nested = Object.keys(props)
    .filter((key) => key !== "children")
    .map((key) => props[key]);
  const children = [props.children, ...nested];
  for (const child of children.flat ? children.flat() : children) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}

function testReadinessPermutations() {
  const readiness = loadModule(path.join(repoRoot, "src/components/claimContextReadiness.js"), makeRequire());
  const hf1 = facility("hf-1", "HF1");
  const hf2 = facility("hf-2", "HF2");
  const a1 = admin("admin-1", "ACTOR", hf1);
  const a2 = admin("admin-2", "ACTOR", hf2);
  const ready = readiness.getClaimContextReadiness({
    facility: hf1,
    admin: a1,
    fetchedFacility: true,
    claimAdminContext: { fetched: true, scopeUuid: "hf-1", username: "ACTOR", adminUuid: "admin-1" },
  });
  equal(ready.status, readiness.CLAIM_CONTEXT_READY, "facility-before-admin resolves ready after both authoritative values complete");

  equal(
    readiness.getClaimContextReadiness({ facility: hf1, admin: null, fetchedFacility: true, claimAdminContext: { isLoading: true } }).status,
    readiness.CLAIM_CONTEXT_LOADING,
    "admin-before-facility remains loading while admin response is deferred",
  );
  equal(
    readiness.getClaimContextReadiness({ facility: hf1, admin: a1, fetchingFacility: true, claimAdminContext: { fetched: true } }).status,
    readiness.CLAIM_CONTEXT_LOADING,
    "cache-hit matching admin is not ready during an in-flight facility transition",
  );
  equal(
    readiness.getClaimContextReadiness({ facility: hf1, admin: a1, claimAdminContext: { fetched: false, scopeUuid: "hf-1" } }).status,
    readiness.CLAIM_CONTEXT_LOADING,
    "delayed effect dispatch after a completed response cannot publish ready early",
  );
  equal(
    readiness.getClaimContextReadiness({ facility: hf1, admin: null, fetchedFacility: true, claimAdminContext: { fetched: true } }).status,
    readiness.CLAIM_CONTEXT_MISSING,
    "completed no-match context is explicit missing state",
  );
  equal(
    readiness.getClaimContextReadiness({ facility: hf1, admin: null, facilityError: new Error("facility failed") }).status,
    readiness.CLAIM_CONTEXT_ERROR,
    "facility failure is explicit error state",
  );
  equal(
    readiness.getClaimContextReadiness({
      facility: hf2,
      admin: a1,
      claimAdminContext: { fetched: true, scopeUuid: "hf-1", username: "ACTOR", adminUuid: "admin-1" },
    }).status,
    readiness.CLAIM_CONTEXT_LOADING,
    "old-scope response cannot make the new facility ready",
  );
  equal(
    readiness.getClaimContextReadiness({
      facility: hf1,
      admin: a2,
      username: "ACTOR",
      claimAdminContext: { fetched: true, scopeUuid: "hf-1", username: "ACTOR", adminUuid: "admin-2" },
    }).status,
    readiness.CLAIM_CONTEXT_ERROR,
    "mismatched administrator facility is rejected",
  );
}

function pageProps(overrides = {}) {
  const pushed = [];
  const selected = [];
  const hf = facility("hf-1", "HF1");
  const currentAdmin = admin("admin-1", "ACTOR", hf);
  return {
    modulesManager: { getConf: (_m, _k, fallback) => fallback },
    history: { push: (route) => pushed.push(route), location: { pathname: "/front/claim/healthFacilities" } },
    location: { pathname: "/front/claim/healthFacilities" },
    intl: {},
    classes: { page: "page", fab: "fab" },
    rights: [RIGHT_ADD],
    generatingPrint: false,
    currentUsername: "ACTOR",
    currentUserHF: hf,
    currentClaimAdmin: currentAdmin,
    fetchingUserHF: false,
    fetchedUserHF: true,
    errorUserHF: null,
    claimAdminContext: { isLoading: false, fetched: true, scopeUuid: "hf-1", username: "ACTOR", adminUuid: "admin-1" },
    selectClaimAdmin: (value) => selected.push(["admin", value]),
    selectHealthFacility: (value) => selected.push(["facility", value]),
    clearCurrentPaginationPage: () => {},
    ...overrides,
    __pushed: pushed,
    __selected: selected,
  };
}

function testHealthFacilitiesPage() {
  const Page = loadClass("src/pages/HealthFacilitiesPage.js", "HealthFacilitiesPage");
  const readyProps = pageProps();
  const readyPage = new Page(readyProps);
  check(readyPage.canAdd(), "ready page permits Add Claim");
  equal(readyPage.onAdd(), true, "Add action revalidates and succeeds when context is ready");
  equal(readyProps.__pushed.length, 1, "ready Add action navigates once");
  equal(readyProps.__selected.length, 2, "ready Add action scopes both facility and admin");

  const loadingProps = pageProps({ fetchingUserHF: true, claimAdminContext: { fetched: true, isLoading: false, scopeUuid: "hf-1", username: "ACTOR", adminUuid: "admin-1" } });
  const loadingPage = new Page(loadingProps);
  equal(loadingPage.canAdd(), false, "loading context disables Add Claim");
  equal(loadingPage.onAdd(), false, "loading context blocks navigation in the action itself");
  equal(loadingProps.__pushed.length, 0, "blocked Add does not navigate");
  const loadingTree = loadingPage.render();
  const loadingFab = findElement(loadingTree, "Fab") || findElement(loadingTree, "button");
  equal(loadingFab.props.disabled, true, "loading Add control is disabled");
  equal(loadingFab.props["aria-busy"], "true", "loading Add control exposes aria-busy");
  equal(loadingFab.props["aria-label"], "newClaim.context.loading", "loading Add control exposes an accessible explanation");

  const retryCalls = [];
  const errorProps = pageProps({
    currentClaimAdmin: null,
    errorUserHF: new Error("transport"),
    claimAdminContext: { fetched: false, isLoading: false, error: null },
    retryClaimContext: () => retryCalls.push(true),
  });
  const errorPage = new Page(errorProps);
  equal(errorPage.canAdd(), false, "error context disables Add Claim");
  errorPage.retryContext();
  equal(retryCalls.length, 1, "error state exposes retry action");

  const baselineSource = childProcess.execFileSync("git", ["show", `${BASELINE}:src/pages/HealthFacilitiesPage.js`], { cwd: repoRoot, encoding: "utf8" });
  const BaselinePage = loadClass("src/pages/HealthFacilitiesPage.js", "HealthFacilitiesPage", {
    require: makeRequire(),
    source: baselineSource,
  });
  check(/canAdd\s*=\s*\(\)\s*=>\s*\{\s*return true;/.test(baselineSource), "baseline source retains the original canAdd true negative control");
  const baselineProps = pageProps({ currentUserHF: null, currentClaimAdmin: null, fetchedUserHF: false, claimAdminContext: {} });
  const baselinePage = new BaselinePage(baselineProps);
  equal(baselinePage.canAdd(), true, "pinned original page exposes the true negative control while context is missing");
}

function claimFormProps(overrides = {}) {
  const hf = facility("hf-1", "HF1");
  const currentAdmin = admin("admin-1", "ACTOR", hf);
  return {
    modulesManager: { getConf: (_m, key, fallback) => (key === "newClaim.status" ? 2 : fallback) },
    rights: [RIGHT_ADD],
    claimHealthFacilitySet: () => {},
    fetchClaim: () => {},
    journalize: () => {},
    print: () => {},
    generate: () => {},
    fetchMutation: () => Promise.resolve({}),
    coreAlert: () => {},
    intl: {},
    classes: { lockedPage: "locked" },
    fetchingClaim: false,
    fetchedClaim: false,
    errorClaim: null,
    add: () => {},
    save: () => Promise.resolve("saved"),
    back: () => {},
    isClaimCodeValid: true,
    claimHealthFacility: null,
    currentUserHF: null,
    claimAdmin: null,
    currentClaimAdmin: null,
    currentUsername: "ACTOR",
    fetchingUserHF: false,
    fetchedUserHF: false,
    errorUserHF: null,
    claimAdminContext: { isLoading: false, fetched: false, error: null },
    ...overrides,
  };
}

function testFreshClaimForm() {
  const Form = loadClass("src/components/ClaimForm.js", "ClaimForm");
  const form = new Form(claimFormProps());
  form.state.claim.explanation = "keep this unsaved user text";
  const hf = facility("hf-1", "HF1");
  const currentAdmin = admin("admin-1", "ACTOR", hf);
  const prevProps = form.props;
  form.props = claimFormProps({
    currentUserHF: hf,
    currentClaimAdmin: currentAdmin,
    fetchedUserHF: true,
    claimAdminContext: { isLoading: false, fetched: true, error: null, scopeUuid: "hf-1", username: "ACTOR", adminUuid: "admin-1" },
  });
  form.componentDidUpdate(prevProps);
  equal(form.state.claim.healthFacility.uuid, "hf-1", "delayed facility effect populates a fresh new claim");
  equal(form.state.claim.admin.uuid, "admin-1", "delayed admin effect populates a fresh new claim");
  equal(form.state.claim.explanation, "keep this unsaved user text", "context sync preserves unsaved user content");

  const saved = new Form(form.props);
  saved.state.isSaved = true;
  saved.state.claim.explanation = "saved content";
  saved.componentDidUpdate({ ...form.props, currentUserHF: null, currentClaimAdmin: null });
  equal(saved.state.claim.explanation, "saved content", "saved new claim content is not overwritten by later context");
  equal(saved.state.claim.healthFacility.uuid, "hf-1", "saved new claim scope remains unchanged");

  const loading = new Form(claimFormProps({
    fetchingUserHF: true,
    claimAdminContext: { isLoading: true, fetched: false, error: null },
  }));
  const loadingTree = loading.render();
  check(!findElement(loadingTree, "Form"), "fresh route does not render a blank claim form before context readiness");
  check(findElement(loadingTree, "ClaimAdminPicker"), "fresh route renders the supported selector/loading flow");

  const freshReady = new Form(claimFormProps({
    currentUserHF: hf,
    currentClaimAdmin: currentAdmin,
    fetchedUserHF: true,
    claimAdminContext: { isLoading: false, fetched: true, error: null, scopeUuid: "hf-1", username: "ACTOR", adminUuid: "admin-1" },
  }));
  check(!!findElement(freshReady.render(), "Form"), "fresh route renders the real form after context readiness");
}

function testReducerTransitions() {
  const core = makeCore({ parseData: () => [] });
  const reducer = loadModule(path.join(repoRoot, "src/reducer.js"), makeRequire({ core })).default;
  const initial = reducer(undefined, { type: "@@INIT" });
  equal(initial.claimAdminContext.retry, 0, "reducer initializes context retry counter");
  const loading = reducer(initial, { type: "CLAIM_CLAIM_ADMIN_CONTEXT_SET", payload: { isLoading: true, fetched: false, scopeUuid: "hf-1" } });
  equal(loading.claimAdminContext.isLoading, true, "reducer records scoped admin loading");
  loading.currentClaimAdmin = admin("admin-1", "ACTOR", facility("hf-1"));
  const retry = reducer(loading, { type: "CLAIM_CLAIM_CONTEXT_RETRY" });
  equal(retry.currentClaimAdmin, null, "retry clears stale current admin");
  equal(retry.claimAdminContext.retry, 1, "retry increments the context request generation");
  equal(retry.claimAdminContext.isLoading, true, "retry returns context to loading");
}

function runPickerHookTest() {
  const calls = [];
  const queryCalls = [];
  let state = { loc: { userHealthFacilityFullPath: null }, core: { user: { username: "ACTOR" } }, claim: { claimAdminContext: { retry: 0 } } };
  let query = { isLoading: false, data: null, error: null };
  let hookStates = [];
  let hookIndex = 0;
  let effects = [];
  let previousEffectDeps = [];
  const depsEqual = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const React = makeReact();
  React.useMemo = (factory, deps) => {
    const index = hookIndex++;
    const previous = hookStates[index];
    if (previous && depsEqual(previous.deps, deps)) return previous.value;
    const value = factory();
    hookStates[index] = { deps, value };
    return value;
  };
  React.useRef = (current) => {
    const index = hookIndex++;
    if (!hookStates[index]) hookStates[index] = { current };
    return hookStates[index];
  };
  React.useEffect = (effect, deps) => {
    const index = hookIndex++;
    const changed = !depsEqual(previousEffectDeps[index], deps);
    effects.push({ index, effect, changed, deps });
  };
  const dispatch = (action) => {
    if (typeof action === "function") return action(dispatch);
    calls.push(action);
  };
  const core = makeCore({
    useModulesManager: () => ({ getConf: (_m, _k, fallback) => fallback }),
    useTranslations: () => ({ formatMessage: (key) => key }),
    Autocomplete: "Autocomplete",
    useGraphqlQuery: (operation, variables, config) => {
      queryCalls.push({ operation, variables, config });
      return query;
    },
  });
  const pickerRequire = makeRequire({
    React,
    core,
    reactRedux: {
      connect: () => identity,
      useSelector: (selector) => selector(state),
      useDispatch: () => dispatch,
    },
    actions: {
      setCurrentClaimAdmin: (value) => (innerDispatch) => innerDispatch({ type: "CLAIM_SET_CURRENT_CLAIM_ADMIN", payload: value }),
    },
  });
  const Picker = loadModule(path.join(repoRoot, "src/pickers/ClaimAdminPicker.js"), pickerRequire).default;
  const render = () => {
    hookIndex = 0;
    effects = [];
    Picker({ onChange: () => {}, readOnly: true, required: true });
    for (const effect of effects) if (effect.changed) effect.effect();
    for (const effect of effects) previousEffectDeps[effect.index] = effect.deps;
  };
  render();
  equal(calls.filter((call) => call.type === "CLAIM_SET_CURRENT_CLAIM_ADMIN").length, 1, "picker clears admin once while the initial query is skipped");
  equal(queryCalls[0].config.skip, true, "picker skips the admin query until a facility scope exists");
  const initialCalls = calls.length;
  render();
  equal(calls.length, initialCalls, "stable picker rerender does not dispatch a loop");

  const hf1 = facility("hf-1");
  query = { isLoading: true, data: null, error: null };
  state = { ...state, loc: { userHealthFacilityFullPath: hf1 } };
  render();
  equal(queryCalls.length, 3, "facility arrival rerenders the picker query with the new scope");
  equal(queryCalls[2].config.skip, false, "facility arrival enables the admin query");
  check(queryCalls[2].operation !== queryCalls[0].operation, "facility arrival changes the operation so core useGraphqlQuery refetches after skipped mount");

  query = {
    isLoading: false,
    data: { claimAdmins: { edges: [{ node: admin("admin-1", "ACTOR", hf1) }] } },
    error: null,
  };
  render();
  equal(calls.filter((call) => call.type === "CLAIM_SET_CURRENT_CLAIM_ADMIN").at(-1).payload.uuid, "admin-1", "completed picker effect publishes the scoped actor");

  state = { ...state, loc: { userHealthFacilityFullPath: facility("hf-2") } };
  render();
  const last = calls.filter((call) => call.type === "CLAIM_SET_CURRENT_CLAIM_ADMIN").at(-1);
  equal(last.payload, null, "old-scope picker response cannot publish the previous actor under a new facility");
}

function runActualClaimFormPickerCompositionTest() {
  const hf = facility("hf-1", "HF1");
  const actor = admin("admin-1", "ACTOR", hf);
  const pickerDispatches = [];
  let pickerState = {
    loc: { userHealthFacilityFullPath: hf },
    core: { user: { username: "ACTOR" } },
    claim: { claimAdminContext: { retry: 0 } },
  };
  let pickerQuery = { isLoading: true, data: null, error: null };
  let hookStates = [];
  let hookIndex = 0;
  let effects = [];
  let previousEffectDeps = [];
  const depsEqual = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const React = makeReact();
  React.useMemo = (factory, deps) => {
    const index = hookIndex++;
    const previous = hookStates[index];
    if (previous && depsEqual(previous.deps, deps)) return previous.value;
    const value = factory();
    hookStates[index] = { deps, value };
    return value;
  };
  React.useRef = (current) => {
    const index = hookIndex++;
    if (!hookStates[index]) hookStates[index] = { current };
    return hookStates[index];
  };
  React.useEffect = (effect, deps) => {
    const index = hookIndex++;
    const changed = !depsEqual(previousEffectDeps[index], deps);
    effects.push({ index, effect, changed, deps });
  };
  const dispatch = (action) => {
    if (typeof action === "function") return action(dispatch);
    pickerDispatches.push(action);
  };
  const pickerCore = makeCore({
    useModulesManager: () => ({ getConf: (_m, _k, fallback) => fallback }),
    useTranslations: () => ({ formatMessage: (key) => key }),
    Autocomplete: "Autocomplete",
    useGraphqlQuery: () => pickerQuery,
  });
  const pickerRequire = makeRequire({
    React,
    core: pickerCore,
    reactRedux: {
      connect: () => identity,
      useSelector: (selector) => selector(pickerState),
      useDispatch: () => dispatch,
    },
    actions: {
      setCurrentClaimAdmin: (value) => (innerDispatch) => innerDispatch({ type: "CLAIM_SET_CURRENT_CLAIM_ADMIN", payload: value }),
    },
  });
  const Picker = loadModule(path.join(repoRoot, "src/pickers/ClaimAdminPicker.js"), pickerRequire).default;

  const renderPicker = (props) => {
    hookIndex = 0;
    effects = [];
    const tree = Picker({ onChange: () => {}, readOnly: true, required: true, ...props });
    for (const effect of effects) if (effect.changed) effect.effect();
    for (const effect of effects) previousEffectDeps[effect.index] = effect.deps;
    return tree;
  };
  const resetPickerMount = () => {
    hookStates = [];
    previousEffectDeps = [];
  };

  const panelCore = makeCore({
    FormPanel: class FormPanel {
      constructor(props) {
        this.props = props;
      }
    },
    ControlledField: "ControlledField",
    PublishedComponent: "PublishedComponent",
    Contributions: "Contributions",
    AmountInput: "AmountInput",
    TextInput: "TextInput",
    ValidatedTextInput: "ValidatedTextInput",
  });
  const panelRequire = (request) => {
    if (request === "react") return React;
    if (request === "redux") return { bindActionCreators: (value) => value };
    if (request === "react-redux") return { connect: () => identity };
    if (request === "react-intl") return { injectIntl: identity };
    if (request === "lodash") return { round: (value, precision) => Number(Number(value).toFixed(precision)) };
    if (request === "@openimis/fe-core") return panelCore;
    if (request === "../constants") return makeRequire() (request);
    if (request === "../actions") return { claimHealthFacilitySet: () => {}, clearClaim: () => {} };
    if (request === "../pickers/ClaimAdminPicker") return { __esModule: true, default: Picker };
    if (request === "../pickers/ClaimStatusPicker" || request === "../pickers/FeedbackStatusPicker" || request === "../pickers/ReviewStatusPicker") {
      return { __esModule: true, default: "StatusPicker" };
    }
    if (request.startsWith("@material-ui")) {
      if (request === "@material-ui/core") return { Grid: "Grid", Checkbox: "Checkbox", FormControlLabel: "FormControlLabel" };
      if (request === "@material-ui/core/styles") return { withStyles: () => identity, withTheme: () => identity };
      return { default: "Icon" };
    }
    return {};
  };
  const MasterPanel = loadClass("src/components/ClaimMasterPanel.js", "ClaimMasterPanel", { require: panelRequire });

  const formCore = makeCore({ Form: "Form" });
  const formRequire = (request) => {
    if (request === "react") return React;
    if (request === "redux") return { bindActionCreators: (value) => value };
    if (request === "react-redux") return { connect: () => identity };
    if (request === "react-intl") return { injectIntl: identity };
    if (request === "moment") return () => ({ toDate: () => new Date("2026-01-01T00:00:00.000Z") });
    if (request === "@openimis/fe-core") return formCore;
    if (request === "../constants") return makeRequire()(request);
    if (request === "../actions") return { claimHealthFacilitySet: () => {}, fetchClaim: () => {}, generate: () => {}, print: () => {} };
    if (request === "./claimFormPermissions") return loadModule(path.join(repoRoot, "src/components/claimFormPermissions.js"), makeRequire());
    if (request === "./claimContextReadiness") return loadModule(path.join(repoRoot, "src/components/claimContextReadiness.js"), makeRequire());
    if (request === "../pickers/ClaimAdminPicker") return { __esModule: true, default: Picker };
    if (request === "./ClaimMasterPanel") return { __esModule: true, default: MasterPanel };
    if (request.startsWith("@material-ui")) {
      if (request === "@material-ui/core") return { Fab: "Fab", Badge: "Badge", Button: "Button", Grid: "Grid", Tooltip: "Tooltip" };
      if (request === "@material-ui/core/styles") return { withStyles: () => identity, withTheme: () => identity };
      return { default: "Icon" };
    }
    return new Proxy({}, { get: (_target, name) => name });
  };
  const ClaimForm = loadClass("src/components/ClaimForm.js", "ClaimForm", { require: formRequire });
  const baseProps = claimFormProps({
    currentUserHF: hf,
    currentUsername: "ACTOR",
    fetchedUserHF: true,
    currentClaimAdmin: null,
    claimAdminContext: { isLoading: true, fetched: false, error: null, scopeUuid: "hf-1", username: "ACTOR" },
  });
  const form = new ClaimForm(baseProps);
  const loadingTree = form.render();
  const fallbackPicker = findElement(loadingTree, Picker);
  check(!!fallbackPicker, "actual ClaimForm mounts the fallback ClaimAdminPicker while context is loading");
  equal(fallbackPicker.props.ownsContext, true, "fallback picker is the explicit context owner");

  renderPicker({ ownsContext: fallbackPicker.props.ownsContext });
  check(pickerDispatches.some((action) => action.type === "CLAIM_CLAIM_ADMIN_CONTEXT_SET" && action.payload.isLoading), "owner publishes loading while its request is in flight");
  pickerQuery = { isLoading: false, data: { claimAdmins: { edges: [{ node: actor }] } }, error: null };
  renderPicker({ ownsContext: true });
  check(pickerDispatches.some((action) => action.type === "CLAIM_CLAIM_ADMIN_CONTEXT_SET" && action.payload.fetched), "owner publishes fetched context after the HTTP response");
  check(pickerDispatches.some((action) => action.type === "CLAIM_SET_CURRENT_CLAIM_ADMIN" && action.payload?.uuid === "admin-1"), "owner publishes the scoped current administrator");

  const readyProps = claimFormProps({
    currentUserHF: hf,
    currentUsername: "ACTOR",
    fetchedUserHF: true,
    currentClaimAdmin: actor,
    claimAdminContext: { isLoading: false, fetched: true, error: null, scopeUuid: "hf-1", username: "ACTOR", adminUuid: "admin-1" },
  });
  const readyForm = new ClaimForm(readyProps);
  const readyTree = readyForm.render();
  const formElement = findElement(readyTree, "Form");
  check(!!formElement, "completed owner response lets the actual ClaimForm mount the real Form");
  check(!!formElement.props.HeadPanel, "actual ClaimForm passes ClaimMasterPanel as the Form head panel");
  const panel = new MasterPanel({
    modulesManager: readyProps.modulesManager,
    intl: {},
    classes: { item: "item" },
    edited: readyForm.state.claim,
    readOnly: true,
    userHealthFacilityFullPath: hf,
    isCodeValid: true,
  });
  const panelTree = panel.render();
  const nestedPicker = findElement(panelTree, Picker);
  check(!!nestedPicker, "actual ClaimMasterPanel mounts its readonly admin picker after the Form appears");
  equal(nestedPicker.props.ownsContext, false, "readonly ClaimMasterPanel picker is display-only and not a context owner");

  const beforeNested = pickerDispatches.length;
  resetPickerMount();
  pickerQuery = { isLoading: true, data: null, error: null };
  renderPicker({ ownsContext: nestedPicker.props.ownsContext });
  equal(pickerDispatches.length, beforeNested, "nested readonly picker loading does not republish global context loading");
  const unguardedStart = pickerDispatches.length;
  resetPickerMount();
  renderPicker({ ownsContext: true });
  check(pickerDispatches.length > unguardedStart, "negative control: an unguarded remounted picker republishes loading");
  check(pickerDispatches.slice(unguardedStart).some((action) => action.type === "CLAIM_CLAIM_ADMIN_CONTEXT_SET" && action.payload.isLoading), "negative control emits the exact loading transition that would gate the Form back to fallback");
}

(async () => {
  testReadinessPermutations();
  testHealthFacilitiesPage();
  testFreshClaimForm();
  testReducerTransitions();
  runPickerHookTest();
  runActualClaimFormPickerCompositionTest();
  console.log(`claim context tests: PASS (${checks} assertions; readiness permutations, real page/form/reducer/picker, actual mount cycle, baseline negative control)`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
