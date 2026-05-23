// ============================================================
// Medical Tracking Platform — Google Apps Script Backend
// ============================================================

// Cached within a single request execution; GAS resets globals between requests.
var _ss = null;
function ss() {
  if (!_ss) _ss = SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}

var TAB = {
  MEASUREMENTS: 'Daily_Measurements',
  INVENTORY:    'Inventory',
  CONFIG:       'Config',
  TOKENS:       'Tokens'
};

var HEADERS = {
  Daily_Measurements: ['Date', 'Time', 'Weight (kg)', 'BP Systolic', 'BP Diastolic', 'Bag Weight After Drainage (kg)', 'Notes', 'Bag Type', 'Measurement Type'],
  Inventory:          ['DateTime', 'Item Name', 'Count'],
  Config:             ['Category', 'Key', 'Value', 'Description', 'isBag', 'active', 'color', 'displayName'],
  Tokens:             ['Token', 'Label', 'Status', 'Created', 'Last Used']
};

// CONFIG_DEFAULTS is defined in Config.defaults.gs (gitignored).
// Copy Config.defaults.gs.example → Config.defaults.gs and fill in your values,
// then paste both files into your Apps Script project.

// ============================================================
// Entry points
// ============================================================

function doGet(e) {
  var action = e.parameter.action;
  try {
    // Public actions — no approved token required
    if (action === 'validateToken') return jsonResponse(validateToken(e.parameter.token));
    if (action === 'registerToken') return jsonResponse(registerToken(e.parameter.token, e.parameter.label));
    if (action === 'touchToken')    return jsonResponse(touchToken(e.parameter.token));
    // Protected actions
    checkToken(e.parameter.token);
    if (action === 'getDashboard') return jsonResponse(getDashboard());
    if (action === 'getHistory')   return jsonResponse(getHistory(e.parameter.from, e.parameter.to));
    if (action === 'getConfig')    return jsonResponse(getConfig());
    return jsonResponse({ error: 'Unknown GET action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON body: ' + err.message });
  }
  var action = body.action;
  try {
    checkToken(body.token);
    if (action === 'logMeasurement')  return jsonResponse(logMeasurement(body));
    if (action === 'updateInventory') return jsonResponse(updateInventory(body));
    return jsonResponse({ error: 'Unknown POST action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ============================================================
// POST handlers
// ============================================================

function logMeasurement(data) {
  var sheet = getSheet(TAB.MEASUREMENTS);
  sheet.appendRow([
    data.date,
    data.time,
    parseFloat(data.weight)      || '',
    parseInt(data.bpSystolic)    || '',
    parseInt(data.bpDiastolic)   || '',
    parseFloat(data.bagWeight)   || '',
    data.notes                   || '',
    data.bagType                 || '',
    data.measurementType         || ''
  ]);
  return { success: true, message: 'Measurement logged.' };
}

function updateInventory(data) {
  var sheet    = getSheet(TAB.INVENTORY);
  var datetime = data.datetime || data.date || '';
  var items    = data.items || [];
  items.forEach(function(item) {
    sheet.appendRow([datetime, item.name, parseInt(item.count) || 0]);
  });
  return { success: true, message: 'Inventory updated.' };
}

// ============================================================
// GET handlers
// ============================================================

function getDashboard() {
  // --- Inventory config from Config tab ---
  var inventoryConfig = readInventoryConfig();

  // --- Latest count per item (tall Inventory format) ---
  var invSheet   = ss().getSheetByName(TAB.INVENTORY);
  var inventory  = {};
  var lowStockArr = [];
  inventoryConfig.forEach(function(item) { inventory[item.name] = 0; });

  if (invSheet && invSheet.getLastRow() > 1) {
    var lastRow   = invSheet.getLastRow();
    var readFrom  = Math.max(2, lastRow - 499); // read at most 500 rows from the tail
    var invRows   = invSheet.getRange(readFrom, 1, lastRow - readFrom + 1, 3).getValues();
    var found     = {};
    // Walk backward; first value seen per item is the most recent
    for (var r = invRows.length - 1; r >= 0; r--) {
      var name = String(invRows[r][1]);
      if (inventory.hasOwnProperty(name) && !found[name]) {
        inventory[name] = parseInt(invRows[r][2]) || 0;
        found[name] = true;
      }
    }
  }

  // Build low-stock flags
  inventoryConfig.forEach(function(item) {
    if ((inventory[item.name] || 0) < item.min) {
      lowStockArr.push(item.name + ' (' + (inventory[item.name] || 0) + ' left)');
    }
  });

  // --- Weight trend (last 7 distinct days) + last 3 BP readings ---
  var measSheet = ss().getSheetByName(TAB.MEASUREMENTS);
  var weightTrend = [];
  var bpRecent = [];
  var bpAvgSys = null, bpAvgDia = null;

  if (measSheet && measSheet.getLastRow() > 1) {
    var totalRows = measSheet.getLastRow() - 1;
    var scanRows  = Math.min(50, totalRows);
    var startRow  = measSheet.getLastRow() - scanRows + 1;
    var mData     = measSheet.getRange(startRow, 1, scanRows, 9).getValues();
    var tz = Session.getScriptTimeZone();

    // Walk backward: collect last 7 distinct-day weight entries and last 3 BP readings
    var weightByDay = {};
    var lastExchange = null;
    for (var i = mData.length - 1; i >= 0; i--) {
      var row = mData[i];
      var dateVal = row[0];
      var dateStr = dateVal instanceof Date
        ? Utilities.formatDate(dateVal, tz, 'yyyy-MM-dd')
        : String(dateVal);
      var timeVal = row[1];
      var timeStr = timeVal instanceof Date
        ? Utilities.formatDate(timeVal, tz, 'HH:mm')
        : (String(timeVal).trim() || '');

      if (row[2] !== '' && row[2] !== null && !weightByDay.hasOwnProperty(dateStr)) {
        weightByDay[dateStr] = row[2];
      }
      if (row[3] && row[4] && bpRecent.length < 3) {
        bpRecent.push({ date: dateStr, time: timeStr, systolic: parseInt(row[3]), diastolic: parseInt(row[4]) });
      }
      if (!lastExchange) {
        var mType = String(row[8]);
        if (mType === 'drain' || mType === 'fill' || mType === 'drain_fill') {
          lastExchange = { date: dateStr, time: timeStr, type: mType };
        }
      }
      if (Object.keys(weightByDay).length >= 7 && bpRecent.length >= 3 && lastExchange) break;
    }

    // Sort weight entries ascending by date, keep last 7 days
    var weightDates = Object.keys(weightByDay).sort();
    if (weightDates.length > 7) weightDates = weightDates.slice(-7);
    weightTrend = weightDates.map(function(d) { return { date: d, weight: weightByDay[d] }; });

    // bpRecent is newest-first from the scan; reverse to oldest-first for display
    bpRecent.reverse();

    if (bpRecent.length > 0) {
      var bpSysTotal = 0, bpDiaTotal = 0;
      bpRecent.forEach(function(r) { bpSysTotal += r.systolic; bpDiaTotal += r.diastolic; });
      bpAvgSys = Math.round(bpSysTotal / bpRecent.length);
      bpAvgDia = Math.round(bpDiaTotal / bpRecent.length);
    }
  }

  return {
    configVersion:   readConfigVersion(),
    inventoryConfig: inventoryConfig,
    inventory:       inventory,
    lowStockFlags:   lowStockArr.join(', '),
    weightTrend:     weightTrend,
    bpRecent:        bpRecent,
    bpAvg:           bpAvgSys !== null ? { systolic: bpAvgSys, diastolic: bpAvgDia } : null,
    lastExchange:    lastExchange
  };
}

function getHistory(from, to) {
  var sheet = getSheet(TAB.MEASUREMENTS);
  if (sheet.getLastRow() <= 1) return { rows: [] };

  var tz = Session.getScriptTimeZone();

  var fromDate = from ? new Date(from + 'T00:00:00') : new Date();
  if (!from) fromDate.setDate(fromDate.getDate() - 7);
  fromDate.setHours(0, 0, 0, 0);

  var toDate = to ? new Date(to + 'T23:59:59') : new Date();
  toDate.setHours(23, 59, 59, 999);

  var totalRows = sheet.getLastRow() - 1;
  var data      = sheet.getRange(2, 1, totalRows, 9).getValues();

  var rows = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var row     = data[i];
    var dateVal = row[0];
    var rowDate = dateVal instanceof Date ? dateVal : new Date(String(dateVal));
    if (isNaN(rowDate)) continue;
    if (rowDate < fromDate) break; // rows are chronological; stop once past window
    if (rowDate > toDate) continue;

    var timeVal = row[1];
    var timeStr = timeVal instanceof Date
      ? Utilities.formatDate(timeVal, tz, 'HH:mm')
      : (String(timeVal).trim() || '');
    var dateStr = Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd');
    rows.push({
      date:            dateStr,
      time:            timeStr,
      weight:          row[2],
      bpSystolic:      row[3],
      bpDiastolic:     row[4],
      bagWeight:       row[5],
      notes:           row[6],
      bagType:         (function(v) {
        // Sheets converts '2.27%' → 0.0227 on read; restore percentage
        if (typeof v === 'number') return (Math.round(v * 10000) / 100) + '%';
        return v ? String(v) : '';
      })(row[7]),
      measurementType: row[8]
    });
  }
  return { rows: rows };
}

function getConfig() {
  var configSheet = ss().getSheetByName(TAB.CONFIG);
  var prepItems   = {};
  var prepSteps   = {};

  if (configSheet && configSheet.getLastRow() > 1) {
    var rows = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 4).getValues();
    rows.forEach(function(row) {
      var cat  = String(row[0]);
      var key  = parseInt(row[1]) || 0;
      var text = String(row[2]);
      var desc = row[3] !== undefined && row[3] !== null ? String(row[3]) : '';
      var entry = desc.trim() ? { text: text, description: desc } : text;
      if (cat === 'prep_items') prepItems[key] = entry;
      else if (cat === 'prep_steps') prepSteps[key] = entry;
    });
  }

  var sortByNumKey = function(obj) {
    return Object.keys(obj)
      .sort(function(a, b) { return parseInt(a) - parseInt(b); })
      .map(function(k) { return obj[k]; });
  };

  return {
    version:   readConfigVersion(),
    prepItems: sortByNumKey(prepItems),
    prepSteps: sortByNumKey(prepSteps)
  };
}

function readConfigVersion() {
  var configSheet = ss().getSheetByName(TAB.CONFIG);
  if (!configSheet || configSheet.getLastRow() <= 1) return null;
  var rows = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === 'meta' && String(rows[i][1]) === 'lastUpdated') {
      var v = rows[i][2];
      if (!v) return null;
      if (v instanceof Date) {
        return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      }
      return String(v);
    }
  }
  return null;
}

