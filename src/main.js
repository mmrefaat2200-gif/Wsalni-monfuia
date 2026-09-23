import "./style.css";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut
} from "firebase/auth";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

import { Geolocation } from "@capacitor/geolocation";

/* ======================================================
   SETTINGS
====================================================== */

// لو true: الكابتن لازم captainStatus بتاعه يبقى "approved" (بتغيره إنت من Firebase Console)
// خليها false لحد ما تعمل لوحة موافقة على الكباتن.
const REQUIRE_CAPTAIN_APPROVAL = false;

// مركز الخريطة الافتراضي (شبين الكوم - المنوفية)
const DEFAULT_CENTER = { lat: 30.5526, lng: 31.0106 };

/* ======================================================
   FIREBASE
====================================================== */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

/* ======================================================
   STATE
====================================================== */

let currentUser = null;
let currentProfile = null;
let currentRole = "customer";

let selectedPickup = "";
let selectedDestination = "";
let selectedPickupCoords = null;
let selectedDestinationCoords = null;
let selectedDistanceKm = null;
let selectedDurationText = "";

let recaptcha = null;
let confirmationResult = null;

let unsubCaptainRides = null;
let unsubCaptainAccepted = null;
let unsubMyRides = null;
const offerUnsubs = new Map();

let openRidesCache = [];
const sentOffers = new Set();

let map = null;
let mapMode = "destination";
let pendingCoords = null;
let pendingAddress = "";
let geocodeToken = 0;
let routeToken = 0;

let googleMapsPromise = null;
let mapSearchTimer = null;

/* ======================================================
   HELPERS
====================================================== */

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(message, type = "info") {
  const box = $("#messageBox");
  if (!box) return;

  box.textContent = message;
  box.className = `message-box ${type}`;
  box.style.display = "block";

  clearTimeout(window.__messageTimer);
  window.__messageTimer = setTimeout(() => {
    box.style.display = "none";
  }, 5000);
}

function formatDateTime(value) {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function toMs(value) {
  return value?.toMillis?.() ?? Date.now();
}

function byCreatedDesc(a, b) {
  return toMs(b.createdAt) - toMs(a.createdAt);
}

function normalizePhone(raw) {
  let p = String(raw || "").replace(/[\s\-()]/g, "");
  if (/^01\d{9}$/.test(p)) p = "+2" + p;
  else if (p.startsWith("00")) p = "+" + p.slice(2);
  return p;
}

function navigationLink(from, to) {
  if (!from || !to) return "";
  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&origin=${from.lat},${from.lng}` +
    `&destination=${to.lat},${to.lng}` +
    "&travelmode=driving"
  );
}

function statusLabel(status) {
  if (status === "open") return "مفتوحة";
  if (status === "accepted") return "تم قبول عرض";
  if (status === "cancelled") return "ملغاة";
  return status || "";
}

function captainAllowed() {
  if (currentRole !== "captain") return false;
  if (!REQUIRE_CAPTAIN_APPROVAL) return true;
  return currentProfile?.captainStatus === "approved";
}

/* ======================================================
   EXTRA STYLES (so style.css doesn't need edits)
====================================================== */

const extraStyle = document.createElement("style");
extraStyle.textContent = `
.wm-overlay{position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px}
.wm-modal{background:#fff;color:#12304a;border-radius:18px;padding:20px;width:100%;max-width:380px;direction:rtl}
.wm-modal h3{margin:0 0 6px}
.wm-modal p{margin:0 0 10px;color:#4b6478}
.wm-modal input{width:100%;padding:14px;border:1px solid #d7e4eb;border-radius:14px;margin:6px 0 10px;font:inherit}
.wm-actions{display:flex;gap:8px}
.wm-actions .btn{flex:1}
.wm-error{color:#c62828;min-height:18px;font-size:14px}
.offer-row{border:1px solid #e1ecf2;border-radius:14px;padding:12px;margin-top:8px;background:#fafdff}
.offer-row .top{display:flex;gap:10px;align-items:center}
.offer-row img{width:44px;height:44px;border-radius:50%;object-fit:cover}
.section-title{margin:18px 4px 8px;font-size:18px}
.link-btn{display:block;text-align:center;text-decoration:none}
.nav button{font-size:12px}
`;
document.head.appendChild(extraStyle);

/* ======================================================
   MODALS
====================================================== */

function askPrice({ title, note = "", initial = "", okText = "إرسال" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "wm-overlay";
    overlay.innerHTML = `
      <div class="wm-modal">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(note)}</p>
        <input id="wmPrice" type="number" min="1" inputmode="decimal"
               value="${escapeHtml(String(initial))}" placeholder="السعر بالجنيه">
        <div class="wm-error" id="wmError"></div>
        <div class="wm-actions">
          <button class="btn green" data-ok type="button">${escapeHtml(okText)}</button>
          <button class="btn outline" data-cancel type="button">إلغاء</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#wmPrice");
    input.focus();

    const close = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay.querySelector("[data-ok]").addEventListener("click", () => {
      const n = Number(input.value);
      if (!n || n <= 0) {
        overlay.querySelector("#wmError").textContent = "اكتب سعر صحيح.";
        return;
      }
      close(n);
    });

    overlay.querySelector("[data-cancel]").addEventListener("click", () => close(null));

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
  });
}

function askConfirm(text, okText = "تأكيد") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "wm-overlay";
    overlay.innerHTML = `
      <div class="wm-modal">
        <h3>${escapeHtml(text)}</h3>
        <div class="wm-actions" style="margin-top:14px">
          <button class="btn green" data-ok type="button">${escapeHtml(okText)}</button>
          <button class="btn outline" data-cancel type="button">رجوع</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay.querySelector("[data-ok]").addEventListener("click", () => close(true));
    overlay.querySelector("[data-cancel]").addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
  });
}

/* ======================================================
   GOOGLE MAPS
====================================================== */

function loadGoogleMaps() {
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      googleMapsPromise = null;
      reject(new Error("VITE_GOOGLE_MAPS_API_KEY غير موجود."));
      return;
    }

    const fail = (message) => {
      googleMapsPromise = null;
      reject(new Error(message));
    };

    window.__gmapsReady = () => resolve(window.google);

    window.gm_authFailure = () => {
      showMessage(
        "مفتاح Google Maps مرفوض. راجع الـ APIs المفعّلة وقيود المفتاح.",
        "error"
      );
    };

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(apiKey)}` +
      "&libraries=places&language=ar&region=EG&v=weekly" +
      "&callback=__gmapsReady";
    script.async = true;
    script.defer = true;
    script.onerror = () => fail("فشل تحميل Google Maps.");

    document.head.appendChild(script);

    setTimeout(() => {
      if (!window.google?.maps) fail("Google Maps لم يتم تحميلها.");
    }, 20000);
  });

  return googleMapsPromise;
}

