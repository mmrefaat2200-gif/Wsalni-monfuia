import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  serverTimestamp,
  limit
} from "firebase/firestore";

import { Geolocation } from "@capacitor/geolocation";

/* ======================================================
   FIREBASE
====================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAZVXuhTTiGKfDflIZUm_8IgzhRjjWsfIc",
  authDomain: "wasselni-monufia-13f28.firebaseapp.com",
  projectId: "wasselni-monufia-13f28",
  storageBucket: "wasselni-monufia-13f28.firebasestorage.app",
  messagingSenderId: "1007737426615",
  appId: "1:1007737426615:web:3a9d2638b8cb9616cef332",
  measurementId: "G-7K0MVY6F73"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(console.error);

/* ======================================================
   CONSTANTS
====================================================== */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const OSRM_URL = "https://router.project-osrm.org";

let currentUser = null;
let currentProfile = null;

let map = null;
let pickupMarker = null;
let destinationMarker = null;
let accuracyCircle = null;
let routeLine = null;

let pickupLocation = null;
let destinationLocation = null;

let destinationSearchTimer = null;

/* ======================================================
   HELPERS
====================================================== */

const $ = (id) => document.getElementById(id);

function appRoot() {
  return $("app");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeEgyptPhone(phone) {
  let value = String(phone || "").trim().replace(/\s+/g, "");

  if (value.startsWith("+20")) {
    return value;
  }

  if (value.startsWith("20") && value.length === 12) {
    return "+" + value;
  }

  if (value.startsWith("01") && value.length === 11) {
    return "+20" + value.substring(1);
  }

  return value;
}

/*
  Firebase Email/Password is used internally so that
  the user can login using phone + password.
*/
function phoneLoginEmail(phone) {
  const normalized = normalizeEgyptPhone(phone);
  const digits = normalized.replace(/\D/g, "");

  return `${digits}@phone.wasselni.app`;
}

function generateAccountNumber() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `WM${random}`;
}

function money(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString("ar-EG");
}

function showMessage(message, type = "info") {
  const old = document.querySelector(".toast-message");

  if (old) {
    old.remove();
  }

  const div = document.createElement("div");

  div.className = `toast-message ${type}`;
  div.textContent = message;

  document.body.appendChild(div);

  setTimeout(() => {
    div.remove();
  }, 3500);
}

function setLoading(button, loading, text = "جاري التنفيذ...") {
  if (!button) return;

  if (loading) {
    button.dataset.oldText = button.textContent;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.oldText || button.textContent;
  }
}

/* ======================================================
   AUTH
====================================================== */

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    currentProfile = null;
    showLogin();
    return;
  }

  try {
    const profileRef = doc(db, "users", user.uid);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      currentProfile = {
        id: user.uid,
        ...profileSnap.data()
      };

      showHome();
    } else {
      await signOut(auth);
      showLogin();
    }
  } catch (error) {
    console.error(error);
    showMessage("حصل خطأ في تحميل الحساب", "error");
  }
});

/* ======================================================
   LOGIN
====================================================== */

function showLogin() {
  appRoot().innerHTML = `
    <div class="auth-page">

      <div class="auth-card">

        <div class="logo-box">
          <div class="logo-icon">🚕</div>
          <h1>وصلني المنوفية</h1>
          <p>اطلب رحلتك بسهولة وأمان</p>
        </div>

        <form id="loginForm">

          <label>رقم الموبايل</label>

          <input
            id="loginPhone"
            type="tel"
            inputmode="tel"
            placeholder="مثال: 01012345678"
            required
          />

          <label>كلمة المرور</label>

          <input
            id="loginPassword"
            type="password"
            placeholder="اكتب كلمة المرور"
            required
          />

          <button
            id="loginBtn"
            class="primary-btn"
            type="submit"
          >
            تسجيل الدخول
          </button>

        </form>

        <div class="separator">
          <span>أو</span>
        </div>

        <button
          id="createAccountBtn"
          class="secondary-btn"
        >
          إنشاء حساب جديد
        </button>

      </div>

    </div>
  `;

  $("loginForm").addEventListener("submit", loginUser);

  $("createAccountBtn").addEventListener(
    "click",
    showRegister
  );
}

async function loginUser(event) {
  event.preventDefault();

  const phone = $("loginPhone").value.trim();
  const password = $("loginPassword").value;

  if (!phone || !password) {
    showMessage("اكتب رقم الموبايل وكلمة المرور", "error");
    return;
  }

  const normalizedPhone = normalizeEgyptPhone(phone);

  const button = $("loginBtn");

  try {
    setLoading(button, true, "جاري تسجيل الدخول...");

    const email = phoneLoginEmail(normalizedPhone);

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    showMessage("تم تسجيل الدخول بنجاح", "success");

  } catch (error) {
    console.error(error);

    if (
      error.code === "auth/invalid-credential" ||
      error.code === "auth/wrong-password" ||
      error.code === "auth/user-not-found"
    ) {
      showMessage(
        "رقم الموبايل أو كلمة المرور غير صحيحة",
        "error"
      );
    } else {
      showMessage(
        error.message || "تعذر تسجيل الدخول",
        "error"
      );
    }

    setLoading(button, false);
  }
}

/* ======================================================
   REGISTER
====================================================== */

function showRegister() {
  appRoot().innerHTML = `
    <div class="auth-page">

      <div class="auth-card register-card">

        <button
          id="backLoginBtn"
          class="back-btn"
        >
          ← رجوع
        </button>

        <div class="logo-box">
          <div class="logo-icon">🚕</div>
          <h1>إنشاء حساب</h1>
          <p>سجل حسابك في وصلني المنوفية</p>
        </div>

        <div class="account-type">

          <button
            id="customerTypeBtn"
            class="type-btn active"
            data-type="customer"
          >
            👤
            <span>عميل</span>
          </button>

          <button
            id="captainTypeBtn"
            class="type-btn"
            data-type="captain"
          >
            🚕
            <span>كابتن</span>
          </button>

        </div>

        <form id="registerForm">

          <label>الاسم</label>

          <input
            id="registerName"
            type="text"
            placeholder="اكتب الاسم"
            required
          />

          <label>رقم الموبايل</label>

          <input
            id="registerPhone"
            type="tel"
            inputmode="tel"
            placeholder="01012345678"
            required
          />

          <div id="captainFields" style="display:none;">

            <label>السن</label>

            <input
              id="registerAge"
              type="number"
              min="18"
              max="80"
              placeholder="مثال: 30"
            />

            <label>نوع العربية</label>

            <select id="carType">

              <option value="">اختر نوع العربية</option>
              <option value="ملاكي">ملاكي</option>
              <option value="ميكروباص">ميكروباص</option>
              <option value="نقل">نقل</option>
              <option value="نصف نقل">نصف نقل</option>
              <option value="دبابة">دبابة</option>

            </select>

            <label>موديل العربية</label>

            <input
              id="carModel"
              type="text"
              placeholder="مثال: تويوتا 2020"
            />

            <label>رقم اللوحة</label>

            <input
              id="plateNumber"
              type="text"
              placeholder="رقم اللوحة"
            />

          </div>

          <label>كلمة المرور</label>

          <input
            id="registerPassword"
            type="password"
            minlength="6"
            placeholder="6 أحرف أو أرقام على الأقل"
            required
          />

          <label>تأكيد كلمة المرور</label>

          <input
            id="registerPasswordConfirm"
            type="password"
            minlength="6"
            placeholder="أعد كتابة كلمة المرور"
            required
          />

          <button
            id="registerBtn"
            class="primary-btn"
            type="submit"
          >
            إنشاء الحساب
          </button>

        </form>

      </div>

    </div>
  `;

  let selectedType = "customer";

  $("backLoginBtn").addEventListener(
    "click",
    showLogin
  );

  $("customerTypeBtn").addEventListener(
    "click",
    () => {
      selectedType = "customer";

      $("customerTypeBtn").classList.add("active");
      $("captainTypeBtn").classList.remove("active");

      $("captainFields").style.display = "none";
    }
  );

  $("captainTypeBtn").addEventListener(
    "click",
    () => {
      selectedType = "captain";

      $("captainTypeBtn").classList.add("active");
      $("customerTypeBtn").classList.remove("active");

      $("captainFields").style.display = "block";
    }
  );

  $("registerForm").addEventListener(
    "submit",
    (event) =>
      registerUser(event, selectedType)
  );
}

