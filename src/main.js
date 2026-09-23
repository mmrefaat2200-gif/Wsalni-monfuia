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
  query,
  where,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp
} from "firebase/firestore";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

import {
  getCurrentPosition,
  requestPermissions,
  checkPermissions
} from "@capacitor/geolocation";

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

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

/* ======================================================
   GOOGLE MAPS
   ====================================================== */

// لو عندك مفتاح Google Maps في .env سيستخدمه
const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/* ======================================================
   GLOBAL VARIABLES
   ====================================================== */

let currentUser = null;
let currentRole = "customer";
let confirmationResult = null;

let recaptchaVerifier = null;

let map = null;
let pickupMarker = null;
let destinationMarker = null;

let pickupLocation = null;
let destinationLocation = null;

let selectedDestination = null;

let unsubscribeCustomerRides = null;
let unsubscribeCaptainRides = null;

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

function formatDate(timestamp) {
  if (!timestamp) return "غير محدد";

  try {
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return date.toLocaleString("ar-EG", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return "غير محدد";
  }
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  const screen = document.getElementById(id);

  if (screen) {
    screen.classList.add("active");
  }
}

function showMessage(message, type = "info") {
  alert(message);
}

function normalizeEgyptianPhone(phone) {
  let value = String(phone || "").trim();

  value = value.replace(/\s+/g, "");

  if (value.startsWith("01")) {
    return "+20" + value.substring(1);
  }

  if (value.startsWith("0020")) {
    return "+" + value.substring(2);
  }

  if (value.startsWith("+20")) {
    return value;
  }

  return value;
}

/* ======================================================
   GOOGLE MAPS LOADER
   ====================================================== */

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    if (!GOOGLE_MAPS_API_KEY) {
      reject(
        new Error(
          "لم يتم وضع Google Maps API Key"
        )
      );
      return;
    }

    const oldScript = document.querySelector(
      'script[data-google-maps="true"]'
    );

    if (oldScript) {
      oldScript.addEventListener("load", () => {
        resolve(window.google.maps);
      });

      oldScript.addEventListener("error", reject);

      return;
    }

    const script = document.createElement("script");

    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        GOOGLE_MAPS_API_KEY
      )}&libraries=places`;

    script.async = true;
    script.defer = true;

    script.dataset.googleMaps = "true";

    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(
          new Error("فشل تحميل Google Maps")
        );
      }
    };

    script.onerror = () => {
      reject(
        new Error("تعذر تحميل Google Maps")
      );
    };

    document.head.appendChild(script);
  });
}

/* ======================================================
   HTML
   ====================================================== */

function renderApp() {
  const app = $("#app");

  if (!app) return;

  app.innerHTML = `
    <div class="screen active" id="homeScreen">
      <div class="page-header">
        <h1>وصلني المنوفية</h1>
        <p>اطلب رحلتك بسهولة وأمان</p>
      </div>

      <div class="card">

        <button class="location-btn" id="fromPlace">
          📍 استخدم موقعي الحالي
        </button>

        <button class="location-btn" id="toPlace">
          🗺️ حدد مكان النزول على الخريطة
        </button>

        <div class="form-group">
          <label>عدد الركاب</label>

          <select id="passengers">
            <option value="1">1 راكب</option>
            <option value="2">2 ركاب</option>
            <option value="3">3 ركاب</option>
            <option value="4">4 ركاب</option>
            <option value="5">5 ركاب</option>
            <option value="6">6 ركاب</option>
            <option value="7">7 ركاب</option>
            <option value="8">8 ركاب</option>
          </select>
        </div>

        <div class="form-group">
          <label>سعر الرحلة المقترح</label>

          <input
            type="number"
            id="ridePrice"
            min="1"
            placeholder="مثال: 150"
          />
        </div>

        <div class="form-group">
          <label>ملاحظات</label>

          <textarea
            id="rideNotes"
            maxlength="500"
            placeholder="مثال: معايا شنطة كبيرة..."
          ></textarea>
        </div>

        <button class="primary-btn" id="requestBtn">
          🚕 اطلب الرحلة
        </button>

      </div>
    </div>

    <div class="screen" id="customerRidesScreen">
      <div class="page-header">
        <h2>رحلاتي</h2>
      </div>

      <div id="customerRides">
        جاري التحميل...
      </div>
    </div>

    <div class="screen" id="mapScreen">

      <div class="map-header">
        <button id="closeMapBtn">✕</button>

        <h3>حدد مكان النزول</h3>
      </div>

      <div id="map"></div>

      <div class="map-bottom">

        <input
          id="destinationSearch"
          type="text"
          placeholder="ابحث عن المكان..."
        />

        <div id="searchResults"></div>

        <button
          class="primary-btn"
          id="confirmDestinationBtn"
        >
          تأكيد المكان
        </button>

      </div>
    </div>

    <div class="screen" id="authScreen">

      <div class="page-header">
        <h2>تسجيل الدخول</h2>
        <p>أنشئ حسابك على وصلني المنوفية</p>
      </div>

      <div class="card">

        <div class="form-group">
          <label>نوع الحساب</label>

          <select id="accountRole">
            <option value="customer">
              راكب
            </option>

            <option value="captain">
              كابتن
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>الاسم</label>

          <input
            id="accountName"
            type="text"
            placeholder="اكتب اسمك"
          />
        </div>

        <div id="captainFields" style="display:none">

          <div class="form-group">
            <label>نوع العربية</label>

            <select id="captainCarType">
              <option value="">
                اختر نوع العربية
              </option>

              <option value="ملاكي">
                ملاكي
              </option>

              <option value="ميكروباص">
                ميكروباص
              </option>

              <option value="نقل">
                نقل
              </option>

              <option value="نصف نقل">
                نصف نقل
              </option>

              <option value="دبابة">
                دبابة
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>موديل العربية</label>

            <input
              id="captainCarModel"
              type="text"
              placeholder="مثال: Toyota 2022"
            />
          </div>

          <div class="form-group">
            <label>رقم العربية</label>

            <input
              id="captainCarNumber"
              type="text"
              placeholder="رقم العربية"
            />
          </div>

        </div>

        <div class="form-group">
          <label>صورة الحساب</label>

          <input
            id="profileImage"
            type="file"
            accept="image/*"
          />
        </div>

        <div class="form-group">

          <label>رقم الهاتف</label>

          <input
            id="phone"
            type="tel"
            placeholder="010xxxxxxxx"
          />

        </div>

        <div id="recaptcha"></div>

        <button
          class="primary-btn"
          id="sendCodeBtn"
        >
          إرسال كود التحقق
        </button>

        <div
          id="codeSection"
          style="display:none"
        >

          <div class="form-group">

            <label>كود التحقق</label>

            <input
              id="verificationCode"
              type="number"
              placeholder="اكتب الكود"
            />

          </div>

          <button
            class="primary-btn"
            id="verifyCodeBtn"
          >
            تأكيد الحساب
          </button>

        </div>

        <p id="authMsg"></p>

      </div>
    </div>

    <div class="screen" id="captainScreen">

      <div class="page-header">
        <h2>رحلات متاحة</h2>
        <p>اختار الرحلة المناسبة وابعت عرضك</p>
      </div>

      <div id="captainRides">
        جاري تحميل الرحلات...
      </div>

      <button
        class="secondary-btn"
        id="captainHistoryBtn"
      >
        📋 سجل رحلاتي
      </button>

    </div>

    <div class="screen" id="captainHistoryScreen">

      <div class="page-header">
        <h2>سجل الرحلات</h2>
      </div>

      <div id="captainHistory">
        جاري التحميل...
      </div>

    </div>

    <div class="screen" id="profileScreen">

      <div class="page-header">
        <h2>حسابي</h2>
      </div>

      <div class="card">

        <div id="profileInfo">
          جاري التحميل...
        </div>

        <button
          class="primary-btn"
          id="editProfileBtn"
        >
          تعديل البيانات
        </button>

        <button
          class="danger-btn"
          id="logoutBtn"
        >
          تسجيل الخروج
        </button>

      </div>

    </div>

    <nav class="bottom-nav">

      <button id="navHome">
        🏠
        <span>الرئيسية</span>
      </button>

      <button id="navRides">
        🚕
        <span>رحلاتي</span>
      </button>

      <button id="navCaptain">
        👨‍✈️
        <span>الكابتن</span>
      </button>

      <button id="navProfile">
        👤
        <span>حسابي</span>
      </button>

    </nav>
  `;

  setupEvents();
}

/* ======================================================
   LOCATION PERMISSION
   ====================================================== */

async function requestLocationPermission() {
  try {
    const permissions = await checkPermissions();

    if (
      permissions.location !== "granted"
    ) {
      await requestPermissions({
        permissions: ["location"]
      });
    }

    const finalPermissions =
      await checkPermissions();

    return (
      finalPermissions.location ===
      "granted"
    );

  } catch (error) {
    console.error(
      "Location permission error:",
      error
    );

    return false;
  }
}

/* ======================================================
   GET CURRENT LOCATION
   ====================================================== */

async function getDeviceLocation() {
  try {

    const allowed =
      await requestLocationPermission();

    if (!allowed) {
      showMessage(
        "اسمح للتطبيق باستخدام الموقع من إعدادات الهاتف."
      );

      return null;
    }

    const position =
      await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000
      });

    const coords = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };

    pickupLocation = coords;

    return coords;

  } catch (error) {

    console.error(
      "Get location error:",
      error
    );

    showMessage(
      "مش قادر أحدد موقعك. تأكد إن GPS شغال وإنك سمحت للتطبيق بالموقع."
    );

    return null;
  }
}

/* ======================================================
   INITIALIZE MAP
   ====================================================== */

async function initializeMap() {

  try {

    await loadGoogleMaps();

    const mapElement =
      document.getElementById("map");

    if (!mapElement) return;

    let center = {
      lat: 30.9876,
      lng: 31.1669
    };

    if (pickupLocation) {
      center = pickupLocation;
    }

    map = new google.maps.Map(
      mapElement,
      {
        center,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      }
    );

    if (pickupLocation) {

      new google.maps.Marker({
        position: pickupLocation,
        map,
        title: "موقع الانطلاق"
      });

    }

    map.addListener(
      "click",
      (event) => {

        const position = {
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        };

        selectedDestination = position;

        if (destinationMarker) {
          destinationMarker.setMap(null);
        }

        destinationMarker =
          new google.maps.Marker({
            position,
            map,
            title: "مكان النزول"
          });

      }
    );

    setupPlacesSearch();

  } catch (error) {

    console.error(
      "Map error:",
      error
    );

    showMessage(
      "مش قادر أشغل الخريطة. تأكد من Google Maps API Key."
    );
  }
}

/* ======================================================
   PLACES SEARCH
   ====================================================== */

function setupPlacesSearch() {

  const input =
    document.getElementById(
      "destinationSearch"
    );

  if (!input || !window.google?.maps?.places) {
    return;
  }

  const autocomplete =
    new google.maps.places.Autocomplete(
      input,
      {
        componentRestrictions: {
          country: "eg"
        },
        fields: [
          "geometry",
          "name",
          "formatted_address"
        ]
      }
    );

  autocomplete.addListener(
    "place_changed",
    () => {

      const place =
        autocomplete.getPlace();

      if (
        !place.geometry ||
        !place.geometry.location
      ) {
        return;
      }

      selectedDestination = {
        lat:
          place.geometry.location.lat(),

        lng:
          place.geometry.location.lng(),

        name:
          place.name || "",

        address:
          place.formatted_address || ""
      };

      if (map) {

        map.setCenter({
          lat:
            selectedDestination.lat,

          lng:
            selectedDestination.lng
        });

        map.setZoom(16);

      }

      if (destinationMarker) {
        destinationMarker.setMap(null);
      }

      destinationMarker =
        new google.maps.Marker({
          position: {
            lat:
              selectedDestination.lat,

            lng:
              selectedDestination.lng
          },

          map
        });

    }
  );
}

/* ======================================================
   OPEN MAP
   ====================================================== */

async function openMap() {

  showScreen("mapScreen");

  if (!pickupLocation) {

    await getDeviceLocation();

  }

  await initializeMap();
}

/* ======================================================
   SAVE USER PROFILE
   ====================================================== */

async function saveUserProfile() {

  if (!currentUser) {
    throw new Error(
      "لا يوجد مستخدم مسجل"
    );
  }

  const name =
    $("#accountName")?.value.trim() || "";

  const role =
    $("#accountRole")?.value || "customer";

  if (!name) {
    throw new Error(
      "اكتب الاسم أولاً"
    );
  }

  let imageUrl = "";

  const imageFile =
    $("#profileImage")?.files?.[0];

  if (imageFile) {

    const imageReference =
      storageRef(
        storage,
        `users/${currentUser.uid}/profile.jpg`
      );

    await uploadBytes(
      imageReference,
      imageFile
    );

    imageUrl =
      await getDownloadURL(
        imageReference
      );
  }

  const profileData = {
    uid: currentUser.uid,
    name,
    phone:
      currentUser.phoneNumber || "",
    role,
    updatedAt:
      serverTimestamp()
  };

  if (imageUrl) {
    profileData.photoURL = imageUrl;
  }

  if (role === "captain") {

    profileData.carType =
      $("#captainCarType")?.value || "";

    profileData.carModel =
      $("#captainCarModel")?.value.trim() || "";

    profileData.carNumber =
      $("#captainCarNumber")?.value.trim() || "";

  }

  await setDoc(
    doc(
      db,
      "users",
      currentUser.uid
    ),
    profileData,
    {
      merge: true
    }
  );

  currentRole = role;

  return profileData;
}
/* ======================================================
   AUTH
   ====================================================== */

function setupRecaptcha() {
  try {
    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch {}
    }

    recaptchaVerifier =
      new RecaptchaVerifier(
        auth,
        "recaptcha",
        {
          size: "normal",
          callback: () => {
            console.log("reCAPTCHA verified");
          },

          "expired-callback": () => {
            console.log(
              "reCAPTCHA expired"
            );
          }
        }
      );

    recaptchaVerifier.render();

  } catch (error) {

    console.error(
      "reCAPTCHA error:",
      error
    );
  }
}

function openAuth(role = "customer") {

  showScreen("authScreen");

  const roleSelect =
    document.getElementById(
      "accountRole"
    );

  if (roleSelect) {
    roleSelect.value = role;
  }

  toggleCaptainFields();

  setTimeout(() => {
    setupRecaptcha();
  }, 300);
}

/* ======================================================
   CAPTAIN FIELDS
   ====================================================== */

function toggleCaptainFields() {

  const role =
    document.getElementById(
      "accountRole"
    )?.value;

  const captainFields =
    document.getElementById(
      "captainFields"
    );

  if (!captainFields) return;

  if (role === "captain") {
    captainFields.style.display =
      "block";
  } else {
    captainFields.style.display =
      "none";
  }
}

/* ======================================================
   SEND PHONE CODE
   ====================================================== */

async function sendVerificationCode() {

  const phoneInput =
    document.getElementById("phone");

  const authMsg =
    document.getElementById("authMsg");

  if (!phoneInput) return;

  const phone =
    normalizeEgyptianPhone(
      phoneInput.value
    );

  if (!phone) {

    if (authMsg) {
      authMsg.textContent =
        "اكتب رقم الهاتف أولاً.";
    }

    return;
  }

  if (
    !phone.startsWith("+20") &&
    !phone.startsWith("+")
  ) {

    if (authMsg) {
      authMsg.textContent =
        "اكتب رقم هاتف مصري صحيح مثل 010xxxxxxxx.";
    }

    return;
  }

  try {

    if (!recaptchaVerifier) {
      setupRecaptcha();
    }

    if (authMsg) {
      authMsg.textContent =
        "جاري إرسال الكود...";
    }

    confirmationResult =
      await signInWithPhoneNumber(
        auth,
        phone,
        recaptchaVerifier
      );

    const codeSection =
      document.getElementById(
        "codeSection"
      );

    if (codeSection) {
      codeSection.style.display =
        "block";
    }

    if (authMsg) {
      authMsg.textContent =
        "تم إرسال كود التحقق على موبايلك.";
    }

  } catch (error) {

    console.error(
      "Phone authentication error:",
      error
    );

    if (authMsg) {

      if (
        error.code ===
        "auth/invalid-phone-number"
      ) {
        authMsg.textContent =
          "رقم الهاتف غير صحيح.";

      } else if (
        error.code ===
        "auth/too-many-requests"
      ) {
        authMsg.textContent =
          "تم إرسال طلبات كثيرة. حاول بعد شوية.";

      } else {
        authMsg.textContent =
          error.message ||
          "حصل خطأ أثناء إرسال الكود.";
      }
    }

    try {

      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
      }

    } catch {}

    recaptchaVerifier = null;

    setTimeout(() => {
      setupRecaptcha();
    }, 500);
  }
}

/* ======================================================
   VERIFY PHONE CODE
   ====================================================== */

async function verifyPhoneCode() {

  const codeInput =
    document.getElementById(
      "verificationCode"
    );

  const authMsg =
    document.getElementById(
      "authMsg"
    );

  if (!confirmationResult) {

    if (authMsg) {
      authMsg.textContent =
        "اطلب كود التحقق الأول.";
    }

    return;
  }

  const code =
    codeInput?.value.trim() || "";

  if (!code) {

    if (authMsg) {
      authMsg.textContent =
        "اكتب كود التحقق.";
    }

    return;
  }

  try {

    if (authMsg) {
      authMsg.textContent =
        "جاري التحقق...";
    }

    const result =
      await confirmationResult.confirm(
        code
      );

    currentUser = result.user;

    try {

      await saveUserProfile();

    } catch (profileError) {

      console.error(
        "Profile save error:",
        profileError
      );

      if (authMsg) {
        authMsg.textContent =
          profileError.message ||
          "تم تسجيل الدخول لكن حصلت مشكلة في حفظ البيانات.";
      }

      return;
    }

    if (authMsg) {
      authMsg.textContent =
        "تم تسجيل الدخول بنجاح.";
    }

    setTimeout(() => {

      if (currentRole === "captain") {
        showScreen(
          "captainScreen"
        );
        loadCaptainRides();
      } else {
        showScreen("homeScreen");
      }

    }, 500);

  } catch (error) {

    console.error(
      "Verification error:",
      error
    );

    if (authMsg) {

      if (
        error.code ===
        "auth/invalid-verification-code"
      ) {

        authMsg.textContent =
          "كود التحقق غير صحيح.";

      } else if (
        error.code ===
        "auth/code-expired"
      ) {

        authMsg.textContent =
          "الكود انتهت صلاحيته. اطلب كود جديد.";

      } else {

        authMsg.textContent =
          error.message ||
          "حصل خطأ أثناء التحقق.";
      }
    }
  }
}

/* ======================================================
   LOAD CURRENT USER PROFILE
   ====================================================== */

async function loadUserProfile() {

  if (!currentUser) {
    return null;
  }

  try {

    const userDoc =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );

    if (!userDoc.exists()) {
      return null;
    }

    const data =
      userDoc.data();

    currentRole =
      data.role || "customer";

    return data;

  } catch (error) {

    console.error(
      "Load profile error:",
      error
    );

    return null;
  }
}

/* ======================================================
   OPEN PROFILE
   ====================================================== */

async function openProfile() {

  showScreen("profileScreen");

  const profileInfo =
    document.getElementById(
      "profileInfo"
    );

  if (!profileInfo) return;

  if (!currentUser) {

    profileInfo.innerHTML = `
      <div class="card">
        <p>أنت غير مسجل الدخول.</p>

        <button
          class="primary-btn"
          id="profileLoginBtn"
        >
          تسجيل الدخول
        </button>
      </div>
    `;

    document
      .getElementById(
        "profileLoginBtn"
      )
      ?.addEventListener(
        "click",
        () => openAuth("customer")
      );

    return;
  }

  profileInfo.innerHTML =
    "جاري تحميل البيانات...";

  const profile =
    await loadUserProfile();

  if (!profile) {

    profileInfo.innerHTML = `
      <div class="card">
        <p>لم يتم العثور على بيانات الحساب.</p>
      </div>
    `;

    return;
  }

  const roleText =
    profile.role === "captain"
      ? "كابتن"
      : "راكب";

  profileInfo.innerHTML = `
    <div class="profile-box">

      ${
        profile.photoURL
          ? `
            <img
              src="${escapeHtml(
                profile.photoURL
              )}"
              class="profile-photo"
              alt="صورة الحساب"
            />
          `
          : `
            <div class="profile-placeholder">
              👤
            </div>
          `
      }

      <h3>
        ${escapeHtml(
          profile.name || "بدون اسم"
        )}
      </h3>

      <p>
        📱 ${escapeHtml(
          profile.phone ||
          currentUser.phoneNumber ||
          ""
        )}
      </p>

      <p>
        👤 نوع الحساب:
        ${roleText}
      </p>

      ${
        profile.role === "captain"
          ? `
            <hr>

            <p>
              🚗 نوع العربية:
              ${escapeHtml(
                profile.carType || "-"
              )}
            </p>

            <p>
              🚘 موديل العربية:
              ${escapeHtml(
                profile.carModel || "-"
              )}
            </p>

            <p>
              🔢 رقم العربية:
              ${escapeHtml(
                profile.carNumber || "-"
              )}
            </p>
          `
          : ""
      }

    </div>
  `;
}

/* ======================================================
   EDIT PROFILE
   ====================================================== */

async function editProfile() {

  if (!currentUser) {

    openAuth("customer");

    return;
  }

  const profile =
    await loadUserProfile();

  if (!profile) {

    openAuth(
      currentRole || "customer"
    );

    return;
  }

  showScreen("authScreen");

  const role =
    document.getElementById(
      "accountRole"
    );

  const name =
    document.getElementById(
      "accountName"
    );

  const carType =
    document.getElementById(
      "captainCarType"
    );

  const carModel =
    document.getElementById(
      "captainCarModel"
    );

  const carNumber =
    document.getElementById(
      "captainCarNumber"
    );

  if (role) {
    role.value =
      profile.role || "customer";
  }

  if (name) {
    name.value =
      profile.name || "";
  }

  if (carType) {
    carType.value =
      profile.carType || "";
  }

  if (carModel) {
    carModel.value =
      profile.carModel || "";
  }

  if (carNumber) {
    carNumber.value =
      profile.carNumber || "";
  }

  toggleCaptainFields();
}

/* ======================================================
   CREATE RIDE
   ====================================================== */

async function createRide() {

  if (!currentUser) {

    showMessage(
      "لازم تسجل الدخول الأول."
    );

    openAuth("customer");

    return;
  }

  if (currentRole !== "customer") {

    showMessage(
      "حساب الكابتن لا يمكنه طلب رحلة."
    );

    return;
  }

  if (!pickupLocation) {

    showMessage(
      "حدد مكان الانطلاق أولاً."
    );

    return;
  }

  if (!destinationLocation) {

    showMessage(
      "حدد مكان النزول أولاً."
    );

    return;
  }

  const passengers =
    Number(
      document.getElementById(
        "passengers"
      )?.value || 1
    );

  const price =
    Number(
      document.getElementById(
        "ridePrice"
      )?.value || 0
    );

  const notes =
    document.getElementById(
      "rideNotes"
    )?.value.trim() || "";

  if (!price || price <= 0) {

    showMessage(
      "اكتب سعر الرحلة."
    );

    return;
  }

  if (
    passengers < 1 ||
    passengers > 8
  ) {

    showMessage(
      "عدد الركاب لازم يكون من 1 إلى 8."
    );

    return;
  }

  try {

    const profile =
      await loadUserProfile();

    const rideData = {

      customerId:
        currentUser.uid,

      customerName:
        profile?.name ||
        currentUser.phoneNumber ||
        "عميل",

      pickup: {
        lat:
          pickupLocation.lat,

        lng:
          pickupLocation.lng
      },

      destination: {
        lat:
          destinationLocation.lat,

        lng:
          destinationLocation.lng,

        name:
          destinationLocation.name ||
          "",

        address:
          destinationLocation.address ||
          ""
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
      "تم نشر الرحلة للسائقين بنجاح 🚕"
    );

    document.getElementById(
      "ridePrice"
    ).value = "";

    document.getElementById(
      "rideNotes"
    ).value = "";

    showScreen(
      "customerRidesScreen"
    );

    loadCustomerRides();

  } catch (error) {

    console.error(
      "Create ride error:",
      error
    );

    showMessage(
      error.message ||
      "حصل خطأ أثناء إنشاء الرحلة."
    );
  }
}

/* ======================================================
   ACCEPT OFFER
   ====================================================== */

async function acceptOffer(
  rideId,
  offerId,
  captainId
) {

  if (!currentUser) {

    showMessage(
      "سجل الدخول أولاً."
    );

    return;
  }

  try {

    await updateDoc(
      doc(
        db,
        "rides",
        rideId
      ),
      {
        status: "accepted",
        acceptedOfferId:
          offerId,
        acceptedCaptainId:
          captainId,
        acceptedAt:
          serverTimestamp()
      }
    );

    await updateDoc(
      doc(
        db,
        "rides",
        rideId,
        "offers",
        offerId
      ),
      {
        status: "accepted"
      }
    );

    showMessage(
      "تم قبول عرض الكابتن بنجاح 🚕"
    );

    loadCustomerRides();

  } catch (error) {

    console.error(
      "Accept offer error:",
      error
    );

    showMessage(
      error.message ||
      "حصل خطأ أثناء قبول العرض."
    );
  }
}

/* ======================================================
   SEND CAPTAIN OFFER
   ====================================================== */

async function sendCaptainOffer(
  rideId
) {

  if (!currentUser) {

    showMessage(
      "لازم تسجل الدخول الأول."
    );

    return;
  }

  if (currentRole !== "captain") {

    showMessage(
      "لازم يكون الحساب كابتن."
    );

    return;
  }

  const price =
    prompt(
      "اكتب السعر الذي تريد عرضه:"
    );

  if (
    price === null ||
    price.trim() === ""
  ) {
    return;
  }

  const offerPrice =
    Number(price);

  if (
    !offerPrice ||
    offerPrice <= 0
  ) {

    showMessage(
      "اكتب سعر صحيح."
    );

    return;
  }

  try {

    const captainProfile =
      await loadUserProfile();

    await setDoc(
      doc(
        db,
        "rides",
        rideId,
        "offers",
        currentUser.uid
      ),
      {

        captainId:
          currentUser.uid,

        captainName:
          captainProfile?.name ||
          currentUser.phoneNumber ||
          "كابتن",

        price:
          offerPrice,

        carType:
          captainProfile?.carType ||
          "",

        carModel:
          captainProfile?.carModel ||
          "",

        carNumber:
          captainProfile?.carNumber ||
          "",

        status: "pending",

        createdAt:
          serverTimestamp()
      }
    );

    showMessage(
      "تم إرسال عرضك للعميل."
    );

    loadCaptainRides();

  } catch (error) {

    console.error(
      "Send offer error:",
      error
    );

    showMessage(
      error.message ||
      "حصل خطأ أثناء إرسال العرض."
    );
  }
}
/* ======================================================
   LOAD CUSTOMER RIDES
   ====================================================== */

async function loadCustomerRides() {

  const container =
    document.getElementById(
      "customerRides"
    );

  if (!container) return;

  if (!currentUser) {

    container.innerHTML = `
      <div class="card">
        <p>سجل الدخول علشان تشوف رحلاتك.</p>

        <button
          class="primary-btn"
          id="customerLoginBtn"
        >
          تسجيل الدخول
        </button>
      </div>
    `;

    document
      .getElementById(
        "customerLoginBtn"
      )
      ?.addEventListener(
        "click",
        () => openAuth("customer")
      );

    return;
  }

  container.innerHTML =
    "جاري تحميل الرحلات...";

  try {

    const ridesQuery =
      query(
        collection(db, "rides"),
        where(
          "customerId",
          "==",
          currentUser.uid
        ),
        limit(50)
      );

    if (unsubscribeCustomerRides) {
      unsubscribeCustomerRides();
    }

    unsubscribeCustomerRides =
      onSnapshot(
        ridesQuery,
        async (snapshot) => {

          const rides =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data()
              })
            );

          rides.sort(
            (a, b) => {

              const dateA =
                a.createdAt?.toMillis?.() ||
                0;

              const dateB =
                b.createdAt?.toMillis?.() ||
                0;

              return dateB - dateA;
            }
          );

          if (!rides.length) {

            container.innerHTML = `
              <div class="card">
                <p>
                  لا توجد رحلات حتى الآن.
                </p>
              </div>
            `;

            return;
          }

          container.innerHTML = "";

          for (const ride of rides) {

            const card =
              document.createElement(
                "div"
              );

            card.className =
              "ride-card";

            let offersHtml =
              "جاري تحميل العروض...";

            card.innerHTML = `
              <div class="ride-card-header">

                <h3>
                  🚕 رحلة
                </h3>

                <span class="status">
                  ${escapeHtml(
                    ride.status ||
                    "open"
                  )}
                </span>

              </div>

              <p>
                📍 الانطلاق:
                ${escapeHtml(
                  ride.pickup?.name ||
                  "موقعك الحالي"
                )}
              </p>

              <p>
                🗺️ النزول:
                ${escapeHtml(
                  ride.destination?.name ||
                  ride.destination?.address ||
                  "المكان المحدد"
                )}
              </p>

              <p>
                👥 عدد الركاب:
                ${escapeHtml(
                  ride.passengers || 1
                )}
              </p>

              <p>
                💰 السعر:
                ${escapeHtml(
                  ride.price || 0
                )} جنيه
              </p>

              ${
                ride.notes
                  ? `
                    <p>
                      📝 ملاحظات:
                      ${escapeHtml(
                        ride.notes
                      )}
                    </p>
                  `
                  : ""
              }

              <p>
                🕐
                ${formatDate(
                  ride.createdAt
                )}
              </p>

              <div
                class="offers"
                id="offers-${ride.id}"
              >
                ${offersHtml}
              </div>
            `;

            container.appendChild(
              card
            );

            loadRideOffers(
              ride.id
            );
          }

        },
        (error) => {

          console.error(
            "Customer rides snapshot:",
            error
          );

          container.innerHTML = `
            <div class="card">
              <p>
                حصل خطأ أثناء تحميل الرحلات.
              </p>
            </div>
          `;
        }
      );

  } catch (error) {

    console.error(
      "Customer rides error:",
      error
    );

    container.innerHTML = `
      <div class="card">
        <p>
          ${escapeHtml(
            error.message ||
            "حصل خطأ."
          )}
        </p>
      </div>
    `;
  }
}

/* ======================================================
   LOAD RIDE OFFERS
   ====================================================== */

async function loadRideOffers(
  rideId
) {

  const container =
    document.getElementById(
      `offers-${rideId}`
    );

  if (!container) return;

  try {

    const offersSnapshot =
      await getDocs(
        collection(
          db,
          "rides",
          rideId,
          "offers"
        )
      );

    if (offersSnapshot.empty) {

      container.innerHTML = `
        <div class="offer-empty">
          لا توجد عروض من الكباتن حتى الآن.
        </div>
      `;

      return;
    }

    const offers =
      offersSnapshot.docs.map(
        (item) => ({
          id: item.id,
          ...item.data()
        })
      );

    offers.sort(
      (a, b) =>
        Number(a.price || 0) -
        Number(b.price || 0)
    );

    container.innerHTML = `
      <h4>
        عروض الكباتن
      </h4>
    `;

    offers.forEach(
      (offer) => {

        const offerElement =
          document.createElement(
            "div"
          );

        offerElement.className =
          "offer-card";

        const accepted =
          offer.status === "accepted";

        offerElement.innerHTML = `

          <div>
            <strong>
              👨‍✈️
              ${escapeHtml(
                offer.captainName ||
                "كابتن"
              )}
            </strong>

            <p>
              💰 السعر:
              ${escapeHtml(
                offer.price || 0
              )}
              جنيه
            </p>

            ${
              offer.carType
                ? `
                  <p>
                    🚗
                    ${escapeHtml(
                      offer.carType
                    )}
                    ${
                      offer.carModel
                        ? " - " +
                          escapeHtml(
                            offer.carModel
                          )
                        : ""
                    }
                  </p>
                `
                : ""
            }

            ${
              offer.carNumber
                ? `
                  <p>
                    🔢 رقم العربية:
                    ${escapeHtml(
                      offer.carNumber
                    )}
                  </p>
                `
                : ""
            }

          </div>

          ${
            accepted
              ? `
                <div class="accepted">
                  ✅ تم قبول العرض
                </div>
              `
              : `
                <button
                  class="primary-btn accept-offer-btn"
                  data-ride="${rideId}"
                  data-offer="${offer.id}"
                  data-captain="${offer.captainId || offer.id}"
                >
                  قبول العرض
                </button>
              `
          }

        `;

        container.appendChild(
          offerElement
        );
      }
    );

    container
      .querySelectorAll(
        ".accept-offer-btn"
      )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            () => {

              acceptOffer(
                button.dataset.ride,
                button.dataset.offer,
                button.dataset.captain
              );

            }
          );

        }
      );

  } catch (error) {

    console.error(
      "Offers error:",
      error
    );

    container.innerHTML = `
      <p>
        تعذر تحميل عروض الكباتن.
      </p>
    `;
  }
}

/* ======================================================
   LOAD CAPTAIN RIDES
   ====================================================== */

async function loadCaptainRides() {

  const container =
    document.getElementById(
      "captainRides"
    );

  if (!container) return;

  if (!currentUser) {

    container.innerHTML = `
      <div class="card">
        <p>سجل الدخول ككابتن أولاً.</p>
      </div>
    `;

    return;
  }

  if (currentRole !== "captain") {

    container.innerHTML = `
      <div class="card">
        <p>
          هذه الصفحة مخصصة للكباتن.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    "جاري تحميل الرحلات...";

  try {

    const ridesQuery =
      query(
        collection(db, "rides"),
        where(
          "status",
          "==",
          "open"
        ),
        limit(50)
      );

    if (unsubscribeCaptainRides) {
      unsubscribeCaptainRides();
    }

    unsubscribeCaptainRides =
      onSnapshot(
        ridesQuery,
        async (snapshot) => {

          const rides =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data()
              })
            );

          rides.sort(
            (a, b) => {

              const dateA =
                a.createdAt?.toMillis?.() ||
                0;

              const dateB =
                b.createdAt?.toMillis?.() ||
                0;

              return dateB - dateA;
            }
          );

          if (!rides.length) {

            container.innerHTML = `
              <div class="card">
                <p>
                  لا توجد رحلات متاحة حالياً.
                </p>
              </div>
            `;

            return;
          }

          container.innerHTML = "";

          for (const ride of rides) {

            const card =
              document.createElement(
                "div"
              );

            card.className =
              "ride-card";

            card.innerHTML = `

              <div class="ride-card-header">

                <h3>
                  🚕 رحلة جديدة
                </h3>

                <span>
                  مفتوحة
                </span>

              </div>

              <p>
                📍 من:
                ${escapeHtml(
                  ride.pickup?.name ||
                  "موقع العميل"
                )}
              </p>

              <p>
                🗺️ إلى:
                ${escapeHtml(
                  ride.destination?.name ||
                  ride.destination?.address ||
                  "المكان المحدد"
                )}
              </p>

              <p>
                👥 الركاب:
                ${escapeHtml(
                  ride.passengers || 1
                )}
              </p>

              <p>
                💰 السعر المقترح:
                ${escapeHtml(
                  ride.price || 0
                )}
                جنيه
              </p>

              ${
                ride.notes
                  ? `
                    <p>
                      📝 ملاحظات:
                      ${escapeHtml(
                        ride.notes
                      )}
                    </p>
                  `
                  : ""
              }

              <button
                class="primary-btn captain-offer-btn"
                data-ride="${ride.id}"
              >
                💰 إرسال عرض
              </button>

            `;

            container.appendChild(
              card
            );
          }

          container
            .querySelectorAll(
              ".captain-offer-btn"
            )
            .forEach(
              (button) => {

                button.addEventListener(
                  "click",
                  () => {

                    sendCaptainOffer(
                      button.dataset.ride
                    );

                  }
                );

              }
            );

        },
        (error) => {

          console.error(
            "Captain rides error:",
            error
          );

          container.innerHTML = `
            <div class="card">
              <p>
                حصل خطأ أثناء تحميل الرحلات.
              </p>
            </div>
          `;
        }
      );

  } catch (error) {

    console.error(
      "Captain query error:",
      error
    );

    container.innerHTML = `
      <div class="card">
        <p>
          ${escapeHtml(
            error.message ||
            "حصل خطأ."
          )}
        </p>
      </div>
    `;
  }
}