// ============================================================
// Setup — safe to run multiple times
// ============================================================

function setupSheet() {
  Object.keys(HEADERS).forEach(function(tabName) {
    var sheet = ss().getSheetByName(tabName);
    if (!sheet) {
      sheet = ss().insertSheet(tabName);
    }
    var firstCell = sheet.getRange(1, 1).getValue();
    if (!firstCell || firstCell === '') {
      sheet.getRange(1, 1, 1, HEADERS[tabName].length).setValues([HEADERS[tabName]]);
      sheet.getRange(1, 1, 1, HEADERS[tabName].length).setFontWeight('bold');
    }
  });

  // Tokens sheet: add status dropdown validation on column C
  var tokSheet = ss().getSheetByName(TAB.TOKENS);
  if (tokSheet) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['pending', 'approved', 'revoked'], true)
      .setAllowInvalid(false)
      .build();
    tokSheet.getRange(2, 3, 1000, 1).setDataValidation(rule);
    // Freeze header row and set column widths for readability
    tokSheet.setFrozenRows(1);
    tokSheet.setColumnWidth(1, 280); // Token UUID
    tokSheet.setColumnWidth(2, 160); // Label
    tokSheet.setColumnWidth(3, 100); // Status
    tokSheet.setColumnWidth(4, 140); // Created
    tokSheet.setColumnWidth(5, 140); // Last Used
  }

  // Populate Config with defaults if empty
  var configSheet = ss().getSheetByName(TAB.CONFIG);
  if (configSheet && configSheet.getLastRow() <= 1) {
    // Format the displayName column (H) as plain text before writing,
    // otherwise Sheets silently converts '1.36%' to the decimal 0.0136
    configSheet.getRange(2, 8, CONFIG_DEFAULTS.length, 1).setNumberFormat('@');
    configSheet.getRange(2, 1, CONFIG_DEFAULTS.length, CONFIG_DEFAULTS[0].length).setValues(CONFIG_DEFAULTS);
  }

  SpreadsheetApp.getUi().alert('Setup complete. All tabs are ready.');
}

