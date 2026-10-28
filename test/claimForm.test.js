const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const childProcess = require("child_process");
const { createStore, applyMiddleware } = require("redux");
const { RSAA, apiMiddleware } = require("redux-api-middleware");

const TOOLCHAIN = "/home/ubuntu/healthpay-v3-execution/module-toolchain/node_modules";
const MODULE_PATHS = [TOOLCHAIN, path.join(__dirname, "../node_modules")];
const resolveModule = (name) => require.resolve(name, { paths: MODULE_PATHS });
const babel = require(resolveModule("@babel/core"));
const presetEnv = require(resolveModule("@babel/preset-env"));
const presetReact = require(resolveModule("@babel/preset-react"));
const classProperties = require(resolveModule("@babel/plugin-proposal-class-properties"));

const RIGHT_ADD = 111002;
const RIGHT_CLAIMREVIEW = 111008;
const RIGHT_FEEDBACK = 111009;
const RIGHT_UPDATE = 111010;
const RIGHT_LOAD = 111005;
const STATUS_ENTERED = 2;
const STATUS_REVIEW = 4;
const BASELINE = "15587e2961f59ab26e1d21cdef97ef12a5182309";
const repoRoot = path.join(__dirname, "..");
const CORE_FORM_CHECKOUT = "/home/ubuntu/healthpay-dev-fixes/healthpay-fe-core_js/src/components/generics/Form.js";
const CORE_FORM_FIXTURE = path.join(repoRoot, "test/fixtures/core-Form.d5ed063.js");

const constants = {
  RIGHT_ADD,
  RIGHT_CLAIMREVIEW,
  RIGHT_FEEDBACK,
  RIGHT_UPDATE,
  RIGHT_LOAD,
  RIGHT_PRINT: 111006,
  RIGHT_RESTORE: 111012,
  STATUS_REJECTED: 1,
  DEFAULT: {
    AUTOGENERATE_CLAIM_CODE: false,
    EXPLANATION_REQUIRED_IF_ABOVE_THRESHOLD: false,
    QUANTITY_EXPLANATION_THRESHOLD: 1,
    QUANTITY_MAX_VALUE: 10000,
  },
  REFERRAL: "R",
  SERVICE_TYPE_PP_S: "S",
  CARE_TYPE_STATUS: ["IPD", "OPD"],
  IN_PATIENT_STRING: "IPD",
  STORAGE_KEY_ADMIN: "admin",
  STORAGE_KEY_CLAIM_HEALTH_FACILITY: "claimHealthFacility",
};

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

function identity(value) {
  return value;
}

function makeCore() {
  const core = {
    Contributions: "Contributions",
    Form: "Form",
    Helmet: "Helmet",
    ProgressOrError: "ProgressOrError",
    PublishedComponent: "PublishedComponent",
    formatMessage: (_intl, _module, key) => key,
    formatMessageWithValues: (_intl, _module, key, values) => `${key}:${JSON.stringify(values || {})}`,
    journalize: () => {},
    toISODate: (date) => date.toISOString(),
    withHistory: identity,
    withModulesManager: identity,
    fetchMutation: () => Promise.resolve({}),
    parseData: () => [],
    coreAlert: () => {},
    historyPush: (_mm, history, route) => history?.push?.(route),
    dispatchMutationReq: (state, action) => ({ ...state, submittingMutation: true, mutation: action.meta }),
    dispatchMutationResp: (state, service, action) => ({
      ...state,
      submittingMutation: false,
      mutation: { ...state.mutation, id: action.payload.data[service].internalId },
    }),
    dispatchMutationErr: (state, action) => ({ ...state, alert: JSON.stringify(action.payload) }),
    formatServerError: (payload) => payload,
    formatGraphQLError: () => null,
    pageInfo: () => ({}),
  };
  return core;
}

