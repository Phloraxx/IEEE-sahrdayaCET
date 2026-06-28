// Test hook — verifies pb_hooks directory is mounted and working.
// Remove this file once confirmed.
// Expected: curl https://db.phloraxx.us.to/api/health/hooks → {"status":"ok","message":"pb_hooks are working"}

routerAdd("GET", "/api/health/hooks", () => {
    return { status: "ok", message: "pb_hooks are working" };
});