async function getAddressFromCoordinates(lat, lng) {
  try {
    await loadGoogleMaps();
    const geocoder = new google.maps.Geocoder();
    const result = await geocoder.geocode({
      location: { lat, lng },
      language: "ar"
    });
    if (result.results?.length) return result.results[0].formatted_address;
  } catch (error) {
    console.error(error);
  }
  return `موقع محدد (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

/* ======================================================
   MAIN HTML
====================================================== */

const appElement = $("#app");
if (!appElement) throw new Error("لم يتم العثور على عنصر #app في index.html");

appElement.innerHTML = `
<div class="app">

<header class="header">
  <div class="logo">🚕 <span>وصلني المنوفية</span></div>
  <button id="profileBtn" class="icon-button" type="button">👤</button>
</header>

<div id="messageBox" class="message-box" style="display:none"></div>

<!-- HOME -->
<section id="homeScreen" class="screen active">

  <div class="hero">
    <h1>اطلب رحلتك بسعر أرخص 🚕</h1>
    <p>حدد مكان الالتقاء ومكان النزول، واكتب السعر المناسب ليك، والكباتن يقدموا عروضهم.</p>
  </div>

  <div class="card">
    <label>📍 مكان الالتقاء</label>
    <button id="fromPlace" class="btn outline" type="button">📍 استخدم موقعي الحالي</button>
    <button id="fromMapBtn" class="btn outline" type="button">🗺️ أو حدده على الخريطة</button>
    <div id="pickupInfo" class="status">لم يتم تحديد مكان الالتقاء</div>
  </div>

  <div class="card">
    <label>🕐 ميعاد الالتقاء</label>
    <input id="pickupDateTime" type="datetime-local">
    <small>حدد اليوم والساعة اللي عايز الكابتن ييجي ياخدك فيها.</small>
  </div>

  <div class="card">
    <label>🏁 مكان النزول</label>
    <button id="toPlace" class="btn outline" type="button">🗺️ حدد مكان النزول على الخريطة</button>
    <div id="destinationInfo" class="status">لم يتم تحديد مكان النزول</div>
  </div>

  <div class="card">
    <label>🕐 ميعاد النزول</label>
    <input id="dropoffDateTime" type="datetime-local">
    <small>حدد الميعاد المتوقع للوصول أو الموعد المطلوب للنزول.</small>
  </div>

  <div id="routeCard" class="card" style="display:none">
    <h3>🛣️ تفاصيل الرحلة</h3>
    <div id="routeInfo" class="status">جاري حساب المسافة والوقت...</div>
  </div>

  <div class="card">
    <label>👥 عدد الركاب</label>
    <select id="passengerCount">
      ${Array.from(
        { length: 8 },
        (_, i) => `<option value="${i + 1}">${i + 1} ${i === 0 ? "راكب" : "ركاب"}</option>`
      ).join("")}
    </select>
  </div>

  <div class="card">
    <label>📝 ملاحظات الرحلة</label>
    <textarea id="rideNotes" rows="4" maxlength="500"
      style="width:100%;padding:14px;border:1px solid #d7e4eb;border-radius:14px;margin:7px 0 10px;background:#fff;color:#12304a;outline:none;resize:vertical;font:inherit;"
      placeholder="مثال: معايا شنطة كبيرة، محتاج عربية واسعة..."></textarea>
    <small>اكتب أي شيء مهم عايز الكابتن يعرفه.</small>
  </div>

  <div class="card">
    <label>💰 سعر الرحلة المقترح</label>
    <input id="ridePrice" type="number" min="1" inputmode="decimal" placeholder="مثال: 100">
    <small>اكتب السعر اللي شايفه مناسب للرحلة.</small>
  </div>

  <button id="requestBtn" class="btn primary" type="button">🚕 اطلب الرحلة</button>
  <button id="captainBtn" class="btn green" type="button">🚗 دخول منصة الكباتن</button>

</section>

<!-- MAP -->
<section id="mapScreen" class="screen">

  <div class="card">
    <div class="switch">
      <div>
        <h2 id="mapTitle">🏁 حدد مكان النزول</h2>
        <small>ابحث عن المكان أو حرّك الخريطة وحدد النقطة بالضبط.</small>
      </div>
      <button id="closeMapBtn" class="btn danger" type="button" style="width:auto">إلغاء</button>
    </div>
  </div>

  <div class="card" style="position:relative;z-index:20">
    <label>🔎 ابحث عن المكان</label>
    <input id="destinationSearch" type="search"
      placeholder="اكتب اسم المكان أو الشارع أو المدينة..." autocomplete="off">
    <div id="searchResults" style="display:none;max-height:240px;overflow:auto;margin-top:8px;"></div>
  </div>

  <div id="mapContainer" class="map" style="position:relative">
    <div id="map" style="height:100%;width:100%;"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);z-index:10;pointer-events:none;font-size:42px;line-height:1;filter:drop-shadow(0 3px 3px #0005);">📍</div>
  </div>

  <div class="card">
    <div id="mapSelectedAddress" class="status">جاري تحميل الخريطة...</div>
    <button id="confirmMapBtn" class="btn primary" type="button">✅ تأكيد المكان</button>
  </div>

</section>

<!-- AUTH / EDIT PROFILE -->
<section id="authScreen" class="screen">
  <div class="card">

    <div class="avatar">📱</div>
    <h2 id="authTitle">إنشاء / تسجيل الدخول</h2>

    <div class="card" style="margin:10px 0">
      <label>أنا:</label>
      <select id="accountRole">
        <option value="customer">👤 عميل</option>
        <option value="captain">🚕 كابتن</option>
      </select>
    </div>

    <input id="accountName" type="text" placeholder="الاسم بالكامل">

    <div id="captainFields" style="display:none">
      <input id="captainCarType" type="text" placeholder="نوع العربية - مثال: سيدان">
      <input id="captainCarModel" type="text" placeholder="موديل العربية - مثال: لانسر">
      <input id="captainCarNumber" type="text" placeholder="رقم السيارة">
    </div>

    <label>📷 الصورة الشخصية</label>
    <input id="profileImage" type="file" accept="image/*">

    <div id="phoneSection">
      <input id="phone" type="tel" placeholder="01xxxxxxxxx أو +201xxxxxxxxx">
      <div id="recaptcha"></div>
      <button id="sendCodeBtn" class="btn primary" type="button">إرسال كود التحقق</button>

      <div id="codeSection" style="display:none">
        <input id="verificationCode" type="number" placeholder="اكتب كود التحقق">
        <button id="verifyCodeBtn" class="btn green" type="button">تأكيد الكود</button>
      </div>
    </div>

    <button id="saveProfileBtn" class="btn green" type="button" style="display:none">💾 حفظ البيانات</button>

    <div id="authMsg" class="status"></div>

  </div>
</section>

<!-- MY RIDES (customer) -->
<section id="myRidesScreen" class="screen">
  <div class="hero">
    <h2>رحلاتي 🧾</h2>
    <p>تابع رحلاتك واختار أنسب عرض من الكباتن.</p>
  </div>
  <div id="myRidesList" class="rides-list">
    <div class="card">سجل دخولك لعرض رحلاتك.</div>
  </div>
</section>

<!-- CAPTAIN -->
<section id="captainScreen" class="screen">

  <div class="hero">
    <h2>منصة الكباتن 🚗</h2>
    <p>الرحلات المفتوحة تظهر هنا ويمكنك تقديم سعرك للعميل.</p>
  </div>

  <div id="captainNotice"></div>

  <h3 class="section-title">✅ رحلاتي المقبولة</h3>
  <div id="captainAccepted" class="rides-list">
    <div class="card">لا توجد رحلات مقبولة حالياً</div>
  </div>

  <h3 class="section-title">🆕 رحلات مفتوحة</h3>
  <div id="captainRides" class="rides-list">
    <div class="card">لا توجد رحلات حالياً</div>
  </div>

  <button id="backHomeBtn" class="btn outline" type="button">← العودة للرئيسية</button>

</section>

<!-- PROFILE -->
<section id="profileScreen" class="screen">
  <div class="card">
    <div class="avatar">👤</div>
    <h2>حسابي</h2>
    <div id="profileInfo" class="status">غير مسجل</div>
    <button id="editProfileBtn" class="btn outline" type="button">✏️ تعديل بياناتي</button>
    <button id="logoutBtn" class="btn danger" type="button">تسجيل الخروج</button>
  </div>
</section>

<!-- NAV -->
<nav class="nav">
  <button id="navHome" class="active" type="button">🏠<br>الرئيسية</button>
  <button id="navMyRides" type="button">🧾<br>رحلاتي</button>
  <button id="navCaptain" type="button">🚗<br>الكابتن</button>
  <button id="navProfile" type="button">👤<br>حسابي</button>
</nav>

</div>
`;

/* ======================================================
   NAVIGATION
====================================================== */

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(`#${screenId}`)?.classList.add("active");

  document.querySelectorAll(".nav button").forEach((b) => b.classList.remove("active"));

  const navMap = {
    homeScreen: "#navHome",
    myRidesScreen: "#navMyRides",
    captainScreen: "#navCaptain",
    profileScreen: "#navProfile"
  };

  if (navMap[screenId]) $(navMap[screenId])?.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ======================================================
   LOCATION DISPLAY
====================================================== */

function updateLocationFields() {
  $("#pickupInfo").innerHTML = selectedPickup
    ? `📍 <strong>${escapeHtml(selectedPickup)}</strong>`
    : "لم يتم تحديد مكان الالتقاء";

  $("#destinationInfo").innerHTML = selectedDestination
    ? `🏁 <strong>${escapeHtml(selectedDestination)}</strong>`
    : "لم يتم تحديد مكان النزول";
}

/* ======================================================
   ROUTE
====================================================== */

async function calculateRoute() {
  const routeCard = $("#routeCard");
  const routeInfo = $("#routeInfo");

  if (!selectedPickupCoords || !selectedDestinationCoords) {
    routeCard.style.display = "none";
    return;
  }

  const token = ++routeToken;

  routeCard.style.display = "block";
  routeInfo.innerHTML = "🛣️ جاري حساب المسافة والوقت...";

  try {
    await loadGoogleMaps();

    const result = await new google.maps.DirectionsService().route({
      origin: selectedPickupCoords,
      destination: selectedDestinationCoords,
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.METRIC
    });

    if (token !== routeToken) return;

    const leg = result.routes?.[0]?.legs?.[0];
    if (!leg) throw new Error("لم يتم العثور على الطريق.");

    selectedDistanceKm = Number(leg.distance?.value || 0) / 1000;
    selectedDurationText = leg.duration?.text || "";

    routeInfo.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;">
        <div style="background:#eef6ff;padding:12px;border-radius:12px;">
          <strong style="display:block;font-size:20px;color:#0878df;">${selectedDistanceKm.toFixed(1)}</strong>
          <small>كيلومتر</small>
        </div>
        <div style="background:#eef8f2;padding:12px;border-radius:12px;">
          <strong style="display:block;font-size:20px;color:#20a65a;">${escapeHtml(selectedDurationText)}</strong>
          <small>وقت تقريبي</small>
        </div>
      </div>`;
  } catch (error) {
    if (token !== routeToken) return;
    console.error(error);

    selectedDistanceKm = null;
    selectedDurationText = "";

    routeInfo.innerHTML = "⚠️ تعذر حساب المسافة والوقت. تقدر تكمل وتطلب الرحلة عادي.";
  }
}

/* ======================================================
   CURRENT LOCATION
====================================================== */

async function getDeviceLocation() {
  try {
    let permission;

    try {
      permission = await Geolocation.checkPermissions();
    } catch (error) {
      console.warn("checkPermissions failed:", error);
    }

    if (permission && permission.location !== "granted") {
      permission = await Geolocation.requestPermissions();
    }

    if (permission && permission.location !== "granted") {
      throw new Error("LOCATION_PERMISSION_DENIED");
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
  } catch (nativeError) {
    console.error("Capacitor location error:", nativeError);

    if (nativeError?.message === "LOCATION_PERMISSION_DENIED") throw nativeError;
    if (!navigator.geolocation) throw nativeError;

    return await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          }),
        reject,
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }
}

$("#fromPlace").addEventListener("click", async () => {
  const button = $("#fromPlace");

  button.disabled = true;
  button.textContent = "📍 جاري تحديد موقعك...";

  try {
    const position = await getDeviceLocation();

    selectedPickupCoords = { lat: position.lat, lng: position.lng };
    selectedPickup = "جاري معرفة العنوان...";
    updateLocationFields();

    selectedPickup = await getAddressFromCoordinates(position.lat, position.lng);
    updateLocationFields();

    showMessage(
      `تم تحديد مكان الالتقاء. دقة الموقع حوالي ${Math.round(position.accuracy || 0)} متر.`,
      "success"
    );

    button.textContent = "📍 تم تحديد موقعي";
    await calculateRoute();
  } catch (error) {
    console.error(error);

    if (error?.message === "LOCATION_PERMISSION_DENIED" || error?.code === 1) {
      showMessage("اسمح للتطبيق باستخدام موقعك الحالي من إعدادات الإذن.", "error");
    } else {
      showMessage("تعذر تحديد موقعك. شغّل GPS وحاول مرة أخرى.", "error");
    }

    button.textContent = "📍 حاول مرة أخرى";
  } finally {
    button.disabled = false;
  }
});

/* ======================================================
   MAP PICKER (pickup / destination)
====================================================== */

async function openMapPicker(mode) {
  mapMode = mode;
  pendingCoords = null;
  pendingAddress = "";

  $("#mapTitle").textContent =
    mode === "pickup" ? "📍 حدد مكان الالتقاء" : "🏁 حدد مكان النزول";

  showScreen("mapScreen");

  $("#mapSelectedAddress").textContent = "جاري تجهيز الخريطة...";
  $("#destinationSearch").value = "";
  $("#searchResults").style.display = "none";

  try {
    await loadGoogleMaps();
    setTimeout(ensureMap, 150);
  } catch (error) {
    console.error(error);
    $("#mapSelectedAddress").innerHTML =
      "⚠️ لم يتم تحميل Google Maps.<br><br>تأكد من مفتاح Google Maps والـ APIs المفعّلة.";
    showMessage("تعذر تحميل Google Maps.", "error");
  }
}

function ensureMap() {
  const mapElement = $("#map");
  if (!mapElement || !window.google?.maps) return;

  const own = mapMode === "pickup" ? selectedPickupCoords : selectedDestinationCoords;
  const other = mapMode === "pickup" ? selectedDestinationCoords : selectedPickupCoords;
  const center = own || other || DEFAULT_CENTER;
  const zoom = own || other ? 17 : 12;

  if (!map) {
    map = new google.maps.Map(mapElement, {
      center,
      zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: "greedy"
    });

    map.addListener("idle", onMapIdle);
  } else {
    google.maps.event.trigger(map, "resize");
    map.setCenter(center);
    map.setZoom(zoom);
  }

  onMapIdle();
}

async function onMapIdle() {
  const position = map?.getCenter();
  if (!position) return;

  const lat = position.lat();
  const lng = position.lng();
  const token = ++geocodeToken;

  pendingCoords = { lat, lng };
  pendingAddress = "";

  $("#mapSelectedAddress").innerHTML =
    `📍 جاري تحديد المكان...<br><small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small>`;

  const address = await getAddressFromCoordinates(lat, lng);
  if (token !== geocodeToken) return;

  pendingAddress = address;

  $("#mapSelectedAddress").innerHTML = `
    🏁 <strong>المكان المحدد</strong><br><br>
    ${escapeHtml(address)}<br><br>
    <small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small>`;
}

$("#toPlace").addEventListener("click", () => openMapPicker("destination"));
$("#fromMapBtn").addEventListener("click", () => openMapPicker("pickup"));

$("#confirmMapBtn").addEventListener("click", async () => {
  if (!pendingCoords || !pendingAddress) {
    showMessage("استنى لحد ما العنوان يظهر، أو حرّك الخريطة.", "error");
    return;
  }

  if (mapMode === "pickup") {
    selectedPickupCoords = pendingCoords;
    selectedPickup = pendingAddress;
    $("#fromPlace").textContent = "📍 استخدم موقعي الحالي";
  } else {
    selectedDestinationCoords = pendingCoords;
    selectedDestination = pendingAddress;
  }

  updateLocationFields();
  showScreen("homeScreen");
  await calculateRoute();

  showMessage("تم تحديد المكان 📍", "success");
});

$("#closeMapBtn").addEventListener("click", () => showScreen("homeScreen"));

/* ======================================================
   MAP SEARCH
====================================================== */

$("#destinationSearch").addEventListener("input", () => {
  clearTimeout(mapSearchTimer);

  const value = $("#destinationSearch").value.trim();

  if (value.length < 2) {
    $("#searchResults").style.display = "none";
    $("#searchResults").innerHTML = "";
    return;
  }

  mapSearchTimer = setTimeout(() => searchPlaces(value), 500);
});

async function searchPlaces(text) {
  const resultsBox = $("#searchResults");

  resultsBox.style.display = "block";
  resultsBox.innerHTML = `<div class="card">🔎 جاري البحث...</div>`;

  try {
    await loadGoogleMaps();

    const service = new google.maps.places.AutocompleteService();

    service.getPlacePredictions(
      {
        input: text,
        componentRestrictions: { country: "eg" },
        language: "ar"
      },
      (predictions, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions?.length) {
          resultsBox.innerHTML = `<div class="card">لا توجد نتائج.</div>`;
          return;
        }

        resultsBox.innerHTML = predictions
          .slice(0, 8)
          .map(
            (p) => `
            <button type="button" class="search-result" data-place-id="${escapeHtml(p.place_id)}"
              style="display:block;width:100%;text-align:right;padding:12px;margin-bottom:6px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer;">
              <strong>${escapeHtml(p.structured_formatting?.main_text || p.description)}</strong><br>
              <small>${escapeHtml(p.structured_formatting?.secondary_text || "")}</small>
            </button>`
          )
          .join("");

        resultsBox.querySelectorAll(".search-result").forEach((button) => {
          button.addEventListener("click", () => selectPlace(button.dataset.placeId));
        });
      }
    );
  } catch (error) {
    console.error(error);
    resultsBox.innerHTML = `<div class="card error">تعذر البحث عن المكان.</div>`;
  }
}

async function selectPlace(placeId) {
  try {
    await loadGoogleMaps();

    const service = new google.maps.places.PlacesService(document.createElement("div"));

    service.getDetails(
      {
        placeId,
        fields: ["geometry", "formatted_address", "name"],
        language: "ar"
      },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          showMessage("تعذر تحديد المكان.", "error");
          return;
        }

        const coords = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };

        if (map) {
          map.setCenter(coords);
          map.setZoom(18);
        }

        $("#destinationSearch").value = place.name || place.formatted_address || "";
        $("#searchResults").style.display = "none";
      }
    );
  } catch (error) {
    console.error(error);
    showMessage("تعذر تحديد المكان.", "error");
  }
}

/* ======================================================
   RECAPTCHA + AUTH SCREEN
====================================================== */

function setupRecaptcha() {
  if (recaptcha) return;

  try {
    recaptcha = new RecaptchaVerifier(auth, "recaptcha", { size: "normal" });
    recaptcha.render();
  } catch (error) {
    console.error(error);
    $("#authMsg").textContent = "تعذر تشغيل التحقق.";
  }
}

function resetRecaptcha() {
  try {
    recaptcha?.clear();
  } catch {
    /* ignore */
  }

  recaptcha = null;

  const holder = $("#recaptcha");
  if (holder) holder.innerHTML = "";
}

function setAuthMode(editingProfile) {
  $("#phoneSection").style.display = editingProfile ? "none" : "block";
  $("#saveProfileBtn").style.display = editingProfile ? "block" : "none";
  $("#authTitle").textContent = editingProfile ? "بيانات الحساب" : "إنشاء / تسجيل الدخول";
}

function toggleCaptainFields() {
  $("#captainFields").style.display =
    $("#accountRole").value === "captain" ? "block" : "none";
}

$("#accountRole").addEventListener("change", toggleCaptainFields);

async function openAuth(preferredRole) {
  showScreen("authScreen");
  $("#authMsg").textContent = "";

  if (currentUser) {
    setAuthMode(true);

    try {
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      const data = snap.exists() ? snap.data() : {};

      $("#accountRole").value = data.role || "customer";
      $("#accountName").value = data.name || "";
      $("#captainCarType").value = data.carType || "";
      $("#captainCarModel").value = data.carModel || "";
      $("#captainCarNumber").value = data.carNumber || "";
    } catch (error) {
      console.error(error);
    }
  } else {
    setAuthMode(false);
    setupRecaptcha();

    if (preferredRole) $("#accountRole").value = preferredRole;
  }

  toggleCaptainFields();
}

$("#profileBtn").addEventListener("click", () => openProfileOrAuth());
$("#navProfile").addEventListener("click", () => openProfileOrAuth());

async function openProfileOrAuth() {
  if (!currentUser) {
    await openAuth();
    return;
  }
  await loadProfile();
  showScreen("profileScreen");
}

$("#editProfileBtn").addEventListener("click", () => openAuth());

/* ======================================================
   SEND SMS
====================================================== */

$("#sendCodeBtn").addEventListener("click", async () => {
  const phone = normalizePhone($("#phone").value);

  if (!phone.startsWith("+") || phone.length < 11) {
    $("#authMsg").textContent = "اكتب رقم الهاتف صح، مثال: 01012345678 أو +201012345678.";
    return;
  }

  try {
    setupRecaptcha();

    $("#sendCodeBtn").disabled = true;
    $("#authMsg").textContent = "جاري إرسال كود التحقق...";

    confirmationResult = await signInWithPhoneNumber(auth, phone, recaptcha);

    $("#codeSection").style.display = "block";
    $("#authMsg").textContent = "تم إرسال كود التحقق.";
  } catch (error) {
    console.error(error);

    $("#authMsg").textContent = error.message || "حدث خطأ أثناء إرسال الكود.";
    $("#sendCodeBtn").disabled = false;

    // الـ reCAPTCHA بتتحرق بعد أي محاولة فاشلة، لازم نعملها من جديد
    resetRecaptcha();
    setupRecaptcha();
  }
});

/* ======================================================
   VERIFY CODE
====================================================== */

$("#verifyCodeBtn").addEventListener("click", async () => {
  const code = $("#verificationCode").value.trim();

  if (!confirmationResult) {
    $("#authMsg").textContent = "اطلب الكود أولاً.";
    return;
  }

  if (!code) {
    $("#authMsg").textContent = "اكتب كود التحقق.";
    return;
  }

  try {
    $("#verifyCodeBtn").disabled = true;

    const result = await confirmationResult.confirm(code);

    // مهم: ما نستناش onAuthStateChanged
    currentUser = result.user;

    await finishProfileAndEnter();
  } catch (error) {
    console.error(error);
    $("#authMsg").textContent = error.message || "كود التحقق غير صحيح.";
  } finally {
    $("#verifyCodeBtn").disabled = false;
  }
});

$("#saveProfileBtn").addEventListener("click", async () => {
  await finishProfileAndEnter();
});

async function finishProfileAndEnter() {
  try {
    await saveUserProfile();

    $("#authMsg").textContent = "تم حفظ البيانات بنجاح.";

    if (currentRole === "captain") {
      showScreen("captainScreen");
      loadCaptainScreenData();
    } else {
      showScreen("homeScreen");
    }

    showMessage("تم تسجيل الدخول بنجاح ✅", "success");
  } catch (error) {
    console.error(error);

    // المستخدم اتسجل دخوله، فنبدل للوضع اللي يكمل فيه بياناته
    setAuthMode(true);
    $("#authMsg").textContent = error.message || "تعذر حفظ البيانات.";
  }
}

/* ======================================================
   SAVE PROFILE
====================================================== */

async function saveUserProfile() {
  if (!currentUser) throw new Error("سجل الدخول أولاً.");

  const userRef = doc(db, "users", currentUser.uid);
  const oldSnap = await getDoc(userRef);
  const oldData = oldSnap.exists() ? oldSnap.data() : {};

  const role = $("#accountRole").value;
  const name = $("#accountName").value.trim() || oldData.name || "";

  if (!name) throw new Error("اكتب الاسم أولاً.");

  const carType = $("#captainCarType").value.trim() || oldData.carType || "";
  const carModel = $("#captainCarModel").value.trim() || oldData.carModel || "";
  const carNumber = $("#captainCarNumber").value.trim() || oldData.carNumber || "";

  if (role === "captain" && (!carType || !carModel || !carNumber)) {
    throw new Error("الكابتن لازم يدخل نوع العربية وموديلها ورقم السيارة.");
  }

  let photoURL = oldData.photoURL || "";
  const imageFile = $("#profileImage").files?.[0];

  if (imageFile) {
    const extension = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
    const imageRef = storageRef(storage, `profileImages/${currentUser.uid}.${extension}`);

    await uploadBytes(imageRef, imageFile);
    photoURL = await getDownloadURL(imageRef);
  }

  const userData = {
    uid: currentUser.uid,
    phone: currentUser.phoneNumber || "",
    name,
    role,
    photoURL,
    updatedAt: serverTimestamp()
  };

  if (role === "captain") {
    userData.carType = carType;
    userData.carModel = carModel;
    userData.carNumber = carNumber;

    // ما نرجعش الحالة pending لو الكابتن اتوافق عليه قبل كده
    if (!oldData.captainStatus) userData.captainStatus = "pending";
  }

  if (!oldSnap.exists()) userData.createdAt = serverTimestamp();

  await setDoc(userRef, userData, { merge: true });

  $("#profileImage").value = "";

  await loadProfile();
}

/* ======================================================
   REQUEST RIDE
====================================================== */

$("#requestBtn").addEventListener("click", async () => {
  if (!currentUser) {
    await openAuth("customer");
    return;
  }

  if (currentRole !== "customer") {
    showMessage("حساب الكابتن لا ينشئ رحلة عميل.", "error");
    return;
  }

  if (!currentProfile?.name) {
    showMessage("أكمل بياناتك (الاسم) الأول.", "error");
    await openAuth();
    return;
  }

  if (!selectedPickupCoords) return showMessage("حدد مكان الالتقاء أولاً.", "error");
  if (!selectedDestinationCoords) return showMessage("حدد مكان النزول أولاً.", "error");

  const pickupDateTime = $("#pickupDateTime").value;
  const dropoffDateTime = $("#dropoffDateTime").value;

  if (!pickupDateTime) return showMessage("حدد ميعاد الالتقاء.", "error");
  if (!dropoffDateTime) return showMessage("حدد ميعاد النزول.", "error");

  if (new Date(pickupDateTime).getTime() < Date.now() - 60 * 1000) {
    return showMessage("ميعاد الالتقاء لازم يكون في المستقبل.", "error");
  }

  if (new Date(dropoffDateTime) < new Date(pickupDateTime)) {
    return showMessage("ميعاد النزول مينفعش يكون قبل ميعاد الالتقاء.", "error");
  }

  const price = Number($("#ridePrice").value);
  if (!price || price <= 0) return showMessage("اكتب سعر الرحلة.", "error");

  const passengerCount = Number($("#passengerCount").value) || 1;
  const rideNotes = $("#rideNotes").value.trim();

  const button = $("#requestBtn");

  try {
    button.disabled = true;
    button.textContent = "جاري إرسال الرحلة...";

    if (!selectedDistanceKm || !selectedDurationText) await calculateRoute();

    // رقم العميل مش بيتخزن في الرحلة المفتوحة، بيتضاف بعد قبول عرض
    await addDoc(collection(db, "rides"), {
      userId: currentUser.uid,
      customerName: currentProfile?.name || "",
      customerPhoto: currentProfile?.photoURL || "",
      fromPlace: selectedPickup,
      toPlace: selectedDestination,
      pickupCoords: selectedPickupCoords,
      destinationCoords: selectedDestinationCoords,
      pickupAt: pickupDateTime,
      dropoffAt: dropoffDateTime,
      price,
      passengerCount,
      notes: rideNotes,
      distanceKm: selectedDistanceKm || 0,
      durationText: selectedDurationText || "",
      status: "open",
      createdAt: serverTimestamp()
    });

    $("#ridePrice").value = "";
    $("#rideNotes").value = "";
    $("#passengerCount").value = "1";
    $("#pickupDateTime").value = "";
    $("#dropoffDateTime").value = "";

    showMessage("تم إرسال الرحلة للكباتن بنجاح 🚕", "success");

    showScreen("myRidesScreen");
    loadMyRides();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "حدث خطأ أثناء إرسال الرحلة.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "🚕 اطلب الرحلة";
  }
});

/* ======================================================
   SHARED RIDE DETAILS HTML
====================================================== */

function rideDetailsHtml(ride) {
  return `
    <div class="status">📍 <strong>الالتقاء:</strong><br>${escapeHtml(ride.fromPlace || "غير محدد")}</div>
    <div class="status">🏁 <strong>النزول:</strong><br>${escapeHtml(ride.toPlace || "غير محدد")}</div>
    <div class="status">🕐 <strong>ميعاد الالتقاء:</strong><br>${escapeHtml(formatDateTime(ride.pickupAt))}</div>
    <div class="status">🕐 <strong>ميعاد النزول:</strong><br>${escapeHtml(formatDateTime(ride.dropoffAt))}</div>
    <div class="status">
      🛣️ <strong>المسافة:</strong> ${Number(ride.distanceKm || 0).toFixed(1)} كم
      ${ride.durationText ? `<br>⏱️ <strong>الوقت:</strong> ${escapeHtml(ride.durationText)}` : ""}
    </div>
    <div class="status">👥 <strong>عدد الركاب:</strong> ${Number(ride.passengerCount || 1)}</div>
    ${
      ride.notes
        ? `<div class="status">📝 <strong>ملاحظات العميل:</strong><br><br>${escapeHtml(ride.notes)}</div>`
        : ""
    }`;
}

function personHtml(photo, name, subtitle) {
  const img = photo
    ? `<img src="${escapeHtml(photo)}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;">`
    : `<div style="font-size:35px">👤</div>`;

  return `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;">
      ${img}
      <div><strong>${escapeHtml(name || "بدون اسم")}</strong><br><small>${escapeHtml(subtitle)}</small></div>
    </div>`;
}

/* ======================================================
   CUSTOMER: MY RIDES + OFFERS
====================================================== */

function clearOfferListeners() {
  offerUnsubs.forEach((unsub) => unsub());
  offerUnsubs.clear();
}

function renderMyRideCard(ride) {
  const acceptedBlock =
    ride.status === "accepted"
      ? `
        <div class="status">
          🚕 <strong>الكابتن:</strong> ${escapeHtml(ride.captainName || "")}<br>
          🚗 ${escapeHtml(ride.carType || "")} ${escapeHtml(ride.carModel || "")} - ${escapeHtml(ride.carNumber || "")}<br>
          💰 <strong>السعر المتفق عليه:</strong> ${Number(ride.finalPrice || 0)} جنيه
        </div>
        ${
          ride.captainPhone
            ? `<a class="btn green link-btn" href="tel:${escapeHtml(ride.captainPhone)}">📞 اتصل بالكابتن</a>`
            : ""
        }`
      : "";

  const openBlock =
    ride.status === "open"
      ? `
        <h4 style="margin:12px 0 4px">💬 عروض الكباتن</h4>
        <div id="offers-${escapeHtml(ride.id)}"><div class="status">لسه مفيش عروض...</div></div>
        <button class="btn danger" data-cancel-ride="${escapeHtml(ride.id)}" type="button" style="margin-top:10px">إلغاء الرحلة</button>`
      : "";

  return `
    <div class="card">
      <div class="offer">
        <div><span class="pill">${escapeHtml(statusLabel(ride.status))}</span><h3>🚕 رحلتي</h3></div>
        <div class="price">${Number(ride.price || 0)} جنيه</div>
      </div>
      ${rideDetailsHtml(ride)}
      ${acceptedBlock}
      ${openBlock}
    </div>`;
}

function loadMyRides() {
  if (!currentUser) return;

  unsubMyRides?.();

  const q = query(collection(db, "rides"), where("userId", "==", currentUser.uid), limit(50));

  unsubMyRides = onSnapshot(
    q,
    (snapshot) => {
      clearOfferListeners();

      const box = $("#myRidesList");
      const rides = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byCreatedDesc);

      if (!rides.length) {
        box.innerHTML = `<div class="card">لسه ما طلبتش أي رحلة 🚕</div>`;
        return;
      }

      box.innerHTML = rides.map(renderMyRideCard).join("");

      box.querySelectorAll("[data-cancel-ride]").forEach((button) => {
        button.addEventListener("click", () => cancelRide(button.dataset.cancelRide));
      });

      rides.filter((r) => r.status === "open").forEach((r) => listenToOffers(r.id));
    },
    (error) => {
      console.error(error);
      $("#myRidesList").innerHTML =
        `<div class="card error">تعذر تحميل الرحلات.<br><br>${escapeHtml(error.message)}</div>`;
    }
  );
}

function listenToOffers(rideId) {
  const unsub = onSnapshot(
    collection(db, "rides", rideId, "offers"),
    (snapshot) => {
      const target = document.getElementById(`offers-${rideId}`);
      if (!target) return;

      const offers = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));

      if (!offers.length) {
        target.innerHTML = `<div class="status">لسه مفيش عروض...</div>`;
        return;
      }

      target.innerHTML = offers
        .map(
          (o) => `
          <div class="offer-row">
            <div class="top">
              ${
                o.captainPhoto
                  ? `<img src="${escapeHtml(o.captainPhoto)}">`
                  : `<div style="font-size:32px">🚕</div>`
              }
              <div style="flex:1">
                <strong>${escapeHtml(o.captainName || "كابتن")}</strong><br>
                <small>${escapeHtml(o.carType || "")} ${escapeHtml(o.carModel || "")} - ${escapeHtml(o.carNumber || "")}</small>
              </div>
              <div class="price">${Number(o.price || 0)} جنيه</div>
            </div>
            <button class="btn green" data-accept="${escapeHtml(o.id)}" type="button" style="margin-top:10px">✅ قبول العرض</button>
          </div>`
        )
        .join("");

      target.querySelectorAll("[data-accept]").forEach((button) => {
        button.addEventListener("click", () => acceptOffer(rideId, button.dataset.accept));
      });
    },
    (error) => console.error("offers listener:", error)
  );

  offerUnsubs.set(rideId, unsub);
}

async function acceptOffer(rideId, offerId) {
  const ok = await askConfirm("تقبل عرض الكابتن ده؟", "قبول");
  if (!ok) return;

  try {
    const offerRef = doc(db, "rides", rideId, "offers", offerId);
    const rideRef = doc(db, "rides", rideId);

    const offerSnap = await getDoc(offerRef);
    if (!offerSnap.exists()) throw new Error("العرض ده لم يعد موجوداً.");

    const o = offerSnap.data();

    const batch = writeBatch(db);

    batch.update(rideRef, {
      status: "accepted",
      acceptedOfferId: offerId,
      captainId: o.captainId,
      captainName: o.captainName || "",
      captainPhone: o.captainPhone || "",
      captainPhoto: o.captainPhoto || "",
      carType: o.carType || "",
      carModel: o.carModel || "",
      carNumber: o.carNumber || "",
      finalPrice: Number(o.price || 0),
      customerPhone: currentUser.phoneNumber || "",
      acceptedAt: serverTimestamp()
    });

    batch.update(offerRef, { status: "accepted" });

    await batch.commit();

    showMessage("تم قبول العرض ✅ تقدر تتصل بالكابتن.", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "تعذر قبول العرض.", "error");
  }
}

async function cancelRide(rideId) {
  const ok = await askConfirm("تلغي الرحلة دي؟", "إلغاء الرحلة");
  if (!ok) return;

  try {
    await updateDoc(doc(db, "rides", rideId), {
      status: "cancelled",
      cancelledAt: serverTimestamp()
    });

    showMessage("تم إلغاء الرحلة.", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "تعذر إلغاء الرحلة.", "error");
  }
}

$("#navMyRides").addEventListener("click", async () => {
  if (!currentUser) {
    await openAuth("customer");
    return;
  }

  if (currentRole === "captain") {
    showMessage("صفحة رحلاتي للعملاء. الكابتن يشوف رحلاته من شاشة الكابتن.", "info");
    return;
  }

  showScreen("myRidesScreen");
  loadMyRides();
});

/* ======================================================
   CAPTAIN
====================================================== */

async function openCaptainScreen() {
  if (!currentUser) {
    await openAuth("captain");
    return;
  }

  if (currentRole !== "captain") {
    showMessage("ده حساب عميل. لو عايز تشتغل ككابتن اعمل حساب كابتن.", "error");
    return;
  }

  showScreen("captainScreen");
  loadCaptainScreenData();
}

function loadCaptainScreenData() {
  const notice = $("#captainNotice");

  if (REQUIRE_CAPTAIN_APPROVAL && currentProfile?.captainStatus !== "approved") {
    notice.innerHTML = `<div class="card">⏳ حسابك تحت المراجعة. هتقدر تقدم عروض بعد الموافقة.</div>`;
  } else {
    notice.innerHTML = "";
  }

  loadCaptainRides();
  loadCaptainAccepted();
}

$("#captainBtn").addEventListener("click", openCaptainScreen);
$("#navCaptain").addEventListener("click", openCaptainScreen);
$("#navHome").addEventListener("click", () => showScreen("homeScreen"));
$("#backHomeBtn").addEventListener("click", () => showScreen("homeScreen"));

function loadCaptainRides() {
  unsubCaptainRides?.();

  const q = query(collection(db, "rides"), where("status", "==", "open"), limit(50));

  unsubCaptainRides = onSnapshot(
    q,
    (snapshot) => {
      openRidesCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byCreatedDesc);
      renderCaptainOpenRides();
    },
    (error) => {
      console.error(error);
      $("#captainRides").innerHTML =
        `<div class="card error">تعذر تحميل الرحلات.<br><br>${escapeHtml(error.message)}</div>`;
    }
  );
}

function renderCaptainOpenRides() {
  const container = $("#captainRides");

  if (!openRidesCache.length) {
    container.innerHTML = `<div class="card">لا توجد رحلات مفتوحة حالياً 🚕</div>`;
    return;
  }

  container.innerHTML = openRidesCache
    .map((ride) => {
      const sent = sentOffers.has(ride.id);

      return `
      <div class="card">
        <div class="offer">
          <div><span class="pill">رحلة جديدة</span><h3>🚕 طلب رحلة</h3></div>
          <div class="price">${Number(ride.price || 0)} جنيه</div>
        </div>
        ${personHtml(ride.customerPhoto, ride.customerName || "عميل", "عميل")}
        ${rideDetailsHtml(ride)}
        <button class="btn green offer-button" data-id="${escapeHtml(ride.id)}" data-price="${Number(ride.price || 0)}" type="button">
          ${sent ? "✅ تم إرسال عرضك (تعديل)" : "💰 تقديم عرض"}
        </button>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".offer-button").forEach((button) => {
    button.addEventListener("click", () => sendOffer(button.dataset.id, Number(button.dataset.price)));
  });
}

function loadCaptainAccepted() {
  unsubCaptainAccepted?.();

  const container = $("#captainAccepted");

  const q = query(collection(db, "rides"), where("captainId", "==", currentUser.uid), limit(50));

  unsubCaptainAccepted = onSnapshot(
    q,
    (snapshot) => {
      const rides = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.status === "accepted")
        .sort(byCreatedDesc);

      if (!rides.length) {
        container.innerHTML = `<div class="card">لا توجد رحلات مقبولة حالياً</div>`;
        return;
      }

      container.innerHTML = rides
        .map((ride) => {
          const link = navigationLink(ride.pickupCoords, ride.destinationCoords);

          return `
          <div class="card">
            <div class="offer">
              <div><span class="pill">مقبولة</span><h3>✅ رحلة مؤكدة</h3></div>
              <div class="price">${Number(ride.finalPrice || 0)} جنيه</div>
            </div>
            ${personHtml(ride.customerPhoto, ride.customerName || "عميل", "عميل")}
            ${rideDetailsHtml(ride)}
            ${
              ride.customerPhone
                ? `<a class="btn green link-btn" href="tel:${escapeHtml(ride.customerPhone)}">📞 اتصل بالعميل</a>`
                : ""
            }
            ${
              link
                ? `<a class="btn outline link-btn" href="${escapeHtml(link)}" target="_blank" rel="noopener">🧭 افتح الطريق في الخرائط</a>`
                : ""
            }
          </div>`;
        })
        .join("");
    },
    (error) => {
      console.error(error);
      container.innerHTML = `<div class="card error">تعذر تحميل رحلاتك.<br><br>${escapeHtml(error.message)}</div>`;
    }
  );
}

