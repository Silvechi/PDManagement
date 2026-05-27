// ============================================================
// i18n.js — Translation strings and language utilities
// Must be loaded before all other app scripts.
// ============================================================

let currentLang = (function () {
  try { return localStorage.getItem('pd_lang') || 'en'; } catch { return 'en'; }
})();

// Set dir + lang immediately so layout and screen readers are correct before first render
document.documentElement.lang = currentLang;
if (currentLang === 'he') document.documentElement.dir = 'rtl';

function t(key, vars) {
  const s = (STRINGS[currentLang]?.[key]) || STRINGS.en[key] || key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

function locale() {
  return currentLang === 'he' ? 'he-IL' : undefined;
}

function setLang(lang) {
  currentLang = lang;
  document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  try { localStorage.setItem('pd_lang', lang); } catch {}
  if (typeof buildNav === 'function') buildNav();
}

const STRINGS = {
  en: {
    // ── Navigation ──────────────────────────────────────────────
    'nav.dashboard':          'Dashboard',
    'nav.measurements':       'Log',
    'nav.inventory':          'Inventory',
    'nav.history':            'History',
    'nav.prep':               'Prep',
    'nav.users':              'Settings',

    // ── Common ──────────────────────────────────────────────────
    'common.offline':         'You are offline — data may be stale',
    'common.loading':         'Loading…',
    'common.saving':          'Saving…',
    'common.error':           'Error: {msg}',
    'common.failed':          'Failed to load: {msg}',
    'common.notes':           'Notes',
    'common.optional':        'Optional…',
    'common.manage':          'Manage →',
    'common.log':             'Log →',
    'common.back':            '← Back',
    'common.low':             'low',

    // ── Dashboard ───────────────────────────────────────────────
    'dash.quick_log':         'Quick log',
    'dash.updated':           'Updated {time}',
    'dash.no_bag_data':       'No bag data.',
    'dash.bags':              'bags',
    'dash.low_stock':         'Low stock: {flags}',
    'dash.overdue':           'Exchange overdue · {elapsed} since last (max {maxH}h)',
    'dash.solution_bags':     'Solution bags',
    'dash.last_exchange':     'Last exchange at {time}',
    'dash.since_exchange':    'since last exchange',
    'dash.supplies':          'Supplies',
    'dash.latest_vitals':     'Latest vitals',
    'dash.weight':            'Weight',
    'dash.no_bp':             'No BP data yet.',
    'dash.blood_pressure':    'Blood pressure',
    'dash.avg':               'avg',
    'dash.trend':             '7-day trend · {delta} kg',
    'dash.no_weight':         'No weight data yet.',

    // ── Measurements ────────────────────────────────────────────
    'meas.title':             'Log',
    'meas.sub':               'Record an exchange or measurement',
    'meas.tab.drainage':      'Exchange',
    'meas.tab.weight':        'Weight',
    'meas.tab.bp':            'BP',
    'meas.proc.both':         'Drain + Fill',
    'meas.proc.drain':        'Drain only',
    'meas.proc.fill':         'Fill only',
    'meas.exchange_type':     'Exchange type',
    'meas.last':              'Last {ago}',
    'meas.drained':           'Drained (bag out)',
    'meas.scroll_wheels':     'Scroll wheels to set weight',
    'meas.new_bag':           'New bag going in',
    'meas.tap_select':        'Tap to select',
    'meas.supplies_used':     'Supplies used',
    'meas.bags':              'bags',
    'meas.caps':              'caps',
    'meas.notes_sub':         'Optional — symptoms, fluid color, etc.',
    'meas.notes_ph':          'Anything to remember…',
    'meas.in_stock':          '{count} in stock',
    'meas.save.both':         'Save Drain + Fill',
    'meas.save.drain':        'Save Drain only',
    'meas.save.fill':         'Save Fill only',
    'meas.saved.both':        'Drainage saved.',
    'meas.saved.drain':       'Drain saved.',
    'meas.saved.fill':        'Fill saved.',
    'meas.weight.title':      'Body weight',
    'meas.weight.sub':        'Empty bladder, no shoes — same time each day',
    'meas.weight.save':       'Save weight',
    'meas.weight.saved':      'Weight saved · {weight} kg',
    'meas.bp.title':          'Blood pressure',
    'meas.bp.save':           'Save BP',
    'meas.bp.saved':          'BP saved · {sys}/{dia} mmHg',
    'meas.bp.healthy':        'Within healthy range',
    'meas.bp.low':            'Lower than usual range',
    'meas.bp.high':           'Higher than usual range',
    'meas.bp.elevated':       'Slightly elevated',

    // ── Now pill ────────────────────────────────────────────────
    'now.now':                'Now',
    'now.today':              'Today',
    'now.yesterday':          'Yesterday',
    'now.reset':              'Reset to now',
    'now.done':               'Done',

    // ── Inventory ───────────────────────────────────────────────
    'inv.title':              'Inventory',
    'inv.sub':                'Adjust counts as you use or restock',
    'inv.solution_bags':      'Solution bags',
    'inv.tap_adjust':         'Tap +/− to adjust',
    'inv.other_supplies':     'Other supplies',
    'inv.no_items':           'No inventory items configured.',
    'inv.warn_below':         'Warn below {n}',
    'inv.save':               'Save inventory',
    'inv.saved':              'Inventory saved.',

    // ── History ─────────────────────────────────────────────────
    'hist.title':             'History',
    'hist.sub':               'Exchange log',
    'hist.no_data':           'No exchanges in this period.',
    'hist.from':              'From',
    'hist.to':                'To',
    'hist.range_sep':         '→',
    'hist.drain_fill':        'Drain & Fill',
    'hist.drain':             'Drain only',
    'hist.fill':              'Fill only',
    'hist.drained':           '{weight} kg drained',

    // ── Prep ────────────────────────────────────────────────────
    'prep.title':             'Prep',
    'prep.sub':               'Reference card for the exchange procedure',
    'prep.keep_screen_on':    'Keep screen on',
    'prep.what_to_prepare':   'What to prepare',
    'prep.procedure':         'Procedure',
    'prep.no_items':          'No items configured.',
    'prep.no_steps':          'No steps configured.',

    // ── Time-ago ────────────────────────────────────────────────
    'time.just_now':          'just now',
    'time.mins_ago':          '{n}m ago',
    'time.hours_ago':         '{n}h ago',
    'time.days_ago':          '{n}d ago',

    // ── Settings ────────────────────────────────────────────────
    'settings.title':         'Settings',
    'settings.appearance':    'Appearance',
    'settings.theme':         'Theme',
    'settings.light':         'Light',
    'settings.dark':          'Dark',
    'settings.language':      'Language',
    'settings.text_size':     'Text size',
    'settings.text_normal':   'Normal',
    'settings.text_large':    'Large',
    'settings.text_xlarge':   'X-Large',
    'settings.active_user':   'Active User',
    'settings.no_user':       'No user selected.',
    'settings.dob':           'DOB: {dob}',
    'settings.manage_users':  'Manage users →',

    // ── Users ───────────────────────────────────────────────────
    'users.title':            'Manage Users',
    'users.active_count':     '{n} active',
    'users.no_users':         'No users yet. Add your first user below.',
    'users.add_btn':          '+ Add user',
    'users.active_badge':     'Active',
    'users.inactive_badge':   'Inactive',
    'users.edit':             'Edit',
    'users.dob':              'DOB: {dob}',
    'users.select':           'Select user',
    'users.form.add':         'Add user',
    'users.form.edit':        'Edit user',
    'users.form.name':        'Name *',
    'users.form.name_ph':     'Display name',
    'users.form.dob':         'Date of birth',
    'users.form.comment':     'Comment',
    'users.form.comment_ph':  'Medical notes, contact info…',
    'users.form.active':      'Active',
    'users.form.yes':         'Yes',
    'users.form.no':          'No',
    'users.form.save':        'Save changes',
    'users.form.required':    'Name is required.',

    // ── Auth ────────────────────────────────────────────────────
    'auth.title':             'PD Tracker',
    'auth.sub':               'Enter your device name and password to sign in or register.',
    'auth.device_label':      'Device name',
    'auth.device_ph':         "e.g. Mom's phone",
    'auth.pw_label':          'Password',
    'auth.pw_hint':           '(6–20 characters)',
    'auth.continue':          'Continue',
    'auth.connecting':        'Connecting…',
    'auth.no_device':         'Please enter a device name.',
    'auth.pw_length':         'Password must be 6–20 characters.',
    'auth.unexpected':        'Unexpected response. Try again.',
    'auth.pending.title':     'Waiting for approval',
    'auth.pending.sub1':      'Your request is pending. Ask the account owner to approve it in the <strong>Tokens</strong> sheet in Google Sheets.',
    'auth.pending.sub2':      'Once approved, sign in again with your device name and password.',
    'auth.check_again':       'Check again',
    'auth.checking':          'Checking…',
    'auth.still_pending':     'Still pending. Check back after the owner approves it in the Tokens sheet.',
    'auth.no_server':         'Could not reach server. Try again.',
    'auth.denied.title':      'Access denied',
    'auth.denied.sub':        "This device's access has been revoked. Contact the account owner.",
    'auth.new_device':        'Register a new device',
    'auth.error.title':       'Connection error',
    'auth.retry':             'Retry',
    'auth.back':              'Back',
  },

  he: {
    // ── Navigation ──────────────────────────────────────────────
    // Arrow note: in RTL, '←' visually points toward the start of the line (right edge),
    // which is the "forward" direction. '→' points toward the end (left edge) = "back".
    'nav.dashboard':          'לוח בקרה',
    'nav.measurements':       'רישום',
    'nav.inventory':          'מלאי',
    'nav.history':            'היסטוריה',
    'nav.prep':               'הכנה',
    'nav.users':              'הגדרות',

    // ── Common ──────────────────────────────────────────────────
    'common.offline':         'אתה לא מחובר — הנתונים עשויים להיות לא מעודכנים',
    'common.loading':         'טוען…',
    'common.saving':          'שומר…',
    'common.error':           'שגיאה: {msg}',
    'common.failed':          'טעינה נכשלה: {msg}',
    'common.notes':           'הערות',
    'common.optional':        'אופציונלי…',
    'common.manage':          'ניהול ←',
    'common.log':             'יומן ←',
    'common.back':            'חזרה →',
    'common.low':             'נמוך',

    // ── Dashboard ───────────────────────────────────────────────
    'dash.quick_log':         'רישום מהיר',
    'dash.updated':           'עודכן ב-{time}',
    'dash.no_bag_data':       'אין נתוני שקיות.',
    'dash.bags':              'שקיות',
    'dash.low_stock':         'מלאי נמוך: {flags}',
    'dash.overdue':           'שחלוף באיחור · {elapsed} מאז האחרון (מקסימום {maxH} שעות)',
    'dash.solution_bags':     'שקיות תמיסה',
    'dash.last_exchange':     'שחלוף אחרון ב-{time}',
    'dash.since_exchange':    'מאז השחלוף האחרון',
    'dash.supplies':          'ציוד',
    'dash.latest_vitals':     'מדדים אחרונים',
    'dash.weight':            'משקל',
    'dash.no_bp':             'אין נתוני לחץ דם עדיין.',
    'dash.blood_pressure':    'לחץ דם',
    'dash.avg':               'ממוצע',
    'dash.trend':             'מגמה של 7 ימים · {delta} kg',
    'dash.no_weight':         'אין נתוני משקל עדיין.',

    // ── Measurements ────────────────────────────────────────────
    'meas.title':             'רישום',
    'meas.sub':               'תיעוד שחלוף או מדידה',
    'meas.tab.drainage':      'שחלוף',
    'meas.tab.weight':        'משקל',
    'meas.tab.bp':            'ל"ד',
    'meas.proc.both':         'ניקוז + מילוי',
    'meas.proc.drain':        'ניקוז בלבד',
    'meas.proc.fill':         'מילוי בלבד',
    'meas.exchange_type':     'סוג שחלוף',
    'meas.last':              'אחרון {ago}',
    'meas.drained':           'ניקוז (שקית יוצאת)',
    'meas.scroll_wheels':     'גלגל לכוונון המשקל',
    'meas.new_bag':           'שקית חדשה נכנסת',
    'meas.tap_select':        'לחץ לבחירה',
    'meas.supplies_used':     'ציוד בשימוש',
    'meas.bags':              'שקיות',
    'meas.caps':              'פקקים',
    'meas.notes_sub':         "אופציונלי — תסמינים, צבע הנוזל, וכו'",
    'meas.notes_ph':          'משהו לציין…',
    'meas.in_stock':          '{count} במלאי',
    'meas.save.both':         'שמור ניקוז + מילוי',
    'meas.save.drain':        'שמור ניקוז בלבד',
    'meas.save.fill':         'שמור מילוי בלבד',
    'meas.saved.both':        'הניקוז נשמר.',
    'meas.saved.drain':       'הניקוז נשמר.',
    'meas.saved.fill':        'המילוי נשמר.',
    'meas.weight.title':      'משקל גוף',
    'meas.weight.sub':        'שלפוחית ריקה, ללא נעליים — באותה שעה בכל יום',
    'meas.weight.save':       'שמור משקל',
    'meas.weight.saved':      'המשקל נשמר · {weight} kg',
    'meas.bp.title':          'לחץ דם',
    'meas.bp.save':           'שמור ל"ד',
    'meas.bp.saved':          'ל"ד נשמר · {sys}/{dia} mmHg',
    'meas.bp.healthy':        'בטווח תקין',
    'meas.bp.low':            'נמוך מהרגיל',
    'meas.bp.high':           'גבוה מהרגיל',
    'meas.bp.elevated':       'מעט מוגבה',

    // ── Now pill ────────────────────────────────────────────────
    'now.now':                'כעת',
    'now.today':              'היום',
    'now.yesterday':          'אתמול',
    'now.reset':              'איפוס לעכשיו',
    'now.done':               'סיום',

    // ── Inventory ───────────────────────────────────────────────
    'inv.title':              'מלאי',
    'inv.sub':                'עדכן כמויות לפי שימוש או חידוש מלאי',
    'inv.solution_bags':      'שקיות תמיסה',
    'inv.tap_adjust':         'לחץ +/− לעדכון',
    'inv.other_supplies':     'ציוד נוסף',
    'inv.no_items':           'לא הוגדרו פריטי מלאי.',
    'inv.warn_below':         'התראה מתחת ל-{n}',
    'inv.save':               'שמור מלאי',
    'inv.saved':              'המלאי נשמר.',

    // ── History ─────────────────────────────────────────────────
    'hist.title':             'היסטוריה',
    'hist.sub':               'יומן שחלופים',
    'hist.no_data':           'אין שחלופים בתקופה זו.',
    'hist.from':              'מתאריך',
    'hist.to':                'עד תאריך',
    'hist.range_sep':         '←',
    'hist.drain_fill':        'ניקוז ומילוי',
    'hist.drain':             'ניקוז בלבד',
    'hist.fill':              'מילוי בלבד',
    'hist.drained':           '{weight} kg נוקז',

    // ── Prep ────────────────────────────────────────────────────
    'prep.title':             'הכנה',
    'prep.sub':               'כרטיס עזר לנוהל השחלוף',
    'prep.keep_screen_on':    'השאר מסך דולק',
    'prep.what_to_prepare':   'מה להכין',
    'prep.procedure':         'נוהל',
    'prep.no_items':          'לא הוגדרו פריטים.',
    'prep.no_steps':          'לא הוגדרו שלבים.',

    // ── Time-ago ────────────────────────────────────────────────
    'time.just_now':          'עכשיו',
    'time.mins_ago':          'לפני {n} דק\'',
    'time.hours_ago':         'לפני {n} ש\'',
    'time.days_ago':          'לפני {n} ימ\'',

    // ── Settings ────────────────────────────────────────────────
    'settings.title':         'הגדרות',
    'settings.appearance':    'מראה',
    'settings.theme':         'ערכת צבעים',
    'settings.light':         'בהיר',
    'settings.dark':          'כהה',
    'settings.language':      'שפה',
    'settings.text_size':     'גודל טקסט',
    'settings.text_normal':   'רגיל',
    'settings.text_large':    'גדול',
    'settings.text_xlarge':   'גדול מאוד',
    'settings.active_user':   'משתמש פעיל',
    'settings.no_user':       'לא נבחר משתמש.',
    'settings.dob':           'תאריך לידה: {dob}',
    'settings.manage_users':  'ניהול משתמשים ←',

    // ── Users ───────────────────────────────────────────────────
    'users.title':            'ניהול משתמשים',
    'users.active_count':     '{n} פעילים',
    'users.no_users':         'אין משתמשים עדיין. הוסף את המשתמש הראשון.',
    'users.add_btn':          '+ הוסף משתמש',
    'users.active_badge':     'פעיל',
    'users.inactive_badge':   'לא פעיל',
    'users.edit':             'עריכה',
    'users.dob':              'תאריך לידה: {dob}',
    'users.select':           'בחר משתמש',
    'users.form.add':         'הוסף משתמש',
    'users.form.edit':        'עריכת משתמש',
    'users.form.name':        'שם *',
    'users.form.name_ph':     'שם תצוגה',
    'users.form.dob':         'תאריך לידה',
    'users.form.comment':     'הערה',
    'users.form.comment_ph':  'הערות רפואיות, פרטי קשר…',
    'users.form.active':      'פעיל',
    'users.form.yes':         'כן',
    'users.form.no':          'לא',
    'users.form.save':        'שמור שינויים',
    'users.form.required':    'נדרש להזין שם.',

    // ── Auth ────────────────────────────────────────────────────
    'auth.title':             'PD Tracker',
    'auth.sub':               'הזן שם מכשיר וסיסמה כדי להתחבר או להירשם.',
    'auth.device_label':      'שם מכשיר',
    'auth.device_ph':         'לדוגמה: הטלפון של אמא',
    'auth.pw_label':          'סיסמה',
    'auth.pw_hint':           '(6–20 תווים)',
    'auth.continue':          'המשך',
    'auth.connecting':        'מתחבר…',
    'auth.no_device':         'נא להזין שם מכשיר.',
    'auth.pw_length':         'הסיסמה חייבת להכיל 6–20 תווים.',
    'auth.unexpected':        'תגובה בלתי צפויה. נסה שוב.',
    'auth.pending.title':     'ממתין לאישור',
    'auth.pending.sub1':      'בקשתך ממתינה לאישור. בקש מבעל החשבון לאשר אותה בגיליון <strong>Tokens</strong> ב-Google Sheets.',
    'auth.pending.sub2':      'לאחר האישור, התחבר שוב עם שם המכשיר והסיסמה.',
    'auth.check_again':       'בדוק שוב',
    'auth.checking':          'בודק…',
    'auth.still_pending':     'עדיין ממתין. בדוק שוב לאחר שהבעלים אישר בגיליון Tokens.',
    'auth.no_server':         'לא ניתן להגיע לשרת. נסה שוב.',
    'auth.denied.title':      'גישה נדחתה',
    'auth.denied.sub':        'הגישה של מכשיר זה בוטלה. פנה לבעל החשבון.',
    'auth.new_device':        'רשום מכשיר חדש',
    'auth.error.title':       'שגיאת חיבור',
    'auth.retry':             'נסה שוב',
    'auth.back':              'חזרה',
  },
};