function makeModuleManager() {
  return {
    getConf: (_module, key, fallback) => {
      if (key === "newClaim.status") return STATUS_ENTERED;
      return fallback;
    },
    getRef: () => "claim-edit",
  };
}

function makeRequire({ baseline = false } = {}) {
  const React = makeReact();
  const core = makeCore();
  const actions = {
    claimHealthFacilitySet: () => {},
    selectClaimAdmin: () => {},
    selectHealthFacility: () => {},
    retryClaimContext: () => {},
    submit: () => {},
    submitAll: () => {},
    del: () => {},
    clearCurrentPaginationPage: () => {},
    fetchClaim: () => {},
    generate: () => {},
    print: () => {},
    createClaim: () => Promise.resolve("created"),
    updateClaim: () => Promise.resolve("updated"),
  };
  const components = new Proxy({}, { get: (_target, name) => name });
  return (request) => {
    if (request === "react") return React;
    if (request === "redux") return { bindActionCreators: (value) => value };
    if (request === "react-redux") return { connect: () => identity };
    if (request === "react-intl") return { injectIntl: identity };
    if (request === "moment") return () => ({ toDate: () => new Date("2026-01-01T00:00:00.000Z") });
    if (request === "@openimis/fe-core") return core;
    if (request === "../constants") return constants;
    if (request === "../actions") return actions;
    if (request === "./claimFormPermissions") {
      return loadModule(path.join(repoRoot, "src/components/claimFormPermissions.js"), {
        transformOptions: { includeHelper: true },
      });
    }
    if (request === "./claimContextReadiness" || request === "../components/claimContextReadiness") {
      return loadModule(path.join(repoRoot, "src/components/claimContextReadiness.js"));
    }
    if (request.startsWith("./") || request.startsWith("../")) return components;
    if (request.startsWith("@material-ui")) {
      if (request === "@material-ui/core") return {
        Fab: "Fab",
        Badge: "Badge",
        Button: "Button",
        Grid: "Grid",
        Tooltip: "Tooltip",
      };
      if (request === "@material-ui/core/styles") return { withStyles: () => identity, withTheme: identity };
      return { default: "Icon" };
    }
    if (request === "prop-types") return {};
    return {};
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

function loadModule(filename, options = {}) {
  const source = options.source || fs.readFileSync(filename, "utf8");
  const transformed = transpile(source, filename);
  const module = { exports: {} };
  const localRequire = options.require || makeRequire(options);
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: localRequire,
    console,
    Promise,
    Error,
    JSON,
    Date,
    Math,
    parseFloat,
    Number,
    isNaN,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  });
  const append = options.exportNames || [];
  const suffix = append.length ? `\nmodule.exports.__classes = { ${append.join(", ")} };` : "";
  new vm.Script(`${transformed}${suffix}`, { filename }).runInContext(context);
  return module.exports;
}

function loadClass(filename, className, options = {}) {
  return loadModule(filename, { ...options, exportNames: [className] }).__classes[className];
}

function baseClaimProps(overrides = {}) {
  const facility = { uuid: "hf-1", code: "HF1", name: "Facility 1" };
  const admin = { uuid: "admin-1", code: "user-1", healthFacility: facility };
  return {
    modulesManager: makeModuleManager(),
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
    claimHealthFacility: facility,
    currentUserHF: facility,
    claimAdmin: admin,
    currentClaimAdmin: admin,
    fetchingUserHF: false,
    fetchedUserHF: true,
    errorUserHF: null,
    claimAdminContext: { isLoading: false, fetched: true, error: null, retry: 0 },
    ...overrides,
  };
}

function findElement(tree, type) {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!tree || typeof tree !== "object") return null;
  if (tree.type === type) return tree;
  const children = tree.props && tree.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}

