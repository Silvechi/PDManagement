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
  TOKENS:       'Tokens',
  PATIENTS:     'Patients',
  RECIPIENTS:   'Recipients'
};

var HEADERS = {
  Daily_Measurements: ['Date', 'Time', 'Weight (kg)', 'BP Systolic', 'BP Diastolic', 'Bag Weight After Drainage (kg)', 'Notes', 'Bag Type', 'Measurement Type', 'PatientID', 'Fill Volume (L)', 'DeviceToken'],
  Inventory:          ['DateTime', 'Item Name', 'Count', 'PatientID', 'DeviceToken'],
  Config:             ['Category', 'Key', 'Value', 'Description', 'isBag', 'active', 'color', 'displayName', 'maxHours', 'reorderDays', 'displayNameHe', 'valueHe', 'descriptionHe'],
  Tokens:             ['Token', 'Label', 'Status', 'Created', 'Last Used', 'PasswordHash', 'ActivePatientID', 'Theme', 'Language', 'TextSize'],
  Patients:           ['PatientID', 'Name', 'DOB', 'Comment', 'Active', 'LastUpdated'],
  Recipients:         ['Name', 'Email', 'Active']
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
    if (action === 'touchToken')    return jsonResponse(touchToken(e.parameter.token));
    // Protected actions — readonly tokens allowed on GET
    checkToken(e.parameter.token, true);
    if (action === 'getDashboard')   return jsonResponse(getDashboard(e.parameter.patientId));
    if (action === 'getHistory')     return jsonResponse(getHistory(e.parameter.patientId, e.parameter.from, e.parameter.to));
    if (action === 'getConfig')      return jsonResponse(getConfig());
    if (action === 'getPatients')    return jsonResponse(getPatients());
    if (action === 'getDataVersion') return jsonResponse(getDataVersion());
    if (action === 'getRecipients')  return jsonResponse(getRecipients());
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
    // Public actions — no approved token required
    if (action === 'loginOrRegister') return jsonResponse(loginOrRegister(body.label, body.passwordHash, body.token));
    // Protected actions — readonly tokens not allowed on POST (writes)
    checkToken(body.token);
    if (action === 'logMeasurement')   return jsonResponse(logMeasurement(body));
    if (action === 'updateInventory')  return jsonResponse(updateInventory(body));
    if (action === 'addPatient')       return jsonResponse(addPatient(body));
    if (action === 'editPatient')      return jsonResponse(editPatient(body));
    if (action === 'savePreferences')  return jsonResponse(savePreferences(body));
    if (action === 'sendHistoryEmail') return jsonResponse(sendHistoryEmail(body));
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
    data.measurementType         || '',
    data.patientId               || '',
    parseFloat(data.fillVolume)  || '',
    data.token                   || ''
  ]);
  _touchDataLastUpdated();
  return { success: true, message: 'Measurement logged.' };
}

function updateInventory(data) {
  var sheet    = getSheet(TAB.INVENTORY);
  var datetime = data.datetime || data.date || '';
  var items    = data.items || [];
  items.forEach(function(item) {
    sheet.appendRow([datetime, item.name, parseInt(item.count) || 0, data.patientId || '', data.token || '']);
  });
  _touchDataLastUpdated();
  return { success: true, message: 'Inventory updated.' };
}

function getDataVersion() {
  return { version: _readDataLastUpdated() };
}

function _readDataLastUpdated() {
  var configSheet = ss().getSheetByName(TAB.CONFIG);
  if (!configSheet || configSheet.getLastRow() <= 1) return null;
  var rows = configSheet.getRange(2, 2, configSheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === 'dataLastUpdated') {
      var v = rows[i][1];
      if (!v) return null;
      if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      return String(v);
    }
  }
  return null;
}

function _touchDataLastUpdated() {
  var configSheet = ss().getSheetByName(TAB.CONFIG);
  if (!configSheet) return;
  var tz  = Session.getScriptTimeZone();
  var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
  // Search existing rows for the key
  if (configSheet.getLastRow() > 1) {
    var keys = configSheet.getRange(2, 2, configSheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === 'dataLastUpdated') {
        configSheet.getRange(i + 2, 3).setValue(now);
        return;
      }
    }
  }
  // Key row missing — create it so future reads and bumps work correctly.
  // (Happens when setupSheet() was never run or the row was manually deleted.)
  configSheet.appendRow(['', 'dataLastUpdated', now]);
}

// ============================================================
// GET handlers
// ============================================================