async function registerUser(event, type) {
  event.preventDefault();

  const name = $("registerName").value.trim();
  const phone = normalizeEgyptPhone(
    $("registerPhone").value.trim()
  );

  const password = $("registerPassword").value;
  const confirmPassword =
    $("registerPasswordConfirm").value;

  if (!name || !phone || !password) {
    showMessage(
      "من فضلك املأ البيانات المطلوبة",
      "error"
    );

    return;
  }

  if (password.length < 6) {
    showMessage(
      "كلمة المرور لازم تكون 6 أحرف أو أرقام على الأقل",
      "error"
    );

    return;
  }

  if (password !== confirmPassword) {
    showMessage(
      "كلمتا المرور غير متطابقتين",
      "error"
    );

    return;
  }

  if (type === "captain") {
    const age = Number($("registerAge").value);

    if (!age || age < 18) {
      showMessage(
        "الكابتن لازم يكون عمره 18 سنة أو أكثر",
        "error"
      );

      return;
    }

    if (!$("carType").value) {
      showMessage(
        "اختار نوع العربية",
        "error"
      );

      return;
    }

    if (!$("carModel").value.trim()) {
      showMessage(
        "اكتب موديل العربية",
        "error"
      );

      return;
    }

    if (!$("plateNumber").value.trim()) {
      showMessage(
        "اكتب رقم اللوحة",
        "error"
      );

      return;
    }
  }

  const button = $("registerBtn");

  try {
    setLoading(
      button,
      true,
      "جاري إنشاء الحساب..."
    );

    const email = phoneLoginEmail(phone);

    /*
      Create Firebase Email/Password account.
      The email is internal and the user sees only
      the phone number.
    */

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    const uid = credential.user.uid;

    const accountNumber =
      generateAccountNumber();

    const userData = {
      uid,
      name,
      phone,
      type,
      accountNumber,
      createdAt: serverTimestamp()
    };

    if (type === "captain") {
      userData.age =
        Number($("registerAge").value);

      userData.carType =
        $("carType").value;

      userData.carModel =
        $("carModel").value.trim();

      userData.plateNumber =
        $("plateNumber").value.trim();

      userData.rating = 5;
      userData.totalRides = 0;
    }

    await setDoc(
      doc(db, "users", uid),
      userData
    );

    currentProfile = {
      id: uid,
      ...userData
    };

    showMessage(
      `تم إنشاء الحساب بنجاح. رقم حسابك: ${accountNumber}`,
      "success"
    );

    showHome();

  } catch (error) {
    console.error(error);

    if (error.code === "auth/email-already-in-use") {
      showMessage(
        "رقم الموبايل ده مسجل بالفعل. سجل دخول بدل إنشاء حساب جديد.",
        "error"
      );
    } else if (error.code === "auth/weak-password") {
      showMessage(
        "كلمة المرور ضعيفة",
        "error"
      );
    } else {
      showMessage(
        error.message || "تعذر إنشاء الحساب",
        "error"
      );
    }

    setLoading(button, false);
  }
}

/* ======================================================
   HOME
====================================================== */

function showHome() {
  if (!currentUser || !currentProfile) {
    showLogin();
    return;
  }

  const isCaptain =
    currentProfile.type === "captain";

  appRoot().innerHTML = `
    <div class="app-shell">

      <header class="top-header">

        <div>
          <h2>وصلني المنوفية</h2>
          <small>
            أهلاً ${escapeHtml(
              currentProfile.name || ""
            )}
          </small>
        </div>

        <button
          id="profileBtn"
          class="icon-btn"
          title="الحساب"
        >
          👤
        </button>

      </header>

      <main id="mainContent">

        ${
          isCaptain
            ? captainHomeHtml()
            : customerHomeHtml()
        }

      </main>

      <nav class="bottom-nav">

        <button
          class="nav-btn active"
          id="homeNav"
        >
          🏠
          <span>الرئيسية</span>
        </button>

        ${
          isCaptain
            ? `
              <button
                class="nav-btn"
                id="ridesNav"
              >
                🚕
                <span>الرحلات</span>
              </button>
            `
            : `
              <button
                class="nav-btn"
                id="myRidesNav"
              >
                📋
                <span>رحلاتي</span>
              </button>
            `
        }

        <button
          class="nav-btn"
          id="profileNav"
        >
          👤
          <span>حسابي</span>
        </button>

      </nav>

    </div>
  `;

  $("profileBtn").addEventListener(
    "click",
    showProfile
  );

  $("homeNav").addEventListener(
    "click",
    showHome
  );

  $("profileNav").addEventListener(
    "click",
    showProfile
  );

  if (isCaptain) {
    $("ridesNav").addEventListener(
      "click",
      showCaptainRides
    );
  } else {
    $("myRidesNav").addEventListener(
      "click",
      showCustomerRides
    );

    $("requestRideBtn").addEventListener(
      "click",
      showRideRequest
    );
  }
}

function customerHomeHtml() {
  return `
    <section class="home-section">

      <div class="welcome-card">

        <div>
          <h3>عايز تروح فين؟</h3>
          <p>
            حدد مكانك والوجهة واعرض السعر اللي يناسبك.
          </p>
        </div>

        <div class="big-car">
          🚕
        </div>

      </div>

      <button
        id="requestRideBtn"
        class="request-ride-card"
      >

        <div class="request-icon">
          📍
        </div>

        <div>
          <strong>اطلب رحلة</strong>
          <span>
            حدد مكان الانطلاق والنزول
          </span>
        </div>

        <div class="arrow">
          ←
        </div>

      </button>

      <div class="info-grid">

        <div class="info-card">
          <b>📍</b>
          <span>حدد موقعك بدقة</span>
        </div>

        <div class="info-card">
          <b>💰</b>
          <span>حدد السعر المناسب</span>
        </div>

        <div class="info-card">
          <b>🚕</b>
          <span>اختار عرض الكابتن</span>
        </div>

      </div>

    </section>
  `;
}