function makeCoreFormRequire() {
  const React = makeReact();
  return (request) => {
    if (request === "react") return React;
    if (request === "@material-ui/core") {
      return {
        Fab: "Fab",
        Grid: "Grid",
        Paper: "Paper",
        IconButton: "IconButton",
        Typography: "Typography",
        Divider: "Divider",
        Tooltip: "Tooltip",
      };
    }
    if (request === "@material-ui/core/styles") return { withStyles: () => identity, withTheme: identity };
    if (request === "react-intl") return { injectIntl: identity };
    if (["@material-ui/icons/Add", "@material-ui/icons/Save", "@material-ui/icons/ChevronLeft"].includes(request))
      return "Icon";
    if (request === "./FormattedMessage" || request === "./Contributions") return "Component";
    if (request === "../../helpers/history") return identity;
    if (request === "../../helpers/i18n") return { withTooltip: (content) => content, formatMessage: () => "tooltip" };
    if (request === "lodash") return {};
    return {};
  };
}

function loadExactCoreFormClass() {
  const sourcePath = fs.existsSync(CORE_FORM_CHECKOUT) ? CORE_FORM_CHECKOUT : CORE_FORM_FIXTURE;
  return loadClass(sourcePath, "Form", { require: makeCoreFormRequire() });
}

function coreFormProps(claimForm) {
  const rendered = findElement(claimForm.render(), "Form");
  assert.ok(rendered, "ClaimForm renders the exact Core Form integration point");
  return {
    ...rendered.props,
    classes: {
      paper: "paper",
      paperHeader: "paper-header",
      paperHeaderAction: "paper-header-action",
      tooltipContainer: "tooltip-container",
      flexTooltip: "flex-tooltip",
    },
    canSave: () => true,
  };
}

function coreSaveFab(coreForm) {
  return findElement(coreForm.render(), "Fab");
}

function testPermissionMatrix() {
  const permissions = loadModule(path.join(repoRoot, "src/components/claimFormPermissions.js"), {
    require: (request) => (request === "../constants" ? constants : {}),
  });
  const claim = (overrides = {}) => ({ status: STATUS_ENTERED, ...overrides });
  const editable = (rights, options = {}) => !permissions.isClaimFormReadOnly({ rights, claim: claim(), ...options });

  assert.strictEqual(permissions.claimFormRequiredRight({}), RIGHT_ADD);
  assert.strictEqual(permissions.claimFormRequiredRight({ isExistingEntry: true }), RIGHT_UPDATE);
  assert.strictEqual(permissions.claimFormRequiredRight({ forReview: true }), RIGHT_CLAIMREVIEW);
  assert.strictEqual(permissions.claimFormRequiredRight({ forFeedback: true }), RIGHT_FEEDBACK);
  assert.strictEqual(editable([RIGHT_ADD]), true);
  assert.strictEqual(editable([RIGHT_CLAIMREVIEW]), false);
  assert.strictEqual(editable([RIGHT_UPDATE, RIGHT_LOAD], { claimUuid: "existing-claim" }), true);
  assert.strictEqual(editable([RIGHT_LOAD], { claimUuid: "existing-claim" }), false);
  assert.strictEqual(editable([RIGHT_ADD], { claimUuid: "existing-claim" }), false);
  assert.strictEqual(editable([RIGHT_CLAIMREVIEW], { forReview: true, claim: claim({ status: STATUS_REVIEW, reviewStatus: 4 }) }), true);
  assert.strictEqual(editable([RIGHT_CLAIMREVIEW], { forReview: true, claim: claim({ status: STATUS_REVIEW, reviewStatus: 8 }) }), false);
  assert.strictEqual(editable([RIGHT_FEEDBACK], { forFeedback: true, claim: claim({ status: STATUS_REVIEW }) }), true);
  assert.strictEqual(editable([RIGHT_UPDATE], { forFeedback: true, claim: claim({ status: STATUS_REVIEW }) }), false);
  assert.strictEqual(editable([RIGHT_ADD], { lockNew: true }), false);
  assert.strictEqual(editable([RIGHT_ADD], { isSaved: true }), false);
  assert.strictEqual(editable([RIGHT_ADD], { claim: claim({ status: 1 }) }), false);
}

