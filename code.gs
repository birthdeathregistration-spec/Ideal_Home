/******************************************************
 * IDEAL HOME - SECURE FULL BACKEND (v6.5 - FINAL + DUAL API + SMART AI + TEMPLATES)
 ******************************************************/

const ss = SpreadsheetApp.getActiveSpreadsheet();

// ===== CONFIG =====
const CONFIG = {
  ONESIGNAL_APP_ID: "1094d89b-d41a-4282-bbc5-469603e76f9c",
  ONESIGNAL_API_KEY: PropertiesService.getScriptProperties().getProperty("ONESIGNAL_API_KEY") || "",
  GEMINI_KEY: PropertiesService.getScriptProperties().getProperty("GEMINI_KEY") || "", 
  GEMINI_MODEL: "gemini-3.5-flash"
};

// Helper: Normalize Bangladesh phone number safely
function formatBdPhone(phone) {
  if (!phone) return "";
  let num = String(phone).replace(/[^\d+]/g, "").trim();
  if (num.startsWith("+88")) num = num.substring(1);
  else if (num.startsWith("01")) num = "88" + num;
  else if (num.startsWith("1") && num.length === 10) num = "880" + num;
  return num;
}

// ===== WHATSAPP UTILITIES (DUAL SYSTEM: WAWP + META) =====
const WA_CONFIG = {
  RENDER_URL: "https://idealhomemess.onrender.com",
  BASE_URL: "https://api.wawp.net",
  INSTANCE_ID: "26F00B3F3F1B",
  ACCESS_TOKEN: PropertiesService.getScriptProperties().getProperty("WA_ACCESS_TOKEN") || ""
};

const META_WA_CONFIG = {
  TOKEN: PropertiesService.getScriptProperties().getProperty("META_WA_TOKEN") || "",
  PHONE_ID: "1283108221551055"
};

function getWaConfig() {
  let props = PropertiesService.getScriptProperties();
  return {
    RENDER_BOT_URL: props.getProperty("RENDER_BOT_URL") || WA_CONFIG.RENDER_URL,
    BASE_URL: props.getProperty("WA_BASE_URL") || WA_CONFIG.BASE_URL,
    INSTANCE_ID: props.getProperty("WA_INSTANCE_ID") || WA_CONFIG.INSTANCE_ID,
    ACCESS_TOKEN: props.getProperty("WA_ACCESS_TOKEN") || WA_CONFIG.ACCESS_TOKEN
  };
}

function sendWhatsApp(phone, textMsg) {
  let num = (typeof phone === "string" && phone.includes("@")) ? phone : formatBdPhone(phone);
  if (!num) return;
  
  let success = false;
  let waCfg = getWaConfig();

  // 1. Priority 1: Self-Hosted Private Bot on Render (100% Free, No 24-hr limit)
  if (waCfg.RENDER_BOT_URL) {
    try {
      let renderUrl = waCfg.RENDER_BOT_URL.replace(/\/+$/, "") + "/send";
      let res = UrlFetchApp.fetch(renderUrl, {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify({ "phone": num, "message": textMsg }),
        "muteHttpExceptions": true
      });
      if (res.getResponseCode() === 200 || res.getResponseCode() === 201) {
        return; // Message successfully delivered via Render Bot
      }
    } catch(e) {
      logAudit("RENDER_BOT_SEND_FAIL", e.toString(), "System");
    }
  }

  // 2. Priority 2: WAWP Gateway
  try {
    let chatId = num + "@c.us";
    let url = `${waCfg.BASE_URL}/v2/send/text?instance_id=${waCfg.INSTANCE_ID}&access_token=${waCfg.ACCESS_TOKEN}`;
    
    let res = UrlFetchApp.fetch(url, {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify({ "chatId": chatId, "message": textMsg }),
      "muteHttpExceptions": true
    });
    
    if (res.getResponseCode() === 200 || res.getResponseCode() === 201) {
      success = true;
    }
  } catch(e) {}

  // 3. Priority 3: Meta Cloud API Fallback
  if (!success) {
    try {
      let metaUrl = `https://graph.facebook.com/v17.0/${META_WA_CONFIG.PHONE_ID}/messages`;
      let metaPayload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": num,
        "type": "text",
        "text": { "preview_url": false, "body": textMsg }
      };
      
      UrlFetchApp.fetch(metaUrl, {
        "method": "post",
        "contentType": "application/json",
        "headers": { "Authorization": "Bearer " + META_WA_CONFIG.TOKEN },
        "payload": JSON.stringify(metaPayload),
        "muteHttpExceptions": true
      });
    } catch(e) {
      logAudit("WA_FALLBACK_ERROR", "Message failed on all APIs: " + e.toString(), "System");
    }
  }
}

// ==========================================
// SAFE BATCH MESSAGE SENDER (5-6s ANTI-BAN INTERVAL)
// ==========================================
function broadcastWhatsAppList(messageList) {
  if (!Array.isArray(messageList) || messageList.length === 0) return 0;

  let waCfg = getWaConfig();

  // 1. Priority 1: Queue on Render Bot for safe 5-6s background delivery
  if (waCfg.RENDER_BOT_URL) {
    try {
      let renderUrl = waCfg.RENDER_BOT_URL.replace(/\/+$/, "") + "/broadcast";
      let res = UrlFetchApp.fetch(renderUrl, {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify({ "messages": messageList }),
        "muteHttpExceptions": true
      });
      if (res.getResponseCode() === 200 || res.getResponseCode() === 202) {
        return messageList.length;
      }
    } catch(e) {
      logAudit("RENDER_BROADCAST_FAIL", e.toString(), "System");
    }
  }

  // 2. Fallback: Loop one by one with a safe 5.5s delay to prevent account ban
  let sent = 0;
  for (let i = 0; i < messageList.length; i++) {
    let item = messageList[i];
    if (item.phone && item.message) {
      sendWhatsApp(item.phone, item.message);
      sent++;
      if (i < messageList.length - 1) {
        Utilities.sleep(5500); // 5.5s delay
      }
    }
  }
  return sent;
}

// ==========================================
// META TEMPLATE MESSAGE SENDER (FORCE RAW LOGGING)
// ==========================================
function sendMetaTemplate(phone, templateName, params) {
  let num = formatBdPhone(phone);
  if (!num) return;
  
  let metaUrl = `https://graph.facebook.com/v17.0/${META_WA_CONFIG.PHONE_ID}/messages`;
  
  let components = [];
  if (params && params.length > 0) {
    let paramList = params.map(p => ({ "type": "text", "text": String(p) }));
    components = [{
      "type": "body",
      "parameters": paramList
    }];
  }

  let metaPayload = {
    "messaging_product": "whatsapp",
    "to": num,
    "type": "template",
    "template": {
      "name": templateName, 
      "language": { "code": "bn" },
      "components": components
    }
  };
  
  try {
    let response = UrlFetchApp.fetch(metaUrl, {
      "method": "post",
      "contentType": "application/json",
      "headers": { "Authorization": "Bearer " + META_WA_CONFIG.TOKEN },
      "payload": JSON.stringify(metaPayload),
      "muteHttpExceptions": true
    });
    
    // মেটা যাই উত্তর দিক না কেন (সফল বা ব্যর্থ), সেটি সরাসরি শিটে সেভ করবে
    logAudit("META_RAW_RESPONSE", response.getContentText(), "System");
    
  } catch(e) {
    logAudit("META_TEMPLATE_ERROR_CRITICAL", e.toString(), "System");
  }
}
// ===== UTILITIES =====
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function text(t) { return ContentService.createTextOutput(t); }
function now() { return Utilities.formatDate(new Date(), "Asia/Dhaka", "yyyy-MM-dd HH:mm:ss"); }
function todayStr() { return Utilities.formatDate(new Date(), "Asia/Dhaka", "yyyy-MM-dd"); }
function uid() { return Utilities.getUuid(); }

function getExactDate(val) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, "Asia/Dhaka", "yyyy-MM-dd");
  let str = String(val).trim().split(" ")[0].split("T")[0];
  let parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      let p0 = parseInt(parts[0], 10);
      let p1 = parseInt(parts[1], 10);
      if (p1 > 12) {
        // parts[0] is month, parts[1] is day: MM/DD/YYYY
        return parts[2] + "-" + ("0" + parts[0]).slice(-2) + "-" + ("0" + parts[1]).slice(-2);
      } else {
        // parts[0] is day, parts[1] is month: DD/MM/YYYY
        return parts[2] + "-" + ("0" + parts[1]).slice(-2) + "-" + ("0" + parts[0]).slice(-2);
      }
    } else if (parts[0].length === 4) {
      return parts[0] + "-" + ("0" + parts[1]).slice(-2) + "-" + ("0" + parts[2]).slice(-2);
    }
  }
  return str;
}

function isThisMonth(dStr) {
  if (!dStr) return false;
  let ex = getExactDate(dStr);
  if (!ex) return false;
  let currentMonthPrefix = Utilities.formatDate(new Date(), "Asia/Dhaka", "yyyy-MM");
  return String(ex).startsWith(currentMonthPrefix);
}

// ===== SERVER-SIDE DATA CACHING =====
function setInitialDataCache(jsonString) {
  try {
    if (jsonString && jsonString.length < 95000) {
      CacheService.getScriptCache().put("INITIAL_DATA_CACHE", jsonString, 120);
    }
  } catch(e) {}
}

function clearInitialDataCache() {
  try {
    CacheService.getScriptCache().remove("INITIAL_DATA_CACHE");
  } catch(e) {}
}

function parse(e) { try { return JSON.parse(e.postData.contents); } catch (err) { return null; } }
function getSheet(name) {
  let sheet = ss.getSheetByName(name);
  return sheet ? sheet.getDataRange().getValues() : [];
}

// ===== SESSIONS & AUDIT =====
function createSession() {
  let t = uid();
  CacheService.getScriptCache().put(t, "manager", 21600);
  return t;
}

function isManager(t) { return t && CacheService.getScriptCache().get(t) === "manager"; }

function logAudit(action, details, user) {
  try {
    let sh = ss.getSheetByName("Audit_Logs");
    if (!sh) {
      sh = ss.insertSheet("Audit_Logs");
      sh.appendRow(["Time", "Action", "Details", "User"]);
    }
    sh.appendRow([now(), action, details, user || "Manager"]);
  } catch(e) {}
}

function findRow(sheet, id) {
  if (!sheet) return -1;
  let d = sheet.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]).trim() === String(id).trim()) return i + 1;
  }
  return -1;
}

// ===== AUTHENTICATION =====
function checkLockout(id) {
  let attempts = CacheService.getScriptCache().get("lockout_" + id);
  return (attempts && parseInt(attempts) >= 3);
}

function recordFailedLogin(id) {
  let cache = CacheService.getScriptCache();
  let attempts = parseInt(cache.get("lockout_" + id) || "0");
  cache.put("lockout_" + id, (attempts + 1).toString(), 900); 
}

function clearLockout(id) { CacheService.getScriptCache().remove("lockout_" + id); }

function loginBoarder(nameOrId, pin) {
  let d = getSheet("Boarders");
  let target = String(nameOrId || "").trim();
  let inPin  = String(pin || "").trim();
  if (!target || !inPin) return null;

  for (let i = 1; i < d.length; i++) {
    let rowId   = String(d[i][0] || "").trim();
    let rowName = String(d[i][1] || "").trim();
    let rowPin  = String(d[i][5] || "").trim();
    
    if (rowId === target || rowName === target || (typeof normStr === "function" && normStr(rowName) === normStr(target))) {
      let cleanRowPin = rowPin.replace(/\.0$/, '');
      let cleanInPin  = inPin.replace(/\.0$/, '');
      let isPinValid  = (cleanRowPin === cleanInPin || cleanRowPin.padStart(4, '0') === cleanInPin.padStart(4, '0'));
      
      if (isPinValid) {
        clearLockout(target);
        if (rowId) clearLockout(rowId);
        return String(d[i][0]).trim();
      } else {
        if (checkLockout(target) || (rowId && checkLockout(rowId))) return "LOCKED";
        recordFailedLogin(target);
        return null;
      }
    }
  }
  return null;
}

function authBoarder(id, pin) {
  let d = getSheet("Boarders");
  let inId = String(id || "").trim();
  let inPin = String(pin || "").trim();
  if (!inId || !inPin) return false;

  for (let i = 1; i < d.length; i++) {
    let rowId   = String(d[i][0] || "").trim();
    let rowName = String(d[i][1] || "").trim();
    let rowPin  = String(d[i][5] || "").trim();
    
    if (rowId === inId || rowName === inId || (typeof normStr === "function" && normStr(rowName) === normStr(inId))) {
      let cleanRowPin = rowPin.replace(/\.0$/, '');
      let cleanInPin  = inPin.replace(/\.0$/, '');
      let isPinValid  = (cleanRowPin === cleanInPin || cleanRowPin.padStart(4, '0') === cleanInPin.padStart(4, '0'));
      
      if (isPinValid) {
        clearLockout(inId);
        if (rowId) clearLockout(rowId);
        return true;
      } else {
        recordFailedLogin(inId);
        return false;
      }
    }
  }
  return false;
}

// ===== NOTIFICATIONS =====
function notify(title, msg) {
  if (!CONFIG.ONESIGNAL_API_KEY) return;
  try {
    UrlFetchApp.fetch("https://onesignal.com/api/v1/notifications", {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Basic " + CONFIG.ONESIGNAL_API_KEY, "accept": "application/json" },
      payload: JSON.stringify({
        app_id: CONFIG.ONESIGNAL_APP_ID,
        included_segments: ["Subscribed Users", "Total Subscriptions", "Active Users"],
        target_channel: "push",
        headings: { en: title },
        contents: { en: msg }
      }),
      muteHttpExceptions: true
    });
  } catch (e) { }
}

// ==========================================
// API ROUTING (GET & POST)
// ==========================================
function doGet(e) {
  if (e && e.parameter && e.parameter['hub.mode'] === 'subscribe' && e.parameter['hub.verify_token'] === 'idealhome2026') {
    return ContentService.createTextOutput(e.parameter['hub.challenge']);
  }

  if (e && e.parameter && e.parameter.action === "get_initial_data") {
    // 1. Fast path: Server-side cache lookup (returns in ~30ms)
    try {
      let cached = CacheService.getScriptCache().get("INITIAL_DATA_CACHE");
      if (cached) {
        return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
      }
    } catch(err) {}

    let settings = getSheet("Settings");
    
    let fixDates = (data, dateColIdx) => {
      for(let i = 1; i < data.length; i++) {
        if(data[i][dateColIdx]) {
           data[i][dateColIdx] = getExactDate(data[i][dateColIdx]);
        }
      }
      return data;
    };

    // 2. Payload slimming: Filter meals to current month to remove 120+ KB historical rows
    let allMeals = getSheet("Meals");
    let filteredMeals = [];
    if (allMeals && allMeals.length > 0) {
      filteredMeals.push(allMeals[0]);
      for (let i = 1; i < allMeals.length; i++) {
        if (allMeals[i][1] && isThisMonth(allMeals[i][1])) {
          filteredMeals.push(allMeals[i]);
        }
      }
    }

    let payload = {
      boarders:        getSheet("Boarders"),
      transactions:    fixDates(getSheet("Transactions"), 1),
      deposits:        fixDates(getSheet("Deposits"), 1),
      meals:           fixDates(filteredMeals, 1),
      pendingBazaar:   fixDates(getSheet("Pending_Bazaar"), 1),
      settings:        settings,
      archives:        getSheet("Archives"),
      manager:         (settings.length > 1 && settings[1][0]) ? settings[1][0] : "",
      notice:          (settings.length > 1 && settings[1][2]) ? settings[1][2] : "",
      assignedBazaar:  (settings.length > 1 && settings[1][3]) ? settings[1][3] : "",
      assignedDates:   (settings.length > 1 && settings[1][4]) ? settings[1][4] : ""
    };

    let jsonStr = JSON.stringify(payload);
    setInitialDataCache(jsonStr);

    return ContentService.createTextOutput(jsonStr).setMimeType(ContentService.MimeType.JSON);
  }
  return text("Ideal Home API is running securely!");
}

