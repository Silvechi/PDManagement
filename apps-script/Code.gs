// ============================================================
// Medical Tracking Platform — Google Apps Script Backend
// ============================================================

var SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

var TAB = {
  MEASUREMENTS: 'Daily_Measurements',
  INVENTORY:    'Inventory',
  DASHBOARD:    'Dashboard',
  CONFIG:       'Config'
};

var HEADERS = {
  Daily_Measurements: ['Date', 'Time', 'Weight (kg)', 'BP Systolic', 'BP Diastolic', 'Bag Weight After Drainage (kg)', 'Notes', 'Bag Type', 'Measurement Type'],
  Inventory:          ['Date', 'Item Name', 'Count'],
  Dashboard:          ['Metric', 'Value', 'Status'],
  Config:             ['Category', 'Key', 'Value', 'Description']
};

// Default config written by setupSheet() if Config tab is empty
var CONFIG_DEFAULTS = [
  // Inventory — names for Solution Bags and Caps must stay as-is (code deducts by exact name)
  ['inventory', 'Solution Bags 1.36%',  '5',  'שקית צהובה. בדוק תוקף לפני שימוש.'],
  ['inventory', 'Solution Bags 2.27%',  '5',  'שקית ירוקה. בדוק תוקף לפני שימוש.'],
  ['inventory', 'Solution Bags 3.86%',  '5',  'שקית ורודה. בדוק תוקף לפני שימוש.'],
  ['inventory', 'Caps',                 '10', 'שני פקקים לכל החלפה.'],
  ['inventory', 'Gauze Pads',           '10', ''],
  ['inventory', 'Salt Water',           '2',  ''],
  ['inventory', 'Antibiotic Ointment',  '1',  'נספר בשפופרות. שפופרת מחזיקה כ-2–3 שבועות. הזמן מחדש כשנשארת שפופרת אחרונה.'],
  ['inventory', 'Big Bandage',          '5',  ''],
  ['inventory', 'Small Bandage',        '5',  ''],
  // Prep checklist
  ['prep_items', '1', 'מסכה כחולה',       ''],
  ['prep_items', '2', '2 פקקים',           ''],
  ['prep_items', '3', 'נייר מגבת',         ''],
  ['prep_items', '4', 'מגבוני אלכוהול',   ''],
  ['prep_items', '5', 'אלכוג\'ל',          ''],
  ['prep_items', '6', 'קלאמפים כחולים',   ''],
  ['prep_items', '7', 'שקית תמיסה',       'בדוק ריכוז, צבע, תקינות ותוקף.'],
  // Procedure steps
  ['prep_steps', '1',  'לשטוף ידיים',                                                                             ''],
  ['prep_steps', '2',  'לנקות את העגלה עם מגבון אלכוהול',                                                        ''],
  ['prep_steps', '3',  'להכין דברים על העגלה',                                                                    ''],
  ['prep_steps', '4',  'לוודא את תקינות, צבע, ריכוז ותוקף השקית',                                                ''],
  ['prep_steps', '5',  'לשים מסכה',                                                                               ''],
  ['prep_steps', '6',  'לשים נייר מגבת על הרגל',                                                                 ''],
  ['prep_steps', '7',  'לנקות את הצינור של הפורט עם מגבון אלכוהול',                                             ''],
  ['prep_steps', '8',  'לחטא ידיים עם אלכוג\'ל',                                                                  ''],
  ['prep_steps', '9',  'לאחוז בבטחה בפורט (בחלק התכלת בלבד) ובקצה הצינור בשקית (מתחת לעיגול)',                ''],
  ['prep_steps', '10', 'לפתוח את הפקק של השקית ולזרוק',                                                         ''],
  ['prep_steps', '11', 'לפתוח את הפקק של הפורט ולזרוק',                                                         ''],
  ['prep_steps', '12', 'לחבר בצורה בטוחה וזהירה',                                                                ''],
  ['prep_steps', '13', 'לקשור מגבון אלכוהול על החיבור',                                                          ''],
  ['prep_steps', '14', 'לפתוח את ההברגה הלבנה כדי להתחיל ניקוז',                                                ''],
  ['prep_steps', '15', 'להמתין עד סוף הניקוז',                                                                    ''],
  ['prep_steps', '16', 'לסגור את ההברגה ולשים קלאמפ לכיוון הניקוז',                                             ''],
  ['prep_steps', '17', 'לשבור את החסם הירוק לשני הצדדים',                                                        ''],
  ['prep_steps', '18', 'לפתוח את ההברגה כדי להתחיל מילוי',                                                       ''],
  ['prep_steps', '19', 'להמתין עד סוף המילוי',                                                                    ''],
  ['prep_steps', '20', 'לסגור את ההברגה ולשים קלאמפ לכיוון המילוי',                                              ''],
  ['prep_steps', '21', 'לשים מסכה',                                                                               ''],
  ['prep_steps', '22', 'לחטא ידיים עם אלכוג\'ל',                                                                  ''],
  ['prep_steps', '23', 'להוריד את מגבון האלכוהול מהחיבור',                                                       ''],
  ['prep_steps', '24', 'לפתוח פקק אחד',                                                                           ''],
  ['prep_steps', '25', 'לחטא שוב ידיים עם אלכוג\'ל',                                                             ''],
  ['prep_steps', '26', 'לאחוז בחיבור, להבריג החוצה בזהירות ולשחרר את הצינור של השקית',                         ''],
  ['prep_steps', '27', 'לקחת את הפקק הפתוח ולהבריג בבטחה על הפורט',                                             ''],
  ['prep_steps', '28', 'ניקוי ואיסוף זבל',                                                                        ''],
  ['prep_steps', '29', 'שקילה של השקית בלי לשקול את הצינור',                                                     ''],
  ['prep_steps', '30', 'ריקון של השקית וזריקה לזבל',                                                             '']
];