async function sendOffer(rideId, originalPrice) {
  if (!currentUser || currentRole !== "captain") {
    showMessage("سجل بحساب كابتن أولاً.", "error");
    return;
  }

  if (!captainAllowed()) {
    showMessage("حسابك لسه تحت المراجعة.", "error");
    return;
  }

  const price = await askPrice({
    title: "قدّم عرضك",
    note: `سعر العميل: ${originalPrice} جنيه`,
    initial: originalPrice || ""
  });

  if (price === null) return;

  try {
    const captainSnap = await getDoc(doc(db, "users", currentUser.uid));
    const captain = captainSnap.exists() ? captainSnap.data() : {};

    // معرّف العرض = معرّف الكابتن، فمفيش عروض مكررة من نفس الكابتن
    await setDoc(doc(db, "rides", rideId, "offers", currentUser.uid), {
      captainId: currentUser.uid,
      captainName: captain.name || "",
      captainPhone: currentUser.phoneNumber || "",
      captainPhoto: captain.photoURL || "",
      carType: captain.carType || "",
      carModel: captain.carModel || "",
      carNumber: captain.carNumber || "",
      price,
      status: "pending",
      createdAt: serverTimestamp()
    });

    sentOffers.add(rideId);
    renderCaptainOpenRides();

    showMessage("تم إرسال عرضك للعميل بنجاح ✅", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "تعذر إرسال العرض.", "error");
  }
}

