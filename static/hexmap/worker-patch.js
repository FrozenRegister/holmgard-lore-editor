// ============================================================================
// WORKER PATH PATCH
// Patches the Worker constructor to resolve relative worker paths to absolute paths
// This runs before game.js loads to ensure workers are created with correct paths
// ============================================================================

(function() {
  'use strict';

  // Store original Worker constructor
  const OriginalWorker = window.Worker;

  // Override Worker constructor to fix relative paths
  window.Worker = function(scriptURL, options) {
    // If scriptURL is a relative path (doesn't start with '/' or 'http'), make it absolute
    let resolvedURL = scriptURL;

    if (typeof scriptURL === 'string' && !scriptURL.startsWith('/') && !scriptURL.startsWith('http')) {
      // Relative path detected - prepend /hexmap/
      resolvedURL = '/hexmap/' + scriptURL;
      console.log('[Worker Patch] Resolved worker path from "' + scriptURL + '" to "' + resolvedURL + '"');
    }

    // Call original Worker with resolved path and set prototype on instance
    const worker = new OriginalWorker(resolvedURL, options);
    Object.setPrototypeOf(worker, OriginalWorker.prototype);
    return worker;
  };

  // Forward constructor's static properties
  Object.setPrototypeOf(window.Worker, OriginalWorker);

  console.log('[Worker Patch] Initialized - will redirect relative worker paths to /hexmap/');
})();