function doPost(e) {
  let d = parse(e);
  if (!d) return text("Invalid JSON Payload");

  if (d.object === "whatsapp_business_account" && d.entry && d.entry[0].changes) {
    return handleMetaWhatsAppWebhook(d);
  }

  if (d.action === "WHATSAPP_BOT" || d.event === "messages.upsert" || (d.sender && (d.message || d.text))) {
    let msgText = d.message || d.text || (d.data && (d.data.message || d.data.text)) || "";
    let sender = d.sender || d.phone || d.from || (d.data && (d.data.from || d.data.sender)) || "";
    let senderJid = d.senderJid || d.jid || (d.data && (d.data.senderJid || d.data.jid)) || "";
    let reply = processWhatsAppBotMessage(msgText, sender, senderJid);
    if (d.sendReply !== false && (senderJid || sender)) {
      sendWhatsApp(senderJid || sender, reply);
    }

    // Resolve real phone number so Baileys can deliver reliably to standard phone JID
    let bList = getSheet("Boarders");
    let bObj = findBoarderByPhone(sender, bList);
    if (!bObj && senderJid) {
      let lId = PropertiesService.getScriptProperties().getProperty("WA_LINK_" + senderJid);
      if (lId) bObj = findBoarderById(lId, bList);
    }
    let targetPhone = bObj ? bObj.phone : "";
    return json({ status: "success", reply: reply, phone: targetPhone });
  }

  // Render Bot Session Persistence Routes
  if (d.action === "GET_WA_SESSION") {
    return getWaSession();
  }
  if (d.action === "SAVE_WA_SESSION") {
    return saveWaSession(d.files);
  }
  if (d.action === "CLEAR_WA_SESSION") {
    return clearWaSession();
  }

  let action = d.action;

  // Invalidate initial data cache on data-mutating requests
  let mutatingActions = [
    "TOGGLE_MEAL", "SUBMIT_BAZAAR", "SUBMIT_PENDING_BAZAAR", "APPROVE_BAZAAR", "REJECT_BAZAAR",
    "ADD_TRANSACTION", "ADD_DEPOSIT", "ADD_BOARDER", "EDIT_BOARDER", "DELETE_BOARDER", "UPDATE_NOTICE",
    "MANAGER_EDIT_MEAL", "ASSIGN_BAZAAR", "CHANGE_MANAGER", "EDIT_DEPOSIT", "EDIT_BAZAAR",
    "EDIT_TRANSACTION", "DELETE_BAZAAR", "ADD_DAILY_MEALS", "MANUAL_ARCHIVE",
    "BROADCAST_MONTHLY_SUMMARY", "UPDATE_WHATSAPP_CONFIG"
  ];
  if (mutatingActions.indexOf(action) !== -1) {
    clearInitialDataCache();
  }
  let settingsSheet = ss.getSheetByName("Settings");
  if (!settingsSheet) return text("Error: Settings sheet not found!");
  let savedManagerPin = settingsSheet.getRange("B2").getValue().toString().trim();

  if (action === "MANAGER_LOGIN" || action === "VERIFY_MANAGER_PIN") {
    if (checkLockout("manager")) return json({ status: "error", message: "Too many attempts. Try later." });
    if (d.pin && String(d.pin).trim() === savedManagerPin) { 
        clearLockout("manager");
        return json({ status: "success", token: createSession() }); 
    }
    recordFailedLogin("manager");
    return json({ status: "error" });
  }

  if (action === "MANAGER_LOGOUT") {
    CacheService.getScriptCache().remove(d.token);
    return json({ status: "success" });
  }

  if (action === "BOARDER_LOGIN") {
    let id = loginBoarder(d.boarder_id || d.id || d.name, d.pin);
    if (id === "LOCKED") return json({ status: "error", message: "Account locked temporarily." });
    if (id) return json({ status: "success", boarder_id: id, name: d.name });
    return json({ status: "error" });
  }

  if (action === "GET_AI_ADVICE") return getAI(d);
  if (action === "FORGET_PASSWORD_EMAIL") return sendExistingPasswordToEmail(d);

  let b_pin = d.boarder_pin || d.pin;
  if (action === "ADD_EMAIL")                   return addEmail(d, b_pin);
  if (action === "TOGGLE_MEAL")                 return toggleMeal(d, b_pin);
  if (action === "SUBMIT_BAZAAR" || action === "SUBMIT_PENDING_BAZAAR") return submitBazaar(d, b_pin);
  if (action === "CHANGE_BOARDER_PIN")          return changeBoarderPin(d, b_pin);

  let isManagerReq = (d.pin && String(d.pin).trim() === savedManagerPin) || isManager(d.token);
  if (!isManagerReq) {
      logAudit("UNAUTHORIZED_ACCESS", "Attempted: " + action, d.name || "Unknown");
      return text("Unauthorized: Access Denied");
  }

  switch (action) {
    case "APPROVE_BAZAAR":      return approveBazaar(d);
    case "REJECT_BAZAAR":       return rejectBazaar(d);
    case "ADD_TRANSACTION":     return addExpense(d);
    case "ADD_DEPOSIT":         return addDeposit(d);
    case "ADD_BOARDER":         return addBoarder(d);
    case "EDIT_BOARDER":        return editBoarder(d);
    case "DELETE_BOARDER":      return deleteBoarder(d);
    case "UPDATE_NOTICE":       return updateNotice(d);
    case "MANAGER_EDIT_MEAL":   return managerEditMeal(d);
    case "ASSIGN_BAZAAR":       return assignBazaar(d);
    case "CHANGE_MANAGER":      return changeManager(d);
    case "CHANGE_MANAGER_PIN":  return changeManagerPin(d);
    case "EDIT_DEPOSIT":        return editDepositById(d);
    case "EDIT_BAZAAR":
    case "EDIT_TRANSACTION":    return editBazaarById(d);
    case "DELETE_BAZAAR":       return deleteBazaarById(d);
    case "GET_TODAYS_MEALS":    return getTodaysMeals();
    case "ADD_DAILY_MEALS":     return addDailyMeals(d);
    case "GENERATE_REPORT":     return text(generateMonthlyReport());
    case "MANUAL_ARCHIVE":      return manualArchiveCurrentMonth(d);
    case "BROADCAST_MONTHLY_SUMMARY": return broadcastMonthlySummary(d);
    case "GET_WHATSAPP_QR":           return getWhatsAppQR(d);
    case "UPDATE_WHATSAPP_CONFIG":    return updateWhatsAppConfig(d);
    case "TEST_WHATSAPP":             return testWhatsAppMessage(d);
    case "SEND_LOW_BALANCE_ALERTS":   return checkAndNotifyLowBalances(d);
  }
  return text("Unknown Action Requested");
}

// ==========================================
// CORE FUNCTIONS
// ==========================================
function addEmail(d, pin) {
  if (!authBoarder(d.boarder_id, pin)) return text("Error: ভুল পিন!");
  let sh = ss.getSheetByName("Boarders");
  let row = findRow(sh, d.boarder_id);
  if (row === -1) return text("Error: বর্ডার পাওয়া যায়নি।");
  sh.getRange(row, 7).setValue(String(d.email).trim());
  return text("Success: ইমেইল সফলভাবে যুক্ত হয়েছে!");
}

function sendExistingPasswordToEmail(d) {
  if (!d || !d.boarder_id) return text("Error: বর্ডার আইডি পাওয়া যায়নি।");
  let sh = ss.getSheetByName("Boarders");
  let data = sh.getDataRange().getValues();
  let email = "", bName = "", currentPin = "";
  
  for(let i=1; i < data.length; i++) {
    if(String(data[i][0]).trim() === String(d.boarder_id).trim()) {
      bName = String(data[i][1]).trim();
      currentPin = String(data[i][5]).trim();
      email = String(data[i][6] || "").trim(); 
      break;
    }
  }
  
  if(!email || !email.includes("@")) return text("Error: আপনার প্রোফাইলে কোনো ইমেইল যুক্ত করা নেই। ম্যানেজারের সাথে যোগাযোগ করুন।");
  
  try {
    MailApp.sendEmail({
      to: email,
      subject: "Ideal Home - Your Current PIN",
      body: `হ্যালো ${bName},\n\nআপনার একাউন্টের বর্তমান লগইন পিন হলো: ${currentPin}\n\nদয়া করে এই পিনটি দিয়ে লগইন করুন। আপনি চাইলে প্রোফাইল অপশন থেকে নিজের পিন পরিবর্তন করে নিতে পারেন।\n\nধন্যবাদ,\nআইডিয়াল হোম`
    });
    return text("Success: আপনার সেভ করা ইমেইলে পিন পাঠানো হয়েছে।");
  } catch(e) {
    return text("Error: ইমেইল পাঠাতে সমস্যা হয়েছে।");
  }
}

function toggleMeal(d, pin) {
  if (!authBoarder(d.boarder_id, pin)) return text("Error: ভুল পিন!");
  let lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return text("Error: সিস্টেম ব্যস্ত, কিছুক্ষণ পর চেষ্টা করুন।");

  try {
    let sh = ss.getSheetByName("Boarders");
    let row = findRow(sh, d.boarder_id);
    if (row === -1) return text("Error: বর্ডার পাওয়া যায়নি।");

    let bdTime = parseInt(Utilities.formatDate(new Date(), "Asia/Dhaka", "HHmm"));
    if (d.type === "lunch"  && bdTime >= 1130 && d.status === "OFF") return text("Error: বেলা ১১:৩০ এর পর লাঞ্চ অফ করা সম্ভব নয়!");
    if (d.type === "dinner" && bdTime >= 1930 && d.status === "OFF") return text("Error: সন্ধ্যা ৭:৩০ এর পর ডিনার অফ করা সম্ভব নয়!");

    let val = 1;
    if (d.status === "OFF") val = 0;
    else if (!isNaN(Number(d.status))) val = Number(d.status);

    let col = (d.type === "lunch") ? 4 : 5;
    sh.getRange(row, col).setValue(val > 0 ? "ON" : "OFF");

    let mSheet = ss.getSheetByName("Meals");
    let mData  = mSheet.getDataRange().getValues();
    let today  = todayStr();
    let exists = false;
    let mCol = (d.type === "lunch") ? 5 : 6;

    for (let i = 1; i < mData.length; i++) {
      if (!mData[i][1]) continue;
      if (String(mData[i][2]).trim() === String(d.boarder_id).trim() && getExactDate(mData[i][1]) === today) {
        mSheet.getRange(i + 1, mCol).setValue(val);
        exists = true;
        break;
      }
    }

    if (!exists) {
      let bData  = sh.getRange(row, 1, 1, 6).getValues()[0];
      let l_val  = (d.type === "lunch")  ? val : (bData[3] === "OFF" ? 0 : 1);
      let d_val  = (d.type === "dinner") ? val : (bData[4] === "OFF" ? 0 : 1);
      mSheet.appendRow([uid(), todayStr(), d.boarder_id, d.name, l_val, d_val]);
    }

    let mealName   = (d.type === "lunch")  ? "দুপুরের (Lunch)"   : "রাতের (Dinner)";
    let statusName = (val === 0) ? "বন্ধ (OFF)" : (val > 1 ? val + " টি করা" : "চালু (ON)");
    notify("🍽️ মিল আপডেট", d.name + " এর " + mealName + " মিল " + statusName + " হয়েছে।");
    logAudit("MEAL_TOGGLE", `${mealName} set to ${statusName}`, d.name);

    return text("Success: মিল আপডেট হয়েছে!");
  } finally {
    lock.releaseLock();
  }
}

function managerEditMeal(d) {
  let mSheet = ss.getSheetByName("Meals");
  let bSheet = ss.getSheetByName("Boarders");
  let targetDate = d.date ? d.date : todayStr();
  let bId        = String(d.boarder_id).trim();
  let bName      = d.name || "";

  let val = Number(d.meal_count);
  if (isNaN(val) || val < 0) val = 0;

  let mCol = (d.type === "lunch") ? 5 : 6;
  let mData    = mSheet.getDataRange().getValues();
  let foundRow = -1;

  let bIdClean   = bId.toLowerCase();
  let bNameClean = bName.toLowerCase();
  for (let i = 1; i < mData.length; i++) {
    if (!mData[i][1]) continue;
    let rId = String(mData[i][2] || "").trim().toLowerCase();
    let rName = String(mData[i][3] || "").trim().toLowerCase();
    let matches = (rId && rId === bIdClean) || (bNameClean && rName === bNameClean) || (rId && rId === bNameClean);
    if (matches && getExactDate(mData[i][1]) === targetDate) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    mSheet.getRange(foundRow, mCol).setValue(val);
    if (bId) mSheet.getRange(foundRow, 3).setValue(bId);
    if (bName) mSheet.getRange(foundRow, 4).setValue(bName);
  } else {
    let bRow  = findRow(bSheet, d.boarder_id);
    let l_val = (d.type === "lunch")  ? val : 0;
    let d_val = (d.type === "dinner") ? val : 0;

    if (bRow !== -1) {
      let bData = bSheet.getRange(bRow, 1, 1, 6).getValues()[0];
      if (d.type === "lunch"  && bData[4] !== "OFF") d_val = 1;
      if (d.type === "dinner" && bData[3] !== "OFF") l_val = 1;
    }
    mSheet.appendRow([uid(), targetDate, bId, bName, l_val, d_val]);
  }

  if (targetDate === todayStr() && (val === 0 || val === 1)) {
    let bRow = findRow(bSheet, d.boarder_id);
    if (bRow !== -1) {
      let bCol = (d.type === "lunch") ? 4 : 5;
      bSheet.getRange(bRow, bCol).setValue(val === 0 ? "OFF" : "ON");
    }
  }
  
  logAudit("MANAGER_MEAL_EDIT", `${bName} on ${targetDate}: ${d.type}=${val}`, d.manager || "Manager");
  return text("Success: Meal updated");
}

function submitBazaar(d, pin) {
  let bId = d.boarder_id || d.id;
  let bName = d.name || d.boarder_name || "সদস্য";
  if (!authBoarder(bId, pin) && !authBoarder(bName, pin)) return text("Error: ভুল পিন!");
  let cost = Number(d.cost);
  if(isNaN(cost) || cost <= 0) return text("Error: টাকার পরিমাণ সঠিক নয়!");
  ss.getSheetByName("Pending_Bazaar").appendRow([uid(), now(), bId, bName, d.item, cost, "PENDING"]);
  notify("🛒 বাজার রিকোয়েস্ট", bName + " → " + d.item + " (৳" + cost + ")");
  return text("Success: Submitted");
}

function changeBoarderPin(d, pin) {
  if (!authBoarder(d.boarder_id, pin)) return text("Error: ভুল পিন!");
  let sh = ss.getSheetByName("Boarders");
  if (!sh) return text("Error: Boarders sheet not found!");
  let row = findRow(sh, d.boarder_id);
  if (row === -1) return text("Error: বর্ডার পাওয়া যায়নি!");
  if (!d.new_pin || String(d.new_pin).trim() === "") return text("Error: নতুন পিন দেওয়া হয়নি!");
  sh.getRange(row, 6).setValue(String(d.new_pin).trim());
  return text("Success: পিন পরিবর্তন হয়েছে!");
}

function approveBazaar(d) {
  let lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return text("Error: সিস্টেম ব্যস্ত!");
  try {
    let sh  = ss.getSheetByName("Pending_Bazaar");
    let row = findRow(sh, d.id || d.row_id);
    if (row === -1) return text("Error: Pending list এ পাওয়া যায়নি");
    
    let data = sh.getRange(row, 1, 1, 7).getValues()[0];
    let reqDate = getExactDate(data[1]) || todayStr();
    let bId = String(data[2] || "").trim();
    let bName = String(data[3] || "").trim();
    let item = String(data[4] || "").trim();
    let cost = Number(data[5]);

    ss.getSheetByName("Transactions").appendRow([uid(), reqDate, d.manager || "Manager", item + " (" + bName + ")", cost]);
    sh.deleteRow(row);
    
    notify("✅ বাজার অনুমোদন", bName + " এর " + item + " অনুমোদিত হয়েছে।");
    logAudit("APPROVE_BAZAAR", `${item} (৳${cost})`, d.manager || "Manager");

    // Send WhatsApp notification to the boarder
    let boarders = getSheet("Boarders");
    let targetPhone = "";
    for (let i = 1; i < boarders.length; i++) {
      if ((bId && String(boarders[i][0]).trim() === bId) || (bName && String(boarders[i][1]).trim() === bName)) {
        targetPhone = boarders[i][7];
        break;
      }
    }

    if (targetPhone && String(targetPhone).trim() !== "") {
      let bzMsg = `✅ *আইডিয়াল হোম মেস - বাজার অনুমোদন*\n----------------------------------------\n👤 আসসালামু আলাইকুম *${bName}* ভাই,\nআপনার সাবমিট করা বাজারের রিকোয়েস্টটি ম্যানেজার অনুমোদন করেছেন।\n\n🛒 পণ্যের বিবরণ: *${item}*\n💰 খরচের পরিমাণ: *৳${cost}*\n📅 তারিখ: *${reqDate}*\n👮 অনুমোদক: *${d.manager || "ম্যানেজার"}*\n\nউক্ত টাকা মেসের চলতি মাসের মোট বাজার খরচে সফলভাবে যুক্ত করা হয়েছে।\n----------------------------------------\nধন্যবাদ, আইডিয়াল হোম মেস।`;
      sendWhatsApp(targetPhone, bzMsg);
    }

    return text("Success: Approved");
  } finally {
    lock.releaseLock();
  }
}