function captainHomeHtml() {
  return `
    <section class="home-section">

      <div class="welcome-card captain-welcome">

        <div>
          <h3>أهلاً يا كابتن 👋</h3>
          <p>
            شوف الرحلات القريبة منك واختار الرحلة المناسبة.
          </p>
        </div>

        <div class="big-car">
          🚕
        </div>

      </div>

      <button
        id="captainRidesHomeBtn"
        class="request-ride-card"
      >

        <div class="request-icon">
          🚕
        </div>

        <div>
          <strong>الرحلات المتاحة</strong>
          <span>
            شوف الطلبات واعرض سعرك
          </span>
        </div>

        <div class="arrow">
          ←
        </div>

      </button>

      <div class="captain-info">

        <h3>بيانات العربية</h3>

        <div class="profile-mini">

          <div>
            <strong>
              ${escapeHtml(
                currentProfile.carType || "-"
              )}
            </strong>

            <span>
              ${escapeHtml(
                currentProfile.carModel || "-"
              )}
            </span>
          </div>

          <div>
            <strong>اللوحة</strong>

            <span>
              ${escapeHtml(
                currentProfile.plateNumber || "-"
              )}
            </span>
          </div>

        </div>

      </div>

    </section>
  `;

}

/* ======================================================
   RIDE REQUEST
====================================================== */

function showRideRequest() {
  appRoot().innerHTML = `
    <div class="app-shell">

      <header class="top-header">

        <button
          id="backHomeBtn"
          class="back-btn"
        >
          ← رجوع
        </button>

        <div>
          <h2>طلب رحلة</h2>
          <small>حدد تفاصيل الرحلة</small>
        </div>

        <div></div>

      </header>

      <main class="ride-page">

        <div class="map-card">

          <div id="map"></div>

          <div class="map-controls">

            <button
              id="myLocationBtn"
              title="موقعي الحالي"
            >
              📍
            </button>

            <button
              id="zoomInBtn"
            >
              +
            </button>

            <button
              id="zoomOutBtn"
            >
              −
            </button>

          </div>

        </div>

        <div class="location-fields">

          <div class="location-input">

            <div class="location-dot pickup-dot"></div>

            <div>
              <label>مكان الانطلاق</label>

              <div
                id="pickupText"
                class="location-value"
              >
                جاري تحديد موقعك...
              </div>
            </div>

          </div>

          <div class="location-line"></div>

          <div class="location-input">

            <div class="location-dot destination-dot"></div>

            <div class="destination-search-wrapper">

              <label>مكان النزول</label>

              <input
                id="destinationSearch"
                type="text"
                placeholder="اكتب المكان..."
                autocomplete="off"
              />

              <div
                id="searchResults"
                class="search-results"
              ></div>

            </div>

          </div>

        </div>

        <div class="coordinates-box">

          <div>
            <span>خط العرض</span>
            <b id="latValue">-</b>
          </div>

          <div>
            <span>خط الطول</span>
            <b id="lngValue">-</b>
          </div>

        </div>

        <div id="routeInfo" class="route-info"></div>

        <div class="ride-details">

          <h3>تفاصيل الرحلة</h3>

          <label>عدد الركاب</label>

          <input
            id="passengers"
            type="number"
            min="1"
            max="20"
            value="1"
          />

          <label>السعر المقترح</label>

          <div class="price-input">

            <input
              id="ridePrice"
              type="number"
              min="1"
              placeholder="مثال: 100"
            />

            <span>جنيه</span>

          </div>

          <label>ملاحظات</label>

          <textarea
            id="rideNotes"
            rows="3"
            placeholder="مثال: معايا شنطة كبيرة..."
          ></textarea>

          <button
            id="submitRideBtn"
            class="primary-btn"
          >
            نشر الرحلة
          </button>

        </div>

      </main>

    </div>
  `;

  $("backHomeBtn").addEventListener(
    "click",
    showHome
  );

  initMap();

  $("myLocationBtn").addEventListener(
    "click",
    locateUser
  );

  $("zoomInBtn").addEventListener(
    "click",
    () => map?.zoomIn()
  );

  $("zoomOutBtn").addEventListener(
    "click",
    () => map?.zoomOut()
  );

  $("destinationSearch").addEventListener(
    "input",
    handleDestinationSearch
  );

  $("submitRideBtn").addEventListener(
    "click",
    submitRide
  );

  locateUser();
}

/* ======================================================
   MAP
====================================================== */

function initMap() {
  if (!$("map")) return;

  const defaultCenter = [
    30.5965,
    30.9750
  ];

  map = L.map("map", {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true
  }).setView(defaultCenter, 13);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
      attribution:
        '&copy; OpenStreetMap contributors'
    }
  ).addTo(map);

  map.on(
    "click",
    async (event) => {
      await setDestination(
        event.latlng.lat,
        event.latlng.lng
      );
    }
  );
}

async function locateUser() {
  if (!map) return;

  try {
    const permission =
      await Geolocation.checkPermissions();

    if (
      permission.location !== "granted"
    ) {
      const requested =
        await Geolocation.requestPermissions();

      if (
        requested.location !== "granted"
      ) {
        showMessage(
          "اسمح للتطبيق باستخدام الموقع من إعدادات الهاتف",
          "error"
        );

        return;
      }
    }

    const position =
      await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      });

    const lat =
      position.coords.latitude;

    const lng =
      position.coords.longitude;

    const accuracy =
      position.coords.accuracy || 30;

    pickupLocation = {
      lat,
      lng
    };

    if (pickupMarker) {
      pickupMarker.remove();
    }

    pickupMarker =
      L.marker([lat, lng], {
        title: "موقع الانطلاق"
      })
        .addTo(map)
        .bindPopup("📍 مكان الانطلاق");

    if (accuracyCircle) {
      accuracyCircle.remove();
    }

    accuracyCircle =
      L.circle([lat, lng], {
        radius: accuracy,
        weight: 2,
        fillOpacity: 0.08
      }).addTo(map);

    map.setView(
      [lat, lng],
      17,
      {
        animate: true
      }
    );

    $("latValue").textContent =
      lat.toFixed(6);

    $("lngValue").textContent =
      lng.toFixed(6);

    await reverseGeocode(
      lat,
      lng,
      "pickupText"
    );

  } catch (error) {
    console.error(error);

    showMessage(
      "مش قادر أحدد موقعك. تأكد إن GPS شغال وإنك سامح للتطبيق بالموقع.",
      "error"
    );

    if ($("pickupText")) {
      $("pickupText").textContent =
        "تعذر تحديد الموقع";
    }
  }
}

/* ======================================================
   REVERSE GEOCODING
====================================================== */