function getDashboard(patientId) {
  if (!patientId) return { error: 'patientId required' };

  // --- Inventory config from Config tab ---
  var inventoryConfig = readInventoryConfig();

  // --- Latest count per item filtered by patient ---
  var invSheet    = ss().getSheetByName(TAB.INVENTORY);
  var inventory   = {};
  var lowStockArr = [];
  inventoryConfig.forEach(function(item) { inventory[item.name] = 0; });

  if (invSheet && invSheet.getLastRow() > 1) {
    var lastRow  = invSheet.getLastRow();
    var readFrom = Math.max(2, lastRow - 499);
    var invRows  = invSheet.getRange(readFrom, 1, lastRow - readFrom + 1, 4).getValues();
    var found    = {};
    for (var r = invRows.length - 1; r >= 0; r--) {
      var name = String(invRows[r][1]);
      if (inventory.hasOwnProperty(name) && !found[name] && String(invRows[r][3]) === String(patientId)) {
        inventory[name] = parseInt(invRows[r][2]) || 0;
        found[name] = true;
      }
    }
  }

  inventoryConfig.forEach(function(item) {
    if ((inventory[item.name] || 0) < item.min) {
      lowStockArr.push(item.name + ' (' + (inventory[item.name] || 0) + ' left)');
    }
  });

  // --- Weight trend + BP readings filtered by patient ---
  var measSheet = ss().getSheetByName(TAB.MEASUREMENTS);
  var weightTrend = [];
  var bpRecent    = [];
  var bpAvgSys    = null, bpAvgDia = null;
  var lastExchange = null;

  if (measSheet && measSheet.getLastRow() > 1) {
    var totalRows    = measSheet.getLastRow() - 1;
    var patientCount = Math.max(1, (ss().getSheetByName(TAB.PATIENTS) || { getLastRow: function() { return 1; } }).getLastRow() - 1);
    var scanRows     = Math.min(Math.max(50, patientCount * 50), 500);
    scanRows = Math.min(scanRows, totalRows);
    var startRow = measSheet.getLastRow() - scanRows + 1;
    var mData    = measSheet.getRange(startRow, 1, scanRows, 11).getValues();
    var tz       = Session.getScriptTimeZone();

    var weightByDay = {};
    for (var i = mData.length - 1; i >= 0; i--) {
      var row = mData[i];
      if (String(row[9]) !== String(patientId)) continue;

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

    var weightDates = Object.keys(weightByDay).sort();
    if (weightDates.length > 7) weightDates = weightDates.slice(-7);
    weightTrend = weightDates.map(function(d) { return { date: d, weight: weightByDay[d] }; });

    bpRecent.reverse();

    if (bpRecent.length > 0) {
      var bpSysTotal = 0, bpDiaTotal = 0;
      bpRecent.forEach(function(r) { bpSysTotal += r.systolic; bpDiaTotal += r.diastolic; });
      bpAvgSys = Math.round(bpSysTotal / bpRecent.length);
      bpAvgDia = Math.round(bpDiaTotal / bpRecent.length);
    }
  }

  return {
    dataVersion:     _readDataLastUpdated(),
    inventoryConfig: inventoryConfig,
    inventory:       inventory,
    lowStockFlags:   lowStockArr.join(', '),
    weightTrend:     weightTrend,
    bpRecent:        bpRecent,
    bpAvg:           bpAvgSys !== null ? { systolic: bpAvgSys, diastolic: bpAvgDia } : null,
    lastExchange:    lastExchange
  };
}

function getHistory(patientId, from, to) {
  if (!patientId) return { rows: [] };
  var sheet = getSheet(TAB.MEASUREMENTS);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { rows: [] };

  var tz       = Session.getScriptTimeZone();
  var fromDate = from ? new Date(from + 'T00:00:00') : new Date();
  if (!from) fromDate.setDate(fromDate.getDate() - 7);
  fromDate.setHours(0, 0, 0, 0);
  var toDate = to ? new Date(to + 'T23:59:59') : new Date();
  toDate.setHours(23, 59, 59, 999);

  var patientCount = Math.max(1, (ss().getSheetByName(TAB.PATIENTS) || { getLastRow: function() { return 1; } }).getLastRow() - 1);
  var tailRows = Math.max(1000, patientCount * 1000);
  var readFrom = Math.max(2, lastRow - tailRows + 1);
  var data     = sheet.getRange(readFrom, 1, lastRow - readFrom + 1, 11).getValues();

  var rows = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var row     = data[i];
    var dateVal = row[0];
    var rowDate = dateVal instanceof Date ? dateVal : new Date(String(dateVal));
    if (isNaN(rowDate)) continue;
    if (rowDate < fromDate) break; // chronological — all earlier rows also out of range
    if (rowDate > toDate) continue;
    if (String(row[9]) !== String(patientId)) continue;

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
        if (typeof v === 'number') return (Math.round(v * 10000) / 100) + '%';
        return v ? String(v) : '';
      })(row[7]),
      measurementType: row[8],
      fillVolume:      row[10] !== '' ? row[10] : ''
    });
  }
  return { version: _readDataLastUpdated(), rows: rows };
}

