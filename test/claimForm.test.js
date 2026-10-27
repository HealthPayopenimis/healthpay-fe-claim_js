const assert = require("assert");
const fs = require("fs");
const path = require("path");

const RIGHT_ADD = 111002;
const RIGHT_CLAIMREVIEW = 111008;
const RIGHT_FEEDBACK = 111009;
const RIGHT_UPDATE = 111010;
const RIGHT_LOAD = 111005;

function loadPermissionHelper() {
  const filename = path.join(__dirname, "../src/components/claimFormPermissions.js");
  const source = fs
    .readFileSync(filename, "utf8")
    .replace(
      /import \{[\s\S]*?\} from "\.\.\/constants";\n\n/,
      "",
    )
    .replace(/export function /g, "function ");
  const module = { exports: {} };
  new Function("module", "exports", `${source}\nmodule.exports = { claimFormRequiredRight, isClaimFormReadOnly, recoverClaimFormAfterSaveError, saveClaimWithRecovery };`)(
    module,
    module.exports,
  );
  return module.exports;
}

Object.assign(global, { RIGHT_ADD, RIGHT_CLAIMREVIEW, RIGHT_FEEDBACK, RIGHT_LOAD });
const {
  claimFormRequiredRight,
  isClaimFormReadOnly,
  recoverClaimFormAfterSaveError,
  saveClaimWithRecovery,
} = loadPermissionHelper();

const claim = (overrides = {}) => ({ status: 2, ...overrides });
const editable = (rights, options = {}) => !isClaimFormReadOnly({ rights, claim: claim(), ...options });

function testPermissionMatrix() {
  assert.strictEqual(claimFormRequiredRight({}), RIGHT_ADD);
  assert.strictEqual(claimFormRequiredRight({ isExistingEntry: true }), RIGHT_LOAD);
  assert.strictEqual(claimFormRequiredRight({ forReview: true }), RIGHT_CLAIMREVIEW);
  assert.strictEqual(claimFormRequiredRight({ forFeedback: true }), RIGHT_FEEDBACK);

  assert.strictEqual(editable([RIGHT_ADD]), true, "entry-only actor can edit a new entered claim");
  assert.strictEqual(editable([RIGHT_ADD, RIGHT_CLAIMREVIEW]), true, "entry actor with reviewer right remains editable");
  assert.strictEqual(editable([RIGHT_CLAIMREVIEW]), false, "reviewer-only actor cannot create a new claim");
  assert.strictEqual(editable([]), false, "actor without entry right cannot create a new claim");

  assert.strictEqual(
    editable([RIGHT_LOAD], { claimUuid: "existing-claim" }),
    true,
    "existing ordinary entry uses the existing load/edit contract",
  );
  assert.strictEqual(
    editable([RIGHT_ADD], { claimUuid: "existing-claim" }),
    false,
    "entry right alone does not broaden existing-claim edit access",
  );

  assert.strictEqual(
    editable([RIGHT_CLAIMREVIEW], { forReview: true, claim: claim({ status: 4, reviewStatus: 4 }) }),
    true,
    "reviewer can edit a valid review claim",
  );
  assert.strictEqual(
    editable([RIGHT_ADD], { forReview: true, claim: claim({ status: 4, reviewStatus: 4 }) }),
    false,
    "entry-only actor cannot edit a review claim",
  );
  assert.strictEqual(
    editable([RIGHT_CLAIMREVIEW], { forReview: true, claim: claim({ status: 4, reviewStatus: 8 }) }),
    false,
    "delivered review remains locked",
  );
  assert.strictEqual(
    editable([RIGHT_CLAIMREVIEW], { forReview: true, claim: claim({ status: 2, reviewStatus: 4 }) }),
    false,
    "non-review main status remains locked",
  );

  assert.strictEqual(
    editable([RIGHT_FEEDBACK], { forFeedback: true, claim: claim({ status: 4 }) }),
    true,
    "feedback right permits valid feedback detail",
  );
  assert.strictEqual(
    editable([RIGHT_UPDATE], { forFeedback: true, claim: claim({ status: 4 }) }),
    false,
    "update right alone does not invent feedback-detail access",
  );
  assert.strictEqual(
    editable([RIGHT_FEEDBACK], { forFeedback: true, claim: claim({ status: 2 }) }),
    false,
    "feedback status lock remains effective",
  );

  assert.strictEqual(editable([RIGHT_ADD], { lockNew: true }), false, "new-form lock remains effective");
  assert.strictEqual(editable([RIGHT_ADD], { isSaved: true }), false, "saved-form lock remains effective");
  assert.strictEqual(editable([RIGHT_ADD], { claim: claim({ status: 1 }) }), false, "status lock remains effective");
}

async function testMockedComponentSaveRecovery() {
  const initialState = { lockNew: true, isSaved: true, claim: { status: 2 } };
  const recovered = recoverClaimFormAfterSaveError(initialState);
  assert.deepStrictEqual(recovered, { ...initialState, lockNew: false, isSaved: false });

  let saveCalls = 0;
  let errorCalls = 0;
  let successCalls = 0;
  await saveClaimWithRecovery(
    () => {
      saveCalls += 1;
      return Promise.reject(new Error("synthetic mutation failure"));
    },
    { code: "SYNTHETIC" },
    () => {
      successCalls += 1;
    },
    (error) => {
      errorCalls += 1;
      assert.match(error.message, /synthetic mutation failure/);
    },
  );
  assert.strictEqual(saveCalls, 1, "failed mutation is attempted once");
  assert.strictEqual(errorCalls, 1, "failed mutation reaches the recovery path");
  assert.strictEqual(successCalls, 0, "failed mutation cannot report success");
}

function testNegativeControls() {
  const claimFormSource = fs.readFileSync(path.join(__dirname, "../src/components/ClaimForm.js"), "utf8");
  assert.ok(!claimFormSource.includes("!rights.filter((r) => r === RIGHT_CLAIMREVIEW).length"), "old unconditional reviewer gate is absent");
  assert.ok(claimFormSource.includes("isClaimFormReadOnly"), "ClaimForm uses the mode-aware predicate");
  assert.ok(claimFormSource.includes("recoverClaimFormAfterSaveError"), "ClaimForm uses bounded save-error recovery");
  assert.ok(!claimFormSource.includes("createClaim"), "ClaimForm does not call a guessed mutation directly");
}

(async () => {
  testPermissionMatrix();
  await testMockedComponentSaveRecovery();
  testNegativeControls();
  console.log("claimForm tests: PASS (permission matrix, mocked component recovery, negative controls)");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
