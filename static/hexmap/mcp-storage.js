

// ============================================================================
// HEXATLAS MCP STORAGE ADAPTER (Local-first, no API key required)
// Replaces cloud-storage.js
// ============================================================================

/* eslint-disable no-unused-vars */

// ---- LOCAL-ONLY CONFIGURATION ------------------------------------------------

var MCP_USE_API = false;                            // false = local-first

var MCP_STORAGE_CONFIG = {
  apiBase: 'https://holmgard-lore-mcp.frozenregister.workers.dev/mcp',       // only used when MCP_USE_API = true
  enabled: true,
  autoSaveDebounceMs: 4000,
  localPrefix: 'mcp_map_',
};

// ---- HEADER HELPER ----------------------------------------------------------

function makeHeaders() {
  if (!MCP_USE_API) {
    return { 'Content-Type': 'application/json' };
  }
  return {
    'Content-Type': 'application/json',
    'X-API-Key': window.MCP_API_KEY || ''
  };
}

// ---- LOCAL STORAGE HELPERS --------------------------------------------------

function localSave(mapId, state) {
  var key = MCP_STORAGE_CONFIG.localPrefix + (mapId || 'local_' + Date.now().toString(36));
  localStorage.setItem(key, JSON.stringify({
    mapId: mapId || '',
    state: state,
    savedAt: Date.now()
  }));
  return { mapId: mapId, saved: true, source: 'local' };
}

function localLoad(mapId) {
  var key = MCP_STORAGE_CONFIG.localPrefix + mapId;
  var raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw).state;
  } catch (_) {
    return null;
  }
}

function listLocalMaps() {
  var maps = [];
  var prefix = MCP_STORAGE_CONFIG.localPrefix;
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.indexOf(prefix) === 0) {
      try {
        var entry = JSON.parse(localStorage.getItem(key) || '{}');
        maps.push({
          id: entry.mapId || key.slice(prefix.length),
          mapId: entry.mapId || key.slice(prefix.length),
          name: (entry.state && entry.state.name) || 'Untitled',
          savedAt: entry.savedAt || 0,
        });
      } catch (_) { /* skip broken entries */ }
    }
  }
  return maps;
}

// ---- THUMBNAIL --------------------------------------------------------------

function captureThumbnail() {
  try {
    var canvas = document.getElementById('hexCanvas');
    if (!canvas) return null;
    var off = document.createElement('canvas');
    off.width = 320;
    off.height = 200;
    var ctx = off.getContext('2d');
    if (ctx) ctx.drawImage(canvas, 0, 0, 320, 200);
    return off.toDataURL('image/jpeg', 0.7);
  } catch (_) {
    return null;
  }
}

// ---- PUBLIC API (game.js calls these via window.*) ---------------------------

window.cloudSave = function (name, mapId, options) {
  options = options || {};
  var state = window.serializeCurrentMapState();

  if (!MCP_USE_API) {
    return Promise.resolve(localSave(mapId, state));
  }

  return captureThumbnail()
    .then(function (thumb) {
      return fetch(MCP_STORAGE_CONFIG.apiBase + '/save', {
        method: 'POST',
        headers: makeHeaders(),
        body: JSON.stringify({
          name: name || (state && state.name) || 'Untitled Map',
          mapId: mapId || undefined,
          state: state,
          thumbnail: thumb,
          timestamp: new Date().toISOString()
        })
      });
    })
    .then(function (resp) {
      if (!resp.ok) throw new Error('Save failed: ' + resp.status);
      return resp.json();
    })
    .catch(function (err) {
      console.error('[MCP Storage] Save error:', err);
      return localSave(mapId, state);
    });
};

