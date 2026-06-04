// ============================================================================
// HEXATLAS MCP AUTH STUB (Local-only)
// Replaces auth.js â€” always authenticated, always pro, zero external deps
// No API key required. MCP server gated behind MCP_USE_API flag in mcp-storage.js.
// ============================================================================

/* eslint-disable no-unused-vars */

// Supabase stubs (game.js reads these globals early)
var SUPABASE_URL = '';
var SUPABASE_ANON_KEY = '';
var supabaseClient = null;

// Mock user â€” always signed in
var currentUser = {
  id: 'local-lore-builder',
  email: 'builder@holmgard.local',
  user_metadata: { name: 'Lore Builder' }
};

// Required by game.js
window.isAuthenticated = function () { return true; };
window.isPro = function () { return true; };
window.initAuth = function () { return Promise.resolve(currentUser); };
window.signOut = function () {};

// Required by cloud-storage.js / mcp-storage.js
window.currentUser = currentUser;

// Patreon stubs
var PATREON_CLIENT_ID = '';
var PATREON_REDIRECT_URI = '';

// MCP API key (only used when MCP_USE_API = true in mcp-storage.js)
window.MCP_API_KEY = '';

console.log('[MCP Auth] Local mode â€” all features unlocked.');