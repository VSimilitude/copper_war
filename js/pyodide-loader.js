/* global loadPyodide */

let pyodide = null;
let bridgeReady = false;

async function initPyodide(onProgress) {
    onProgress("Downloading Python runtime...");
    pyodide = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/",
    });

    onProgress("Loading simulation engine...");
    // Cache-bust with the build SHA so a new deploy can't pair fresh JS with
    // a stale cached engine bundle.
    const response = await fetch(`python/copper_war.zip?v=${window.BUILD_SHA || ""}`);
    const zipData = await response.arrayBuffer();
    pyodide.unpackArchive(zipData, "zip", {
        extractDir: "/lib/python3.12/site-packages/",
    });

    onProgress("Initializing bridge...");
    pyodide.runPython("from copper_war.web import bridge");

    bridgeReady = true;
    onProgress("Ready");
}

function callBridge(funcName, ...args) {
    if (!bridgeReady) {
        return { ok: false, error: "Python runtime not ready" };
    }

    try {
        const argsJson = JSON.stringify(args);
        pyodide.globals.set("_bridge_args_json", argsJson);

        const resultJson = pyodide.runPython(
`import json
_bridge_args = json.loads(_bridge_args_json)
json.dumps(bridge.${funcName}(*_bridge_args))`
        );

        return JSON.parse(resultJson);
    } catch (err) {
        return { ok: false, error: `${funcName}: ${err.message || err}` };
    }
}

async function callBridgeAsync(funcName, ...args) {
    await new Promise(r => setTimeout(r, 0));
    return callBridge(funcName, ...args);
}

// Public API used by app.js
const PyBridge = {
    init: initPyodide,
    isReady: () => bridgeReady,
    getDefaultState: () => callBridge("get_default_state"),
    getDefaultModelConfig: (state) => callBridge("get_default_model_config", state || null),
    validateState: (state) => callBridge("validate_state", state),
    validateModelConfig: (model, state) => callBridge("validate_model_config", model, state),
    runSingle: (state, model, seed) => callBridgeAsync("run_single", state, model, seed),
    runMonteCarlo: (state, model, n, seed) => callBridgeAsync("run_monte_carlo", state, model, n, seed),
    aggregateRuns: (records) => callBridgeAsync("aggregate_runs", records),
    importCsv: (csvText) => callBridge("import_csv", csvText),
    generateTemplateCsv: (state, topN) => callBridge("generate_template_csv", state, topN),
    computeHeuristic: (aPower, dPower, day, coeffs) => callBridge("compute_heuristic", aPower, dPower, day, coeffs || null),
    getHeuristicDefaults: () => callBridge("get_heuristic_defaults"),
};