function rejectBazaar(d) {
  let sh = ss.getSheetByName("Pending_Bazaar");
  if (!sh) return text("Error: Pending_Bazaar sheet not found!");
  let row = findRow(sh, d.id || d.row_id);
  if (row === -1) return text("Error: Pending list এ পাওয়া যায়নি!");
  let data = sh.getRange(row, 1, 1, 7).getValues()[0];
  sh.deleteRow(row);
  logAudit("REJECT_BAZAAR", `${data[4]}`, d.manager || "Manager");
  return text("Success: Rejected");
}

function addExpense(d) {
  let cost = Number(d.cost);
  if (!d.item || isNaN(cost) || cost <= 0) return text("Error: item এবং সঠিক cost দেওয়া আবশ্যক!");
  ss.getSheetByName("Transactions").appendRow([uid(), todayStr(), d.manager || "Manager", d.item, cost]);
  logAudit("ADD_EXPENSE", `${d.item} (৳${cost})`, d.manager || "Manager");
  return text("Success");
}

function addDeposit(d) {
  let amount = Number(d.amount);
  if (!d.name || isNaN(amount) || amount <= 0) return text("Error: name এবং সঠিক amount দেওয়া আবশ্যক!");
  
  ss.getSheetByName("Deposits").appendRow([uid(), todayStr(), d.boarder_id || "", d.name, amount]);
  logAudit("ADD_DEPOSIT", `${d.name} (৳${amount})`, d.manager || "Manager");

  let boarders = getSheet("Boarders");
  let targetPhone = "";
  let bId = String(d.boarder_id || "").trim();

  for (let i = 1; i < boarders.length; i++) {
    if ((bId && String(boarders[i][0]).trim() === bId) || String(boarders[i][1]).trim() === String(d.name).trim()) {
      targetPhone = boarders[i][7];
      bId = String(boarders[i][0]).trim(); 
      break;
    }
  }

  if (targetPhone && String(targetPhone).trim() !== "") {
    let stats = getProcessedMonthlyStats(isThisMonth);
    let member = stats.list.find(item => (bId && item.id.toLowerCase() === bId.toLowerCase()) || (d.name && item.name.toLowerCase() === String(d.name).trim().toLowerCase()));

    let myMeals   = member ? member.meals : 0;
    let myDep     = member ? member.dep : 0;
    let mealRate  = stats.rate;
    let myCost    = member ? member.cost : 0;
    let myBalance = member ? member.bal : 0;

    let depositMsg = `💳 *আইডিয়াল হোম মেস - টাকা জমার ডিজিটাল রসিদ*\n----------------------------------------\n👤 বর্ডারের নাম: *${d.name}*\n💰 নতুন জমা: *৳${amount}*\n📅 তারিখ: *${todayStr()}*\n👮 গ্রহণকারী: *${d.manager || "ম্যানেজার"}*\n\n📊 *চলতি মাসের আপডেট হিসাব:*\n• মোট জমা: ৳${myDep.toFixed(0)}\n• মোট মিল: ${myMeals} টি\n• বর্তমান মিল রেট: ৳${mealRate.toFixed(2)}\n• আনুমানিক মিল খরচ: ৳${myCost.toFixed(0)}\n• বর্তমান স্থিতি: *৳${Math.abs(myBalance).toFixed(0)}* (${myBalance >= 0 ? "পাওনা / Surplus" : "দেনা / Due"})\n----------------------------------------\nহিসাবে কোনো অমিল থাকলে ম্যানেজারের সাথে দ্রুত যোগাযোগ করুন।\nধন্যবাদ, আইডিয়াল হোম মেস।`;
    
    sendWhatsApp(targetPhone, depositMsg);

    sendMetaTemplate(targetPhone, "payment_confirmation_1", [
      d.name, 
      myDep.toFixed(0), 
      myCost.toFixed(0), 
      Math.abs(myBalance).toFixed(0) 
    ]);

    try {
      if (bId) PropertiesService.getScriptProperties().deleteProperty("LOW_BAL_SENT_" + bId);
    } catch(e) {}
  }
  return text("Success");
}

function addBoarder(d) {
  if (!d.name) return text("Error: name দেওয়া আবশ্যক!");
  let newPin = "1234"; 
  let phone = d.phone || "";
  let guardianPhone = d.guardian_phone || d.guardianPhone || "";

  let bSheet = ss.getSheetByName("Boarders");
  if (!bSheet) return text("Error: Boarders sheet not found!");

  // Ensure header has Guardian Number in column 9 if missing
  if (bSheet.getLastColumn() < 9) {
    bSheet.getRange(1, 9).setValue("Guardian Number");
  }

  bSheet.appendRow([
    d.id || uid(), d.name, d.amount || 0, "ON", "ON", newPin, "", phone, guardianPhone
  ]);

  logAudit("ADD_BOARDER", d.name + (guardianPhone ? " (Guardian: " + guardianPhone + ")" : ""), d.manager || "Manager");

  if (phone && String(phone).trim() !== "") {
    let waMsg = `🎉 স্বাগতম *${d.name}* ভাই!\nআপনাকে 'আইডিয়াল হোম' মেসে সফলভাবে যুক্ত করা হয়েছে।\n\nঅ্যাপে আপনি নিজের মিল ও খরচের বিস্তারিত হিসাব দেখতে পারবেন।\n🔐 আপনার লগইন পিন: *${newPin}*\n\nযেকোনো প্রয়োজনে ম্যানেজারের সাথে যোগাযোগ করুন।\n- আইডিয়াল হোম`;
    sendWhatsApp(phone, waMsg);
  }

  return text("Success");
}

function editBoarder(d) {
  let sh = ss.getSheetByName("Boarders");
  if (!sh) return text("Error: Boarders sheet not found!");
  let row = findRow(sh, d.boarder_id);
  if (row === -1) return text("Error: বর্ডার পাওয়া যায়নি!");

  if (d.name) sh.getRange(row, 2).setValue(d.name);
  if (d.phone !== undefined) sh.getRange(row, 8).setValue(d.phone);
  if (d.guardian_phone !== undefined) {
    if (sh.getLastColumn() < 9) sh.getRange(1, 9).setValue("Guardian Number");
    sh.getRange(row, 9).setValue(d.guardian_phone);
  }
  logAudit("EDIT_BOARDER", (d.name || d.boarder_id) + " (Phone/Guardian updated)", d.manager || "Manager");
  return text("Success");
}

function deleteBoarder(d) {
  let sh  = ss.getSheetByName("Boarders");
  if (!sh) return text("Error: Boarders sheet not found!");
  let row = findRow(sh, d.boarder_id);
  if (row === -1) return text("Error: বর্ডার পাওয়া যায়নি!");
  sh.deleteRow(row);
  logAudit("DELETE_BOARDER", d.name || "ID: " + d.boarder_id, d.manager || "Manager");
  return text("Success: Deleted");
}

// ২. নোটিশ আপডেট করার ফাংশন আপডেট
function updateNotice(d) {
  if (d.notice === undefined) return text("Error: notice দেওয়া হয়নি!");
  let setSh = ss.getSheetByName("Settings");
  if (setSh) setSh.getRange("C2").setValue(d.notice);
  notify("📢 নতুন নোটিশ", d.notice.substring(0, 100));

  let boarders = getSheet("Boarders");
  for (let i = 1; i < boarders.length; i++) {
    let phone = boarders[i][7]; 
    if (phone && String(phone).trim() !== "") {
      // এখানে mess_notice টেমপ্লেট ব্যবহার করা হয়েছে (প্যারামিটার: নোটিশের টেক্সট)
      sendMetaTemplate(phone, "mess_notice", [d.notice]);
    }
  }
  return text("Success: Updated");
}

function assignBazaar(d) {
  if (!d.name) return text("Error: name দেওয়া আবশ্যক!");
  let setSh = ss.getSheetByName("Settings");
  if (setSh) {
    setSh.getRange("D2").setValue(d.name);
    let dateStr = d.dates || todayStr();
    setSh.getRange("E2").setValue(dateStr);
  }
  let dateStr = d.dates || todayStr();
  
  let boarders = getSheet("Boarders");
  let phoneFound = false;
  
  for (let i = 1; i < boarders.length; i++) {
    if (String(boarders[i][0]).trim() === String(d.boarder_id).trim() || String(boarders[i][1]).trim() === String(d.name).trim()) {
      let phone = boarders[i][7]; 
      
      if (phone && String(phone).trim() !== "") {
        let assignMsg = `🛒 *আইডিয়াল হোম মেস - বাজারের দায়িত্ব বরাদ্দ*\n----------------------------------------\n👤 আসসালামু আলাইকুম *${d.name}* ভাই,\nআপনাকে আইডিয়াল হোম মেসের পরবর্তী বাজারের দায়িত্ব দেওয়া হয়েছে।\n\n📅 নির্ধারিত তারিখ: *${dateStr}*\n👮 দায়িত্ব দিয়েছেন: *${d.manager || "ম্যানেজার"}*\n\nদয়া করে সময়মতো প্রয়োজনীয় বাজার সম্পন্ন করে মেস অ্যাপে বা ম্যানেজারের কাছে ভাউচারসহ হিসাব জমা দিন।\n----------------------------------------\nধন্যবাদ, আইডিয়াল হোম মেস।`;
        sendWhatsApp(phone, assignMsg);
        sendMetaTemplate(phone, "notification", [d.name, dateStr]);
        phoneFound = true;
      }
      break;
    }
  }

  notify("🛒 বাজারের দায়িত্ব", d.name + " ভাইকে বাজারের দায়িত্ব দেওয়া হয়েছে।");
  
  if(!phoneFound) {
    return text("Success: " + d.name + "-কে দায়িত্ব দেওয়া হয়েছে, কিন্তু শিটে ফোন নম্বর না থাকায় WhatsApp এ মেসেজ যায়নি!");
  }
  return text("Success: " + d.name + "-কে বাজারের দায়িত্ব দেওয়া হয়েছে এবং WhatsApp এ মেসেজ পাঠানো হয়েছে!");
}

function changeManager(d) {
  if (!d.name) return text("Error: name দেওয়া আবশ্যক!");
  let setSh = ss.getSheetByName("Settings");
  if (setSh) setSh.getRange("A2").setValue(d.name);
  logAudit("CHANGE_MANAGER", "New Manager: " + d.name, "System");
  return text("Success: " + d.name + " এখন নতুন ম্যানেজার!");
}

function changeManagerPin(d) {
  if (!d.new_pin || String(d.new_pin).trim() === "") return text("Error: নতুন পিন দেওয়া হয়নি!");
  let setSh = ss.getSheetByName("Settings");
  if (setSh) setSh.getRange("B2").setValue(String(d.new_pin).trim());
  logAudit("CHANGE_MANAGER_PIN", "PIN updated", d.manager || "Manager");
  return text("Success: ম্যানেজার পিন পরিবর্তন হয়েছে!");
}

function editDepositById(d) {
  let sh = ss.getSheetByName("Deposits");
  if (!sh) return text("Error: Deposits sheet not found!");
  let row = findRow(sh, d.id);
  if (row === -1) return text("Error: জমা রেকর্ড পাওয়া যায়নি!");
  
  let amount = Number(d.amount);
  if (isNaN(amount) || amount <= 0) return text("Error: সঠিক টাকার পরিমাণ দিন!");
  
  let oldData = sh.getRange(row, 1, 1, 6).getValues()[0];
  let oldAmount = oldData[4] || 0;
  let bName = oldData[3] || "Unknown";

  if (d.boarder_id) sh.getRange(row, 3).setValue(String(d.boarder_id).trim());
  if (d.name) sh.getRange(row, 4).setValue(String(d.name).trim());
  sh.getRange(row, 5).setValue(amount);
  let note = `[Edit: ${todayStr()}] ৳${oldAmount} -> ৳${amount}`;
  sh.getRange(row, 6).setValue((oldData[5] ? oldData[5] + " | " : "") + note);

  logAudit("EDIT_DEPOSIT", `${d.name || bName}: ৳${oldAmount} -> ৳${amount}`, d.manager || "Manager");

  try {
    let boarders = getSheet("Boarders");
    let targetPhone = "";
    let bId = String(d.boarder_id || oldData[2] || "").trim();
    for (let i = 1; i < boarders.length; i++) {
      if ((bId && String(boarders[i][0]).trim() === bId) || String(boarders[i][1]).trim() === String(d.name || bName).trim()) {
        targetPhone = boarders[i][7];
        break;
      }
    }
    if (targetPhone && String(targetPhone).trim() !== "") {
      let editMsg = `💳 *আইডিয়াল হোম মেস - জমা সংশোধনের রসিদ*\n----------------------------------------\n👤 বর্ডার: *${d.name || bName}*\n💰 সংশোধিত জমা: *৳${amount}* (পূর্বের জমা: ৳${oldAmount})\n📅 তারিখ: *${todayStr()}*\n👮 ম্যানেজার: *${d.manager || "ম্যানেজার"}*\n----------------------------------------\nআপনার জমার পরিমাণ সিস্টেমে সফলভাবে সংশোধন করা হয়েছে। ধন্যবাদ!`;
      sendWhatsApp(targetPhone, editMsg);
    }
  } catch(e) {}

  return text("Success: জমা এডিট সফল হয়েছে!");
}

function editBazaarById(d) {
  let sh = ss.getSheetByName("Transactions");
  if (!sh) return text("Error: Transactions sheet not found!");
  let row = findRow(sh, d.id);
  if (row === -1) return text("Error: খরচের রেকর্ড পাওয়া যায়নি!");
  
  let cost = Number(d.cost);
  if (isNaN(cost) || cost <= 0) return text("Error: সঠিক খরচের পরিমাণ দিন!");
  
  let oldData = sh.getRange(row, 1, 1, 6).getValues()[0];
  let oldItem = oldData[3];
  let oldCost = oldData[4];

  if (d.item) sh.getRange(row, 4).setValue(d.item);
  sh.getRange(row, 5).setValue(cost);

  let note = `[Edit: ${todayStr()}] ${oldItem}(৳${oldCost}) -> ${d.item || oldItem}(৳${cost})`;
  sh.getRange(row, 6).setValue((oldData[5] ? oldData[5] + " | " : "") + note);

  logAudit("EDIT_EXPENSE", `${oldItem}(৳${oldCost}) -> ${d.item || oldItem}(৳${cost})`, d.manager || "Manager");
  return text("Success: বাজার এডিট হয়েছে!");
}

function deleteBazaarById(d) {
  let sh = ss.getSheetByName("Transactions");
  if (!sh) return text("Error: Transactions sheet not found!");
  let row = findRow(sh, d.id);
  if (row === -1) return text("Error: খরচের রেকর্ড পাওয়া যায়নি!");
  
  let oldData = sh.getRange(row, 1, 1, 5).getValues()[0];
  let oldItem = oldData[3];
  let oldCost = oldData[4];
  sh.deleteRow(row);
  logAudit("DELETE_EXPENSE", `Deleted: ${oldItem} (৳${oldCost})`, d.manager || "Manager");
  return text("Success: বাজার ডিলিট হয়েছে!");
}

function getTodaysMeals() {
  let mSheet = ss.getSheetByName("Meals");
  let bSheet = ss.getSheetByName("Boarders");
  if (!mSheet || !bSheet) return json([]);

  let mData       = mSheet.getDataRange().getValues();
  let bData       = bSheet.getDataRange().getValues();
  let today       = todayStr();
  let todaysMeals = [];

  for (let i = 1; i < bData.length; i++) {
    let bId    = String(bData[i][0]).trim();
    let bName  = String(bData[i][1]).trim();
    let lunch  = 0;
    let dinner = 0;

    for (let j = 1; j < mData.length; j++) {
      if (!mData[j][1]) continue;
      if (String(mData[j][2]).trim() === bId && getExactDate(mData[j][1]) === today) {
        lunch  = Number(mData[j][4]);
        dinner = Number(mData[j][5]);
        break;
      }
    }
    todaysMeals.push({ boarder_id: bId, name: bName, lunch: lunch, dinner: dinner });
  }
  return json(todaysMeals);
}