function testRealClaimFormRender() {
  const ClaimForm = loadClass(path.join(repoRoot, "src/components/ClaimForm.js"), "ClaimForm");
  const entryForm = new ClaimForm(baseClaimProps({ rights: [RIGHT_ADD] }));
  const entryTree = entryForm.render();
  const entry = findElement(entryTree, "Form");
  assert.ok(entry, "real ClaimForm renders the core Form");
  assert.strictEqual(entry.props.readOnly, false, "entry-only actor gets an editable new form");
  assert.strictEqual(typeof entry.props.save, "function", "editable new form exposes save");

  const reviewerOnNewForm = new ClaimForm(baseClaimProps({ rights: [RIGHT_CLAIMREVIEW] }));
  const reviewer = findElement(reviewerOnNewForm.render(), "Form");
  assert.strictEqual(reviewer.props.readOnly, true, "reviewer-only actor cannot edit ordinary new entry");
  assert.strictEqual(reviewer.props.save, null, "read-only new form does not expose save");

  const loadOnly = new ClaimForm(baseClaimProps({ rights: [RIGHT_LOAD], fetchedClaim: true }));
  loadOnly.state.claim_uuid = "existing-claim";
  loadOnly.state.claim.uuid = "existing-claim";
  const loaded = findElement(loadOnly.render(), "Form");
  assert.strictEqual(loaded.props.readOnly, true, "load-only actor cannot update an existing claim");
  assert.strictEqual(loaded.props.save, null, "load-only form does not expose update");
  const updater = new ClaimForm(baseClaimProps({ rights: [RIGHT_LOAD, RIGHT_UPDATE], fetchedClaim: true }));
  updater.state.claim_uuid = "existing-claim";
  updater.state.claim.uuid = "existing-claim";
  const updated = findElement(updater.render(), "Form");
  assert.strictEqual(updated.props.readOnly, false, "existing update requires the backend update right");

  const validReview = new ClaimForm(
    baseClaimProps({ rights: [RIGHT_CLAIMREVIEW], forReview: true }),
  );
  validReview.state.claim = { ...validReview.state.claim, status: STATUS_REVIEW, reviewStatus: 4 };
  const review = findElement(validReview.render(), "Form");
  assert.strictEqual(review.props.readOnly, false, "reviewer can edit a valid review form");

  const lockedReview = new ClaimForm(
    baseClaimProps({ rights: [RIGHT_CLAIMREVIEW], forReview: true }),
  );
  lockedReview.state.claim = { ...lockedReview.state.claim, status: STATUS_REVIEW, reviewStatus: 8 };
  const locked = findElement(lockedReview.render(), "Form");
  assert.strictEqual(locked.props.readOnly, true, "delivered review remains locked");
}