// ============================================================
// Token management (device auth)
// ============================================================

function validateToken(token) {
  if (!token) return { status: 'unknown' };
  var sheet = ss().getSheetByName(TAB.TOKENS);
  if (!sheet || sheet.getLastRow() <= 1) return { status: 'unknown' };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(token)) {
      return { status: String(rows[i][2]).toLowerCase() };
    }
  }
  return { status: 'unknown' };
}

function registerToken(token, label) {
  if (!token) throw new Error('No token provided');
  if (String(token).length > 100) throw new Error('Invalid token');
  var sheet = ss().getSheetByName(TAB.TOKENS);
  if (!sheet) throw new Error('Tokens sheet not found. Run setupSheet() first.');
  // Idempotent — ignore duplicate registrations
  if (sheet.getLastRow() > 1) {
    var existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][0]) === String(token)) return { success: true, message: 'Already registered' };
    }
  }
  var tz  = Session.getScriptTimeZone();
  var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  sheet.appendRow([token, label || 'Unnamed device', 'pending', now, '']);
  return { success: true };
}

function touchToken(token) {
  if (!token) return { success: false };
  var sheet = ss().getSheetByName(TAB.TOKENS);
  if (!sheet || sheet.getLastRow() <= 1) return { success: false };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var tz  = Session.getScriptTimeZone();
  var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(token)) {
      sheet.getRange(i + 2, 5).setValue(now);
      return { success: true };
    }
  }
  return { success: false };
}