/* ======================================================
   PROFILE
====================================================== */

async function loadProfile() {
  if (!currentUser) return;

  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid));

    if (!snap.exists()) {
      currentProfile = null;
      currentRole = "customer";

      $("#profileInfo").textContent = "لسه ما أكملتش بياناتك. اضغط تعديل بياناتي.";
      return;
    }

    const data = snap.data();

    currentProfile = data;
    currentRole = data.role || "customer";

    const photo = data.photoURL
      ? `<img src="${escapeHtml(data.photoURL)}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`
      : "👤";

    const captainExtra =
      currentRole === "captain"
        ? `
          <br><br>
          🚗 ${escapeHtml(data.carType || "")}<br>
          🚘 ${escapeHtml(data.carModel || "")}<br>
          🔢 ${escapeHtml(data.carNumber || "")}<br><br>
          الحالة: <strong>${
            data.captainStatus === "approved"
              ? "موافق عليه ✅"
              : data.captainStatus === "rejected"
                ? "مرفوض"
                : "تحت المراجعة ⏳"
          }</strong>`
        : "";

    $("#profileInfo").innerHTML = `
      <div style="text-align:center;">
        ${photo}<br><br>
        <strong>${escapeHtml(data.name || "بدون اسم")}</strong><br><br>
        📱 ${escapeHtml(currentUser.phoneNumber || "")}<br><br>
        👤 النوع: <strong>${currentRole === "captain" ? "كابتن" : "عميل"}</strong>
        ${captainExtra}
      </div>`;
  } catch (error) {
    console.error(error);
    $("#profileInfo").textContent = "تعذر تحميل الحساب.";
  }
}