function getConfig() {
  var configSheet = ss().getSheetByName(TAB.CONFIG);
  var prepItems   = {};
  var prepSteps   = {};

  if (configSheet && configSheet.getLastRow() > 1) {
    var rows = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 13).getValues();
    rows.forEach(function(row) {
      var cat  = String(row[0]);
      var key  = parseInt(row[1]) || 0;
      var entry = {
        text:          String(row[2]  || ''),
        description:   String(row[3]  || ''),
        textHe:        String(row[11] || ''),
        descriptionHe: String(row[12] || '')
      };
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
      .requireValueInList(['pending', 'approved', 'revoked', 'readonly'], true)
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
    tokSheet.setColumnWidth(6, 220); // PasswordHash
    tokSheet.setColumnWidth(7, 220); // ActivePatientID
    tokSheet.setColumnWidth(8, 80);  // Theme
    tokSheet.setColumnWidth(9, 80);  // Language
  }

  // Recipients sheet: freeze header, column widths, Active dropdown
  var recipientsSheet = ss().getSheetByName(TAB.RECIPIENTS);
  if (recipientsSheet) {
    recipientsSheet.setFrozenRows(1);
    recipientsSheet.setColumnWidth(1, 180); // Name
    recipientsSheet.setColumnWidth(2, 240); // Email
    recipientsSheet.setColumnWidth(3, 70);  // Active
    var recipActiveRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['TRUE', 'FALSE'], true)
      .setAllowInvalid(false)
      .build();
    recipientsSheet.getRange(2, 3, 1000, 1).setDataValidation(recipActiveRule);
  }

  // Patients sheet: freeze header, column widths, Active dropdown
  var patientsSheet = ss().getSheetByName(TAB.PATIENTS);
  if (patientsSheet) {
    patientsSheet.setFrozenRows(1);
    patientsSheet.setColumnWidth(1, 220); // PatientID
    patientsSheet.setColumnWidth(2, 160); // Name
    patientsSheet.setColumnWidth(3, 100); // DOB
    patientsSheet.setColumnWidth(4, 200); // Comment
    patientsSheet.setColumnWidth(5, 60);  // Active
    patientsSheet.setColumnWidth(6, 140); // LastUpdated
    var activeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['TRUE', 'FALSE'], true)
      .setAllowInvalid(false)
      .build();
    patientsSheet.getRange(2, 5, 1000, 1).setDataValidation(activeRule);
  }

  // Populate Config with defaults if empty
  var configSheet = ss().getSheetByName(TAB.CONFIG);
  if (configSheet && configSheet.getLastRow() <= 1) {
    // Format the displayName column (H) as plain text before writing,
    // otherwise Sheets silently converts '1.36%' to the decimal 0.0136
    configSheet.getRange(2, 8, CONFIG_DEFAULTS.length, 1).setNumberFormat('@');
    configSheet.getRange(2, 1, CONFIG_DEFAULTS.length, CONFIG_DEFAULTS[0].length).setValues(CONFIG_DEFAULTS);
  }

  // Seed Config meta rows if they don't already exist
  var metaKeys     = ['dataLastUpdated', 'maxExchangeHours', 'exportEmail'];
  var metaDefaults = { dataLastUpdated: '', maxExchangeHours: '6', exportEmail: '' };
  if (configSheet) {
    var existingKeys = configSheet.getLastRow() > 1
      ? configSheet.getRange(2, 2, configSheet.getLastRow() - 1, 1).getValues().map(function(r) { return r[0]; })
      : [];
    metaKeys.forEach(function(key) {
      if (existingKeys.indexOf(key) === -1) {
        configSheet.appendRow(['meta', key, metaDefaults[key], '', '', '', '', '', '', '', '', '', '']);
      }
    });
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
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(token)) {
      var status = String(rows[i][2]).toLowerCase();
      return {
        status:          status,
        readonly:        status === 'readonly',
        theme:           rows[i][7] ? String(rows[i][7]) : '',
        language:        rows[i][8] ? String(rows[i][8]) : '',
        textSize:        rows[i][9] ? String(rows[i][9]) : '',
        activePatientId: rows[i][6] ? String(rows[i][6]) : ''
      };
    }
  }
  return { status: 'unknown' };
}