/* ======================================================
   CAPTAIN HISTORY
   ====================================================== */

async function loadCaptainHistory() {

  const container =
    document.getElementById(
      "captainHistory"
    );

  if (!container) return;

  if (!currentUser) {

    container.innerHTML =
      "سجل الدخول أولاً.";

    return;
  }

  container.innerHTML =
    "جاري التحميل...";

  try {

    const offersQuery =
      query(
        collection(db, "rides"),
        where(
          "acceptedCaptainId",
          "==",
          currentUser.uid
        ),
        limit(50)
      );

    const snapshot =
      await getDocs(
        offersQuery
      );

    if (snapshot.empty) {

      container.innerHTML = `
        <div class="card">
          <p>
            لا توجد رحلات في السجل.
          </p>
        </div>
      `;

      return;
    }

    const rides =
      snapshot.docs.map(
        (item) => ({
          id: item.id,
          ...item.data()
        })
      );

    container.innerHTML = "";

    rides.forEach(
      (ride) => {

        const card =
          document.createElement(
            "div"
          );

        card.className =
          "ride-card";

        card.innerHTML = `

          <h3>
            🚕 رحلة
          </h3>

          <p>
            📍 من:
            ${escapeHtml(
              ride.pickup?.name ||
              "موقع العميل"
            )}
          </p>

          <p>
            🗺️ إلى:
            ${escapeHtml(
              ride.destination?.name ||
              ride.destination?.address ||
              "المكان المحدد"
            )}
          </p>

          <p>
            👥 الركاب:
            ${escapeHtml(
              ride.passengers || 1
            )}
          </p>

          <p>
            💰 السعر:
            ${escapeHtml(
              ride.price || 0
            )}
            جنيه
          </p>

          <p>
            🕐
            ${formatDate(
              ride.createdAt
            )}
          </p>

          <div class="accepted">
            ✅ تم قبول الرحلة
          </div>

        `;

        container.appendChild(
          card
        );

      }
    );

  } catch (error) {

    console.error(
      "Captain history error:",
      error
    );

    container.innerHTML = `
      <div class="card">
        <p>
          حصل خطأ أثناء تحميل السجل.
        </p>
      </div>
    `;
  }
}