async function reverseGeocode(
  lat,
  lng,
  elementId
) {
  try {
    const response = await fetch(
      `${NOMINATIM_URL}/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(
        lng
      )}&zoom=18&addressdetails=1`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "Reverse geocoding failed"
      );
    }

    const data =
      await response.json();

    const text =
      data.display_name ||
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    if ($(elementId)) {
      $(elementId).textContent = text;
    }

  } catch (error) {
    console.error(error);

    if ($(elementId)) {
      $(elementId).textContent =
        `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }
}

/* ======================================================
   DESTINATION SEARCH
====================================================== */

function handleDestinationSearch(event) {
  const value =
    event.target.value.trim();

  clearTimeout(
    destinationSearchTimer
  );

  if (value.length < 3) {
    $("searchResults").innerHTML = "";
    return;
  }

  destinationSearchTimer =
    setTimeout(
      () => searchPlaces(value),
      600
    );
}

async function searchPlaces(queryText) {
  try {
    const url =
      `${NOMINATIM_URL}/search?format=jsonv2` +
      `&q=${encodeURIComponent(
        queryText
      )}` +
      `&countrycodes=eg` +
      `&addressdetails=1` +
      `&limit=8`;

    const response =
      await fetch(url, {
        headers: {
          Accept: "application/json"
        }
      });

    if (!response.ok) {
      throw new Error(
        "Search failed"
      );
    }

    const results =
      await response.json();

    const container =
      $("searchResults");

    if (!container) return;

    if (!results.length) {
      container.innerHTML = `
        <div class="no-results">
          مفيش نتائج
        </div>
      `;

      return;
    }

    container.innerHTML =
      results
        .map(
          (result, index) => `
            <button
              class="search-result"
              data-index="${index}"
            >
              📍
              <span>
                ${escapeHtml(
                  result.display_name
                )}
              </span>
            </button>
          `
        )
        .join("");

    container
      .querySelectorAll(
        ".search-result"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            const result =
              results[
                Number(
                  button.dataset.index
                )
              ];

            await setDestination(
              Number(result.lat),
              Number(result.lon),
              result.display_name
            );

            $("destinationSearch").value =
              result.display_name;

            container.innerHTML = "";
          }
        );

      });

  } catch (error) {
    console.error(error);

    showMessage(
      "تعذر البحث عن المكان",
      "error"
    );
  }
}

/* ======================================================
   DESTINATION MARKER
====================================================== */

async function setDestination(
  lat,
  lng,
  label = null
) {
  destinationLocation = {
    lat,
    lng
  };

  if (destinationMarker) {
    destinationMarker.remove();
  }

  destinationMarker =
    L.marker([lat, lng], {
      draggable: true,
      title: "مكان النزول"
    })
      .addTo(map)
      .bindPopup(
        "📍 مكان النزول"
      )
      .openPopup();

  destinationMarker.on(
    "dragend",
    async (event) => {

      const position =
        event.target.getLatLng();

      destinationLocation = {
        lat: position.lat,
        lng: position.lng
      };

      await reverseGeocode(
        position.lat,
        position.lng,
        "destinationSearch"
      );

      await drawRoute();
    }
  );

  if (label) {
    $("destinationSearch").value =
      label;
  } else {
    await reverseGeocode(
      lat,
      lng,
      "destinationSearch"
    );
  }

  $("latValue").textContent =
    lat.toFixed(6);

  $("lngValue").textContent =
    lng.toFixed(6);

  await drawRoute();

  if (pickupLocation) {
    const bounds =
      L.latLngBounds([
        [
          pickupLocation.lat,
          pickupLocation.lng
        ],
        [lat, lng]
      ]);

    map.fitBounds(bounds, {
      padding: [50, 50]
    });
  } else {
    map.setView(
      [lat, lng],
      17
    );
  }
}

/* ======================================================
   ROUTING
====================================================== */

async function drawRoute() {
  if (
    !pickupLocation ||
    !destinationLocation
  ) {
    return;
  }

  try {
    const url =
      `${OSRM_URL}/route/v1/driving/` +
      `${pickupLocation.lng},${pickupLocation.lat};` +
      `${destinationLocation.lng},${destinationLocation.lat}` +
      `?overview=full&geometries=geojson`;

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Routing failed"
      );
    }

    const data =
      await response.json();

    if (
      data.code !== "Ok" ||
      !data.routes?.length
    ) {
      throw new Error(
        "No route"
      );
    }

    const route =
      data.routes[0];

    if (routeLine) {
      routeLine.remove();
    }

    routeLine =
      L.geoJSON(
        route.geometry,
        {
          style: {
            weight: 6,
            opacity: 0.85
          }
        }
      ).addTo(map);

    const distanceKm =
      route.distance / 1000;

    const durationMin =
      route.duration / 60;

    $("routeInfo").innerHTML = `
      <div>
        <strong>المسافة</strong>
        <span>
          ${distanceKm.toFixed(1)} كم
        </span>
      </div>

      <div>
        <strong>الوقت التقريبي</strong>
        <span>
          ${Math.round(durationMin)} دقيقة
        </span>
      </div>
    `;

  } catch (error) {
    console.error(error);

    if ($("routeInfo")) {
      $("routeInfo").innerHTML = `
        <div>
          لم يتم حساب الطريق حالياً
        </div>
      `;
    }
  }
}

/* ======================================================
   SUBMIT RIDE
====================================================== */

async function submitRide() {
  if (!currentUser) {
    showLogin();
    return;
  }

  if (!pickupLocation) {
    showMessage(
      "حدد مكان الانطلاق أولاً",
      "error"
    );

    return;
  }

  if (!destinationLocation) {
    showMessage(
      "حدد مكان النزول أولاً",
      "error"
    );

    return;
  }

  const passengers =
    Number($("passengers").value);

  const price =
    Number($("ridePrice").value);

  const notes =
    $("rideNotes").value.trim();

  if (!passengers || passengers < 1) {
    showMessage(
      "اكتب عدد الركاب",
      "error"
    );

    return;
  }

  if (!price || price <= 0) {
    showMessage(
      "اكتب السعر المقترح",
      "error"
    );

    return;
  }

  const button =
    $("submitRideBtn");

  try {
    setLoading(
      button,
      true,
      "جاري نشر الرحلة..."
    );

    const pickupText =
      $("pickupText")?.textContent || "";

    const destinationText =
      $("destinationSearch")?.value || "";

    const rideData = {

      customerId:
        currentUser.uid,

      customerName:
        currentProfile.name || "",

      pickup: {
        lat: pickupLocation.lat,
        lng: pickupLocation.lng,
        address: pickupText
      },

      destination: {
        lat: destinationLocation.lat,
        lng: destinationLocation.lng,
        address: destinationText
      },

      passengers,

      price,

      notes,

      status: "open",

      createdAt:
        serverTimestamp()

    };

    await addDoc(
      collection(db, "rides"),
      rideData
    );

    showMessage(
      "تم نشر الرحلة للكباتن بنجاح",
      "success"
    );

    showCustomerRides();

  } catch (error) {
    console.error(error);

    showMessage(
      "حصل خطأ أثناء نشر الرحلة",
      "error"
    );

    setLoading(
      button,
      false
    );
  }
}

/* ======================================================
   CUSTOMER RIDES
====================================================== */

function showCustomerRides() {
  appRoot().innerHTML = `
    <div class="app-shell">

      <header class="top-header">

        <div>
          <h2>رحلاتي</h2>
          <small>الرحلات اللي طلبتها</small>
        </div>

        <button
          id="backHomeBtn"
          class="icon-btn"
        >
          🏠
        </button>

      </header>

      <main class="content-page">

        <div
          id="customerRidesList"
          class="rides-list"
        >
          <div class="loading">
            جاري تحميل الرحلات...
          </div>
        </div>

      </main>

      <nav class="bottom-nav">

        <button
          class="nav-btn"
          id="homeNav"
        >
          🏠
          <span>الرئيسية</span>
        </button>

        <button
          class="nav-btn active"
        >
          📋
          <span>رحلاتي</span>
        </button>

        <button
          class="nav-btn"
          id="profileNav"
        >
          👤
          <span>حسابي</span>
        </button>

      </nav>

    </div>
  `;

  $("backHomeBtn").addEventListener(
    "click",
    showHome
  );

  $("homeNav").addEventListener(
    "click",
    showHome
  );

  $("profileNav").addEventListener(
    "click",
    showProfile
  );

  loadCustomerRides();
}

async function loadCustomerRides() {
  const container =
    $("customerRidesList");

  if (!container) return;

  try {
    const q =
      query(
        collection(db, "rides"),
        where(
          "customerId",
          "==",
          currentUser.uid
        ),
        limit(50)
      );

    const snapshot =
      await getDocs(q);

    const rides =
      snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        .sort(
          (a, b) =>
            timestampValue(
              b.createdAt
            ) -
            timestampValue(
              a.createdAt
            )
        );

    if (!rides.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div>🚕</div>
          <h3>مفيش رحلات لسه</h3>
          <p>اطلب أول رحلة ليك.</p>
          <button
            id="newRideBtn"
            class="primary-btn"
          >
            اطلب رحلة
          </button>
        </div>
      `;

      $("newRideBtn").addEventListener(
        "click",
        showRideRequest
      );

      return;
    }

    container.innerHTML =
      rides
        .map(
          (ride) =>
            customerRideCard(
              ride
            )
        )
        .join("");

    rides.forEach(
      (ride) => {
        const button =
          document.querySelector(
            `[data-offers="${ride.id}"]`
          );

        if (button) {
          button.addEventListener(
            "click",
            () =>
              showRideOffers(
                ride.id
              )
          );
        }
      }
    );

  } catch (error) {
    console.error(error);

    container.innerHTML = `
      <div class="empty-state">
        حصل خطأ في تحميل الرحلات
      </div>
    `;
  }
}