function loginOrRegister(label, passwordHash, newUUID) {
  if (!label)        throw new Error('Label is required');
  if (!passwordHash) throw new Error('Password is required');
  if (!newUUID)      throw new Error('No token provided');
  if (String(newUUID).length > 100) throw new Error('Invalid token');

  var sheet = ss().getSheetByName(TAB.TOKENS);
  if (!sheet) throw new Error('Tokens sheet not found. Run setupSheet() first.');

  var tz  = Session.getScriptTimeZone();
  var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');

  if (sheet.getLastRow() > 1) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][1]) === String(label) && String(rows[i][5]) === String(passwordHash)) {
        var status = String(rows[i][2]).toLowerCase();
        if (status === 'approved') {
          sheet.getRange(i + 2, 5).setValue(now);
          return {
            restored:        true,
            token:           String(rows[i][0]),
            status:          'approved',
            readonly:        false,
            theme:           rows[i][7] ? String(rows[i][7]) : '',
            language:        rows[i][8] ? String(rows[i][8]) : '',
            textSize:        rows[i][9] ? String(rows[i][9]) : '',
            activePatientId: rows[i][6] ? String(rows[i][6]) : ''
          };
        }
        if (status === 'revoked') {
          return { restored: false, status: 'revoked' };
        }
        // pending — return existing token so the user can poll for approval
        return { restored: false, status: 'pending', token: String(rows[i][0]) };
      }
    }
  }

  // No label+password match — register as new pending device
  sheet.appendRow([newUUID, label, 'pending', now, '', passwordHash, '', '', '']);
  return { restored: false, status: 'pending', token: newUUID };
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

function savePreferences(data) {
  if (!data.token) return { success: false };
  var sheet = ss().getSheetByName(TAB.TOKENS);
  if (!sheet || sheet.getLastRow() <= 1) return { success: false };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.token)) {
      var r = i + 2;
      if (data.theme    !== undefined) sheet.getRange(r, 8).setValue(data.theme);
      if (data.language !== undefined) sheet.getRange(r, 9).setValue(data.language);
      if (data.textSize !== undefined) sheet.getRange(r, 10).setValue(data.textSize);
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
  var globalMaxHours = null;
  if (configSheet && configSheet.getLastRow() > 1) {
    var rows = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 11).getValues();
    rows.forEach(function(row) {
      if (String(row[0]) === 'meta' && String(row[1]) === 'maxExchangeHours') {
        var v = row[2];
        if (v !== '' && v !== null) globalMaxHours = parseFloat(v) || null;
      }
    });
    rows.forEach(function(row) {
      if (String(row[0]) === 'inventory') {
        var active = row[5] === '' || row[5] === true || String(row[5]).toUpperCase() === 'TRUE';
        if (!active) return;
        var itemMaxHours = row[8] !== '' && row[8] !== null ? parseFloat(row[8]) : null;
        result.push({
          name:        String(row[1]),
          min:         parseInt(row[2]) || 0,
          description: row[3] ? String(row[3]) : '',
          isBag:       row[4] === true || String(row[4]).toUpperCase() === 'TRUE',
          color:       row[6] ? String(row[6]) : '',
          displayName: (function(v) {
            if (typeof v === 'number') return (Math.round(v * 10000) / 100) + '%';
            return v ? String(v) : '';
          })(row[7]),
          maxHours:       itemMaxHours !== null ? itemMaxHours : globalMaxHours,
          reorderDays:    row[9]  !== '' && row[9]  !== null ? parseInt(row[9]) : null,
          displayNameHe:  row[10] ? String(row[10]) : ''
        });
      }
    });
  }
  return result;
}

// ============================================================
// Patient management
// ============================================================