function addDailyMeals(d) {
  let lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return text("Error: সিস্টেম ব্যস্ত, কিছুক্ষণ পর চেষ্টা করুন।");

  try {
    let mSheet = ss.getSheetByName("Meals");
    let bSheet = ss.getSheetByName("Boarders");
    let today  = todayStr();

    let mData    = mSheet.getDataRange().getValues();
    let existMap = {};
    for (let i = 1; i < mData.length; i++) {
      if (!mData[i][1]) continue;
      let key = String(mData[i][2]).trim() + "_" + getExactDate(mData[i][1]);
      existMap[key] = i + 1; 
    }

    let bData = bSheet ? bSheet.getDataRange().getValues() : [];
    let bRowMap = {};
    for (let i = 1; i < bData.length; i++) {
      bRowMap[String(bData[i][0]).trim()] = i + 1;
    }

    d.mealsList.forEach(function (m) {
      let bId  = String(m.boarder_id).trim();
      let key  = bId + "_" + today;
      let lVal = Number(m.lunch)  || 0;
      let dVal = Number(m.dinner) || 0;

      if (existMap[key] !== undefined) {
        mSheet.getRange(existMap[key], 5).setValue(lVal);
        mSheet.getRange(existMap[key], 6).setValue(dVal);
      } else {
        let newRow = mSheet.getLastRow() + 1;
        mSheet.getRange(newRow, 1, 1, 6).setValues([[uid(), todayStr(), bId, m.name || "", lVal, dVal]]);
        existMap[key] = newRow;
      }

      // Sync Boarders sheet ON/OFF for today
      if (bSheet && bRowMap[bId]) {
        bSheet.getRange(bRowMap[bId], 4).setValue(lVal > 0 ? "ON" : "OFF");
        bSheet.getRange(bRowMap[bId], 5).setValue(dVal > 0 ? "ON" : "OFF");
      }
    });
    logAudit("ADD_DAILY_MEALS", "Batch update completed", d.manager || "Manager");
    return text("Success: মিল সেভ হয়েছে!");
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// AI INTEGRATION
// ==========================================
function getAI(data) {
  if (!CONFIG.GEMINI_KEY) return text("Error: AI Key is missing.");
  
  let transactions = getSheet("Transactions");
  let stats = getProcessedMonthlyStats(isThisMonth);
  
  let totalExp   = stats.totalExp;
  let totalDep   = stats.totalDep;
  let totalMeals = stats.totalMeals;
  let rate       = stats.rate;
  let todaysBazaar = "";
  let today = todayStr();

  transactions.slice(1).filter(r => isThisMonth(r[1])).forEach(r => { 
    if(getExactDate(r[1]) === today) {
        todaysBazaar += r[3] + ", ";
    }
  });

  let bazaarInfo = todaysBazaar !== "" ? todaysBazaar : "আজ কোনো বাজার হয়নি";

  let prompt = `তুমি 'আইডিয়াল হোম' মেসের মুসলিম এআই ম্যানেজার। বর্তমান তথ্য — চলতি মাসের মোট জমা: ${totalDep} টাকা, মোট খরচ: ${totalExp} টাকা, বর্তমান মিল রেট: ${rate.toFixed(2)} টাকা। আজকের বাজারে আনা হয়েছে: ${bazaarInfo}। এই তথ্যের ভিত্তিতে  স্বাস্থ্যকর লাঞ্চ ও ডিনার মেন্যু এবং বাজেট ঠিক রাখার ১টি টিপস ৫-৬ লাইনের মধ্যে বাংলায় দাও।`;
  
  let modelName = CONFIG.GEMINI_MODEL || "gemini-3.5-flash";
  try {
    let res = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent",
      {
        method: "post", 
        contentType: "application/json", 
        headers: { "X-goog-api-key": CONFIG.GEMINI_KEY },
        payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), 
        muteHttpExceptions: true
      }
    );
    
    let j = JSON.parse(res.getContentText());
    if (j.error) { return text("AI API Error: " + j.error.message); }
    if (j.candidates && j.candidates.length > 0 && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.length > 0) {
      return text(j.candidates[0].content.parts[0].text);
    }
    return text("দুঃখিত, এআই এই মুহূর্তে উত্তর দিতে পারছে না।");
  } catch (e) { 
    return text("সার্ভার কানেকশন এরর: " + e.toString()); 
  }
}

// ==========================================
// REPORTS & MONTHLY JOB (BEAUTIFUL PDF DESIGN & CRON)
// ==========================================
function getProcessedMonthlyStats(filterFn) {
  let boarders = getSheet("Boarders");
  let deposits = getSheet("Deposits");
  let transactions = getSheet("Transactions");
  let meals = getSheet("Meals");

  let isTargetMonth = filterFn || isThisMonth;

  let currentExpenses = transactions.slice(1).filter(r => isTargetMonth(r[1]));
  let currentDeposits = deposits.slice(1).filter(r => isTargetMonth(r[1]));
  let currentMeals    = meals.slice(1).filter(r => isTargetMonth(r[1]));

  let totalExp = currentExpenses.reduce((s, r) => s + (Number(r[4]) || 0), 0);

  let normStr = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  let boarderMap = {};
  let list = [];
  for (let i = 1; i < boarders.length; i++) {
    let bId = String(boarders[i][0] || "").trim();
    let bName = String(boarders[i][1] || "").trim();
    let phone = boarders[i][7] ? String(boarders[i][7]).trim() : "";
    let item = {
      id: bId,
      name: bName,
      phone: phone,
      meals: 0,
      dep: 0,
      cost: 0,
      bal: 0,
      isGuest: false
    };
    list.push(item);
    if (bId) boarderMap["id_" + normStr(bId)] = item;
    if (bName) boarderMap["name_" + normStr(bName)] = item;
  }

  let unassignedMeals = 0;
  let unassignedDep = 0;

  currentMeals.forEach(r => {
    let m = (Number(r[4]) || 0) + (Number(r[5]) || 0);
    if (m === 0) return;
    let rId = normStr(r[2]);
    let rName = normStr(r[3]);

    let target = (rId && boarderMap["id_" + rId]) ? boarderMap["id_" + rId] : null;
    if (!target && rName && boarderMap["name_" + rName]) target = boarderMap["name_" + rName];
    if (!target && rId && boarderMap["name_" + rId]) target = boarderMap["name_" + rId];

    if (target) {
      target.meals += m;
    } else {
      unassignedMeals += m;
    }
  });

  currentDeposits.forEach(r => {
    let dep = Number(r[4]) || 0;
    let rId = normStr(r[2]);
    let rName = normStr(r[3]);

    let target = (rId && boarderMap["id_" + rId]) ? boarderMap["id_" + rId] : null;
    if (!target && rName && boarderMap["name_" + rName]) target = boarderMap["name_" + rName];
    if (!target && rId && boarderMap["name_" + rId]) target = boarderMap["name_" + rId];

    if (target) {
      target.dep += dep;
    } else {
      unassignedDep += dep;
    }
  });

  if (unassignedMeals > 0 || unassignedDep > 0) {
    list.push({
      id: "GUEST_EXTRA",
      name: "গেস্ট মিল / অতিরিক্ত (Guest / Extra)",
      phone: "",
      meals: unassignedMeals,
      dep: unassignedDep,
      cost: 0,
      bal: 0,
      isGuest: true
    });
  }

  let totalMeals = list.reduce((s, item) => s + item.meals, 0);
  let rate = totalMeals > 0 ? (totalExp / totalMeals) : 0;
  let totalDep = 0;
  let totalCost = 0;

  list.forEach(item => {
    item.cost = item.meals * rate;
    item.bal = item.dep - item.cost;
    totalDep += item.dep;
    totalCost += item.cost;
  });

  return {
    list: list,
    totalExp: totalExp,
    totalMeals: totalMeals,
    totalDep: totalDep,
    totalCost: totalCost,
    rate: rate,
    unassignedMeals: unassignedMeals
  };
}