function timestampValue(timestamp) {
  if (!timestamp) return 0;

  if (
    typeof timestamp.toMillis ===
    "function"
  ) {
    return timestamp.toMillis();
  }

  if (
    timestamp.seconds !== undefined
  ) {
    return timestamp.seconds * 1000;
  }

  return 0;
}

function customerRideCard(ride) {
  const statusText =
    ride.status === "open"
      ? "في انتظار الكباتن"
      : ride.status === "accepted"
      ? "تم قبول الرحلة"
      : ride.status === "completed"
      ? "مكتملة"
      : ride.status === "cancelled"
      ? "ملغاة"
      : ride.status || "غير معروف";

  return `
    <div class="ride-card">

      <div class="ride-card-header">

        <strong>
          ${statusText}
        </strong>

        <span class="ride-price">
          ${money(ride.price)} جنيه
        </span>

      </div>

      <div class="ride-location">
        <b>📍</b>
        <span>
          ${escapeHtml(
            ride.pickup?.address ||
              "مكان الانطلاق"
          )}
        </span>
      </div>

      <div class="ride-location">
        <b>🏁</b>
        <span>
          ${escapeHtml(
            ride.destination?.address ||
              "مكان النزول"
          )}
        </span>
      </div>

      <div class="ride-meta">

        <span>
          👥 ${ride.passengers || 1}
        </span>

        ${
          ride.notes
            ? `
              <span>
                📝 ${escapeHtml(
                  ride.notes
                )}
              </span>
            `
            : ""
        }

      </div>

      ${
        ride.status === "open"
          ? `
            <button
              class="secondary-btn"
              data-offers="${ride.id}"
            >
              مشاهدة عروض الكباتن
            </button>
          `
          : ""
      }

    </div>
  `;
}

/* ======================================================
   OFFERS
====================================================== */

async function showRideOffers(rideId) {
  appRoot().innerHTML = `
    <div class="app-shell">

      <header class="top-header">

        <button
          id="backRidesBtn"
          class="back-btn"
        >
          ← رجوع
        </button>

        <div>
          <h2>عروض الكباتن</h2>
          <small>اختار العرض المناسب</small>
        </div>

        <div></div>

      </header>

      <main class="content-page">

        <div
          id="offersList"
          class="offers-list"
        >
          جاري تحميل العروض...
        </div>

      </main>

    </div>
  `;

  $("backRidesBtn").addEventListener(
    "click",
    showCustomerRides
  );

  await loadOffers(
    rideId
  );
}

async function loadOffers(rideId) {
  const container =
    $("offersList");

  try {
    const q =
      query(
        collection(db, "offers"),
        where(
          "rideId",
          "==",
          rideId
        ),
        limit(50)
      );

    const snapshot =
      await getDocs(q);

    const offers =
      snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        .sort(
          (a, b) =>
            Number(a.price || 0) -
            Number(b.price || 0)
        );

    if (!offers.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div>🚕</div>
          <h3>لسه مفيش عروض</h3>
          <p>
            استنى شوية، الكباتن هتشوف طلبك.
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      offers
        .map(
          (offer) => `
            <div class="offer-card">

              <div class="offer-driver">

                <div class="driver-avatar">
                  👤
                </div>

                <div>

                  <strong>
                    ${escapeHtml(
                      offer.captainName ||
                        "كابتن"
                    )}
                  </strong>

                  <span>
                    ${
                      offer.carType
                        ? escapeHtml(
                            offer.carType
                          )
                        : "سيارة"
                    }
                    ${
                      offer.carModel
                        ? " - " +
                          escapeHtml(
                            offer.carModel
                          )
                        : ""
                    }
                  </span>

                </div>

              </div>

              <div class="offer-price">
                ${money(
                  offer.price
                )}
                <small>جنيه</small>
              </div>

              ${
                offer.status ===
                "accepted"
                  ? `
                    <div class="accepted-label">
                      تم قبول العرض
                    </div>
                  `
                  : `
                    <button
                      class="primary-btn accept-offer-btn"
                      data-offer="${offer.id}"
                      data-ride="${rideId}"
                    >
                      قبول العرض
                    </button>
                  `
              }

            </div>
          `
        )
        .join("");

    container
      .querySelectorAll(
        ".accept-offer-btn"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () =>
              acceptOffer(
                button.dataset.offer,
                button.dataset.ride
              )
          );
        }
      );

  } catch (error) {
    console.error(error);

    container.innerHTML = `
      <div class="empty-state">
        حصل خطأ في تحميل العروض
      </div>
    `;
  }
}

async function acceptOffer(
  offerId,
  rideId
) {
  if (
    !confirm(
      "هل أنت متأكد من قبول العرض؟"
    )
  ) {
    return;
  }

  try {
    const offerRef =
      doc(
        db,
        "offers",
        offerId
      );

    const rideRef =
      doc(
        db,
        "rides",
        rideId
      );

    const offerSnap =
      await getDoc(offerRef);

    if (!offerSnap.exists()) {
      showMessage(
        "العرض غير موجود",
        "error"
      );

      return;
    }

    const offer =
      offerSnap.data();

    await updateDoc(
      offerRef,
      {
        status: "accepted"
      }
    );

    await updateDoc(
      rideRef,
      {
        status: "accepted",
        acceptedOfferId:
          offerId,
        captainId:
          offer.captainId,
        captainName:
          offer.captainName,
        finalPrice:
          Number(offer.price)
      }
    );

    showMessage(
      "تم قبول العرض بنجاح",
      "success"
    );

    showCustomerRides();

  } catch (error) {
    console.error(error);

    showMessage(
      "تعذر قبول العرض",
      "error"
    );
  }
}

/* ======================================================
   CAPTAIN RIDES
====================================================== */