function getPatients() {
  var sheet = ss().getSheetByName(TAB.PATIENTS);
  if (!sheet || sheet.getLastRow() <= 1) return { version: null, patients: [] };
  var rows     = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  var tz       = Session.getScriptTimeZone();
  var latestUpdated = null;
  var patients = rows.map(function(row) {
    var lu = row[5] instanceof Date
      ? Utilities.formatDate(row[5], tz, 'yyyy-MM-dd HH:mm')
      : String(row[5] || '');
    if (lu && (!latestUpdated || lu > latestUpdated)) latestUpdated = lu;
    var dob = row[2] instanceof Date
      ? Utilities.formatDate(row[2], tz, 'yyyy-MM-dd')
      : String(row[2] || '');
    return {
      patientId:   String(row[0]),
      name:        String(row[1]),
      dob:         dob,
      comment:     String(row[3] || ''),
      active:      row[4] === true || String(row[4]).toUpperCase() === 'TRUE',
      lastUpdated: lu
    };
  });
  return { version: latestUpdated, patients: patients };
}

function addPatient(data) {
  if (!data.name) throw new Error('Name is required');
  var sheet = ss().getSheetByName(TAB.PATIENTS);
  if (!sheet) throw new Error('Patients sheet not found. Run setupSheet() first.');
  var tz        = Session.getScriptTimeZone();
  var now       = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  var patientId = Utilities.getUuid();
  sheet.appendRow([patientId, data.name, data.dob || '', data.comment || '', 'TRUE', now]);
  return { success: true, patientId: patientId };
}

function editPatient(data) {
  if (!data.patientId) throw new Error('patientId required');
  var sheet = ss().getSheetByName(TAB.PATIENTS);
  if (!sheet || sheet.getLastRow() <= 1) throw new Error('Patient not found');
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.patientId)) {
      var tz  = Session.getScriptTimeZone();
      var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
      var r   = i + 2;
      if (data.name    !== undefined) sheet.getRange(r, 2).setValue(data.name);
      if (data.dob     !== undefined) sheet.getRange(r, 3).setValue(data.dob);
      if (data.comment !== undefined) sheet.getRange(r, 4).setValue(data.comment);
      if (data.active  !== undefined) sheet.getRange(r, 5).setValue(data.active ? 'TRUE' : 'FALSE');
      sheet.getRange(r, 6).setValue(now);
      return { success: true };
    }
  }
  throw new Error('Patient not found: ' + data.patientId);
}

function _getPatientName(patientId) {
  var sheet = ss().getSheetByName(TAB.PATIENTS);
  if (!sheet || sheet.getLastRow() <= 1) return '';
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(patientId)) return String(rows[i][1]);
  }
  return '';
}

// allowReadonly: true on GET endpoints; false (default) on write endpoints.
function checkToken(supplied, allowReadonly) {
  var result = validateToken(supplied);
  if (result.status === 'approved') return;
  if (allowReadonly && result.status === 'readonly') return;
  throw new Error('Unauthorized');
}

function getSheet(name) {
  var sheet = ss().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name + '. Run setupSheet() first.');
  return sheet;
}

// ============================================================
// Email / Recipients
// ============================================================

function getRecipients() {
  var sheet = ss().getSheetByName(TAB.RECIPIENTS);
  if (!sheet || sheet.getLastRow() <= 1) return { recipients: [] };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  var out  = [];
  rows.forEach(function(r) {
    if (String(r[2]).toUpperCase() === 'TRUE' && r[1]) {
      out.push({ name: String(r[0]), email: String(r[1]) });
    }
  });
  return { recipients: out };
}

function sendHistoryEmail(data) {
  if (!data.patientId) return { error: 'patientId required' };
  if (!data.from || !data.to) return { error: 'Date range required' };

  // 1. Validate recipients against server-side whitelist — client cannot send to arbitrary addresses
  var allowedRecs = getRecipients().recipients;
  var allowedMap  = {};
  allowedRecs.forEach(function(r) { allowedMap[r.email] = r.name; });
  var targets = (Array.isArray(data.recipients) ? data.recipients : [])
    .filter(function(e) { return typeof e === 'string' && allowedMap.hasOwnProperty(e); });
  if (!targets.length) return { error: 'No valid recipients selected' };

  // 2. Fetch all rows for date range (all measurement types — weight, bp, exchanges)
  var rows      = (getHistory(data.patientId, data.from, data.to).rows) || [];
  var EXCH      = { drain: true, fill: true, drain_fill: true };
  var exchanges = rows.filter(function(r) { return EXCH[r.measurementType]; });
  var weights   = rows.filter(function(r) { return r.measurementType === 'weight' && r.weight !== '' && r.weight !== null; });
  var bpRows    = rows.filter(function(r) { return r.measurementType === 'bp'     && r.bpSystolic !== '' && r.bpSystolic !== null; });

  // 3. Charts (SVG strings, embedded in HTML body)
  var weightSvg = _buildChartSvg(
    [{ points: weights.map(function(r) { return { date: r.date, val: parseFloat(r.weight) }; }),
       color: '#2a5fd6', label: 'Weight (kg)' }], {});

  var bpSvg = _buildChartSvg(
    [{ points: bpRows.map(function(r) { return { date: r.date, val: parseInt(r.bpSystolic)  }; }), color: '#2a5fd6', label: 'Systolic' },
     { points: bpRows.map(function(r) { return { date: r.date, val: parseInt(r.bpDiastolic) }; }), color: '#e74c3c', label: 'Diastolic' }], {});

  // 4. Patient name
  var patientName = _getPatientName(data.patientId) || data.patientId;

  // 5. Build HTML body + PDF attachment
  var htmlBody = _buildEmailHtml(patientName, data.from, data.to, weightSvg, bpSvg, exchanges);
  var pdfBlob  = _buildEmailPdf(patientName, data.from, data.to, exchanges, weights, bpRows);
  pdfBlob = pdfBlob.setName('PD_Report_' + data.from + '_to_' + data.to + '.pdf');

  // 6. Send to each validated recipient
  var subject = 'PD Tracker: History Report ' + data.from + ' → ' + data.to;
  targets.forEach(function(email) {
    MailApp.sendEmail({ to: email, name: 'PD Tracker', subject: subject, htmlBody: htmlBody, attachments: [pdfBlob] });
  });
  return { success: true, sent: targets.length };
}