function getBeautifulPdfTemplate(monthStr, totalExp, rate, rows, totalDep, totalMeals) {
  let netBal = (totalDep !== undefined) ? (totalDep - totalExp) : 0;
  let totalRow = (totalDep !== undefined && totalMeals !== undefined) ? `
        <tfoot>
          <tr style="background-color: #e0e7ff; font-weight: bold; border-top: 2px solid #4f46e5;">
            <td class="t-left">সর্বমোট (Total)</td>
            <td style="color:#0284c7;">৳${totalDep.toFixed(0)}</td>
            <td>${totalMeals}</td>
            <td style="color:#ea580c;">৳${totalExp.toFixed(0)}</td>
            <td style="color:${netBal >= 0 ? '#16a34a' : '#ef4444'}; font-weight:bold;">${netBal >= 0 ? '+' : '-'}৳${Math.abs(netBal).toFixed(0)}</td>
          </tr>
        </tfoot>` : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { font-family: sans-serif; margin: 0; padding: 20px; background-color: #f8fafc; }
    .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background-color: #4f46e5; padding: 30px 20px; text-align: center; color: white; }
    .header h1 { margin: 0 0 5px 0; font-size: 26px; font-weight: bold; }
    .header p { margin: 0; font-size: 12px; opacity: 0.9; letter-spacing: 1px; text-transform: uppercase; }
    .badge { margin-top: 15px; display: inline-block; background-color: rgba(255,255,255,0.2); padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: bold; }
    .summary { display: table; width: 100%; margin-top: 20px; padding: 0 20px; box-sizing: border-box; }
    .box { display: table-cell; width: 48%; background: white; padding: 15px; text-align: center; border: 1px solid #e2e8f0; border-top: 4px solid #ef4444; border-radius: 8px; }
    .box.rate { border-top-color: #f97316; }
    .spacer { display: table-cell; width: 4%; }
    .label { font-size: 11px; color: #64748b; font-weight: bold; margin: 0 0 5px 0; text-transform: uppercase; }
    .val { font-size: 22px; font-weight: bold; margin: 0; color: #ef4444; }
    .val.rate { color: #f97316; }
    .table-wrap { padding: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th { background-color: #4f46e5 !important; color: #ffffff !important; padding: 12px 10px; font-size: 13px; text-align: right; }
    th.t-left { text-align: left; }
    td { padding: 10px; font-size: 13px; text-align: right; border-bottom: 1px solid #f1f5f9; color: #334155; }
    td.t-left { text-align: left; font-weight: bold; color: #1e293b; }
    tfoot td { padding: 12px 10px; font-size: 13px; font-weight: bold; }
    tr:nth-child(even) { background-color: #f8fafc; }
    .footer { background-color: #1e293b; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.6; }
  </style>
  </head><body>
  <div class="container">
    <div class="header">
      <h1>আইডিয়াল হোম</h1>
      <p>টিকরপাড়া · Students Mess</p>
      <div class="badge">মাসিক হিসাব — ${monthStr}</div>
    </div>
    <div class="summary">
      <div class="box"><p class="label">মোট খরচ</p><p class="val">৳${totalExp.toFixed(0)}</p></div>
      <div class="spacer"></div>
      <div class="box rate"><p class="label">মিল রেট</p><p class="val rate">৳${rate.toFixed(2)}</p></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th class="t-left">নাম</th><th>জমা</th><th>মিল</th><th>খরচ</th><th>ব্যালেন্স</th></tr></thead>
        <tbody>${rows}</tbody>
        ${totalRow}
      </table>
    </div>
    <div class="footer">
      ম্যানেজারের সেবায় কোনো ত্রুটি হয়ে থাকলে ক্ষমাসুন্দর দৃষ্টিতে দেখবেন।<br>সবার সহযোগিতায় মেস পরিচালনা সম্ভব হচ্ছে।<br>
      <span style="color: #475569; display: block; margin-top: 8px;">— আইডিয়াল হোম পরিবার —</span>
    </div>
  </div>
  </body></html>`;
}

function generateMonthlyReport() {
  let stats = getProcessedMonthlyStats(isThisMonth);
  let rows = "";

  stats.list.forEach(item => {
    let balColor = item.bal >= 0 ? '#16a34a' : '#ef4444';
    let rowBg = item.isGuest ? 'background-color:#fffbeb;' : '';
    rows += `<tr style="${rowBg}">
      <td class="t-left">${item.isGuest ? '<strong>' + item.name + '</strong>' : item.name}</td>
      <td style="color:#0284c7;">৳${item.dep.toFixed(0)}</td>
      <td>${item.meals}</td>
      <td style="color:#ea580c;">৳${item.cost.toFixed(0)}</td>
      <td style="color:${balColor}; font-weight:bold;">${item.bal >= 0 ? '+' : '-'}৳${Math.abs(item.bal).toFixed(0)}</td>
    </tr>`;
  });

  let html = getBeautifulPdfTemplate(todayStr(), stats.totalExp, stats.rate, rows, stats.totalDep, stats.totalMeals);
  let blob = Utilities.newBlob(html, "text/html").getAs("application/pdf");
  let file = DriveApp.createFile(blob.setName("IdealHome_Report_" + todayStr() + ".pdf"));
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(e) {}
  return file.getUrl();
}

function generateMonthlyReportForPrevMonth(stats, prevMonth) {
  let rows = "";
  stats.list.forEach(item => {
    let balColor = item.bal >= 0 ? '#16a34a' : '#ef4444';
    let rowBg = item.isGuest ? 'background-color:#fffbeb;' : '';
    rows += `<tr style="${rowBg}">
      <td class="t-left">${item.isGuest ? '<strong>' + item.name + '</strong>' : item.name}</td>
      <td style="color:#0284c7;">৳${item.dep.toFixed(0)}</td>
      <td>${item.meals}</td>
      <td style="color:#ea580c;">৳${item.cost.toFixed(0)}</td>
      <td style="color:${balColor}; font-weight:bold;">${item.bal >= 0 ? '+' : '-'}৳${Math.abs(item.bal).toFixed(0)}</td>
    </tr>`;
  });

  let monthStr = Utilities.formatDate(prevMonth, "Asia/Dhaka", "MMMM yyyy");
  let html = getBeautifulPdfTemplate(monthStr, stats.totalExp, stats.rate, rows, stats.totalDep, stats.totalMeals);
  let blob = Utilities.newBlob(html, "text/html").getAs("application/pdf");
  let file = DriveApp.createFile(blob.setName("IdealHome_Report_" + Utilities.formatDate(prevMonth, "Asia/Dhaka", "yyyy_MM") + ".pdf"));
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(e) {}
  return file.getUrl();
}

function monthlyJob() {
  try {
    let nowD = new Date();
    let prevMonth = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
    let monthStrForWa = Utilities.formatDate(prevMonth, "Asia/Dhaka", "MMMM yyyy");
    
    let isPrevMonth = (dStr) => {
      if(!dStr) return false;
      let d = new Date(getExactDate(dStr));
      return d.getMonth() === prevMonth.getMonth() && d.getFullYear() === prevMonth.getFullYear();
    };

    let stats = getProcessedMonthlyStats(isPrevMonth);
    let url = generateMonthlyReportForPrevMonth(stats, prevMonth);
    let archive = ss.getSheetByName("Archives");
    if (!archive) {
      archive = ss.insertSheet("Archives");
      archive.appendRow(["Month", "Report URL"]);
    }
    if (archive && url) archive.appendRow([monthStrForWa, url]);

    let monthlyMsgList = [];
    stats.list.filter(item => !item.isGuest).forEach(item => {
      if (item.phone && String(item.phone).trim() !== "") {
        let balColor = item.bal >= 0 ? "পাওনা" : "দেনা";
        let waMsg = `📊 *আইডিয়াল হোম মেস - মাসিক ব্যালেন্স রিপোর্ট*\n----------------------------------------\n📅 মাস: *${monthStrForWa}*\n👤 বর্ডার: *${item.name}*\n\n🍽️ মোট মিল: *${item.meals}* টি\n💵 জমা টাকা: *৳${item.dep.toFixed(0)}*\n📈 গড় মিল রেট: *৳${stats.rate.toFixed(2)}*\n📉 মিল বাবদ খরচ: *৳${item.cost.toFixed(0)}*\n\n💰 *হিসাবের স্থিতি:* \n👉 *৳${Math.abs(item.bal).toFixed(0)}* (${item.bal >= 0 ? "পাওনা (মেস থেকে ফেরত পাবেন)" : "দেনা (ম্যানেজারকে পরিশোধ করুন)"})\n----------------------------------------\nহিসাবে কোনো প্রশ্ন থাকলে ম্যানেজারের সাথে দ্রুত যোগাযোগ করুন। ধন্যবাদ!`;
        monthlyMsgList.push({ phone: item.phone, message: waMsg });
      }
    });
    broadcastWhatsAppList(monthlyMsgList);

    notify("📄 নতুন মাস শুরু", "গত মাসের হিসাব আর্কাইভে সেভ হয়েছে এবং সবাইকে WhatsApp-এ হিসেব পাঠানো হয়েছে।");
    logAudit("MONTHLY_JOB", "End-of-month archive & WhatsApp sent.", "System");
    clearInitialDataCache();
  } catch (e) {
    logAudit("MONTHLY_JOB_ERROR", e.toString(), "System");
  }
}
  
function testMailPermission() {
  var myEmail = Session.getActiveUser().getEmail();
  MailApp.sendEmail(myEmail, "Permission Test", "আপনার অ্যাপ এখন ইমেইল পাঠাতে প্রস্তুত!");
}

// ==========================================
// DAILY AUTOMATIC MEAL COUNT (CRON JOB)
// ==========================================
function dailyJob() {
  let bSheet = ss.getSheetByName("Boarders");
  let mSheet = ss.getSheetByName("Meals");
  if (!bSheet || !mSheet) return;

  let bData = bSheet.getDataRange().getValues();
  let mData = mSheet.getDataRange().getValues();
  let today = todayStr();

  let existingBoarders = {};
  for(let i = 1; i < mData.length; i++) {
    if(mData[i][1] && getExactDate(mData[i][1]) === today) {
      let bId = String(mData[i][2]).trim();
      existingBoarders[bId] = true;
    }
  }
  
  let newMeals = [];
  for (let i = 1; i < bData.length; i++) {
    let bId = String(bData[i][0]).trim();
    
    if(!existingBoarders[bId]) {
        let bName = String(bData[i][1]).trim();
        let l_status = String(bData[i][3]).trim();
        let d_status = String(bData[i][4]).trim();

        let l_val = (l_status === "OFF") ? 0 : 1;
        let d_val = (d_status === "OFF") ? 0 : 1;

        newMeals.push([uid(), today, bId, bName, l_val, d_val]);
    }
  }

  if (newMeals.length > 0) {
    mSheet.getRange(mSheet.getLastRow() + 1, 1, newMeals.length, 6).setValues(newMeals);
    clearInitialDataCache();
  }

  // Automatically check low balances and send WhatsApp alert (with 48-hour anti-spam guard)
  try {
    checkAndNotifyLowBalances({ action: "CRON_LOW_BAL", manager: "System", threshold: 200 });
  } catch(e) {}
}

// ==========================================
// NOTIFICATION REMINDERS (TRIGGERS)
// ==========================================
function sendBazaarReminder() {
  let settings = getSheet("Settings");
  if (settings.length > 1 && settings[1][3]) {
    let assignedName = settings[1][3];
    notify("🛒 বাজার রিমাইন্ডার", assignedName + " ভাই, আপনার বাজারের দায়িত্ব রয়েছে। মেসের বাজার করতে ভুলবেন না!");
  }
}

function mealClosureAlerts() {
  let hour = parseInt(Utilities.formatDate(new Date(), "Asia/Dhaka", "HH"), 10);
  
  if (hour >= 9 && hour <= 11) {
    notify("⏳ লাঞ্চ রিমাইন্ডার", "বেলা ১১:৩০ এর পর লাঞ্চ অফ করা যাবে না। যারা খাবেন না, এখনই অ্যাপ থেকে অফ করে দিন।");
  } 
  else if (hour >= 17 && hour <= 19) {
    notify("⏳ ডিনার রিমাইন্ডার", "সন্ধ্যা ৭:৩০ এর পর ডিনার অফ করা যাবে না। যারা খাবেন অ্যাক্টিভ করতে ভুলবেন না।");
  } 
  else {
    notify("⏳ মিল আপডেট", "আপনার আজকের মিলের স্ট্যাটাস অ্যাপ থেকে চেক করে নিন।");
  }
}

function manualArchiveCurrentMonth(d) {
  let url = generateMonthlyReport(); 
  let archiveSheet = ss.getSheetByName("Archives");
  let currentMonthStr = Utilities.formatDate(new Date(), "Asia/Dhaka", "MMMM yyyy").trim();
  
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet("Archives");
    archiveSheet.appendRow(["Month", "Report URL"]);
  }
  
  if(archiveSheet && url) {
     let data = archiveSheet.getDataRange().getValues();
     let foundRow = -1;
     
     for(let i=0; i < data.length; i++) {
       if(String(data[i][0]).trim() === currentMonthStr) {
         foundRow = i + 1;
         break;
       }
     }
     
     if(foundRow !== -1) {
       archiveSheet.getRange(foundRow, 2).setValue(url);
     } else {
       archiveSheet.appendRow([currentMonthStr, url]);
     }
     
     logAudit("MANUAL_ARCHIVE", currentMonthStr, d.manager || "Manager");
     try {
       broadcastMonthlySummary(d);
     } catch(e) {}
     return text("Success: চলতি মাসের হিসাব আর্কাইভে সেভ হয়েছে এবং সবার WhatsApp-এ মাসিক ব্যালেন্স রিপোর্ট পাঠানো হয়েছে!");
  }
  return text("Error: আর্কাইভ করতে সমস্যা হয়েছে!");
}

function broadcastMonthlySummary(d) {
  let stats = getProcessedMonthlyStats(isThisMonth);
  let currentMonthName = Utilities.formatDate(new Date(), "Asia/Dhaka", "MMMM yyyy");

  let sentCount = 0;
  let skippedCount = 0;
  let broadcastList = [];

  stats.list.filter(item => !item.isGuest).forEach(item => {
    if (item.phone && String(item.phone).trim() !== "") {
      let balText = item.bal >= 0 ? `৳${Math.abs(item.bal).toFixed(0)} (মেস থেকে ফেরত পাবেন / Surplus)` : `৳${Math.abs(item.bal).toFixed(0)} (ম্যানেজারকে পরিশোধ করুন / Due)`;

      let waSummary = `📊 *আইডিয়াল হোম মেস - মাসিক ব্যালেন্স রিপোর্ট*\n----------------------------------------\n📅 মাস: *${currentMonthName}*\n👤 বর্ডার: *${item.name}*\n\n🍽️ চলতি মাসের মোট মিল: *${item.meals}* টি\n💵 আপনার মোট জমা: *৳${item.dep.toFixed(0)}*\n📈 বর্তমান মিল রেট: *৳${stats.rate.toFixed(2)}*\n📉 মোট মিল বাবদ খরচ: *৳${item.cost.toFixed(0)}*\n\n💰 *হিসাবের স্থিতি:* \n👉 *${balText}*\n----------------------------------------\nহিসাবে কোনো প্রশ্ন থাকলে ম্যানেজারের সাথে সরাসরি যোগাযোগ করুন।\nধন্যবাদ, আইডিয়াল হোম মেস।`;

      broadcastList.push({ phone: item.phone, message: waSummary });
    } else {
      skippedCount++;
    }
  });

  sentCount = broadcastWhatsAppList(broadcastList);

  logAudit("BROADCAST_MONTHLY_SUMMARY", `Sent to ${sentCount} boarders, Skipped: ${skippedCount}`, d.manager || "Manager");
  notify("📢 মাসিক ব্যালেন্স প্রেরিত", `${sentCount} জন বর্ডারের WhatsApp-এ চলতি মাসের ব্যালেন্স রিপোর্ট পাঠানো হয়েছে।`);

  return json({
    status: "success",
    sent: sentCount,
    skipped: skippedCount,
    message: `সফলভাবে ${sentCount} জন বর্ডারের WhatsApp-এ মাসিক ব্যালেন্স রিপোর্ট পাঠানো হয়েছে!`
  });
}

function checkAndNotifyLowBalances(d) {
  let isManual = (d && d.action === "SEND_LOW_BALANCE_ALERTS");
  let managerName = (d && d.manager) ? d.manager : "মেস ম্যানেজার";
  let threshold = (d && d.threshold) ? Number(d.threshold) : 200; // Low balance if <= 200 Tk

  let stats = getProcessedMonthlyStats(isThisMonth);
  let props = PropertiesService.getScriptProperties();
  let nowMs = Date.now();
  let sentCount = 0;
  let lowBoarders = [];
  let alertList = [];

  stats.list.filter(item => !item.isGuest).forEach(item => {
    let bId = item.id;
    let bName = item.name;
    let phone = item.phone;
    let m = item.meals;
    let dep = item.dep;
    let cost = item.cost;
    let bal = item.bal;

    // Check if balance is low or negative (due)
    if (bal <= threshold) {
      lowBoarders.push({ id: bId, name: bName, bal: bal });

      if (phone && String(phone).trim() !== "") {
        // Anti-spam check for automatic cron: don't alert the same boarder more than once every 48 hours
        if (!isManual) {
          let lastSent = Number(props.getProperty("LOW_BAL_SENT_" + bId) || 0);
          if (nowMs - lastSent < 48 * 60 * 60 * 1000) {
            return; // Skip, already alerted recently
          }
        }

        let alertMsg = "";
        if (bal < 0) {
          alertMsg = `⚠️ *আইডিয়াল হোম মেস - বকেয়া পরিশোধের নোটিশ*\n----------------------------------------\n👤 প্রিয় বর্ডার: *${bName} ভাই*\n📅 তারিখ: *${todayStr()}*\n\nআপনার মেসের অ্যাকাউন্টে বকেয়া তৈরি হয়েছে:\n💵 আপনার মোট জমা: ৳${dep.toFixed(0)}\n🍽️ চলতি মাসের মোট মিল: ${m} টি\n📈 বর্তমান মিল রেট: ৳${mealRate.toFixed(2)}\n📉 মোট মিল খরচ: ৳${cost.toFixed(0)}\n\n🚨 *বর্তমান বকেয়া (Due): ৳${Math.abs(bal).toFixed(0)}*\n----------------------------------------\n👉 মেসের সুষ্ঠু বাজার পরিচালনার সুবিধার্থে অনুগ্রহ করে অতিসত্বর বকেয়া টাকা পরিশোধের অনুরোধ করা হচ্ছে।\n👮 যোগাযোগ: *${managerName}*\nধন্যবাদ, আইডিয়াল হোম মেস।`;
        } else {
          let remainingMeals = mealRate > 0 ? Math.floor(bal / mealRate) : 0;
          alertMsg = `⚠️ *আইডিয়াল হোম মেস - ব্যালেন্স সতর্কবার্তা*\n----------------------------------------\n👤 প্রিয় বর্ডার: *${bName} ভাই*\n📅 তারিখ: *${todayStr()}*\n\nআপনার মেসের মিল অ্যাকাউন্টের ব্যালেন্স কমে এসেছে:\n💵 আপনার মোট জমা: ৳${dep.toFixed(0)}\n🍽️ চলতি মাসের মোট মিল: ${m} টি\n📉 অবশিষ্ট স্থিতি: *৳${bal.toFixed(0)}* (আর মাত্র প্রায় ${remainingMeals} টি মিল হতে পারে)\n----------------------------------------\n👉 নির্বিঘ্নে খাবার চালু রাখতে দয়া করে দ্রুত মেসের অ্যাকাউন্টে টাকা জমা দেওয়ার অনুরোধ করা হচ্ছে।\n👮 যোগাযোগ: *${managerName}*\nধন্যবাদ, আইডিয়াল হোম মেস।`;
        }

        alertList.push({ phone: phone, message: alertMsg });
        props.setProperty("LOW_BAL_SENT_" + bId, String(nowMs));
      }
    }
  });

  sentCount = broadcastWhatsAppList(alertList);

  logAudit("LOW_BALANCE_ALERTS", `Sent to ${sentCount} boarders (Total low: ${lowBoarders.length})`, managerName);
  return json({
    status: "success",
    sent: sentCount,
    total_low: lowBoarders.length,
    message: `${sentCount} জন বর্ডারের WhatsApp-এ লো-ব্যালেন্স সতর্কবার্তা পাঠানো হয়েছে!`
  });
}

function getWhatsAppQR(d) {
  let waCfg = getWaConfig();
  let defaultBotPhone = "8801616445343";
  let defaultChatUrl = `https://wa.me/${defaultBotPhone}`;
  let defaultQr = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(defaultChatUrl)}`;
  
  let renderBot = {
    url: waCfg.RENDER_BOT_URL || "",
    connected: false,
    qr_image: "",
    user: null
  };

  // Check Render Bot status if configured
  if (waCfg.RENDER_BOT_URL) {
    try {
      let statusUrl = waCfg.RENDER_BOT_URL.replace(/\/+$/, "") + "/status";
      let res = UrlFetchApp.fetch(statusUrl, { "muteHttpExceptions": true });
      if (res.getResponseCode() === 200) {
        let st = JSON.parse(res.getContentText());
        renderBot.connected = !!st.connected;
        renderBot.qr_image = st.qr || "";
        renderBot.user = st.user || null;
      }
    } catch(e) {}
  }

  let finalConnected = renderBot.url ? renderBot.connected : true;
  let finalQr = (renderBot.url && renderBot.qr_image) ? renderBot.qr_image : defaultQr;
  let finalPhone = (renderBot.user && renderBot.user.id) ? renderBot.user.id.split(":")[0] : defaultBotPhone;
  let finalChatUrl = `https://wa.me/${finalPhone}`;

  return json({
    status: "success",
    connected: finalConnected,
    render_bot: renderBot,
    bot_phone: finalPhone,
    chat_url: finalChatUrl,
    qr_url: finalQr,
    wawp: {
      instance_id: waCfg.INSTANCE_ID
    }
  });
}

function updateWhatsAppConfig(d) {
  let props = PropertiesService.getScriptProperties();
  if (d.render_bot_url !== undefined) props.setProperty("RENDER_BOT_URL", String(d.render_bot_url).trim());
  if (d.instance_id) props.setProperty("WA_INSTANCE_ID", String(d.instance_id).trim());
  if (d.access_token) props.setProperty("WA_ACCESS_TOKEN", String(d.access_token).trim());
  if (d.base_url) props.setProperty("WA_BASE_URL", String(d.base_url).trim());
  
  logAudit("UPDATE_WA_CONFIG", "WhatsApp Bot configuration updated", d.manager || "Manager");
  return json({ status: "success", message: "WhatsApp সেটিংস সফলভাবে আপডেট হয়েছে!" });
}

function testWhatsAppMessage(d) {
  let phone = d.phone || d.sender;
  if (!phone) {
    let boarders = getSheet("Boarders");
    if (boarders.length > 1 && boarders[1][7]) phone = boarders[1][7];
  }
  if (!phone) return json({ status: "error", message: "কোনো বৈধ ফোন নম্বর পাওয়া যায়নি।" });

  let testText = `🤖 *আইডিয়াল হোম মেস - WhatsApp বট সংযোগ সফল!*\n----------------------------------------\nআপনার প্রাইভেট বট ইঞ্জিন সফলভাবে লাইভ হয়েছে এবং মেসেজ প্রেরণে প্রস্তুত।\n📅 সময়: ${now()}\n----------------------------------------\nধন্যবাদ! ✨`;
  sendWhatsApp(phone, testText);
  return json({ status: "success", message: `টেস্ট মেসেজ ${phone} নম্বরে সফলভাবে পাঠানো হয়েছে!` });
}

// ==========================================
// RENDER BOT CLOUD SESSION PERSISTENCE (SHEET)
// ==========================================
function saveWaSession(files) {
  if (!files || typeof files !== "object") return json({ status: "error", message: "No files provided" });
  try {
    let sh = ss.getSheetByName("WA_Session");
    if (!sh) {
      sh = ss.insertSheet("WA_Session");
      sh.appendRow(["Key", "Data", "Updated_At"]);
    }
    let rows = [];
    let timeStr = now();
    for (let k in files) {
      if (Object.prototype.hasOwnProperty.call(files, k)) {
        rows.push([k, String(files[k]), timeStr]);
      }
    }
    sh.clearContents();
    sh.appendRow(["Key", "Data", "Updated_At"]);
    if (rows.length > 0) {
      sh.getRange(2, 1, rows.length, 3).setValues(rows);
    }
    return json({ status: "success", count: rows.length });
  } catch(e) {
    return json({ status: "error", error: e.toString() });
  }
}

function getWaSession() {
  try {
    let sh = ss.getSheetByName("WA_Session");
    if (!sh) return json({ status: "empty", files: {} });
    let data = sh.getDataRange().getValues();
    if (data.length <= 1) return json({ status: "empty", files: {} });
    let files = {};
    for (let i = 1; i < data.length; i++) {
      let key = String(data[i][0]).trim();
      let val = String(data[i][1]);
      if (key) files[key] = val;
    }
    return json({ status: "success", files: files });
  } catch(e) {
    return json({ status: "error", error: e.toString() });
  }
}

function clearWaSession() {
  try {
    let sh = ss.getSheetByName("WA_Session");
    if (sh) {
      sh.clearContents();
      sh.appendRow(["Key", "Data", "Updated_At"]);
    }
    return json({ status: "success" });
  } catch(e) {
    return json({ status: "error", error: e.toString() });
  }
}

function keepAliveRenderBot() {
  let waCfg = getWaConfig();
  if (waCfg.RENDER_BOT_URL) {
    try {
      UrlFetchApp.fetch(waCfg.RENDER_BOT_URL.replace(/\/+$/, "") + "/ping", { muteHttpExceptions: true });
    } catch(e) {}
  }
}

// ==========================================
// OFFICIAL META WHATSAPP AI AUTO-REPLY (ANTI-LOOP & COMPLETE)
// ==========================================

function sendMetaWhatsApp(phone, textMsg) {
  let num = formatBdPhone(phone);
  if (!num) return;
  
  let metaUrl = `https://graph.facebook.com/v17.0/${META_WA_CONFIG.PHONE_ID}/messages`;
  let metaPayload = {
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": num,
    "type": "text",
    "text": { "preview_url": false, "body": textMsg }
  };
  
  try {
    UrlFetchApp.fetch(metaUrl, {
      "method": "post",
      "contentType": "application/json",
      "headers": { "Authorization": "Bearer " + META_WA_CONFIG.TOKEN },
      "payload": JSON.stringify(metaPayload),
      "muteHttpExceptions": true
    });
  } catch(e) {
    logAudit("META_REPLY_ERROR", e.toString(), "System");
  }
}

function getTomorrowDateStr() {
  let d = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
  return Utilities.formatDate(d, "Asia/Dhaka", "yyyy-MM-dd");
}

function findBoarderById(id, boarders) {
  if (!id || !boarders || boarders.length < 2) return null;
  let targetId = String(id).trim().toLowerCase();
  for (let i = 1; i < boarders.length; i++) {
    let row = boarders[i];
    let rowId = String(row[0] || "").trim().toLowerCase();
    let rowName = String(row[1] || "").trim().toLowerCase();
    if (rowId === targetId || rowName === targetId) {
      return {
        row: i + 1,
        id: String(row[0]).trim(),
        name: String(row[1]).trim(),
        room: String(row[2] || "").trim(),
        lunchDefault: String(row[3] || "ON").trim(),
        dinnerDefault: String(row[4] || "ON").trim(),
        phone: String(row[7] || "").trim()
      };
    }
  }
  return null;
}

function findBoarderByPhone(phone, boarders) {
  if (!phone || !boarders || boarders.length < 2) return null;

  // 1. Remove domain, device index (:0, :1), and non-digit characters
  let raw = String(phone).split('@')[0].split(':')[0].replace(/[^0-9]/g, "");

  // If raw has an extra trailing digit from unstripped :0 or :1 (e.g. 14 digits with 880 or 12 digits with 01)
  if (raw.startsWith("880") && raw.length === 14) {
    raw = raw.slice(0, 13);
  } else if (raw.startsWith("01") && raw.length === 12) {
    raw = raw.slice(0, 11);
  }

  if (raw.length < 10) return null;
  let last10 = raw.slice(-10);

  // 2. Search in Boarders sheet
  for (let i = 1; i < boarders.length; i++) {
    let row = boarders[i];

    // Priority check: standard Phone column (Index 7)
    let p7 = String(row[7] || "").split('@')[0].split(':')[0].replace(/[^0-9]/g, "");
    if (p7.length >= 10 && p7.slice(-10) === last10) {
      return {
        row: i + 1,
        id: String(row[0]).trim(),
        name: String(row[1]).trim(),
        room: String(row[2] || "").trim(),
        lunchDefault: String(row[3] || "ON").trim(),
        dinnerDefault: String(row[4] || "ON").trim(),
        phone: String(row[7] || "").trim()
      };
    }

    // Flexible fallback: check all other columns (e.g. Guardian phone, room, or if column shifted)
    for (let c = 2; c < row.length; c++) {
      let pc = String(row[c] || "").split('@')[0].split(':')[0].replace(/[^0-9]/g, "");
      if (pc.length >= 10 && pc.slice(-10) === last10) {
        return {
          row: i + 1,
          id: String(row[0]).trim(),
          name: String(row[1]).trim(),
          room: String(row[2] || "").trim(),
          lunchDefault: String(row[3] || "ON").trim(),
          dinnerDefault: String(row[4] || "ON").trim(),
          phone: String(row[c] || "").trim()
        };
      }
    }
  }
  return null;
}

function setBoarderMealRecord(boarderId, boarderName, targetDate, lunchVal, dinnerVal) {
  let mSheet = ss.getSheetByName("Meals");
  let bSheet = ss.getSheetByName("Boarders");
  if (!mSheet || !bSheet) return false;

  let mData = mSheet.getDataRange().getValues();
  let foundRow = -1;
  let targetDateClean = getExactDate(targetDate);

  for (let i = 1; i < mData.length; i++) {
    if (!mData[i][1]) continue;
    if (String(mData[i][2]).trim() === String(boarderId).trim() && getExactDate(mData[i][1]) === targetDateClean) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    if (lunchVal !== null && lunchVal !== undefined) {
      mSheet.getRange(foundRow, 5).setValue(lunchVal);
    }
    if (dinnerVal !== null && dinnerVal !== undefined) {
      mSheet.getRange(foundRow, 6).setValue(dinnerVal);
    }
  } else {
    let bRow = findRow(bSheet, boarderId);
    let defaultLunch = 1;
    let defaultDinner = 1;
    if (bRow !== -1) {
      let bData = bSheet.getRange(bRow, 1, 1, 6).getValues()[0];
      defaultLunch = (bData[3] === "OFF") ? 0 : 1;
      defaultDinner = (bData[4] === "OFF") ? 0 : 1;
    }
    let finalLunch = (lunchVal !== null && lunchVal !== undefined) ? lunchVal : defaultLunch;
    let finalDinner = (dinnerVal !== null && dinnerVal !== undefined) ? dinnerVal : defaultDinner;
    mSheet.appendRow([uid(), targetDateClean, boarderId, boarderName, finalLunch, finalDinner]);
  }
  return true;
}

function setBoarderDefaultStatus(boarderRow, lunchStatus, dinnerStatus) {
  let bSheet = ss.getSheetByName("Boarders");
  if (!bSheet || boarderRow <= 0) return;
  if (lunchStatus !== null && lunchStatus !== undefined) {
    bSheet.getRange(boarderRow, 4).setValue(lunchStatus);
  }
  if (dinnerStatus !== null && dinnerStatus !== undefined) {
    bSheet.getRange(boarderRow, 5).setValue(dinnerStatus);
  }
}

function callGeminiApi(prompt) {
  try {
    let modelName = CONFIG.GEMINI_MODEL || "gemini-3.5-flash";
    let res = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent",
      {
        method: "post",
        contentType: "application/json",
        headers: { "X-goog-api-key": CONFIG.GEMINI_KEY },
        payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        muteHttpExceptions: true
      }
    );
    let j = JSON.parse(res.getContentText());
    if (j.candidates && j.candidates.length > 0 && j.candidates[0].content && j.candidates[0].content.parts) {
      return j.candidates[0].content.parts[0].text.trim();
    }
    return null;
  } catch (e) {
    logAudit("GEMINI_API_ERROR", e.toString(), "WhatsApp Bot");
    return null;
  }
}

function processWhatsAppBotMessage(userMessage, senderPhone, senderJid) {
  if (!userMessage || String(userMessage).trim() === "") {
    return "দয়া করে আপনার বার্তা বা প্রশ্নটি লিখে পাঠান।";
  }

  let boarders = getSheet("Boarders");
  let boarder = findBoarderByPhone(senderPhone, boarders);

  // 0. Fallback: check linked WhatsApp account (LID or phone in ScriptProperties)
  if (!boarder && senderJid) {
    let linkedId = PropertiesService.getScriptProperties().getProperty("WA_LINK_" + senderJid);
    if (linkedId) {
      boarder = findBoarderById(linkedId, boarders);
    }
  }
  if (!boarder && senderPhone && String(senderPhone).length > 5) {
    let linkedId = PropertiesService.getScriptProperties().getProperty("WA_LINK_" + senderPhone);
    if (linkedId) {
      boarder = findBoarderById(linkedId, boarders);
    }
  }

  let cleanMsg = String(userMessage).trim();

  // 0.0 WhatsApp Logout / Unlink Support (e.g. "লগআউট", "logout", "আনলিংক", "unlink")
  if (/^(লগআউট|logout|আনলিংক|unlink)$/i.test(cleanMsg)) {
    if (senderJid) PropertiesService.getScriptProperties().deleteProperty("WA_LINK_" + senderJid);
    if (senderPhone && String(senderPhone).length > 5) PropertiesService.getScriptProperties().deleteProperty("WA_LINK_" + senderPhone);
    return `👋 আপনার WhatsApp অ্যাকাউন্টটি মেস প্রোফাইল থেকে সফলভাবে লগআউট / আনলিংক করা হয়েছে।\n\nপুনরায় যুক্ত হতে আপনার মেস আইডি ও পিন লিখে পাঠান (যেমন: *লগইন [আইডি] [পিন]*) অথবা আপনার নিবন্ধিত ১১ ডিজিটের মোবাইল নম্বরটি লিখে পাঠান।`;
  }

  // 0.1 WhatsApp Self-Linking / Login Support:
  // e.g. "লগইন 101 1234", "login 101 1234", "101 1234"
  let loginMatch = cleanMsg.match(/^(?:লগইন|login|আইডি|id)?\s*([a-zA-Z0-9\-_]{2,40})\s+([0-9]{4,8})$/i);
  if (loginMatch) {
    let tryId = loginMatch[1];
    let tryPin = loginMatch[2];
    if (authBoarder(tryId, tryPin)) {
      let foundB = findBoarderById(tryId, boarders);
      if (foundB) {
        if (senderJid) PropertiesService.getScriptProperties().setProperty("WA_LINK_" + senderJid, String(foundB.id));
        if (senderPhone && String(senderPhone).length > 5) PropertiesService.getScriptProperties().setProperty("WA_LINK_" + senderPhone, String(foundB.id));
        boarder = foundB;
        return `✅ *স্বাগতম ${boarder.name} ভাই!*
আপনার WhatsApp অ্যাকাউন্টটি আইডি *${boarder.id}* এর সাথে সফলভাবে লিংক করা হয়েছে। 🎉

এখন থেকে আপনি এই চ্যাট থেকেই সরাসরি মিল অন/অফ, ব্যালেন্স ও মেসের যাবতীয় নোটিশ দেখতে পারবেন।

👉 ব্যালেন্স দেখতে লিখুন: *"হিসাব"* বা *"ব্যালেন্স"*
👉 সহায়তার জন্য লিখুন: *"মেনু"*`;
      }
    } else {
      return `❌ দুঃখিত! মেস আইডি (${tryId}) অথবা পিন (${tryPin}) সঠিক নয়।\nঅনুগ্রহ করে সঠিক মেস আইডি ও পিন লিখে পাঠান (যেমন: *লগইন 101 1234*)।`;
    }
  }

  // 0.2 WhatsApp Self-Linking by 11-digit phone number (e.g. "01715455373")
  let phoneMatch = cleanMsg.match(/(?:01[3-9]\d{8})/);
  if (phoneMatch) {
    let matchedPhone = phoneMatch[0];
    let foundB = findBoarderByPhone(matchedPhone, boarders);
    if (foundB) {
      if (senderJid) PropertiesService.getScriptProperties().setProperty("WA_LINK_" + senderJid, String(foundB.id));
      if (senderPhone && String(senderPhone).length > 5) PropertiesService.getScriptProperties().setProperty("WA_LINK_" + senderPhone, String(foundB.id));
      boarder = foundB;
      return `✅ *স্বাগতম ${boarder.name} ভাই!*
আপনার মোবাইল নম্বর (${matchedPhone}) মেসের ডাটাবেজের সাথে মিলেছে এবং WhatsApp অ্যাকাউন্ট সফলভাবে লিংক করা হয়েছে। 🎉

👉 চলতি মাসের হিসাব দেখতে লিখুন: *"হিসাব"* বা *"ব্যালেন্স"*
👉 সহায়তার জন্য লিখুন: *"মেনু"*`;
    }
  }

  // 1. Strict Protection: Never allow editing or modifying past days' meals
  let pastRegex = /(গতকাল|গতকালের|আগের|গত পরশু|পেছনের|আগের দিনের|yesterday|past)/i;
  let mealActionRegex = /(মিল|meal|off|on|বন্ধ|চালু|লাঞ্চ|ডিনার|lunch|dinner|ভাত|খাব)/i;
  if (pastRegex.test(userMessage) && mealActionRegex.test(userMessage)) {
    let bName = boarder ? (boarder.name + " ভাই") : "সম্মানিত সদস্য";
    return `⚠️ দুঃখিত ${bName}! মেসের নিয়ম অনুযায়ী পেছনের কোনো দিনের মিল বট থেকে পরিবর্তন বা এডিট করা সম্ভব নয়।\n\nঅতীতের কোনো মিল সংশোধনের প্রয়োজন হলে অনুগ্রহ করে সরাসরি মেস ম্যানেজারের সাথে যোগাযোগ করুন।`;
  }

  // 2. Strict Phone Verification: Only verified boarders can toggle meals or view private accounts
  let isMealIntent = mealActionRegex.test(userMessage) || 
                     /(বাড়ি|বাড়ি|গ্রামে|দেশে|home).*(যাচ্ছি|যাব|যাইতেছি|রওনা|চলে যাচ্ছি)/i.test(userMessage) ||
                     /(ব্যালেন্স|টাকা|হিসাব|খরচ|জমা|balance)/i.test(userMessage);

  if (!boarder) {
    // Direct Help/Menu query for unregistered visitor / manager
    if (/^(help|menu|সহায়তা|মেনু|হেল্প|তথ্য|info|\?|সাহায্য|১|1|২|2)$/i.test(cleanMsg)) {
      return `👋 *আসসালামু আলাইকুম!*
এটি *আইডিয়াল হোম মেস*-এর অফিসিয়াল WhatsApp সহকারী বট।

📋 *কীভাবে যুক্ত হবেন?*
আপনার WhatsApp একাউন্ট লিংক করতে আপনার মেস আইডি ও পিন লিখে পাঠান:
👉 *লগইন [আইডি] [পিন]* (যেমন: *লগইন 101 1234*)
অথবা আপনার নিবন্ধিত ১১ ডিজিটের মোবাইল নম্বরটি লিখে পাঠান (যেমন: *017xxxxxxxx*)।

লিংক হলে আপনি সরাসরি এখান থেকে মিল অন/অফ, ব্যালেন্স ও মেসের যাবতীয় নোটিশ দেখতে পারবেন।`;
    }

    if (isMealIntent) {
      return `❌ *আপনার WhatsApp মেস আইডির সাথে লিংক করা নেই!*

আইডিয়াল হোম মেসের নিয়ম অনুযায়ী নিজের ব্যক্তিগত হিসাব ও মিল দেখতে একাউন্ট যাচাই করা প্রয়োজন।

💡 *অতি সহজে এখনই লিংক করুন:*
আপনার মেস আইডি ও পিন লিখে পাঠান:
👉 *লগইন [আইডি] [পিন]* (যেমন: *লগইন 101 1234*)
অথবা আপনার নিবন্ধিত ১১ ডিজিটের মোবাইল নম্বরটি লিখে পাঠান (যেমন: *01775851863*)।`;
    }

    let genPrompt = `তুমি 'আইডিয়াল হোম' মেসের এআই সহকারী। একজন ব্যক্তি মেসেজ করেছেন: "${userMessage}". মেসের নিয়মনীতি ও সৌজন্যমূলকভাবে বাংলায় সংক্ষিপ্ত উত্তর দাও। কোনো ব্যক্তিগত তথ্য প্রকাশ করবে না। জানাও যে এটি আইডিয়াল হোম মেসের বট।`;
    let aiRes = callGeminiApi(genPrompt);
    if (aiRes) return aiRes;

    return `👋 আসসালামু আলাইকুম! এটি আইডিয়াল হোম মেস-এর WhatsApp সহকারী।\n\nমেসের যেকোনো তথ্যের জন্য লিখুন *"মেনু"* অথবা মেস ম্যানেজারের সাথে যোগাযোগ করুন। আপনি মেসের বর্ডার হলে আপনার আইডি ও পিন পাঠিয়ে একাউন্ট লিংক করে নিন (যেমন: *লগইন 101 1234*)।`;
  }

  // Current Bangladesh (Dhaka) Time & Dates
  let bdTime = parseInt(Utilities.formatDate(new Date(), "Asia/Dhaka", "HHmm"));
  let today = todayStr();
  let tomorrow = getTomorrowDateStr();

  // 3. Going Home Automation ("বাড়ি যাচ্ছি" / "আজ দুপুরে খেয়ে চলে যাব")
  if (/(বাড়ি|বাড়ি|গ্রামে|দেশে|home|village).*(যাচ্ছি|যাব|যাইতেছি|রওনা|চলে যাচ্ছি|গেলাম|গিয়াছি|যাবো)/i.test(userMessage) ||
      /(আজ|আজকে).*(বাড়ি|বাড়ি).*(যাচ্ছি|যাব|যাবো)/i.test(userMessage) ||
      /(চলে\s*যা(চ্ছি|ব|বো)|রওনা\s*দি(চ্ছি|ব|বো))/i.test(userMessage) ||
      /^(বাড়ি|বাড়ি)\s*(যাচ্ছি|যাব|যাবো)$/i.test(userMessage.trim())) {
    
    let lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        let msg = "";
        if (bdTime < 1130) {
          // Leaving in morning: turn off today's lunch, dinner, and tomorrow's lunch, dinner
          setBoarderMealRecord(boarder.id, boarder.name, today, 0, 0);
          setBoarderMealRecord(boarder.id, boarder.name, tomorrow, 0, 0);
          setBoarderDefaultStatus(boarder.row, "OFF", "OFF");
          clearInitialDataCache();
          logAudit("WA_MEAL_GOING_HOME", `${boarder.name}: Today & Tomorrow ALL OFF, Defaults OFF`, "WhatsApp Bot");
          notify("🍽️ মিল আপডেট (WhatsApp)", `${boarder.name} বাড়ি যাচ্ছেন - আজ ও কালকের সকল মিল বন্ধ করা হয়েছে।`);
          msg = `🏠 শুভ যাত্রা, ${boarder.name} ভাই!\n\nআপনার বাড়ি যাওয়ার বিষয়টি সিস্টেমে আপডেট করা হয়েছে:\n• আজকের দুপুরের লাঞ্চ: বন্ধ (OFF)\n• আজকের রাতের ডিনার: বন্ধ (OFF)\n• আগামীকালের (${tomorrow}) লাঞ্চ: বন্ধ (OFF)\n• আগামীকালের (${tomorrow}) ডিনার: বন্ধ (OFF)\n\nপাশাপাশি মেসের সিস্টেমে আপনার ডিফল্ট মিল স্ট্যাটাস 'বন্ধ' করে রাখা হয়েছে, ফলে বাড়ি থাকা অবস্থায় প্রতিদিনের মিল স্বয়ংক্রিয়ভাবে বন্ধ থাকবে। ফিরে এসে জানালে আবার মিল চালু করে দেওয়া হবে। নিরাপদ ভ্রমণের শুভকামনা! ✨`;
        } else if (bdTime >= 1130 && bdTime < 1930) {
          // Leaving after lunch: today's lunch kept (already eaten), tonight's dinner off, tomorrow's lunch and dinner off
          setBoarderMealRecord(boarder.id, boarder.name, today, null, 0);
          setBoarderMealRecord(boarder.id, boarder.name, tomorrow, 0, 0);
          setBoarderDefaultStatus(boarder.row, "OFF", "OFF");
          clearInitialDataCache();
          logAudit("WA_MEAL_GOING_HOME", `${boarder.name}: Tonight Dinner & Tomorrow ALL OFF, Defaults OFF`, "WhatsApp Bot");
          notify("🍽️ মিল আপডেট (WhatsApp)", `${boarder.name} বাড়ি যাচ্ছেন - আজকের রাতের ও আগামীকালের সকল মিল বন্ধ করা হয়েছে।`);
          msg = `🏠 শুভ যাত্রা, ${boarder.name} ভাই!\n\nআপনার বাড়ি যাওয়ার রিকোয়েস্ট গ্রহণ করা হয়েছে:\n• আজকের দুপুরের লাঞ্চ: খেয়েছেন (কাউন্টে থাকবে)\n• আজকের রাতের ডিনার: বন্ধ (OFF)\n• আগামীকালের (${tomorrow}) দুপুরের লাঞ্চ: বন্ধ (OFF)\n• আগামীকালের (${tomorrow}) রাতের ডিনার: বন্ধ (OFF)\n\nপাশাপাশি আপনার ডিফল্ট মিল স্ট্যাটাস 'বন্ধ' করা হয়েছে, যাতে প্রতিদিন আলাদা করে মিল অফ করতে না হয়। মেস এ ফিরে আসার পর জানালেই আবার মিল চালু হয়ে যাবে। আপনার যাত্রা শুভ ও নিরাপদ হোক! ✨`;
        } else {
          // Night after 7:30 PM: today's dinner past cutoff; tomorrow lunch and dinner off
          setBoarderMealRecord(boarder.id, boarder.name, tomorrow, 0, 0);
          setBoarderDefaultStatus(boarder.row, "OFF", "OFF");
          clearInitialDataCache();
          logAudit("WA_MEAL_GOING_HOME", `${boarder.name}: Tomorrow ALL OFF, Defaults OFF`, "WhatsApp Bot");
          notify("🍽️ মিল আপডেট (WhatsApp)", `${boarder.name} বাড়ি যাচ্ছেন - আগামীকালের সকল মিল বন্ধ করা হয়েছে।`);
          msg = `🏠 শুভ যাত্রা, ${boarder.name} ভাই!\n\nআজকের ডিনারের কাট-অফ সময় (৭:৩০) শেষ হয়ে যাওয়ায় আজকের হিসাব অপরিবর্তিত রইল। তবে আগামীকালের আপডেট গ্রহণ করা হয়েছে:\n• আগামীকালের (${tomorrow}) দুপুরের লাঞ্চ: বন্ধ (OFF)\n• আগামীকালের (${tomorrow}) রাতের ডিনার: বন্ধ (OFF)\n\nসিস্টেমে আপনার ডিফল্ট মিল স্ট্যাটাস 'বন্ধ' করা হয়েছে, যাতে বাড়ি থাকা অবস্থায় প্রতিদিন আলাদা করে মিল অফ করতে না হয়। মেস এ ফিরলে জানালেই মিল চালু করে দেওয়া হবে। আপনার ভ্রমণ নিরাপদ হোক! ✨`;
        }
        return msg;
      } finally {
        lock.releaseLock();
      }
    }
  }

  // 4. Return to Mess ("ফিরে এসেছি" / "বাড়ি থেকে আসছি")
  if (/(ফিরে\s*এসেছি|ফিরে\s*আসছি|বাড়ি\s*থেকে\s*এসেছি|মেস(ে| এ)\s*আস(লাম|ছি)|ব্যাক\s*করেছি|back)/i.test(userMessage)) {
    let lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        setBoarderDefaultStatus(boarder.row, "ON", "ON");
        clearInitialDataCache();
        logAudit("WA_MEAL_RETURN", `${boarder.name}: Returned to mess, Defaults ON`, "WhatsApp Bot");
        notify("🍽️ বর্ডার প্রত্যাবর্তন (WhatsApp)", `${boarder.name} মেসে ফিরে এসেছেন - মিল স্ট্যাটাস সক্রিয় করা হয়েছে।`);
        return `🎉 স্বাগতম, ${boarder.name} ভাই!\n\nআইডিয়াল হোম মেসে আপনাকে স্বাগতম। আপনার মিল স্ট্যাটাস পুনরায় সক্রিয় (চালু) করা হয়েছে। আপনি যদি আজ বা কালকের সুনির্দিষ্ট কোনো মিল অন বা অফ করতে চান, আমাকে জানান।`;
      } finally {
        lock.releaseLock();
      }
    }
  }

  let isTomorrowWord = /(কাল|আগামীকাল|tomorrow)/i.test(userMessage);
  let isLunchWord = /(লাঞ্চ|দুপুর|lunch)/i.test(userMessage);
  let isDinnerWord = /(ডিনার|রাত|dinner)/i.test(userMessage);
  let isOffWord = /(অফ|off|বন্ধ|খাব\s*না)/i.test(userMessage);
  let isOnWord = /(অন|on|চালু|খাব|মিল\s*দিও)/i.test(userMessage);

  // 5. Tomorrow's Meal OFF ("কালকের মিল অফ", "কাল দুপুরে খাব না", "কাল রাতে খাব না")
  if (isTomorrowWord && isOffWord) {
    let lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        if (isLunchWord && !isDinnerWord) {
          setBoarderMealRecord(boarder.id, boarder.name, tomorrow, 0, null);
          setBoarderDefaultStatus(boarder.row, "OFF", null);
          clearInitialDataCache();
          logAudit("WA_MEAL_TOMORROW_LUNCH_OFF", `${boarder.name}: Tomorrow Lunch OFF`, "WhatsApp Bot");
          return `✅ ${boarder.name} ভাই, আগামীকালের (${tomorrow}) দুপুরের লাঞ্চ বন্ধ (OFF) করা হয়েছে।`;
        } else if (isDinnerWord && !isLunchWord) {
          setBoarderMealRecord(boarder.id, boarder.name, tomorrow, null, 0);
          setBoarderDefaultStatus(boarder.row, null, "OFF");
          clearInitialDataCache();
          logAudit("WA_MEAL_TOMORROW_DINNER_OFF", `${boarder.name}: Tomorrow Dinner OFF`, "WhatsApp Bot");
          return `✅ ${boarder.name} ভাই, আগামীকালের (${tomorrow}) রাতের ডিনার বন্ধ (OFF) করা হয়েছে।`;
        } else {
          setBoarderMealRecord(boarder.id, boarder.name, tomorrow, 0, 0);
          setBoarderDefaultStatus(boarder.row, "OFF", "OFF");
          clearInitialDataCache();
          logAudit("WA_MEAL_TOMORROW_ALL_OFF", `${boarder.name}: Tomorrow Lunch & Dinner OFF`, "WhatsApp Bot");
          return `✅ ${boarder.name} ভাই, আগামীকালের (${tomorrow}) দুপুরের লাঞ্চ ও রাতের ডিনার উভয় মিলই বন্ধ (OFF) করা হয়েছে।`;
        }
      } finally {
        lock.releaseLock();
      }
    }
  }

  // 6. Tomorrow's Meal ON ("কালকে মিল চালু", "কালকে থেকে খাব")
  if (isTomorrowWord && isOnWord) {
    let lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        if (isLunchWord && !isDinnerWord) {
          setBoarderMealRecord(boarder.id, boarder.name, tomorrow, 1, null);
          setBoarderDefaultStatus(boarder.row, "ON", null);
          clearInitialDataCache();
          logAudit("WA_MEAL_TOMORROW_LUNCH_ON", `${boarder.name}: Tomorrow Lunch ON`, "WhatsApp Bot");
          return `✅ ${boarder.name} ভাই, আগামীকালের (${tomorrow}) দুপুরের লাঞ্চ চালু (ON) করা হয়েছে।`;
        } else if (isDinnerWord && !isLunchWord) {
          setBoarderMealRecord(boarder.id, boarder.name, tomorrow, null, 1);
          setBoarderDefaultStatus(boarder.row, null, "ON");
          clearInitialDataCache();
          logAudit("WA_MEAL_TOMORROW_DINNER_ON", `${boarder.name}: Tomorrow Dinner ON`, "WhatsApp Bot");
          return `✅ ${boarder.name} ভাই, আগামীকালের (${tomorrow}) রাতের ডিনার চালু (ON) করা হয়েছে।`;
        } else {
          setBoarderMealRecord(boarder.id, boarder.name, tomorrow, 1, 1);
          setBoarderDefaultStatus(boarder.row, "ON", "ON");
          clearInitialDataCache();
          logAudit("WA_MEAL_TOMORROW_ALL_ON", `${boarder.name}: Tomorrow Lunch & Dinner ON`, "WhatsApp Bot");
          return `✅ ${boarder.name} ভাই, আগামীকালের (${tomorrow}) দুপুরের লাঞ্চ ও রাতের ডিনার উভয় মিলই চালু (ON) করা হয়েছে।`;
        }
      } finally {
        lock.releaseLock();
      }
    }
  }

  // 7. Today Dinner OFF ("আজকের রাতের ডিনার অফ", "রাতে খাব না")
  if (isDinnerWord && isOffWord && !isTomorrowWord) {
    if (bdTime >= 1930) {
      return `⚠️ দুঃখিত ${boarder.name} ভাই! সন্ধ্যা ৭:৩০ এর পর আজকের রাতের ডিনার অফ করার কাট-অফ সময় পার হয়ে গেছে। মেস ম্যানেজারের সাথে সরাসরি যোগাযোগ করুন।`;
    }
    let lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        setBoarderMealRecord(boarder.id, boarder.name, today, null, 0);
        setBoarderDefaultStatus(boarder.row, null, "OFF");
        clearInitialDataCache();
        logAudit("WA_MEAL_TODAY_DINNER_OFF", `${boarder.name}: Today Dinner OFF`, "WhatsApp Bot");
        notify("🍽️ মিল আপডেট (WhatsApp)", `${boarder.name} এর আজকের রাতের ডিনার বন্ধ করা হয়েছে।`);
        return `✅ ${boarder.name} ভাই, আজকের রাতের ডিনার সফলভাবে বন্ধ (OFF) করা হয়েছে।`;
      } finally {
        lock.releaseLock();
      }
    }
  }

  // 8. Today Lunch OFF ("আজকের দুপুরের লাঞ্চ অফ", "দুপুরে খাব না")
  if (isLunchWord && isOffWord && !isTomorrowWord) {
    if (bdTime >= 1130) {
      return `⚠️ দুঃখিত ${boarder.name} ভাই! বেলা ১১:৩০ এর পর আজকের দুপুরের লাঞ্চ অফ করার কাট-অফ সময় পার হয়ে গেছে। মেস ম্যানেজারের সাথে সরাসরি যোগাযোগ করুন।`;
    }
    let lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        setBoarderMealRecord(boarder.id, boarder.name, today, 0, null);
        setBoarderDefaultStatus(boarder.row, "OFF", null);
        clearInitialDataCache();
        logAudit("WA_MEAL_TODAY_LUNCH_OFF", `${boarder.name}: Today Lunch OFF`, "WhatsApp Bot");
        notify("🍽️ মিল আপডেট (WhatsApp)", `${boarder.name} এর আজকের দুপুরের লাঞ্চ বন্ধ করা হয়েছে।`);
        return `✅ ${boarder.name} ভাই, আজকের দুপুরের লাঞ্চ সফলভাবে বন্ধ (OFF) করা হয়েছে।`;
      } finally {
        lock.releaseLock();
      }
    }
  }

  // 9. Today All Meals OFF ("আজকের মিল অফ", "আজকে খাব না", "আজ মিল বন্ধ")
  if ((/(আজ|আজকে|today)?.*(মিল|meal)\s*(অফ|off|বন্ধ)/i.test(userMessage) || /(আজ|আজকে)\s*খাব\s*না/i.test(userMessage) || /^(মিল|meal)\s*(অফ|off|বন্ধ)$/i.test(userMessage.trim())) && !isTomorrowWord) {
    let lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        if (bdTime < 1130) {
          setBoarderMealRecord(boarder.id, boarder.name, today, 0, 0);
          setBoarderDefaultStatus(boarder.row, "OFF", "OFF");
          clearInitialDataCache();
          logAudit("WA_MEAL_TODAY_ALL_OFF", `${boarder.name}: Today Lunch & Dinner OFF`, "WhatsApp Bot");
          notify("🍽️ মিল আপডেট (WhatsApp)", `${boarder.name} এর আজকের সকল মিল বন্ধ করা হয়েছে।`);
          return `✅ ${boarder.name} ভাই, আজকের দুপুরের লাঞ্চ ও রাতের ডিনার উভয় মিলই বন্ধ (OFF) করা হয়েছে।`;
        } else if (bdTime < 1930) {
          setBoarderMealRecord(boarder.id, boarder.name, today, null, 0);
          setBoarderDefaultStatus(boarder.row, null, "OFF");
          clearInitialDataCache();
          logAudit("WA_MEAL_TODAY_DINNER_OFF", `${boarder.name}: Today Dinner OFF (Lunch past cutoff)`, "WhatsApp Bot");
          notify("🍽️ মিল আপডেট (WhatsApp)", `${boarder.name} এর আজকের রাতের ডিনার বন্ধ করা হয়েছে (দুপুর পার)।`);
          return `ℹ️ ${boarder.name} ভাই, দুপুরের মিলের কাট-অফ সময় (১১:৩০) পার হয়ে যাওয়ায় লাঞ্চ অফ করা যায়নি। তবে আজকের রাতের ডিনার সফলভাবে বন্ধ (OFF) করা হয়েছে।`;
        } else {
          return `⚠️ দুঃখিত ${boarder.name} ভাই! আজকের লাঞ্চ (১১:৩০) ও ডিনার (৭:৩০) উভয়ের কাট-অফ সময় পার হয়ে গেছে। আপনি চাইলে আগামীকালের মিল অফ করতে পারেন ("কালকের মিল অফ" লিখে পাঠান)।`;
        }
      } finally {
        lock.releaseLock();
      }
    }
  }

  // 10. Turn Meals ON ("মিল চালু", "মিল অন", "আজকে খাব")
  if (isOnWord && !isTomorrowWord) {
    let lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        if (isLunchWord && !isDinnerWord) {
          if (bdTime >= 1130) {
            return `⚠️ দুঃখিত ${boarder.name} ভাই! বেলা ১১:৩০ এর পর আজকের লাঞ্চে নাম তোলা সম্ভব নয়। মেস ম্যানেজারের সাথে সরাসরি যোগাযোগ করুন।`;
          }
          setBoarderMealRecord(boarder.id, boarder.name, today, 1, null);
          setBoarderDefaultStatus(boarder.row, "ON", null);
          clearInitialDataCache();
          logAudit("WA_MEAL_TODAY_LUNCH_ON", `${boarder.name}: Today Lunch ON`, "WhatsApp Bot");
          return `✅ ${boarder.name} ভাই, আজকের দুপুরের লাঞ্চ সফলভাবে চালু (ON) করা হয়েছে।`;
        } else if (isDinnerWord && !isLunchWord) {
          if (bdTime >= 1930) {
            return `⚠️ দুঃখিত ${boarder.name} ভাই! সন্ধ্যা ৭:৩০ এর পর আজকের ডিনারে নাম তোলা সম্ভব নয়। মেস ম্যানেজারের সাথে সরাসরি যোগাযোগ করুন।`;
          }
          setBoarderMealRecord(boarder.id, boarder.name, today, null, 1);
          setBoarderDefaultStatus(boarder.row, null, "ON");
          clearInitialDataCache();
          logAudit("WA_MEAL_TODAY_DINNER_ON", `${boarder.name}: Today Dinner ON`, "WhatsApp Bot");
          return `✅ ${boarder.name} ভাই, আজকের রাতের ডিনার সফলভাবে চালু (ON) করা হয়েছে।`;
        } else {
          if (bdTime < 1130) {
            setBoarderMealRecord(boarder.id, boarder.name, today, 1, 1);
            setBoarderDefaultStatus(boarder.row, "ON", "ON");
            clearInitialDataCache();
            logAudit("WA_MEAL_TODAY_ALL_ON", `${boarder.name}: Today Lunch & Dinner ON`, "WhatsApp Bot");
            return `✅ ${boarder.name} ভাই, আজকের দুপুরের লাঞ্চ ও রাতের ডিনার উভয় মিল চালু (ON) করা হয়েছে।`;
          } else if (bdTime < 1930) {
            setBoarderMealRecord(boarder.id, boarder.name, today, null, 1);
            setBoarderDefaultStatus(boarder.row, null, "ON");
            clearInitialDataCache();
            logAudit("WA_MEAL_TODAY_DINNER_ON", `${boarder.name}: Today Dinner ON (Lunch past)`, "WhatsApp Bot");
            return `✅ ${boarder.name} ভাই, দুপুরের সময় পার হয়ে গেলেও আজকের রাতের ডিনার সফলভাবে চালু (ON) করা হয়েছে।`;
          } else {
            setBoarderMealRecord(boarder.id, boarder.name, tomorrow, 1, 1);
            setBoarderDefaultStatus(boarder.row, "ON", "ON");
            clearInitialDataCache();
            logAudit("WA_MEAL_TOMORROW_ALL_ON", `${boarder.name}: Tomorrow Lunch & Dinner ON`, "WhatsApp Bot");
            return `ℹ️ ${boarder.name} ভাই, আজকের সময়ের সমাপ্তি ঘটেছে। তাই আগামীকাল (${tomorrow}) থেকে আপনার দুপুরের ও রাতের মিল চালু (ON) করে দেওয়া হয়েছে।`;
          }
        }
      } finally {
        lock.releaseLock();
      }
    }
  }

  // 11. Core Financials & Fast Direct Query Handlers (Zero AI Dependency)
  let transactions = getSheet("Transactions");
  let settings     = getSheet("Settings");

  let stats = getProcessedMonthlyStats(isThisMonth);
  let totalMessMeals = stats.totalMeals;
  let totalMessExp   = stats.totalExp;
  let totalMessDep   = stats.totalDep;
  let mealRate       = stats.rate;

  let member = stats.list.find(item => (boarder.id && item.id.toLowerCase() === String(boarder.id).trim().toLowerCase()) || (boarder.name && item.name.toLowerCase() === String(boarder.name).trim().toLowerCase()));
  let myMeals   = member ? member.meals : 0;
  let myDep     = member ? member.dep : 0;
  let myCost    = member ? member.cost : 0;
  let myBalance = member ? member.bal : 0;

  let todayBazaar = "";
  transactions.slice(1).forEach(r => {
    if (isThisMonth(r[1]) && getExactDate(r[1]) === today) {
      todayBazaar += r[3] + " (৳" + r[4] + "), ";
    }
  });

  // Direct Menu / Help Query
  if (/^(help|menu|সহায়তা|মেনু|হেল্প|তথ্য|info|\?|সাহায্য|হালনাগাদ|অপশন|২|2)$/i.test(userMessage.trim())) {
    return `🤖 *আইডিয়াল হোম WhatsApp সহকারী*
👤 স্বাগতম, *${boarder.name}* ভাই!
────────────────────
মেসেজে সহজেই যা যা জানতে পারবেন:

1️⃣ *ব্যালেন্স দেখতে:*
  👉 *"ব্যালেন্স"* বা *"1"* লিখে পাঠান
  (চলতি মাসের মোট জমা, মিল সংখ্যা, মিল রেট ও ব্যালেন্স স্থিতি)

2️⃣ *মিল বন্ধ বা চালু করতে:*
  👉 *"আজকের মিল অফ"* (আজকে না খেলে)
  👉 *"আজ রাতের ডিনার অফ"* (শুধুমাত্র ডিনার বন্ধ)
  👉 *"কালকের মিল অফ"* (আগামীকালের সকল মিল বন্ধ)
  👉 *"মিল চালু"* (মিল আবার অন করতে)

3️⃣ *ছুটি / বাড়ি যাওয়া:*
  👉 *"বাড়ি যাচ্ছি"* (আজ রাত ও আগামীকালের সব মিল অফ হবে এবং ডিফল্ট বন্ধ থাকবে)
  👉 *"ফিরে এসেছি"* (মেসে ফিরলে মিল সক্রিয় হবে)

4️⃣ *বাজার ও নোটিশ:*
  👉 *"বাজার"* (আজকের মেস বাজার ও খরচ)
  👉 *"নোটিশ"* (মেসের জরুরি নোটিশ)
  👉 *"ম্যানেজার"* (ম্যানেজারের তথ্য)
────────────────────
⏰ লাঞ্চ কাট-অফ: বেলা ১১:৩০ | ডিনার কাট-অফ: সন্ধ্যা ৭:৩০`;
  }

  // Direct Balance / Statement Query (Instant, Accurate, Always Works)
  if (/^(balance|ব্যালেন্স|হিসাব|টাকা|হিসেব|খরচ|১|1)$/i.test(userMessage.trim()) ||
      /(ব্যালেন্স|টাকা|হিসাব|খরচ|জমা|balance).*(কত|দেখান|জানান|দেখাও|কতো|দিবেন|চাই|আছে)/i.test(userMessage) ||
      /^(আমার\s*)?(ব্যালেন্স|টাকা|হিসাব|হিসেব)$/i.test(userMessage.trim())) {
    
    let balStatus = myBalance >= 0 
      ? `🟢 *পাওনা (অতিরিক্ত জমা):* ৳${Math.round(myBalance)}`
      : `🔴 *বকেয়া (দেনা):* ৳${Math.abs(Math.round(myBalance))}`;

    return `📊 *আইডিয়াল হোম মেস - চলতি মাসের হিসাব*
👤 বর্ডার: *${boarder.name}* (আইডি: ${boarder.id}, রুম: ${boarder.room || "-"})
📅 তারিখ: ${today}
────────────────────
💰 আপনার মোট জমা: ৳${myDep}
🍽️ আপনার খাওয়া মিল: ${myMeals} টি
🏷️ বর্তমান মিল রেট: ৳${mealRate.toFixed(2)}
📉 আপনার মোট মিল খরচ: ৳${Math.round(myCost)}
────────────────────
💵 *বর্তমান স্থিতি / ব্যালেন্স:*
${balStatus}
────────────────────
💡 মিল অফ/অন করতে লিখুন *"আজকের মিল অফ"* বা *"মিল চালু"*।
অন্যান্য সহায়তার জন্য লিখুন *"মেনু"*।`;
  }

  // Direct Today's Bazaar Query
  if (/^(বাজার|bazaar|market|আজকের বাজার|বাজারের হিসাব|৩|3)$/i.test(userMessage.trim())) {
    let bzText = todayBazaar ? todayBazaar.replace(/,\s*$/, "") : "আজকের কোনো বাজার এন্ট্রি এখনও করা হয়নি।";
    let nextPerson = settings.length > 1 ? (settings[1][3] || "নির্ধারিত হয়নি") : "নির্ধারিত হয়নি";
    return `🛒 *আইডিয়াল হোম - আজকের বাজার*
📅 তারিখ: ${today}
────────────────────
🛍️ আজকের বাজার খরচ:
${bzText}
────────────────────
👨‍🍳 পরবর্তী বাজার দায়িত্ব: *${nextPerson}*
💰 মেসের মোট খরচ (চলতি মাস): ৳${totalMessExp}
🍽️ মেসের মোট মিল: ${totalMessMeals} টি (রেট: ৳${mealRate.toFixed(2)})`;
  }

  // Direct Notice Query
  if (/^(নোটিশ|notice|নিয়ম|৪|4)$/i.test(userMessage.trim())) {
    let noticeText = settings.length > 1 ? (settings[1][2] || "এই মুহূর্তে কোনো জরুরি নোটিশ নেই।") : "এই মুহূর্তে কোনো জরুরি নোটিশ নেই।";
    return `📢 *আইডিয়াল হোম - মেস নোটিশ*
────────────────────
${noticeText}
────────────────────
ম্যানেজার: ${settings.length > 1 ? settings[1][0] : "আইডিয়াল হোম মেস"}`;
  }

  // Direct Manager Contact Query
  if (/^(ম্যানেজার|manager|পরিচালক|৫|5)$/i.test(userMessage.trim())) {
    return `👤 *মেস ম্যানেজার তথ্য*
────────────────────
ম্যানেজার: ${settings.length > 1 ? settings[1][0] : "আইডিয়াল হোম মেস"}
জরুরি প্রয়োজনে বা মিল সংশোধনে সরাসরি যোগাযোগ করুন।`;
  }

  // 12. Smart AI Chatbot with Gemini (Full Mess Financials & User Context)
  let prompt = `তুমি 'আইডিয়াল হোম' মেসের বুদ্ধিমান সহকারী এআই।
তুমি কথা বলছো মেসের বর্ডার: "${boarder.name}" (আইডি: ${boarder.id}, রুম: ${boarder.room || "রুম"}) এর সাথে।

[বর্তমান মেসের তথ্য]:
- ম্যানেজার: ${settings.length > 1 ? settings[1][0] : "অজানা"}
- নোটিশ: ${settings.length > 1 ? settings[1][2] : "নেই"}
- পরবর্তী বাজার দায়িত্ব: ${settings.length > 1 ? settings[1][3] : "অজানা"}
- আজকের বাজার: ${todayBazaar || "আজকের কোনো বাজার এন্ট্রি হয়নি"}
- মেসের মোট জমা: ৳${totalMessDep}, মোট খরচ: ৳${totalMessExp}, মোট মিল: ${totalMessMeals}
- বর্তমান মিল রেট: ৳${mealRate.toFixed(2)}

[${boarder.name} এর ব্যক্তিগত হিসাব]:
- চলতি মাসের মোট মিল: ${myMeals} টি
- মোট জমা টাকা: ৳${myDep}
- মোট মিল খরচ: ৳${myCost.toFixed(0)}
- বর্তমান ব্যালেন্স: ৳${Math.abs(myBalance).toFixed(0)} (${myBalance >= 0 ? "পাওনা / Surplus" : "দেনা / Due"})

[মেসের নিয়ম ও সময়সীমা]:
- দুপুর ১১:৩০ এর পর আজকের লাঞ্চ অফ করা যায় না।
- সন্ধ্যা ৭:৩০ এর পর আজকের ডিনার অফ করা যায় না।
- পেছনের বা অতীতের কোনো দিনের মিল বট থেকে পরিবর্তন করা সম্পূর্ণ নিষেধ।
- বাড়ি যাওয়ার সময় বললে আজ রাতের ও আগামীকালের সকল মিল অফ হয়ে যায়।

বর্ডারের মেসেজ: "${userMessage}"

নির্দেশনা:
1. খুব ভদ্র, আন্তরিক ও সংক্ষেপে বাংলায় উত্তর দাও।
2. যদি কোনো তথ্যের উত্তর দাও তবে উপরের সঠিক ডাটা ব্যবহার করো। নিজে থেকে টাকার অংক বানাবে না।
3. বর্ডার যদি কোনো মিল পরিবর্তন করতে চায় তবে উত্তরের শেষে বন্ধনীতে নিচের উপযুক্ত অ্যাকশন ট্যাগটি লিখবে:
   [ACTION: GOING_HOME], [ACTION: TOMORROW_ALL_OFF], [ACTION: TOMORROW_LUNCH_OFF], [ACTION: TOMORROW_DINNER_OFF], [ACTION: TODAY_ALL_OFF], [ACTION: TODAY_LUNCH_OFF], [ACTION: TODAY_DINNER_OFF], [ACTION: ALL_ON], [ACTION: TOMORROW_ALL_ON], [ACTION: PAST_REJECT]
   যদি কোনো মিল পরিবর্তনের বিষয় না থাকে, কোনো অ্যাকশন ট্যাগ লিখবে না।`;

  let aiReply = callGeminiApi(prompt);

  // Check if Gemini triggered an action tag
  if (aiReply && aiReply.indexOf("[ACTION:") !== -1) {
    if (aiReply.indexOf("GOING_HOME") !== -1) {
      return processWhatsAppBotMessage("বাড়ি যাচ্ছি", senderPhone);
    }
    if (aiReply.indexOf("PAST_REJECT") !== -1) {
      return `⚠️ দুঃখিত ${boarder.name}! মেসের নিয়ম অনুযায়ী পেছনের কোনো দিনের মিল বট থেকে পরিবর্তন করা সম্ভব নয়।`;
    }
    if (aiReply.indexOf("TOMORROW_ALL_OFF") !== -1) {
      return processWhatsAppBotMessage("কালকের মিল অফ", senderPhone);
    }
    if (aiReply.indexOf("TOMORROW_LUNCH_OFF") !== -1) {
      return processWhatsAppBotMessage("কাল দুপুরে খাব না", senderPhone);
    }
    if (aiReply.indexOf("TOMORROW_DINNER_OFF") !== -1) {
      return processWhatsAppBotMessage("কাল রাতে খাব না", senderPhone);
    }
    if (aiReply.indexOf("TODAY_ALL_OFF") !== -1) {
      return processWhatsAppBotMessage("আজকের মিল অফ", senderPhone);
    }
    if (aiReply.indexOf("TODAY_LUNCH_OFF") !== -1) {
      return processWhatsAppBotMessage("আজ দুপুরে খাব না", senderPhone);
    }
    if (aiReply.indexOf("TODAY_DINNER_OFF") !== -1) {
      return processWhatsAppBotMessage("আজ রাতে খাব না", senderPhone);
    }
    if (aiReply.indexOf("ALL_ON") !== -1 || aiReply.indexOf("TOMORROW_ALL_ON") !== -1) {
      return processWhatsAppBotMessage("মিল চালু", senderPhone);
    }
    return aiReply.replace(/\[ACTION:[^\]]+\]/g, "").trim();
  }

  if (aiReply) {
    return aiReply.replace(/\[ACTION:[^\]]+\]/g, "").trim();
  }

  // Graceful fallback if Gemini API is temporarily busy
  return `👋 আসসালামু আলাইকুম, ${boarder.name} ভাই!
আইডিয়াল হোম মেসে আপনাকে স্বাগতম।

💡 আপনার তথ্যের জন্য নিচের অপশনগুলো ব্যবহার করুন:
• *"ব্যালেন্স"* - আপনার চলতি মাসের সম্পূর্ণ হিসাব দেখতে
• *"আজকের মিল অফ"* / *"মিল চালু"* - মিল কন্ট্রোল করতে
• *"বাড়ি যাচ্ছি"* - ছুটিতে মিল বন্ধ করতে
• *"বাজার"* - আজকের বাজার তালিকা ও খরচ দেখতে
• *"মেনু"* - সকল কমান্ডের তালিকা দেখতে`;
}

function handleMetaWhatsAppWebhook(data) {
  try {
    let messageInfo = data.entry[0].changes[0].value.messages;
    if (!messageInfo || messageInfo.length === 0) return text("No message");

    let msgObj = messageInfo[0];
    let senderPhone = msgObj.from;
    let userMessage = msgObj.text ? msgObj.text.body : "";
    let msgId = msgObj.id;

    let cache = CacheService.getScriptCache();
    if (cache.get(msgId)) {
      return text("Already processed");
    }
    cache.put(msgId, "done", 300);

    if (userMessage && senderPhone) {
      let botReply = processWhatsAppBotMessage(userMessage, senderPhone);
      sendMetaWhatsApp(senderPhone, botReply);
    }
    return text("Success");
  } catch (e) {
    logAudit("META_WA_WEBHOOK_ERROR", e.toString(), "System");
    return text("Error");
  }
}