/* ======================================================
   EVENTS
   ====================================================== */

function setupEvents() {

  document
    .getElementById("navHome")
    ?.addEventListener(
      "click",
      () => {
        showScreen(
          "homeScreen"
        );
      }
    );

  document
    .getElementById("navRides")
    ?.addEventListener(
      "click",
      () => {

        showScreen(
          "customerRidesScreen"
        );

        loadCustomerRides();

      }
    );

  document
    .getElementById("navCaptain")
    ?.addEventListener(
      "click",
      async () => {

        if (!currentUser) {

          openAuth("captain");

          return;
        }

        if (
          currentRole !== "captain"
        ) {

          showMessage(
            "لازم يكون حسابك كابتن علشان تدخل منصة الكباتن."
          );

          return;
        }

        showScreen(
          "captainScreen"
        );

        loadCaptainRides();

      }
    );

  document
    .getElementById("navProfile")
    ?.addEventListener(
      "click",
      () => {
        openProfile();
      }
    );

  document
    .getElementById("profileBtn")
    ?.addEventListener(
      "click",
      () => {
        openProfile();
      }
    );

  document
    .getElementById("captainBtn")
    ?.addEventListener(
      "click",
      () => {

        if (!currentUser) {

          openAuth("captain");

          return;
        }

        showScreen(
          "captainScreen"
        );

        loadCaptainRides();

      }
    );

  document
    .getElementById("requestBtn")
    ?.addEventListener(
      "click",
      createRide
    );

  document
    .getElementById("fromPlace")
    ?.addEventListener(
      "click",
      async () => {

        const location =
          await getDeviceLocation();

        if (location) {

          showMessage(
            "تم تحديد موقع الانطلاق بنجاح 📍"
          );

        }

      }
    );

  document
    .getElementById("toPlace")
    ?.addEventListener(
      "click",
      openMap
    );

  document
    .getElementById("closeMapBtn")
    ?.addEventListener(
      "click",
      () => {

        showScreen(
          "homeScreen"
        );

      }
    );

  document
    .getElementById(
      "confirmDestinationBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        if (!selectedDestination) {

          showMessage(
            "اختار مكان النزول على الخريطة أولاً."
          );

          return;
        }

        destinationLocation =
          selectedDestination;

        showScreen(
          "homeScreen"
        );

        const toPlace =
          document.getElementById(
            "toPlace"
          );

        if (toPlace) {

          toPlace.textContent =
            "✅ تم تحديد مكان النزول";

        }

      }
    );

  document
    .getElementById(
      "accountRole"
    )
    ?.addEventListener(
      "change",
      toggleCaptainFields
    );

  document
    .getElementById(
      "sendCodeBtn"
    )
    ?.addEventListener(
      "click",
      sendVerificationCode
    );

  document
    .getElementById(
      "verifyCodeBtn"
    )
    ?.addEventListener(
      "click",
      verifyPhoneCode
    );

  document
    .getElementById(
      "editProfileBtn"
    )
    ?.addEventListener(
      "click",
      editProfile
    );

  document
    .getElementById(
      "logoutBtn"
    )
    ?.addEventListener(
      "click",
      logoutUser
    );

  document
    .getElementById(
      "captainHistoryBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        showScreen(
          "captainHistoryScreen"
        );

        loadCaptainHistory();

      }
    );
}