function showCaptainRides() {
  appRoot().innerHTML = `
    <div class="app-shell">

      <header class="top-header">

        <div>
          <h2>الرحلات المتاحة</h2>
          <small>
            اختار الرحلة واعرض سعرك
          </small>
        </div>

        <button
          id="refreshRidesBtn"
          class="icon-btn"
        >
          🔄
        </button>

      </header>

      <main class="content-page">

        <div
          id="captainRidesList"
          class="rides-list"
        >
          جاري تحميل الرحلات...
        </div>

      </main>

      <nav class="bottom-nav">

        <button
          class="nav-btn"
          id="homeNav"
        >
          🏠
          <span>الرئيسية</span>
        </button>

        <button
          class="nav-btn active"
        >
          🚕
          <span>الرحلات</span>
        </button>

        <button
          class="nav-btn"
          id="profileNav"
        >
          👤
          <span>حسابي</span>
        </button>

      </nav>

    </div>
  `;

  $("homeNav").addEventListener(
    "click",
    showHome
  );

  $("profileNav").addEventListener(
    "click",
    showProfile
  );

  $("refreshRidesBtn").addEventListener(
    "click",
    loadCaptainRides
  );

  loadCaptainRides();
}

async function loadCaptainRides() {
  const container =
    $("captainRidesList");

  if (!container) return;

  try {
    /*
      Only where() is used here so Firebase doesn't
      require a composite index.
    */

    const q =
      query(
        collection(db, "rides"),
        where(
          "status",
          "==",
          "open"
        ),
        limit(50)
      );

    const snapshot =
      await getDocs(q);

    const rides =
      snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        .sort(
          (a, b) =>
            timestampValue(
              b.createdAt
            ) -
            timestampValue(
              a.createdAt
            )
        );

    if (!rides.length) {
      container.innerHTML = `
        <div class="empty-state">

          <div>🚕</div>

          <h3>
            مفيش رحلات متاحة دلوقتي
          </h3>

          <p>
            جرب تعمل تحديث بعد شوية.
          </p>

        </div>
      `;

      return;
    }

    container.innerHTML =
      rides
        .map(
          (ride) =>
            captainRideCard(
              ride
            )
        )
        .join("");

    container
      .querySelectorAll(
        ".make-offer-btn"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () =>
              showOfferForm(
                button.dataset.ride
              )
          );
        }
      );

  } catch (error) {
    console.error(error);

    container.innerHTML = `
      <div class="empty-state">
        حصل خطأ في تحميل الرحلات
      </div>
    `;
  }
}

function captainRideCard(ride) {
  return `
    <div class="ride-card">

      <div class="ride-card-header">

        <strong>
          طلب رحلة
        </strong>

        <span class="ride-price">
          ${money(
            ride.price
          )}
          جنيه
        </span>

      </div>

      <div class="ride-location">

        <b>📍</b>

        <span>
          ${escapeHtml(
            ride.pickup?.address ||
              "مكان الانطلاق"
          )}
        </span>

      </div>

      <div class="ride-location">

        <b>🏁</b>

        <span>
          ${escapeHtml(
            ride.destination?.address ||
              "مكان النزول"
          )}
        </span>

      </div>

      <div class="ride-meta">

        <span>
          👥 ${ride.passengers || 1}
        </span>

        ${
          ride.notes
            ? `
              <span>
                📝 ${escapeHtml(
                  ride.notes
                )}
              </span>
            `
            : ""
        }

      </div>

      <button
        class="primary-btn make-offer-btn"
        data-ride="${ride.id}"
      >
        💰 اعرض سعرك
      </button>

    </div>
  `;
}

/* ======================================================
   CAPTAIN OFFER
====================================================== */

async function showOfferForm(
  rideId
) {
  const rideRef =
    doc(
      db,
      "rides",
      rideId
    );

  const rideSnap =
    await getDoc(rideRef);

  if (!rideSnap.exists()) {
    showMessage(
      "الرحلة لم تعد موجودة",
      "error"
    );

    return;
  }

  const ride =
    rideSnap.data();

  appRoot().innerHTML = `
    <div class="app-shell">

      <header class="top-header">

        <button
          id="backCaptainRides"
          class="back-btn"
        >
          ← رجوع
        </button>

        <div>
          <h2>تقديم عرض</h2>
          <small>اعرض السعر المناسب ليك</small>
        </div>

        <div></div>

      </header>

      <main class="content-page">

        <div class="ride-card">

          <div class="ride-card-header">

            <strong>
              السعر المطلوب
            </strong>

            <span class="ride-price">
              ${money(
                ride.price
              )}
              جنيه
            </span>

          </div>

          <div class="ride-location">
            📍
            <span>
              ${escapeHtml(
                ride.pickup?.address ||
                  ""
              )}
            </span>
          </div>

          <div class="ride-location">
            🏁
            <span>
              ${escapeHtml(
                ride.destination?.address ||
                  ""
              )}
            </span>
          </div>

          <div class="ride-meta">

            <span>
              👥 ${ride.passengers || 1}
            </span>

            ${
              ride.notes
                ? `
                  <span>
                    📝 ${escapeHtml(
                      ride.notes
                    )}
                  </span>
                `
                : ""
            }

          </div>

        </div>

        <div class="ride-details">

          <h3>
            سعرك للرحلة
          </h3>

          <div class="price-input">

            <input
              id="offerPrice"
              type="number"
              min="1"
              value="${ride.price || ""}"
              placeholder="اكتب السعر"
            />

            <span>جنيه</span>

          </div>

          <button
            id="sendOfferBtn"
            class="primary-btn"
          >
            إرسال العرض
          </button>

        </div>

      </main>

    </div>
  `;

  $("backCaptainRides")
    .addEventListener(
      "click",
      showCaptainRides
    );

  $("sendOfferBtn")
    .addEventListener(
      "click",
      () =>
        sendOffer(rideId)
    );
}

async function sendOffer(
  rideId
) {
  const price =
    Number(
      $("offerPrice").value
    );

  if (!price || price <= 0) {
    showMessage(
      "اكتب السعر",
      "error"
    );

    return;
  }

  try {
    const existingQuery =
      query(
        collection(db, "offers"),
        where(
          "rideId",
          "==",
          rideId
        ),
        where(
          "captainId",
          "==",
          currentUser.uid
        ),
        limit(1)
      );

    const existing =
      await getDocs(
        existingQuery
      );

    if (!existing.empty) {
      showMessage(
        "أنت قدمت عرض للرحلة دي بالفعل",
        "error"
      );

      return;
    }

    await addDoc(
      collection(db, "offers"),
      {
        rideId,

        captainId:
          currentUser.uid,

        captainName:
          currentProfile.name || "",

        carType:
          currentProfile.carType || "",

        carModel:
          currentProfile.carModel || "",

        plateNumber:
          currentProfile.plateNumber || "",

        price,

        status: "pending",

        createdAt:
          serverTimestamp()
      }
    );

    showMessage(
      "تم إرسال العرض للعميل",
      "success"
    );

    showCaptainRides();

  } catch (error) {
    console.error(error);

    showMessage(
      "تعذر إرسال العرض",
      "error"
    );
  }
}

/* ======================================================
   PROFILE
====================================================== */