// Generates a standalone SVG line chart. series = [{ points:[{date,val}], color, label }]
function _buildChartSvg(series, opts) {
  var W = 560, H = 200;
  var PL = 52, PR = 16, PT = 20, PB = 60;
  var cW = W - PL - PR;  // 492
  var cH = H - PT - PB;  // 120

  // Union of all dates; all values
  var dateSet = {}, allVals = [];
  series.forEach(function(s) {
    (s.points || []).forEach(function(p) {
      if (!isNaN(p.val)) { dateSet[p.date] = true; allVals.push(p.val); }
    });
  });
  var dates = Object.keys(dateSet).sort();
  var n     = dates.length;

  // Empty state
  if (!n || !allVals.length) {
    return '<svg width="' + W + '" height="60" viewBox="0 0 ' + W + ' 60" xmlns="http://www.w3.org/2000/svg" style="display:block">' +
      '<text x="' + (W/2) + '" y="36" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#aaa">No data for this period</text>' +
      '</svg>';
  }

  // Y range with 5 % margin
  var yMin = Math.min.apply(null, allVals);
  var yMax = Math.max.apply(null, allVals);
  if (yMax === yMin) { yMin -= 1; yMax += 1; }
  var rng  = yMax - yMin;
  yMin -= rng * 0.08; yMax += rng * 0.08; rng = yMax - yMin;

  function xFor(date) {
    var i = dates.indexOf(date);
    return n === 1 ? PL + cW / 2 : PL + (i / (n - 1)) * cW;
  }
  function yFor(val) { return PT + cH - ((val - yMin) / rng) * cH; }

  var out = [];
  out.push('<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="display:block;background:#fff">');

  // Horizontal gridlines + y-axis labels (5 steps)
  for (var g = 0; g <= 4; g++) {
    var gy   = PT + (g / 4) * cH;
    var gVal = yMax - (g / 4) * rng;
    out.push('<line x1="' + PL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + gy.toFixed(1) + '" stroke="#ececec" stroke-width="1"/>');
    out.push('<text x="' + (PL - 5) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-family="Arial,sans-serif" font-size="10" fill="#999">' + gVal.toFixed(gVal < 10 ? 1 : 0) + '</text>');
  }

  // Axes
  out.push('<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (PT + cH) + '" stroke="#ccc" stroke-width="1"/>');
  out.push('<line x1="' + PL + '" y1="' + (PT + cH) + '" x2="' + (W - PR) + '" y2="' + (PT + cH) + '" stroke="#ccc" stroke-width="1"/>');

  // X-axis date labels (at most 7 evenly spaced)
  var step = Math.ceil(n / 7);
  dates.forEach(function(d, i) {
    if (i % step !== 0 && i !== n - 1) return;
    var parts = d.split('-');
    out.push('<text x="' + xFor(d).toFixed(1) + '" y="' + (PT + cH + 14) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#999">' + parts[1] + '/' + parts[2] + '</text>');
  });

  // Series lines + dots
  series.forEach(function(s) {
    var pts = (s.points || []).filter(function(p) { return !isNaN(p.val); });
    if (!pts.length) return;
    var ptStr = pts.map(function(p) { return xFor(p.date).toFixed(1) + ',' + yFor(p.val).toFixed(1); }).join(' ');
    out.push('<polyline points="' + ptStr + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
    pts.forEach(function(p) {
      out.push('<circle cx="' + xFor(p.date).toFixed(1) + '" cy="' + yFor(p.val).toFixed(1) + '" r="3" fill="' + s.color + '"/>');
    });
  });

  // Legend (only when >1 series)
  if (series.length > 1) {
    var lx = PL, ly = PT + cH + 34;
    series.forEach(function(s) {
      out.push('<circle cx="' + (lx + 5) + '" cy="' + ly + '" r="4" fill="' + s.color + '"/>');
      out.push('<text x="' + (lx + 13) + '" y="' + (ly + 4) + '" font-family="Arial,sans-serif" font-size="10" fill="#555">' + s.label + '</text>');
      lx += 110;
    });
  }

  out.push('</svg>');
  return out.join('\n');
}

function _buildEmailHtml(patientName, from, to, weightSvg, bpSvg, exchanges) {
  var tz        = Session.getScriptTimeZone();
  var generated = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  var typeMap   = { drain_fill: 'Drain &amp; Fill', drain: 'Drain', fill: 'Fill' };

  var rows = exchanges.map(function(r) {
    var bg = exchanges.indexOf(r) % 2 === 0 ? '#fff' : '#f9f9f9';
    return '<tr style="background:' + bg + '">' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + r.date + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + r.time + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + (typeMap[r.measurementType] || r.measurementType || '') + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + _htmlEscape(r.bagType || '') + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + (r.bagWeight  !== '' && r.bagWeight  != null ? parseFloat(r.bagWeight).toFixed(1)  : '') + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + (r.fillVolume !== '' && r.fillVolume != null ? parseFloat(r.fillVolume).toFixed(2) : '') + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + _htmlEscape(r.notes || '') + '</td>' +
      '</tr>';
  }).join('');

  var noRows = exchanges.length === 0
    ? '<tr><td colspan="7" style="padding:12px;text-align:center;color:#999;font-style:italic">No exchange records for this period</td></tr>'
    : '';

  var TH = 'style="padding:8px;text-align:left;border-bottom:2px solid #2a5fd6;background:#eef1fb;font-size:12px;font-weight:600"';
  var THR = 'style="padding:8px;text-align:right;border-bottom:2px solid #2a5fd6;background:#eef1fb;font-size:12px;font-weight:600"';

  return '<!DOCTYPE html>' +
    '<html dir="ltr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;padding:20px 16px;color:#222;background:#fff">' +

    '<div style="border-bottom:3px solid #2a5fd6;padding-bottom:12px;margin-bottom:20px">' +
    '<h1 style="margin:0 0 4px;font-size:22px;color:#2a5fd6">PD History Report</h1>' +
    '<p style="margin:0;color:#666;font-size:13px">Patient: <strong>' + _htmlEscape(patientName) + '</strong> &nbsp;&middot;&nbsp; ' +
    from + ' &rarr; ' + to + ' &nbsp;&middot;&nbsp; Generated ' + generated + '</p>' +
    '</div>' +

    '<h2 style="font-size:14px;font-weight:600;color:#333;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Weight Trend (kg)</h2>' +
    weightSvg +

    '<h2 style="font-size:14px;font-weight:600;color:#333;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.04em">Blood Pressure (mmHg)</h2>' +
    bpSvg +

    '<h2 style="font-size:14px;font-weight:600;color:#333;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.04em">Exchange Log (' + exchanges.length + ' records)</h2>' +
    '<table style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #ddd">' +
    '<thead><tr>' +
    '<th ' + TH  + '>Date</th>' +
    '<th ' + TH  + '>Time</th>' +
    '<th ' + TH  + '>Type</th>' +
    '<th ' + TH  + '>Bag</th>' +
    '<th ' + THR + '>Drained (kg)</th>' +
    '<th ' + THR + '>Fill Vol (L)</th>' +
    '<th ' + TH  + '>Notes</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + noRows + '</tbody>' +
    '</table>' +

    '<p style="color:#bbb;font-size:11px;margin-top:28px;border-top:1px solid #eee;padding-top:10px">Sent by PD Tracker &middot; ' + generated + '</p>' +
    '</body></html>';
}

function _buildEmailPdf(patientName, from, to, exchanges, weights, bpRows) {
  var tz        = Session.getScriptTimeZone();
  var generated = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  var typeMap   = { drain_fill: 'Drain & Fill', drain: 'Drain', fill: 'Fill' };

  var doc  = null;
  var blob = null;
  try {
    doc  = DocumentApp.create('__pd_export_' + Utilities.getUuid() + '__');
    var body = doc.getBody();
    body.setMarginTop(36).setMarginBottom(36).setMarginLeft(54).setMarginRight(54);

    // Title
    body.appendParagraph('PD History Report — ' + patientName)
        .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Period: ' + from + ' → ' + to).setFontSize(10).setForegroundColor('#444444');
    body.appendParagraph('Generated: ' + generated).setFontSize(9).setForegroundColor('#888888');
    body.appendHorizontalRule();

    // Stats summary
    body.appendParagraph('Summary').setHeading(DocumentApp.ParagraphHeading.HEADING2);

    var wVals = weights.map(function(r) { return parseFloat(r.weight); }).filter(function(v) { return !isNaN(v) && v > 0; });
    if (wVals.length) {
      var wAvg = (wVals.reduce(function(a,b){return a+b;},0)/wVals.length).toFixed(1);
      body.appendParagraph('Weight: avg ' + wAvg + ' kg  ·  min ' + Math.min.apply(null,wVals).toFixed(1) + ' kg  ·  max ' + Math.max.apply(null,wVals).toFixed(1) + ' kg  (' + wVals.length + ' readings)').setFontSize(10);
    } else {
      body.appendParagraph('Weight: no readings in this period').setFontSize(10).setForegroundColor('#888888');
    }

    var sVals = bpRows.map(function(r) { return parseInt(r.bpSystolic);  }).filter(function(v) { return !isNaN(v) && v > 0; });
    var dVals = bpRows.map(function(r) { return parseInt(r.bpDiastolic); }).filter(function(v) { return !isNaN(v) && v > 0; });
    if (sVals.length) {
      var sAvg = Math.round(sVals.reduce(function(a,b){return a+b;},0)/sVals.length);
      var dAvg = Math.round(dVals.reduce(function(a,b){return a+b;},0)/dVals.length);
      body.appendParagraph('Blood Pressure: avg ' + sAvg + '/' + dAvg + ' mmHg  ·  range ' +
        Math.min.apply(null,sVals) + '–' + Math.max.apply(null,sVals) + '/' +
        Math.min.apply(null,dVals) + '–' + Math.max.apply(null,dVals) + ' mmHg  (' + sVals.length + ' readings)').setFontSize(10);
    } else {
      body.appendParagraph('Blood Pressure: no readings in this period').setFontSize(10).setForegroundColor('#888888');
    }

    body.appendParagraph('See the HTML email for weight and BP charts.').setFontSize(9).setForegroundColor('#aaaaaa').setItalic(true);
    body.appendHorizontalRule();

    // Exchange table
    body.appendParagraph('Exchanges (' + exchanges.length + ' records)').setHeading(DocumentApp.ParagraphHeading.HEADING2);

    var headers = [['Date', 'Time', 'Type', 'Bag', 'Drained (kg)', 'Fill Vol (L)', 'Notes']];
    var dataRows = exchanges.map(function(r) {
      return [
        r.date,
        r.time,
        typeMap[r.measurementType] || r.measurementType || '',
        r.bagType   || '',
        r.bagWeight  !== '' && r.bagWeight  != null ? String(parseFloat(r.bagWeight).toFixed(1))  : '',
        r.fillVolume !== '' && r.fillVolume != null ? String(parseFloat(r.fillVolume).toFixed(2)) : '',
        r.notes || ''
      ];
    });

    if (dataRows.length) {
      var table = body.appendTable(headers.concat(dataRows));
      // Bold header row
      var hRow = table.getRow(0);
      for (var c = 0; c < hRow.getNumCells(); c++) {
        hRow.getCell(c).getChild(0).asParagraph().editAsText().setBold(true);
      }
      table.setFontSize(9);
    } else {
      body.appendParagraph('No exchange records for this period.').setFontSize(10).setForegroundColor('#888888').setItalic(true);
    }

    // Footer
    body.appendHorizontalRule();
    body.appendParagraph('Sent by PD Tracker · ' + generated).setFontSize(8).setForegroundColor('#bbbbbb');

    doc.saveAndClose();
    blob = doc.getAs(MimeType.PDF);
  } finally {
    if (doc) {
      try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch(_) {}
    }
  }
  return blob;
}

// Minimal HTML-entity escaper for email body construction (server-side, no DOM available)
function _htmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