/* ======================================================
   LOGOUT
   ====================================================== */

async function logoutUser() {

  try {

    if (unsubscribeCustomerRides) {
      unsubscribeCustomerRides();
      unsubscribeCustomerRides = null;
    }

    if (unsubscribeCaptainRides) {
      unsubscribeCaptainRides();
      unsubscribeCaptainRides = null;
    }

    await signOut(auth);

    currentUser = null;
    currentRole = "customer";

    pickupLocation = null;
    destinationLocation = null;
    selectedDestination = null;

    showMessage(
      "تم تسجيل الخروج."
    );

    showScreen(
      "homeScreen"
    );

  } catch (error) {

    console.error(
      "Logout error:",
      error
    );

    showMessage(
      "حصل خطأ أثناء تسجيل الخروج."
    );
  }
}

/* ======================================================
   AUTH STATE
   ====================================================== */

onAuthStateChanged(
  auth,
  async (user) => {

    currentUser = user;

    if (!user) {

      currentRole =
        "customer";

      return;
    }

    const profile =
      await loadUserProfile();

    if (profile) {

      currentRole =
        profile.role ||
        "customer";

    } else {

      currentRole =
        "customer";
    }

  }
);

/* ======================================================
   INITIALIZE APP
   ====================================================== */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    renderApp();

  }
);