// ============================================================
// Entry points
// ============================================================

function doGet(e) {
  var action = e.parameter.action;
  try {
    checkToken(e.parameter.token);
    if (action === 'getDashboard') return jsonResponse(getDashboard());
    if (action === 'getHistory')   return jsonResponse(getHistory(e.parameter.n || 7));
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
  var sheet = getSheet(TAB.INVENTORY);
  var date  = data.date || '';
  var items = data.items || [];

  if (data.mode === 'delta') {
    // Read current counts (last write per item wins)
    var current = {};
    if (sheet.getLastRow() > 1) {
      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
      rows.forEach(function(row) { current[String(row[1])] = parseInt(row[2]) || 0; });
    }
    items.forEach(function(item) {
      var newCount = Math.max(0, (current[item.name] || 0) + (parseInt(item.delta) || 0));
      sheet.appendRow([date, item.name, newCount]);
    });
  } else {
    items.forEach(function(item) {
      sheet.appendRow([date, item.name, parseInt(item.count) || 0]);
    });
  }
  return { success: true, message: 'Inventory updated.' };
}

// ============================================================
// GET handlers
// ============================================================

function getDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Inventory config from Config tab ---
  var inventoryConfig = readInventoryConfig(ss);

  // --- Latest count per item (tall Inventory format) ---
  var invSheet   = ss.getSheetByName(TAB.INVENTORY);
  var inventory  = {};
  var lowStockArr = [];
  inventoryConfig.forEach(function(item) { inventory[item.name] = 0; });

  if (invSheet && invSheet.getLastRow() > 1) {
    var invRows = invSheet.getRange(2, 1, invSheet.getLastRow() - 1, 3).getValues();
    // Walk forward; last write for each item wins
    invRows.forEach(function(row) {
      var name = String(row[1]);
      if (inventory.hasOwnProperty(name)) {
        inventory[name] = parseInt(row[2]) || 0;
      }
    });
  }

  // Build low-stock flags
  inventoryConfig.forEach(function(item) {
    if ((inventory[item.name] || 0) < item.min) {
      lowStockArr.push(item.name + ' (' + (inventory[item.name] || 0) + ' left)');
    }
  });

  // --- Weight trend (last 7 distinct days) + last 3 BP readings ---
  var measSheet = ss.getSheetByName(TAB.MEASUREMENTS);
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
    for (var i = mData.length - 1; i >= 0; i--) {
      var row = mData[i];
      var dateVal = row[0];
      var dateStr = dateVal instanceof Date
        ? Utilities.formatDate(dateVal, tz, 'yyyy-MM-dd')
        : String(dateVal);

      if (row[2] !== '' && row[2] !== null && !weightByDay.hasOwnProperty(dateStr)) {
        weightByDay[dateStr] = row[2];
      }
      if (row[3] && row[4] && bpRecent.length < 3) {
        var timeVal = row[1];
        var timeStr = timeVal instanceof Date
          ? Utilities.formatDate(timeVal, tz, 'HH:mm')
          : (String(timeVal).trim() || '');
        bpRecent.push({ date: dateStr, time: timeStr, systolic: parseInt(row[3]), diastolic: parseInt(row[4]) });
      }
      if (Object.keys(weightByDay).length >= 7 && bpRecent.length >= 3) break;
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
    inventoryConfig: inventoryConfig,
    inventory:       inventory,
    lowStockFlags:   lowStockArr.join(', '),
    weightTrend:     weightTrend,
    bpRecent:        bpRecent,
    bpAvg:           bpAvgSys !== null ? { systolic: bpAvgSys, diastolic: bpAvgDia } : null
  };
}