/* ======================================================
   AUTH STATE + LOGOUT
====================================================== */

function stopAllListeners() {
  unsubCaptainRides?.();
  unsubCaptainAccepted?.();
  unsubMyRides?.();

  unsubCaptainRides = null;
  unsubCaptainAccepted = null;
  unsubMyRides = null;

  clearOfferListeners();

  openRidesCache = [];
  sentOffers.clear();
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    await loadProfile();
  } else {
    stopAllListeners();
    currentProfile = null;
    currentRole = "customer";
    $("#profileInfo").textContent = "غير مسجل";
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  try {
    stopAllListeners();
    await signOut(auth);

    currentUser = null;
    currentProfile = null;
    currentRole = "customer";
    confirmationResult = null;

    $("#codeSection").style.display = "none";
    $("#sendCodeBtn").disabled = false;
    $("#verificationCode").value = "";
    resetRecaptcha();

    showMessage("تم تسجيل الخروج.", "success");
    showScreen("homeScreen");
  } catch (error) {
    console.error(error);
    showMessage("تعذر تسجيل الخروج.", "error");
  }
});

/* ======================================================
   INITIALIZE
====================================================== */

$("#pickupDateTime").min = nowLocalInput();
$("#dropoffDateTime").min = nowLocalInput();

updateLocationFields();
showScreen("homeScreen");

console.log("وصلني المنوفية يعمل بنجاح 🚕");