window.cloudLoad = function (mapId, options) {
  if (!MCP_USE_API) {
    var local = localLoad(mapId);
    return Promise.resolve(local ? { state: local, mapId: mapId } : { error: 'Not found' });
  }

  return fetch(MCP_STORAGE_CONFIG.apiBase + '/load/' + encodeURIComponent(mapId), {
    headers: makeHeaders()
  })
    .then(function (resp) {
      if (!resp.ok) throw new Error('Load failed: ' + resp.status);
      return resp.json();
    })
    .catch(function (err) {
      console.error('[MCP Storage] Load error:', err);
      var local = localLoad(mapId);
      if (local) return { state: local, mapId: mapId };
      return { error: err.message };
    });
};

window.cloudGetMapMetadata = function (mapId) {
  if (!MCP_USE_API) return Promise.resolve(null);

  return fetch(MCP_STORAGE_CONFIG.apiBase + '/meta/' + encodeURIComponent(mapId), {
    headers: makeHeaders()
  })
    .then(function (resp) { return resp.ok ? resp.json() : null; })
    .catch(function () { return null; });
};

window.cloudListMaps = function () {
  if (!MCP_USE_API) return Promise.resolve(listLocalMaps());

  return fetch(MCP_STORAGE_CONFIG.apiBase + '/list', { headers: makeHeaders() })
    .then(function (resp) { return resp.ok ? resp.json() : []; })
    .catch(function () { return []; });
};

window.deleteCloudMap = function (mapId) {
  if (!MCP_USE_API) {
    localStorage.removeItem(MCP_STORAGE_CONFIG.localPrefix + mapId);
    return Promise.resolve(true);
  }

  return fetch(MCP_STORAGE_CONFIG.apiBase + '/delete/' + encodeURIComponent(mapId), {
    method: 'DELETE',
    headers: makeHeaders()
  })
    .then(function (resp) { return resp.ok; })
    .catch(function () { return false; });
};

window.loadSharedMapFromCloudMapId = function (mapId) {
  return window.cloudLoad(mapId);
};

window.createCloudShareUrl = function (mapId) {
  if (!MCP_USE_API) return Promise.resolve(null);

  return fetch(MCP_STORAGE_CONFIG.apiBase + '/share/' + encodeURIComponent(mapId), {
    method: 'POST',
    headers: makeHeaders()
  })
    .then(function (resp) {
      if (!resp.ok) throw new Error('Share failed');
      return resp.json();
    })
    .then(function (data) { return data.shareUrl; })
    .catch(function () { return null; });
};

window.openMapLinkPicker = function (options) {
  return window.cloudListMaps().then(function (maps) {
    return showPicker(maps).then(function (selected) {
      if (selected && options && options.onSelect) options.onSelect(selected);
      return selected;
    });
  });
};

window.openLinkedCloudMap = function (mapId) {
  return window.cloudLoad(mapId).then(function (data) {
    if (data && data.state && window.loadMapDataIntoState) {
      window.loadMapDataIntoState(data.state);
    }
  });
};

// ---- MAP PICKER ------------------------------------------------------------

function showPicker(maps) {
  return new Promise(function (resolve) {
    var old = document.getElementById('mcpMapPickerModal');
    if (old) old.remove();

    var html = '<div id="mcpMapPickerModal"><div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;"><div style="background:#1e2530;border-radius:12px;padding:24px;max-width:480px;width:90%;max-height:80vh;overflow-y:auto;"><h3 style="margin:0 0 16px;color:#f0f4f8;">Open Map</h3><div style="display:flex;flex-direction:column;gap:8px;">';

    if (maps.length === 0) {
      html += '<p style="color:#718096;">No maps saved yet.</p>';
    } else {
      maps.forEach(function (m) {
        var id = m.mapId || m.id || '';
        var name = m.name || 'Untitled';
        html += '<button class="mcp-map-picker-item" data-map-id="' + id + '" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#141a23;border:1px solid #2d3748;border-radius:8px;cursor:pointer;color:#f0f4f8;text-align:left;width:100%;">' +
          '<div style="width:60px;height:38px;border-radius:4px;background:#1e2530;"></div>' +
          '<div><div style="font-weight:600;">' + escHtml(name) + '</div>' +
          '<div style="font-size:12px;color:#718096;">' + (m.savedAt ? new Date(m.savedAt).toLocaleDateString() : '') + '</div></div>' +
          '</button>';
      });
    }

    html += '</div><div style="margin-top:16px;display:flex;justify-content:flex-end;"><button id="mcpMapPickerCancel" style="padding:8px 16px;background:transparent;border:1px solid #2d3748;border-radius:6px;cursor:pointer;color:#a0aec0;">Cancel</button></div></div></div></div>';

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstElementChild);

    var modal = document.getElementById('mcpMapPickerModal');

    modal.querySelectorAll('.mcp-map-picker-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-map-id');
        modal.remove();
        resolve(maps.find(function (m) { return (m.mapId || m.id) === id; }) || null);
      });
    });

    modal.querySelector('#mcpMapPickerCancel').addEventListener('click', function () {
      modal.remove();
      resolve(null);
    });

    modal.querySelector('div').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) {
        modal.remove();
        resolve(null);
      }
    });
  });
}

