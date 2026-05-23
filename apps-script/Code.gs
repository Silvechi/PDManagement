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
  PATIENTS:     'Patients'
};

var HEADERS = {
  Daily_Measurements: ['Date', 'Time', 'Weight (kg)', 'BP Systolic', 'BP Diastolic', 'Bag Weight After Drainage (kg)', 'Notes', 'Bag Type', 'Measurement Type', 'PatientID', 'Fill Volume (L)'],
  Inventory:          ['DateTime', 'Item Name', 'Count', 'PatientID'],
  Config:             ['Category', 'Key', 'Value', 'Description', 'isBag', 'active', 'color', 'displayName', 'maxHours', 'reorderDays'],
  Tokens:             ['Token', 'Label', 'Status', 'Created', 'Last Used', 'PasswordHash', 'ActivePatientID', 'Theme', 'Language'],
  Patients:           ['PatientID', 'Name', 'DOB', 'Comment', 'Active', 'LastUpdated']
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
    if (action === 'logMeasurement')  return jsonResponse(logMeasurement(body));
    if (action === 'updateInventory') return jsonResponse(updateInventory(body));
    if (action === 'addPatient')      return jsonResponse(addPatient(body));
    if (action === 'editPatient')     return jsonResponse(editPatient(body));
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
    parseFloat(data.fillVolume)  || ''
  ]);
  _touchDataLastUpdated();
  return { success: true, message: 'Measurement logged.' };
}

function updateInventory(data) {
  var sheet    = getSheet(TAB.INVENTORY);
  var datetime = data.datetime || data.date || '';
  var items    = data.items || [];
  items.forEach(function(item) {
    sheet.appendRow([datetime, item.name, parseInt(item.count) || 0, data.patientId || '']);
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
  if (!configSheet || configSheet.getLastRow() <= 1) return;
  var keys = configSheet.getRange(2, 2, configSheet.getLastRow() - 1, 1).getValues();
  var tz   = Session.getScriptTimeZone();
  var now  = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === 'dataLastUpdated') {
      configSheet.getRange(i + 2, 3).setValue(now);
      return;
    }
  }
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
        configSheet.appendRow(['meta', key, metaDefaults[key], '', '', '', '', '', '', '']);
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

// ============================================================
// Helpers
// ============================================================

function readInventoryConfig() {
  var configSheet = ss().getSheetByName(TAB.CONFIG);
  var result = [];
  if (configSheet && configSheet.getLastRow() > 1) {
    var rows = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 10).getValues();
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
            if (typeof v === 'number') return (Math.round(v * 10000) / 100) + '%';
            return v ? String(v) : '';
          })(row[7]),
          maxHours:    row[8] !== '' && row[8] !== null ? parseFloat(row[8]) : null,
          reorderDays: row[9] !== '' && row[9] !== null ? parseInt(row[9]) : null
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

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