async function testRealClaimFormSaveRecovery() {
  const ClaimForm = loadClass(path.join(repoRoot, "src/components/ClaimForm.js"), "ClaimForm");
  let saveCalls = 0;
  const form = new ClaimForm(
    baseClaimProps({
      save: () => {
        saveCalls += 1;
        return Promise.reject(new Error("synthetic transport rejection"));
      },
    }),
  );
  const errors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    form._save({ code: "SYNTHETIC" });
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    console.error = originalConsoleError;
  }
  assert.strictEqual(saveCalls, 1, "real ClaimForm._save attempts a rejected mutation once");
  assert.strictEqual(errors.length, 1, "rejected mutation reports one error");
  assert.match(String(errors[0][0]), /Failed to save claim/);
  assert.strictEqual(form.state.lockNew, false, "rejected create unlocks the real form");
  assert.strictEqual(form.state.isSaved, false, "rejected create clears the real saved flag");

  let successCalls = 0;
  const successful = new ClaimForm(
    baseClaimProps({ save: () => Promise.resolve("created") }),
  );
  successful.props.save = () => {
    successCalls += 1;
    return Promise.resolve("created");
  };
  successful._save({ code: "SUCCESS" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(successCalls, 1, "successful real ClaimForm._save calls transport once");
  assert.strictEqual(successful.state.lockNew, true, "successful save keeps existing lock semantics");
  assert.strictEqual(successful.state.isSaved, true, "successful save keeps existing saved semantics");
}

function transportFailureAction(clientMutationId) {
  return {
    [RSAA]: {
      endpoint: "https://claims.invalid/api/graphql",
      method: "POST",
      body: "{}",
      fetch: () => Promise.reject(new Error("simulated network failure")),
      types: [
        { type: "CLAIM_MUTATION_REQ", meta: { clientMutationId } },
        { type: "CLAIM_CREATE_CLAIM_RESP", meta: { clientMutationId } },
        { type: "CLAIM_MUTATION_ERR", meta: { clientMutationId } },
      ],
    },
  };
}

async function testReduxTransportFailureRecovery() {
  const reducer = loadModule(path.join(repoRoot, "src/reducer.js"), {
    ...makeRequire(),
  }).default;
  const store = createStore(reducer, applyMiddleware(apiMiddleware));
  const clientMutationId = "transport-failure-1";
  const draft = { code: "RETRY-ME", clientMutationId, description: "preserve this draft" };
  let journalCalls = 0;
  let transportCalls = 0;
  const form = new (loadClass(path.join(repoRoot, "src/components/ClaimForm.js"), "ClaimForm"))(
    baseClaimProps({
      submittingMutation: true,
      mutation: { clientMutationId },
      journalize: () => {
        journalCalls += 1;
      },
      save: () => {
        transportCalls += 1;
        return store.dispatch(transportFailureAction(`transport-failure-${transportCalls}`));
      },
    }),
  );
  form.state.claim = draft;

  const failureAction = await store.dispatch(transportFailureAction(clientMutationId));
  const failedState = store.getState();
  assert.strictEqual(failureAction.error, true, "real RSAA middleware returns a resolved error action");
  assert.strictEqual(failedState.submittingMutation, false, "claim reducer completes a failed mutation");
  assert.strictEqual(!!failedState.mutationError, true, "claim reducer exposes the failed mutation to the observer");

  const previousProps = form.props;
  form.props = {
    ...form.props,
    submittingMutation: failedState.submittingMutation,
    mutation: failedState.mutation,
    mutationError: failedState.mutationError,
  };
  form.componentDidUpdate(previousProps, form.state);
  assert.strictEqual(form.state.lockNew, false, "real Redux transport failure unlocks the form");
  assert.strictEqual(form.state.isSaved, false, "real Redux transport failure clears the saved flag");
  assert.strictEqual(form.state.claim.clientMutationId, undefined, "failed transient mutation id is cleared");
  assert.strictEqual(form.state.claim.code, draft.code, "failed save preserves the edited draft");
  assert.strictEqual(form.state.claim.description, draft.description, "failed save preserves all draft fields");
  assert.strictEqual(journalCalls, 0, "failed mutation is not journalized as a success");

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    form._save(form.state.claim);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    console.error = originalConsoleError;
  }
  assert.strictEqual(transportCalls, 1, "unlocked form permits a genuine retry transport");
  assert.strictEqual(form.state.lockNew, false, "retry failure also unlocks the form");
  assert.strictEqual(form.state.isSaved, false, "retry failure also clears the saved flag");
}