function escHtml(s) {
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function createAppModalOverlay({ id = '', show = true, className = '', onBackdropClose = null } = {}) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay' + (show ? ' show' : '') + (className ? ' ' + className : '');
  if (id) overlay.id = id;
  if (typeof onBackdropClose === 'function') {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) onBackdropClose();
    });
  }
  return overlay;
}

function buildAppModalMarkup({
  panelClass = '',
  panelStyle = '',
  title = '',
  iconSvg = '',
  closeAction = '',
  closeButtonId = '',
  introHtml = '',
  introClass = '',
  bodyHtml = '',
  bodyId = '',
  bodyClass = '',
  bodyStyle = '',
  afterBodyHtml = '',
  afterBodyClass = '',
  footerHtml = '',
  footerClass = '',
  footerStyle = ''
} = {}) {
  var panelClasses = ['modal', panelClass].filter(Boolean).join(' ');
  var bodyClasses = ['modal-body', bodyClass].filter(Boolean).join(' ');
  var footerClasses = ['modal-footer', footerClass].filter(Boolean).join(' ');
  var closeButtonAttrs = [
    'class="modal-close"',
    closeButtonId ? 'id="' + closeButtonId + '"' : '',
    closeAction ? 'onclick="' + closeAction + '"' : ''
  ].filter(Boolean).join(' ');
  var closeButtonHtml = '\n    <button ' + closeButtonAttrs + '>\n      <svg class="icon" viewBox="0 0 24 24" fill="currentColor">\n        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>\n      </svg>\n    </button>\n  ';

  return '\n    <div class="' + panelClasses + '"' + (panelStyle ? ' style="' + panelStyle + '"' : '') + '>\n      <div class="modal-header">\n        <div class="modal-title">\n          ' + (iconSvg ? '<span class="app-modal-title-icon">' + iconSvg + '</span>' : '') + '\n          ' + title + '\n        </div>\n        ' + closeButtonHtml + '\n      </div>\n      ' + (introHtml ? '<div class="app-modal-intro' + (introClass ? ' ' + introClass : '') + '">' + introHtml + '</div>' : '') + '\n      <div class="' + bodyClasses + '"' + (bodyId ? ' id="' + bodyId + '"' : '') + (bodyStyle ? ' style="' + bodyStyle + '"' : '') + '>\n        ' + bodyHtml + '\n      </div>\n      ' + (afterBodyHtml ? '<div class="app-modal-after-body' + (afterBodyClass ? ' ' + afterBodyClass : '') + '">' + afterBodyHtml + '</div>' : '') + '\n      ' + (footerHtml ? '<div class="' + footerClasses + '"' + (footerStyle ? ' style="' + footerStyle + '"' : '') + '>' + footerHtml + '</div>' : '') + '\n    </div>\n  ';
}

console.log('[MCP Storage] LOCAL MODE. Set MCP_USE_API = true for server-backed sync.');