function showProfile() {
  const isCaptain =
    currentProfile.type ===
    "captain";

  appRoot().innerHTML = `
    <div class="app-shell">

      <header class="top-header">

        <div>
          <h2>حسابي</h2>
          <small>بيانات الحساب</small>
        </div>

        <button
          id="homeBtn"
          class="icon-btn"
        >
          🏠
        </button>

      </header>

      <main class="content-page">

        <div class="profile-card">

          <div class="profile-avatar">
            👤
          </div>

          <h2>
            ${escapeHtml(
              currentProfile.name ||
                ""
            )}
          </h2>

          <span class="account-type-label">
            ${
              isCaptain
                ? "كابتن"
                : "عميل"
            }
          </span>

          <div class="profile-data">

            <div>
              <span>رقم الموبايل</span>
              <strong>
                ${escapeHtml(
                  currentProfile.phone ||
                    ""
                )}
              </strong>
            </div>

            <div>
              <span>رقم الحساب</span>
              <strong>
                ${escapeHtml(
                  currentProfile.accountNumber ||
                    ""
                )}
              </strong>
            </div>

            ${
              isCaptain
                ? `
                  <div>
                    <span>السن</span>
                    <strong>
                      ${
                        currentProfile.age ||
                        "-"
                      }
                    </strong>
                  </div>

                  <div>
                    <span>نوع العربية</span>
                    <strong>
                      ${escapeHtml(
                        currentProfile.carType ||
                          "-"
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>موديل العربية</span>
                    <strong>
                      ${escapeHtml(
                        currentProfile.carModel ||
                          "-"
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>رقم اللوحة</span>
                    <strong>
                      ${escapeHtml(
                        currentProfile.plateNumber ||
                          "-"
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>التقييم</span>
                    <strong>
                      ⭐ ${
                        currentProfile.rating ||
                        5
                      }
                    </strong>
                  </div>
                `
                : ""
            }

          </div>

          <button
            id="logoutBtn"
            class="danger-btn"
          >
            تسجيل الخروج
          </button>

        </div>

      </main>

      <nav class="bottom-nav">

        <button
          class="nav-btn"
          id="homeNav"
        >
          🏠
          <span>الرئيسية</span>
        </button>

        ${
          isCaptain
            ? `
              <button
                class="nav-btn"
                id="ridesNav"
              >
                🚕
                <span>الرحلات</span>
              </button>
            `
            : `
              <button
                class="nav-btn"
                id="myRidesNav"
              >
                📋
                <span>رحلاتي</span>
              </button>
            `
        }

        <button
          class="nav-btn active"
        >
          👤
          <span>حسابي</span>
        </button>

      </nav>

    </div>
  `;

  $("homeBtn").addEventListener(
    "click",
    showHome
  );

  $("homeNav").addEventListener(
    "click",
    showHome
  );

  $("logoutBtn").addEventListener(
    "click",
    async () => {
      try {
        await signOut(auth);

        currentUser = null;
        currentProfile = null;

        showLogin();

      } catch (error) {
        console.error(error);

        showMessage(
          "تعذر تسجيل الخروج",
          "error"
        );
      }
    }
  );

  if (isCaptain) {
    $("ridesNav").addEventListener(
      "click",
      showCaptainRides
    );
  } else {
    $("myRidesNav").addEventListener(
      "click",
      showCustomerRides
    );
  }
}

/* ======================================================
   GLOBAL CSS
====================================================== */

const dynamicStyle =
  document.createElement("style");

dynamicStyle.textContent = `

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    Arial,
    Tahoma,
    sans-serif;
  background: #f5f7fa;
  color: #18212f;
}

button,
input,
textarea,
select {
  font-family: inherit;
}

button {
  cursor: pointer;
}

.auth-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background:
    linear-gradient(
      145deg,
      #eef6ff,
      #ffffff
    );
}

.auth-card {
  width: 100%;
  max-width: 430px;
  background: white;
  border-radius: 24px;
  padding: 25px;
  box-shadow:
    0 15px 45px rgba(
      0,
      0,
      0,
      0.09
    );
}

.register-card {
  max-height: 95vh;
  overflow-y: auto;
}

.logo-box {
  text-align: center;
  margin-bottom: 25px;
}

.logo-icon {
  font-size: 52px;
  margin-bottom: 5px;
}

.logo-box h1 {
  margin: 0;
  font-size: 28px;
}

.logo-box p {
  color: #718096;
  margin-top: 8px;
}

.auth-card label,
.ride-details label {
  display: block;
  margin: 13px 0 7px;
  font-weight: bold;
}

.auth-card input,
.auth-card select,
.ride-details input,
.ride-details textarea {
  width: 100%;
  padding: 14px;
  border: 1px solid #dce2ea;
  border-radius: 12px;
  background: #fff;
  outline: none;
  font-size: 15px;
}

.auth-card input:focus,
.auth-card select:focus,
.ride-details input:focus,
.ride-details textarea:focus {
  border-color: #0878df;
  box-shadow:
    0 0 0 3px rgba(
      8,
      120,
      223,
      0.1
    );
}

.primary-btn,
.secondary-btn,
.danger-btn {
  width: 100%;
  border: 0;
  border-radius: 13px;
  padding: 14px;
  font-size: 16px;
  font-weight: bold;
  margin-top: 15px;
}

.primary-btn {
  background: #0878df;
  color: white;
}

.primary-btn:disabled {
  opacity: .6;
}

.secondary-btn {
  background: #edf5ff;
  color: #0878df;
}

.danger-btn {
  background: #fff0f0;
  color: #d22;
}

.separator {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0;
  color: #888;
}

.separator::before,
.separator::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #ddd;
}

.account-type {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 15px;
}

.type-btn {
  border: 1px solid #ddd;
  background: white;
  border-radius: 13px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  font-size: 15px;
}

.type-btn.active {
  border-color: #0878df;
  background: #edf5ff;
  color: #0878df;
}

.back-btn {
  border: 0;
  background: transparent;
  font-size: 16px;
  color: #0878df;
  padding: 4px;
}

.app-shell {
  min-height: 100vh;
  padding-bottom: 75px;
}

.top-header {
  min-height: 70px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #edf0f4;
  position: sticky;
  top: 0;
  z-index: 1000;
}

.top-header h2 {
  margin: 0;
  font-size: 20px;
}

.top-header small {
  display: block;
  color: #777;
  margin-top: 3px;
}

.icon-btn {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: #edf5ff;
  font-size: 20px;
}

.home-section,
.content-page,
.ride-page {
  padding: 16px;
  max-width: 700px;
  margin: auto;
}

.welcome-card {
  background:
    linear-gradient(
      135deg,
      #0878df,
      #35a2ff
    );
  color: white;
  border-radius: 22px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.welcome-card h3 {
  margin: 0 0 8px;
  font-size: 21px;
}

.welcome-card p {
  margin: 0;
  opacity: .9;
  line-height: 1.7;
}

.big-car {
  font-size: 55px;
}

.request-ride-card {
  width: 100%;
  border: 0;
  background: white;
  border-radius: 18px;
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 15px;
  text-align: right;
  box-shadow:
    0 6px 20px rgba(
      0,
      0,
      0,
      0.06
    );
}

.request-icon {
  width: 52px;
  height: 52px;
  border-radius: 15px;
  background: #edf5ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 25px;
}

.request-ride-card strong {
  display: block;
  font-size: 18px;
}

.request-ride-card span {
  display: block;
  color: #777;
  margin-top: 5px;
}

.request-ride-card .arrow {
  margin-right: auto;
  font-size: 22px;
  color: #0878df;
}

.info-grid {
  display: grid;
  grid-template-columns:
    repeat(3, 1fr);
  gap: 10px;
  margin-top: 16px;
}

.info-card {
  background: white;
  border-radius: 15px;
  padding: 14px 8px;
  text-align: center;
  box-shadow:
    0 4px 15px rgba(
      0,
      0,
      0,
      .04
    );
}

.info-card b {
  display: block;
  font-size: 25px;
  margin-bottom: 8px;
}

.info-card span {
  font-size: 12px;
  color: #666;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 68px;
  background: white;
  border-top: 1px solid #e8ebef;
  display: grid;
  grid-template-columns:
    repeat(3, 1fr);
  z-index: 2000;
  padding-bottom: env(
    safe-area-inset-bottom
  );
}

.nav-btn {
  border: 0;
  background: white;
  color: #8a929d;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.nav-btn span {
  font-size: 11px;
}

.nav-btn.active {
  color: #0878df;
  font-weight: bold;
}

.map-card {
  background: white;
  border-radius: 18px;
  overflow: hidden;
  position: relative;
  box-shadow:
    0 6px 20px rgba(
      0,
      0,
      0,
      .07
    );
}

#map {
  width: 100%;
  height: 430px;
}

.map-controls {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 500;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.map-controls button {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 11px;
  background: white;
  box-shadow:
    0 3px 12px rgba(
      0,
      0,
      0,
      .15
    );
  font-size: 20px;
}

.location-fields {
  background: white;
  border-radius: 18px;
  padding: 15px;
  margin-top: 12px;
  box-shadow:
    0 5px 18px rgba(
      0,
      0,
      0,
      .05
    );
}

.location-input {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.location-input label {
  display: block;
  font-size: 12px;
  color: #777;
  margin-bottom: 4px;
}

.location-value {
  line-height: 1.5;
  font-size: 14px;
}

.location-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  margin-top: 5px;
  flex: none;
}

.pickup-dot {
  background: #0878df;
}

.destination-dot {
  background: #e53935;
}

.location-line {
  height: 25px;
  width: 2px;
  background: #ddd;
  margin-right: 5px;
}

.destination-search-wrapper {
  width: 100%;
  position: relative;
}

.destination-search-wrapper input {
  width: 100%;
  border: 0;
  outline: 0;
  padding: 4px 0;
  font-size: 15px;
}

.search-results {
  position: absolute;
  top: 55px;
  right: 0;
  left: 0;
  background: white;
  z-index: 1000;
  border-radius: 12px;
  box-shadow:
    0 8px 25px rgba(
      0,
      0,
      0,
      .15
    );
  overflow: hidden;
}

.search-result {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #eee;
  background: white;
  padding: 12px;
  display: flex;
  gap: 8px;
  text-align: right;
  line-height: 1.5;
}

.search-result:hover {
  background: #f3f8ff;
}

.no-results {
  padding: 15px;
  color: #777;
}

.coordinates-box {
  background: #edf5ff;
  border-radius: 14px;
  padding: 12px;
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.coordinates-box div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coordinates-box span {
  font-size: 11px;
  color: #777;
}

.coordinates-box b {
  direction: ltr;
  font-size: 12px;
}

.route-info {
  background: white;
  border-radius: 14px;
  padding: 13px;
  margin-top: 12px;
  display: flex;
  justify-content: space-around;
  text-align: center;
  box-shadow:
    0 5px 18px rgba(
      0,
      0,
      0,
      .05
    );
}

.route-info div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.route-info strong {
  font-size: 12px;
  color: #777;
}

.ride-details {
  background: white;
  border-radius: 18px;
  padding: 17px;
  margin-top: 12px;
  box-shadow:
    0 5px 18px rgba(
      0,
      0,
      0,
      .05
    );
}

.ride-details h3 {
  margin-top: 0;
}

.price-input {
  position: relative;
}

.price-input input {
  padding-left: 65px !important;
}

.price-input span {
  position: absolute;
  left: 15px;
  top: 50%;
  transform:
    translateY(-50%);
  color: #777;
  font-weight: bold;
}

.rides-list,
.offers-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ride-card,
.offer-card,
.profile-card {
  background: white;
  border-radius: 18px;
  padding: 16px;
  box-shadow:
    0 5px 18px rgba(
      0,
      0,
      0,
      .05
    );
}

.ride-card-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 13px;
}

.ride-price,
.offer-price {
  color: #0878df;
  font-weight: bold;
}

.ride-location {
  display: flex;
  gap: 9px;
  margin: 10px 0;
  line-height: 1.5;
  font-size: 14px;
}

.ride-location b {
  flex: none;
}

.ride-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  color: #666;
  font-size: 13px;
}

.ride-meta span {
  background: #f2f4f7;
  padding: 7px 9px;
  border-radius: 8px;
}

.empty-state {
  background: white;
  border-radius: 18px;
  padding: 35px 20px;
  text-align: center;
  color: #666;
}

.empty-state > div {
  font-size: 50px;
  margin-bottom: 10px;
}

.empty-state h3 {
  color: #222;
}

.offer-driver {
  display: flex;
  align-items: center;
  gap: 12px;
}

.driver-avatar,
.profile-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #edf5ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 25px;
}

.offer-driver strong {
  display: block;
}

.offer-driver span {
  display: block;
  color: #777;
  font-size: 13px;
  margin-top: 4px;
}

.offer-card {
  display: grid;
  grid-template-columns:
    1fr auto;
  gap: 12px;
  align-items: center;
}

.offer-card
.accept-offer-btn {
  grid-column: 1 / -1;
  margin-top: 0;
}

.accepted-label {
  grid-column: 1 / -1;
  background: #e9f8ef;
  color: #16833c;
  padding: 10px;
  text-align: center;
  border-radius: 10px;
  font-weight: bold;
}

.profile-card {
  text-align: center;
}

.profile-avatar {
  width: 80px;
  height: 80px;
  margin: 0 auto 10px;
  font-size: 38px;
}

.profile-card h2 {
  margin: 5px 0;
}

.account-type-label {
  display: inline-block;
  background: #edf5ff;
  color: #0878df;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
}

.profile-data {
  margin-top: 20px;
  text-align: right;
}

.profile-data div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 0;
  border-bottom: 1px solid #eee;
}

.profile-data span {
  color: #777;
}

.profile-data strong {
  text-align: left;
}

.profile-mini {
  background: white;
  border-radius: 15px;
  padding: 15px;
  display: flex;
  justify-content: space-between;
  gap: 15px;
}

.profile-mini div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.profile-mini span {
  color: #777;
  font-size: 13px;
}

.loading {
  background: white;
  padding: 25px;
  border-radius: 15px;
  text-align: center;
  color: #777;
}

.toast-message {
  position: fixed;
  top: 18px;
  left: 50%;
  transform:
    translateX(-50%);
  z-index: 99999;
  max-width: 90%;
  padding: 13px 18px;
  border-radius: 12px;
  color: white;
  font-weight: bold;
  box-shadow:
    0 7px 25px rgba(
      0,
      0,
      0,
      .2
    );
}

.toast-message.info {
  background: #0878df;
}

.toast-message.success {
  background: #159447;
}

.toast-message.error {
  background: #d93636;
}

.leaflet-container {
  font-family:
    Arial,
    Tahoma,
    sans-serif;
}

@media (
  max-width: 420px
) {

  .home-section,
  .content-page,
  .ride-page {
    padding: 12px;
  }

  #map {
    height: 390px;
  }

  .info-grid {
    gap: 7px;
  }

  .info-card {
    padding: 11px 5px;
  }

}

`;

document.head.appendChild(
  dynamicStyle
);