async function testExactCoreFormRecoveryLifecycle() {
  const CoreForm = loadExactCoreFormClass();
  const ClaimForm = loadClass(path.join(repoRoot, "src/components/ClaimForm.js"), "ClaimForm");
  let transportCalls = 0;
  const claimForm = new ClaimForm(
    baseClaimProps({
      save: () => {
        transportCalls += 1;
        return Promise.reject(new Error("exact Core Form lifecycle rejection"));
      },
    }),
  );
  const coreForm = new CoreForm(coreFormProps(claimForm));
  const draft = { ...claimForm.state.claim, code: "CORE-RETRY", description: "retain this draft" };

  coreForm.onEditedChanged(draft);
  coreForm.save(draft);
  assert.strictEqual(coreForm.state.dirty, true, "exact Core Form marks the edited claim dirty");
  assert.strictEqual(coreForm.state.saving, true, "exact Core Form locks Save while the first attempt is pending");
  assert.strictEqual(coreSaveFab(coreForm).props.disabled, true, "exact Core Form disables Save during the first attempt");
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(transportCalls, 1, "the exact Core Form path makes one real first save attempt");
  assert.strictEqual(claimForm.state.claim.description, draft.description, "claim recovery retains the edited draft");
  assert.strictEqual(claimForm.state.lockNew, false, "claim recovery unlocks the form");
  assert.strictEqual(claimForm.state.isSaved, false, "claim recovery clears the saved flag");
  assert.strictEqual(claimForm.state.saveRecoveryVersion, 1, "claim recovery emits one update version");

  const previousCoreProps = coreForm.props;
  coreForm.props = coreFormProps(claimForm);
  coreForm.componentDidUpdate(previousCoreProps, coreForm.state);
  assert.strictEqual(coreForm.state.dirty, true, "Core Form recovery does not discard dirty state");
  assert.strictEqual(coreForm.state.saving, false, "Core Form update signal clears only saving");
  assert.strictEqual(coreSaveFab(coreForm).props.disabled, false, "the recovered Core Form Save control is enabled");

  coreForm.save(claimForm.state.claim);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(transportCalls, 2, "the recovered exact Core Form permits a genuine second save attempt");
}