// ============================================================
// Helpers
// ============================================================

function readInventoryConfig() {
  var configSheet = ss().getSheetByName(TAB.CONFIG);
  var result = [];
  if (configSheet && configSheet.getLastRow() > 1) {
    var rows = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 8).getValues();
    rows.forEach(function(row) {
      if (String(row[0]) === 'inventory') {
        var active = row[5] === '' || row[5] === true || String(row[5]).toUpperCase() === 'TRUE';
        if (!active) return;
        result.push({
          name:        String(row[1]),
          min:         parseInt(row[2]) || 0,
          description: row[3] ? String(row[3]) : '',
          isBag:       row[4] === true || String(row[4]).toUpperCase() === 'TRUE',
          color:       row[6] ? String(row[6]) : '',
          displayName: (function(v) {
            // Sheets converts '1.36%' → 0.0136; restore percentage
            if (typeof v === 'number') return (Math.round(v * 10000) / 100) + '%';
            return v ? String(v) : '';
          })(row[7])
        });
      }
    });
  }
  return result;
}

// Validates that the supplied token exists in the Tokens sheet with status "approved".
function checkToken(supplied) {
  var result = validateToken(supplied);
  if (result.status !== 'approved') throw new Error('Unauthorized');
}

function getSheet(name) {
  var sheet = ss().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name + '. Run setupSheet() first.');
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