function getHistory(n) {
  var sheet = getSheet(TAB.MEASUREMENTS);
  if (sheet.getLastRow() <= 1) return { rows: [] };
  var numRows  = Math.min(parseInt(n) || 7, sheet.getLastRow() - 1);
  var startRow = sheet.getLastRow() - numRows + 1;
  var data     = sheet.getRange(startRow, 1, numRows, 9).getValues();
  var rows = data.map(function(row) {
    return {
      date:            row[0],
      time:            row[1],
      weight:          row[2],
      bpSystolic:      row[3],
      bpDiastolic:     row[4],
      bagWeight:       row[5],
      notes:           row[6],
      bagType:         row[7],
      measurementType: row[8]
    };
  });
  return { rows: rows };
}

function getConfig() {
  var ss          = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName(TAB.CONFIG);
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
    prepItems: sortByNumKey(prepItems),
    prepSteps: sortByNumKey(prepSteps)
  };
}

// ============================================================
// Setup — safe to run multiple times
// ============================================================

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(HEADERS).forEach(function(tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    var firstCell = sheet.getRange(1, 1).getValue();
    if (!firstCell || firstCell === '') {
      sheet.getRange(1, 1, 1, HEADERS[tabName].length).setValues([HEADERS[tabName]]);
      sheet.getRange(1, 1, 1, HEADERS[tabName].length).setFontWeight('bold');
    }
  });

  // Populate Config with defaults if empty
  var configSheet = ss.getSheetByName(TAB.CONFIG);
  if (configSheet && configSheet.getLastRow() <= 1) {
    configSheet.getRange(2, 1, CONFIG_DEFAULTS.length, 4).setValues(CONFIG_DEFAULTS);
  }

  SpreadsheetApp.getUi().alert('Setup complete. All tabs are ready.');
}

// ============================================================
// Helpers
// ============================================================

function readInventoryConfig(ss) {
  var configSheet = ss.getSheetByName(TAB.CONFIG);
  var result = [];
  if (configSheet && configSheet.getLastRow() > 1) {
    var rows = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 4).getValues();
    rows.forEach(function(row) {
      if (String(row[0]) === 'inventory') {
        var desc = row[3] !== undefined && row[3] !== null ? String(row[3]) : '';
        result.push({ name: String(row[1]), min: parseInt(row[2]) || 0, description: desc });
      }
    });
  }
  // Fallback if Config tab doesn't exist yet
  if (!result.length) {
    result = [
      { name: 'Solution Bags',    min: 5,  description: '' },
      { name: 'Caps',             min: 10, description: '' },
      { name: 'Gauze Pads',       min: 10, description: '' },
      { name: 'Bandages',         min: 10, description: '' },
      { name: 'Ointment (units)', min: 10, description: '' }
    ];
  }
  return result;
}

// Token is stored in Project Settings → Script Properties as "API_TOKEN".
// If no token is configured, all requests are allowed (useful during initial setup).
function checkToken(supplied) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (expected && supplied !== expected) throw new Error('Unauthorized');
}

function getSheet(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name + '. Run setupSheet() first.');
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