async function testOldClaimRecoveryLeavesExactCoreFormSaving() {
  const CoreForm = loadExactCoreFormClass();
  const oldClaimSource = childProcess.execFileSync("git", ["show", "HEAD:src/components/ClaimForm.js"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const ClaimForm = loadClass(path.join(repoRoot, "src/components/ClaimForm.js"), "ClaimForm", {
    source: oldClaimSource,
  });
  let transportCalls = 0;
  const claimForm = new ClaimForm(
    baseClaimProps({
      save: () => {
        transportCalls += 1;
        return Promise.reject(new Error("old exact Core Form lifecycle rejection"));
      },
    }),
  );
  const coreForm = new CoreForm(coreFormProps(claimForm));
  const draft = { ...claimForm.state.claim, code: "OLD-CORE-RETRY", description: "old draft" };
  coreForm.onEditedChanged(draft);
  coreForm.save(draft);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(transportCalls, 1, "old claim path makes one first save attempt");
  const previousCoreProps = coreForm.props;
  coreForm.props = coreFormProps(claimForm);
  coreForm.componentDidUpdate(previousCoreProps, coreForm.state);
  assert.strictEqual(coreForm.state.dirty, true, "old claim recovery still retains dirty state");
  assert.strictEqual(coreForm.state.saving, true, "old claim recovery leaves exact Core Form saving stuck");
  assert.strictEqual(coreSaveFab(coreForm).props.disabled, true, "old claim recovery leaves Save disabled");
}

async function testBaselineReduxTransportNegativeControl() {
  const baselineReducer = loadModule(path.join(repoRoot, "src/reducer.js"), {
    ...makeRequire(),
  }, [], childProcess.execFileSync("git", ["show", `${BASELINE}:src/reducer.js`], {
    cwd: repoRoot,
    encoding: "utf8",
  })).default;
  const store = createStore(baselineReducer, applyMiddleware(apiMiddleware));
  const form = new (loadBaselineClass("src/components/ClaimForm.js", "ClaimForm"))(
    baseClaimProps({ submittingMutation: true, mutation: { clientMutationId: "baseline-failure" } }),
  );
  form.state.claim = { code: "BASELINE-LOCK", clientMutationId: "baseline-failure" };
  form.state.lockNew = true;
  form.state.isSaved = true;
  const previousProps = form.props;
  await store.dispatch(transportFailureAction("baseline-failure"));
  const failedState = store.getState();
  form.props = { ...form.props, submittingMutation: failedState.submittingMutation, mutation: failedState.mutation };
  form.componentDidUpdate(previousProps, form.state);
  assert.strictEqual(form.state.lockNew, true, "baseline negative control reproduces the stuck lock after Redux transport failure");
  assert.strictEqual(form.state.isSaved, true, "baseline negative control reproduces the stuck saved state");
}

async function testRealEditPageSave() {
  const EditPage = loadClass(path.join(repoRoot, "src/pages/EditPage.js"), "EditPage");
  const createResult = Promise.resolve({ created: true });
  const updateResult = Promise.resolve({ updated: true });
  const calls = [];
  const page = new EditPage({
    modulesManager: makeModuleManager(),
    history: {},
    intl: {},
    createClaim: (...args) => {
      calls.push(["create", args[1]]);
      return createResult;
    },
    updateClaim: (...args) => {
      calls.push(["update", args[1]]);
      return updateResult;
    },
  });
  assert.deepStrictEqual(await page.save({ code: "NEW" }), { created: true }, "EditPage.save returns create result");
  assert.deepStrictEqual(await page.save({ uuid: "existing", code: "OLD" }), { updated: true }, "EditPage.save returns update result");
  assert.deepStrictEqual(calls.map(([kind]) => kind), ["create", "update"]);

  const rejection = Promise.reject(new Error("mutation rejected"));
  rejection.catch(() => {});
  const rejectingPage = new EditPage({
    modulesManager: makeModuleManager(),
    history: {},
    intl: {},
    createClaim: () => rejection,
    updateClaim: () => rejection,
  });
  await assert.rejects(() => rejectingPage.save({ code: "REJECTED" }), /mutation rejected/);
  await assert.rejects(() => rejectingPage.save({ uuid: "existing", code: "REJECTED" }), /mutation rejected/);
}

function loadBaselineClass(relativePath, className) {
  const source = childProcess.execFileSync("git", ["show", `${BASELINE}:${relativePath}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return loadClass(path.join(repoRoot, relativePath), className, { source });
}

async function testBaselineNegativeControls() {
  const BaselineClaimForm = loadBaselineClass("src/components/ClaimForm.js", "ClaimForm");
  const baselineForm = new BaselineClaimForm(baseClaimProps({ rights: [RIGHT_ADD] }));
  const baselineEntry = findElement(baselineForm.render(), "Form");
  assert.strictEqual(baselineEntry.props.readOnly, true, "baseline negative control reproduces reviewer-gated entry block");

  const BaselineEditPage = loadBaselineClass("src/pages/EditPage.js", "EditPage");
  const action = Promise.reject(new Error("baseline mutation rejected"));
  action.catch(() => {});
  const baselinePage = new BaselineEditPage({
    modulesManager: makeModuleManager(),
    history: {},
    intl: {},
    createClaim: () => action,
    updateClaim: () => action,
  });
  const baselineResult = await baselinePage.save({ code: "BASELINE" });
  assert.strictEqual(baselineResult, undefined, "baseline EditPage.save does not bubble mutation promise");
}

(async () => {
  testPermissionMatrix();
  testRealClaimFormRender();
  await testRealClaimFormSaveRecovery();
  await testReduxTransportFailureRecovery();
  await testExactCoreFormRecoveryLifecycle();
  await testOldClaimRecoveryLeavesExactCoreFormSaving();
  await testBaselineReduxTransportNegativeControl();
  await testRealEditPageSave();
  await testBaselineNegativeControls();
  console.log("claimForm tests: PASS (real ClaimForm/EditPage, Redux transport failure recovery, permission matrix, baseline controls)");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
