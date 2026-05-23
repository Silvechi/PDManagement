# Schema Migration Plan

Files touched: `apps-script/Code.gs`, `apps-script/Config.defaults.gs.example`
Trigger: run `setupSheet()` once after all changes — sheet reset required (no real data).

---

## Checklist

### Step 1 — `TAB` constant in `Code.gs`
- [ ] Add `PATIENTS: 'Patients'`

---

### Step 2 — `HEADERS` constant in `Code.gs`

- [ ] `Tokens` — extend from 5 to 9 columns:
  `['Token', 'Label', 'Status', 'Created', 'Last Used', 'PasswordHash', 'ActivePatientID', 'Theme', 'Language']`

- [ ] `Daily_Measurements` — extend from 9 to 11 columns, add at end:
  `... 'PatientID', 'Fill Volume (L)'`

- [ ] `Inventory` — extend from 3 to 4 columns, add at end:
  `... 'PatientID'`

- [ ] `Config` — extend from 8 to 10 columns, add at end:
  `... 'maxHours', 'reorderDays'`

- [ ] `Patients` — new entry:
  `['PatientID', 'Name', 'DOB', 'Comment', 'Active', 'LastUpdated']`

---

### Step 3 — `setupSheet()` changes in `Code.gs`

- [ ] **Tokens status dropdown** — add `readonly` to allowed values:
  ```javascript
  .requireValueInList(['pending', 'approved', 'revoked', 'readonly'], true)
  ```

- [ ] **Tokens column widths** — add widths for columns F–I after existing widths:
  ```javascript
  tokSheet.setColumnWidth(6, 220); // PasswordHash (SHA-256 hex — narrow, never read by humans)
  tokSheet.setColumnWidth(7, 220); // ActivePatientID
  tokSheet.setColumnWidth(8, 80);  // Theme
  tokSheet.setColumnWidth(9, 80);  // Language
  ```

- [ ] **Patients sheet formatting** — after the main forEach loop, add a block mirroring the Tokens block:
  ```javascript
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
  ```

- [ ] **Seed Config meta rows** — after the CONFIG_DEFAULTS write block, append meta rows if they don't already exist:
  ```javascript
  var metaKeys = ['dataLastUpdated', 'maxExchangeHours', 'exportEmail'];
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
  ```

---

### Step 4 — `Config.defaults.gs.example` changes

- [ ] Add `maxHours` (column I) to each bag row (`isBag: TRUE`):
  - Standard bags (e.g. 1.36%, 2.27%, 3.86%): `6`
  - Overnight bag: `10`
  - Leave blank for non-bag rows

- [ ] Add `reorderDays` (column J) to non-bag consumable rows (`isBag: FALSE`):
  - e.g. `14` for gauze, tape, disinfectant
  - Leave blank for bag rows

- [ ] Ensure the three meta rows are present with sensible defaults:
  ```
  meta | dataLastUpdated | (empty)
  meta | maxExchangeHours | 6
  meta | exportEmail | (empty — owner fills in)
  ```

---

### Step 5 — Reset & verify checklist

Run `setupSheet()` in Apps Script, then confirm:

- [ ] 5 tabs exist: `Daily_Measurements`, `Inventory`, `Config`, `Tokens`, `Patients`
- [ ] `Tokens` has 9 columns (A–I), header row bold and frozen
- [ ] `Tokens` Status dropdown (col C) includes `readonly`
- [ ] `Daily_Measurements` has 11 columns (A–K)
- [ ] `Inventory` has 4 columns (A–D)
- [ ] `Config` has 10 columns (A–J)
- [ ] `Patients` has 6 columns (A–F), header row bold and frozen, Active dropdown on col E
- [ ] `Config` contains meta rows: `dataLastUpdated`, `maxExchangeHours`, `exportEmail`

---

## Source references

| Change | TODO item |
|--------|-----------|
| Tokens: PasswordHash | #6 |
| Tokens: ActivePatientID | #11 + #6 |
| Tokens: Theme | #21 |
| Tokens: Language | #22 |
| Tokens: readonly status | #20 |
| Daily_Measurements: PatientID | #11 |
| Daily_Measurements: Fill Volume (L) | #15 |
| Inventory: PatientID | #11 |
| Config: maxHours | #18 |
| Config: reorderDays | #19 |
| Config meta: dataLastUpdated | #9 |
| Config meta: maxExchangeHours | #18 |
| Config meta: exportEmail | #16 |
| New Patients sheet | #11 |
