import "./style.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  setPersistence,
  browserLocalPersistence,
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
  serverTimestamp,
  runTransaction
} from "firebase/firestore";

import { Geolocation } from "@capacitor/geolocation";

/* ======================================================
   FIREBASE
   ====================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAZVXuhTTiGKfDflIZUm_8gmj2rRjjWsfIc",
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

setPersistence(auth, browserLocalPersistence).catch(console.error);

/* ======================================================
   STATE
   ====================================================== */

let currentUser = null;
let profile = null;

let currentRole = "";

let confirmationResult = null;
let recaptchaVerifier = null;

let map = null;
let pickupMarker = null;
let destinationMarker = null;
let routeLayer = null;
let accuracyCircle = null;

let pickup = null;
let destination = null;

let unsubscribeCustomerRides = null;
let unsubscribeCaptainRides = null;
let unsubscribeCaptainHistory = null;

/* ======================================================
   HELPERS
   ====================================================== */

const $ = id => document.getElementById(id);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(message, type = "info") {
  let box = $("messageBox");

  if (!box) {
    box = document.createElement("div");
    box.id = "messageBox";

    Object.assign(box.style, {
      position: "fixed",
      top: "15px",
      left: "15px",
      right: "15px",
      zIndex: "99999",
      padding: "14px",
      borderRadius: "12px",
      textAlign: "center",
      fontWeight: "bold",
      background: "#fff",
      boxShadow: "0 5px 20px rgba(0,0,0,.15)"
    });

    document.body.appendChild(box);
  }

  box.textContent = message;

  if (type === "error") {
    box.style.color = "#b00020";
  } else if (type === "success") {
    box.style.color = "#087a35";
  } else {
    box.style.color = "#0759a8";
  }

  box.style.display = "block";

  clearTimeout(window.__messageTimer);

  window.__messageTimer = setTimeout(() => {
    box.style.display = "none";
  }, 4500);
}

function accountNumber() {
  return "WM-" + Math.floor(100000 + Math.random() * 900000);
}

function loginEmail(phone) {
  return phone.replace(/\D/g, "") + "@wasselni-monufia.app";
}

function normalizePhone(value) {
  let p = String(value || "").trim();

  if (p.startsWith("01")) {
    p = "+20" + p.substring(1);
  }

  if (!p.startsWith("+20")) {
    p = "+20" + p.replace(/^0/, "");
  }

  return p;
}

function timestampMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value.seconds) {
    return Number(value.seconds) * 1000;
  }

  return 0;
}

function formatDate(date) {
  if (!date) return "";

  const d = new Date(date + "T00:00:00");

  return d.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function dayName(date) {
  if (!date) return "";

  const d = new Date(date + "T00:00:00");

  return d.toLocaleDateString("ar-EG", {
    weekday: "long"
  });
}

function formatStatus(status) {
  const list = {
    open: "🟡 في انتظار الكابتن",
    accepted: "🟢 تم قبول الرحلة",
    completed: "🔵 مكتملة",
    cancelled: "🔴 ملغاة"
  };

  return list[status] || status || "";
}

/* ======================================================
   BUILD APP UI
   ====================================================== */

function buildApp() {
  document.body.innerHTML = `
    <div id="messageBox" style="display:none"></div>

    <div id="app">

      <!-- LOGIN -->

      <section id="loginScreen" class="screen">
        <div class="auth-card">

          <h1>🚕 وصلني المنوفية</h1>

          <p>تسجيل الدخول</p>

          <input
            id="loginPhone"
            type="tel"
            placeholder="رقم الهاتف"
            autocomplete="tel"
          />

          <input
            id="loginPassword"
            type="password"
            placeholder="كلمة المرور"
          />

          <button id="loginBtn" class="btn primary">
            تسجيل الدخول
          </button>

          <button id="openRegisterBtn" class="btn outline">
            إنشاء حساب جديد
          </button>

          <div id="loginMsg"></div>

        </div>
      </section>


      <!-- REGISTER -->

      <section id="registerScreen" class="screen" style="display:none">

        <div class="auth-card">

          <h2>إنشاء حساب</h2>

          <label>نوع الحساب</label>

          <select id="registerRole">
            <option value="customer">👤 عميل</option>
            <option value="captain">🚕 كابتن</option>
          </select>

          <input
            id="registerName"
            type="text"
            placeholder="الاسم بالكامل"
          />

          <input
            id="registerPhone"
            type="tel"
            placeholder="رقم الهاتف"
          />

          <input
            id="registerPassword"
            type="password"
            placeholder="كلمة المرور"
          />

          <div id="captainFields" style="display:none">

            <input
              id="captainAge"
              type="number"
              placeholder="السن"
              min="18"
            />

            <input
              id="captainCarType"
              type="text"
              placeholder="نوع العربية"
            />

            <input
              id="captainCarModel"
              type="text"
              placeholder="موديل العربية"
            />

            <input
              id="captainPlate"
              type="text"
              placeholder="رقم اللوحة"
            />

          </div>

          <button id="sendCodeBtn" class="btn primary">
            إرسال كود التحقق
          </button>

          <div id="verifyArea" style="display:none">

            <input
              id="verificationCode"
              type="number"
              placeholder="اكتب كود التحقق"
            />

            <button id="verifyBtn" class="btn green">
              تأكيد التسجيل
            </button>

          </div>

          <button id="backLoginBtn" class="btn outline">
            رجوع لتسجيل الدخول
          </button>

          <div id="registerMsg"></div>

        </div>

      </section>


      <!-- CUSTOMER HOME -->

      <section id="customerScreen" class="screen" style="display:none">

        <div class="topbar">
          <h2>🚕 وصلني المنوفية</h2>
          <button id="customerLogoutBtn" class="small-btn">
            خروج
          </button>
        </div>

        <div class="card">

          <h3>طلب رحلة جديدة</h3>

          <button id="locationBtn" class="btn outline">
            📍 تحديد موقعي الحالي
          </button>

          <input
            id="pickupInput"
            type="text"
            placeholder="مكان الانطلاق بالتفصيل"
          />

          <input
            id="destinationInput"
            type="text"
            placeholder="مكان الوصول بالتفصيل"
          />

          <button id="searchDestinationBtn" class="btn outline">
            🔎 البحث عن المكان
          </button>

          <div id="map" class="map"></div>

          <label>📅 تاريخ الرحلة</label>

          <input
            id="rideDate"
            type="date"
          />

          <div id="dayNameBox" class="info-box">
            اسم اليوم سيظهر هنا
          </div>

          <label>⏰ وقت الرحلة</label>

          <input
            id="rideTime"
            type="time"
          />

          <input
            id="ridePrice"
            type="number"
            placeholder="سعر الرحلة بالجنيه"
            min="1"
          />

          <input
            id="passengerCount"
            type="number"
            placeholder="عدد الركاب"
            min="1"
            max="20"
            value="1"
          />

          <textarea
            id="rideNotes"
            placeholder="ملاحظات الرحلة، مثل شنطة كبيرة أو أي تفاصيل أخرى"
          ></textarea>

          <button id="postRideBtn" class="btn primary">
            🚕 نشر الرحلة
          </button>

        </div>

        <div class="card">

          <h3>رحلاتي</h3>

          <div id="customerRides"></div>

        </div>

      </section>


      <!-- CAPTAIN -->

      <section id="captainScreen" class="screen" style="display:none">

        <div class="topbar">

          <h2>🚕 منصة الكابتن</h2>

          <button id="captainLogoutBtn" class="small-btn">
            خروج
          </button>

        </div>

        <div class="card">

          <h3>الرحلات المتاحة</h3>

          <div id="captainRides"></div>

        </div>

        <div class="card">

          <h3>رحلاتي المقبولة</h3>

          <div id="captainHistory"></div>

        </div>

      </section>

    </div>
  `;

  bindEvents();
}

/* ======================================================
   SCREEN
   ====================================================== */

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.style.display = "none";
  });

  const screen = $(id);

  if (screen) {
    screen.style.display = "block";
  }
}

/* ======================================================
   AUTH EVENTS
   ====================================================== */

function bindEvents() {

  $("openRegisterBtn").onclick = () => {
    showScreen("registerScreen");
  };

  $("backLoginBtn").onclick = () => {
    showScreen("loginScreen");
  };

  $("registerRole").onchange = () => {

    $("captainFields").style.display =
      $("registerRole").value === "captain"
        ? "block"
        : "none";

  };

  $("loginBtn").onclick = login;

  $("sendCodeBtn").onclick = sendRegistrationCode;

  $("verifyBtn").onclick = verifyRegistration;

  $("customerLogoutBtn").onclick = logout;

  $("captainLogoutBtn").onclick = logout;

  $("locationBtn").onclick = useCurrentLocation;

  $("searchDestinationBtn").onclick = searchDestination;

  $("rideDate").onchange = () => {

    const date = $("rideDate").value;

    $("dayNameBox").textContent =
      date
        ? `📅 اليوم: ${dayName(date)}`
        : "اسم اليوم سيظهر هنا";

  };

  $("postRideBtn").onclick = createRide;
}

/* ======================================================
   LOGIN
   ====================================================== */

async function login() {

  const phone = normalizePhone($("loginPhone").value);
  const password = $("loginPassword").value;

  if (!phone || !password) {
    $("loginMsg").textContent =
      "اكتب رقم الهاتف وكلمة المرور.";

    return;
  }

  try {

    $("loginBtn").disabled = true;

    await signInWithEmailAndPassword(
      auth,
      loginEmail(phone),
      password
    );

    $("loginMsg").textContent =
      "تم تسجيل الدخول بنجاح.";

  } catch (error) {

    console.error(error);

    $("loginMsg").textContent =
      "رقم الهاتف أو كلمة المرور غير صحيحة.";

  } finally {

    $("loginBtn").disabled = false;

  }
}

/* ======================================================
   RECAPTCHA
   ====================================================== */

function createRecaptcha() {

  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {}
  }

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "sendCodeBtn",
    {
      size: "invisible"
    }
  );

  return recaptchaVerifier;
}

/* ======================================================
   SEND OTP
   ====================================================== */

async function sendRegistrationCode() {

  const name = $("registerName").value.trim();
  const phone = normalizePhone($("registerPhone").value);
  const password = $("registerPassword").value;
  const role = $("registerRole").value;

  if (!name) {
    showMessage("اكتب الاسم.", "error");
    return;
  }

  if (!phone || phone.length < 13) {
    showMessage("اكتب رقم هاتف مصري صحيح.", "error");
    return;
  }

  if (!password || password.length < 6) {
    showMessage("كلمة المرور لازم تكون 6 أحرف أو أرقام على الأقل.", "error");
    return;
  }

  if (role === "captain") {

    const age = Number($("captainAge").value);
    const carType = $("captainCarType").value.trim();
    const carModel = $("captainCarModel").value.trim();
    const plate = $("captainPlate").value.trim();

    if (!age || age < 18) {
      showMessage("الكابتن لازم يكون 18 سنة أو أكثر.", "error");
      return;
    }

    if (!carType || !carModel || !plate) {
      showMessage(
        "اكتب نوع العربية والموديل ورقم اللوحة.",
        "error"
      );

      return;
    }
  }

  try {

    $("sendCodeBtn").disabled = true;

    const verifier = createRecaptcha();

    confirmationResult =
      await signInWithPhoneNumber(
        auth,
        phone,
        verifier
      );

    $("verifyArea").style.display = "block";

    showMessage(
      "تم إرسال كود التحقق على الهاتف.",
      "success"
    );

  } catch (error) {

    console.error(error);

    showMessage(
      error.message || "تعذر إرسال كود التحقق.",
      "error"
    );

  } finally {

    $("sendCodeBtn").disabled = false;

  }
}

/* ======================================================
   VERIFY REGISTRATION
   ====================================================== */

async function verifyRegistration() {

  const code = $("verificationCode").value.trim();

  if (!confirmationResult) {
    showMessage("اطلب كود التحقق أولاً.", "error");
    return;
  }

  if (!code) {
    showMessage("اكتب كود التحقق.", "error");
    return;
  }

  try {

    const result =
      await confirmationResult.confirm(code);

    currentUser = result.user;

    const phone = normalizePhone(
      $("registerPhone").value
    );

    const password =
      $("registerPassword").value;

    const role =
      $("registerRole").value;

    const credential =
      EmailAuthProvider.credential(
        loginEmail(phone),
        password
      );

    try {

      await linkWithCredential(
        currentUser,
        credential
      );

    } catch (error) {

      if (error.code !== "auth/provider-already-linked") {
        throw error;
      }

    }

    const data = {

      uid: currentUser.uid,

      name: $("registerName").value.trim(),

      phone,

      role,

      accountNumber: accountNumber(),

      createdAt: serverTimestamp(),

      updatedAt: serverTimestamp()

    };

    if (role === "captain") {

      data.age =
        Number($("captainAge").value);

      data.carType =
        $("captainCarType").value.trim();

      data.carModel =
        $("captainCarModel").value.trim();

      data.plateNumber =
        $("captainPlate").value.trim();

    }

    await setDoc(
      doc(db, "users", currentUser.uid),
      data
    );

    profile = data;
    currentRole = role;

    showMessage(
      "تم إنشاء الحساب بنجاح ✅",
      "success"
    );

    openRoleScreen();

  } catch (error) {

    console.error(error);

    showMessage(
      error.message || "تعذر تأكيد الحساب.",
      "error"
    );

  }
}

/* ======================================================
   AUTH STATE
   ====================================================== */

onAuthStateChanged(auth, async user => {

  currentUser = user;

  if (!user) {

    profile = null;
    currentRole = "";

    showScreen("loginScreen");

    return;
  }

  try {

    const snap =
      await getDoc(
        doc(db, "users", user.uid)
      );

    if (!snap.exists()) {

      await signOut(auth);

      showScreen("loginScreen");

      return;
    }

    profile = snap.data();

    currentRole = profile.role;

    if (
      currentRole !== "customer" &&
      currentRole !== "captain"
    ) {

      await signOut(auth);

      showMessage(
        "نوع الحساب غير صحيح.",
        "error"
      );

      return;
    }

    openRoleScreen();

  } catch (error) {

    console.error(error);

    showMessage(
      "تعذر تحميل الحساب.",
      "error"
    );

  }

});

/* ======================================================
   OPEN ROLE SCREEN
   ====================================================== */

function openRoleScreen() {

  if (currentRole === "customer") {

    showScreen("customerScreen");

    loadCustomerRides();

  } else if (currentRole === "captain") {

    showScreen("captainScreen");

    loadCaptainRides();

    loadCaptainHistory();

  }

}

/* ======================================================
   LOGOUT
   ====================================================== */

async function logout() {

  if (unsubscribeCustomerRides) {
    unsubscribeCustomerRides();
    unsubscribeCustomerRides = null;
  }

  if (unsubscribeCaptainRides) {
    unsubscribeCaptainRides();
    unsubscribeCaptainRides = null;
  }

  if (unsubscribeCaptainHistory) {
    unsubscribeCaptainHistory();
    unsubscribeCaptainHistory = null;
  }

  await signOut(auth);

  showScreen("loginScreen");

}

/* ======================================================
   LOCATION
   ====================================================== */

async function useCurrentLocation() {

  try {

    let permissions =
      await Geolocation.checkPermissions();

    if (
      permissions.location !== "granted"
    ) {

      permissions =
        await Geolocation.requestPermissions();

    }

    if (
      permissions.location !== "granted"
    ) {

      showMessage(
        "اسمح للتطبيق بالوصول إلى الموقع من إعدادات الهاتف.",
        "error"
      );

      return;
    }

    const position =
      await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000
      });

    const lat =
      position.coords.latitude;

    const lng =
      position.coords.longitude;

    pickup = {
      lat,
      lng
    };

    $("pickupInput").value =
      await reverseGeocode(lat, lng);

    showMap(lat, lng);

  } catch (error) {

    console.error(error);

    showMessage(
      "تعذر تحديد موقعك. تأكد من تشغيل GPS والسماح بالموقع.",
      "error"
    );

  }

}

/* ======================================================
   MAP
   ====================================================== */

function showMap(lat = 30.5595, lng = 31.0106) {

  if (!map) {

    map = L.map("map", {
      zoomControl: true,
      maxZoom: 20
    }).setView([lat, lng], 13);

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 20,
        attribution: "© OpenStreetMap"
      }
    ).addTo(map);

    map.on("click", async event => {

      destination = {
        lat: event.latlng.lat,
        lng: event.latlng.lng
      };

      if (destinationMarker) {
        map.removeLayer(destinationMarker);
      }

      destinationMarker =
        L.marker([
          destination.lat,
          destination.lng
        ]).addTo(map);

      const address =
        await reverseGeocode(
          destination.lat,
          destination.lng
        );

      $("destinationInput").value =
        address;

      drawRoute();

    });

  } else {

    map.setView([lat, lng], 15);

  }

  if (pickupMarker) {
    map.removeLayer(pickupMarker);
  }

  pickupMarker =
    L.marker([lat, lng])
      .addTo(map)
      .bindPopup("📍 الانطلاق")
      .openPopup();

}

/* ======================================================
   SEARCH DESTINATION
   ====================================================== */

async function searchDestination() {

  const text =
    $("destinationInput").value.trim();

  if (!text) {

    showMessage(
      "اكتب مكان الوصول.",
      "error"
    );

    return;
  }

  try {

    const url =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({
        q: text,
        format: "json",
        limit: "1",
        countrycodes: "eg"
      });

    const response =
      await fetch(url, {
        headers: {
          Accept: "application/json"
        }
      });

    const results =
      await response.json();

    if (!results.length) {

      showMessage(
        "المكان مش موجود في البحث.",
        "error"
      );

      return;
    }

    const place = results[0];

    destination = {
      lat: Number(place.lat),
      lng: Number(place.lon)
    };

    $("destinationInput").value =
      place.display_name;

    showMap(
      destination.lat,
      destination.lng
    );

    if (destinationMarker) {
      map.removeLayer(destinationMarker);
    }

    destinationMarker =
      L.marker([
        destination.lat,
        destination.lng
      ]).addTo(map);

    drawRoute();

  } catch (error) {

    console.error(error);

    showMessage(
      "تعذر البحث عن المكان.",
      "error"
    );

  }

}

/* ======================================================
   REVERSE GEOCODING
   ====================================================== */

async function reverseGeocode(lat, lng) {

  try {

    const url =
      "https://nominatim.openstreetmap.org/reverse?" +
      new URLSearchParams({
        lat,
        lon: lng,
        format: "json",
        zoom: 18,
        addressdetails: 1
      });

    const response =
      await fetch(url, {
        headers: {
          Accept: "application/json"
        }
      });

    const data =
      await response.json();

    return data.display_name ||
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  } catch {

    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  }

}

/* ======================================================
   ROUTE
   ====================================================== */

async function drawRoute() {

  if (!pickup || !destination) {
    return;
  }

  try {

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${pickup.lng},${pickup.lat};` +
      `${destination.lng},${destination.lat}` +
      `?overview=full&geometries=geojson`;

    const response =
      await fetch(url);

    const data =
      await response.json();

    if (
      !data.routes ||
      !data.routes.length
    ) {
      return;
    }

    const geometry =
      data.routes[0].geometry;

    if (routeLayer) {
      map.removeLayer(routeLayer);
    }

    routeLayer =
      L.geoJSON(geometry, {
        style: {
          weight: 5
        }
      }).addTo(map);

    map.fitBounds(
      routeLayer.getBounds(),
      {
        padding: [30, 30]
      }
    );

  } catch (error) {

    console.error(error);

  }

}

/* ======================================================
   CREATE RIDE
   ====================================================== */

async function createRide() {

  if (!currentUser) {
    return;
  }

  if (currentRole !== "customer") {

    showMessage(
      "صفحة الرحلات للعميل فقط.",
      "error"
    );

    return;
  }

  const fromPlace =
    $("pickupInput").value.trim();

  const toPlace =
    $("destinationInput").value.trim();

  const rideDate =
    $("rideDate").value;

  const rideTime =
    $("rideTime").value;

  const price =
    Number($("ridePrice").value);

  const passengerCount =
    Number($("passengerCount").value);

  const notes =
    $("rideNotes").value.trim();

  if (!fromPlace) {
    showMessage(
      "حدد مكان الانطلاق.",
      "error"
    );

    return;
  }

  if (!toPlace) {
    showMessage(
      "حدد مكان الوصول.",
      "error"
    );

    return;
  }

  if (!rideDate) {
    showMessage(
      "اختار تاريخ الرحلة.",
      "error"
    );

    return;
  }

  if (!rideTime) {
    showMessage(
      "اختار وقت الرحلة.",
      "error"
    );

    return;
  }

  if (!price || price <= 0) {
    showMessage(
      "اكتب سعر الرحلة.",
      "error"
    );

    return;
  }

  if (
    !passengerCount ||
    passengerCount < 1
  ) {

    showMessage(
      "اكتب عدد الركاب.",
      "error"
    );

    return;
  }

  if (!pickup || !destination) {

    showMessage(
      "حدد نقطة الانطلاق والوصول على الخريطة.",
      "error"
    );

    return;
  }

  try {

    $("postRideBtn").disabled = true;

    const rideRef =
      await addDoc(
        collection(db, "rides"),
        {
          customerId: currentUser.uid,

          fromPlace,

          toPlace,

          pickupCoords: pickup,

          destinationCoords: destination,

          price,

          passengerCount,

          notes,

          rideDate,

          rideTime,

          dayName: dayName(rideDate),

          status: "open",

          createdAt: serverTimestamp(),

          updatedAt: serverTimestamp()
        }
      );

    /*
      رقم العميل موجود في ملف contact
      لكن الكابتن ممنوع يقرأه قبل قبول الرحلة.
    */

    await setDoc(
      doc(
        db,
        "rides",
        rideRef.id,
        "contact",
        "info"
      ),
      {
        customerPhone:
          profile.phone ||
          currentUser.phoneNumber ||
          "",

        captainPhone: "",

        createdAt: serverTimestamp()
      }
    );

    showMessage(
      "تم نشر الرحلة على منصة الكباتن ✅",
      "success"
    );

    $("ridePrice").value = "";
    $("rideNotes").value = "";

    $("customerRides").scrollIntoView({
      behavior: "smooth"
    });

  } catch (error) {

    console.error(error);

    showMessage(
      error.message ||
      "تعذر نشر الرحلة.",
      "error"
    );

  } finally {

    $("postRideBtn").disabled = false;

  }

}

/* ======================================================
   CUSTOMER RIDES
   ====================================================== */

function loadCustomerRides() {

  const container =
    $("customerRides");

  if (!currentUser) {
    return;
  }

  if (unsubscribeCustomerRides) {
    unsubscribeCustomerRides();
  }

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

  unsubscribeCustomerRides =
    onSnapshot(
      q,
      async snapshot => {

        const rides =
          snapshot.docs
            .map(d => ({
              id: d.id,
              ...d.data()
            }))
            .sort(
              (a, b) =>
                timestampMillis(b.createdAt) -
                timestampMillis(a.createdAt)
            );

        if (!rides.length) {

          container.innerHTML =
            `<div class="info-box">
              لسه مفيش رحلات.
            </div>`;

          return;
        }

        const cards = [];

        for (const ride of rides) {

          let contact = null;

          if (
            ride.status === "accepted"
          ) {

            try {

              const contactSnap =
                await getDoc(
                  doc(
                    db,
                    "rides",
                    ride.id,
                    "contact",
                    "info"
                  )
                );

              if (contactSnap.exists()) {
                contact =
                  contactSnap.data();
              }

            } catch (error) {

              console.error(error);

            }

          }

          cards.push(
            renderCustomerRide(
              ride,
              contact
            )
          );

        }

        container.innerHTML =
          cards.join("");

      },
      error => {

        console.error(error);

        container.innerHTML =
          `<div class="card error">
            تعذر تحميل رحلاتك.
          </div>`;

      }
    );

}

/* ======================================================
   CUSTOMER RIDE CARD
   ====================================================== */

function renderCustomerRide(
  ride,
  contact
) {

  const accepted =
    ride.status === "accepted";

  return `
    <div class="card ride-card">

      <div class="ride-header">

        <strong>
          🚕 الرحلة
        </strong>

        <span class="pill">
          ${escapeHtml(
            formatStatus(ride.status)
          )}
        </span>

      </div>

      <div class="ride-line">
        📍 <strong>من:</strong>
        <br>
        ${escapeHtml(ride.fromPlace)}
      </div>

      <div class="ride-line">
        🏁 <strong>إلى:</strong>
        <br>
        ${escapeHtml(ride.toPlace)}
      </div>

      <div class="ride-line">
        💰 السعر:
        <strong>
          ${Number(ride.price || 0)}
          جنيه
        </strong>
      </div>

      <div class="ride-line">
        👥 عدد الركاب:
        ${Number(ride.passengerCount || 1)}
      </div>

      <div class="ride-line">
        📅 ${escapeHtml(formatDate(ride.rideDate))}
        <br>
        🗓️ ${escapeHtml(ride.dayName || "")}
        <br>
        ⏰ ${escapeHtml(ride.rideTime || "")}
      </div>

      ${
        ride.notes
          ? `
            <div class="ride-line">
              📝 ${escapeHtml(ride.notes)}
            </div>
          `
          : ""
      }

      ${
        accepted
          ? `
            <div class="accepted-contact">

              <strong>
                🚕 تم قبول الرحلة
              </strong>

              <br><br>

              ${
                ride.captainName
                  ? `👤 الكابتن:
                     ${escapeHtml(ride.captainName)}
                     <br>`
                  : ""
              }

              ${
                contact?.captainPhone
                  ? `
                    <a
                      href="tel:${escapeHtml(contact.captainPhone)}"
                      class="phone-button"
                    >
                      📞 ${escapeHtml(contact.captainPhone)}
                    </a>
                  `
                  : `
                    <span>
                      📞 رقم الكابتن سيظهر بعد اكتمال بياناته.
                    </span>
                  `
              }

              ${
                ride.carType
                  ? `
                    <br><br>
                    🚗 ${escapeHtml(ride.carType)}
                    ${escapeHtml(ride.carModel || "")}
                    <br>
                    🔢 ${escapeHtml(ride.plateNumber || "")}
                  `
                  : ""
              }

            </div>
          `
          : `
            <div class="info-box">
              ⏳ الرحلة ظاهرة للكباتن وفي انتظار القبول.
            </div>
          `
      }

    </div>
  `;

}

/* ======================================================
   CAPTAIN OPEN RIDES
   ====================================================== */

function loadCaptainRides() {

  const container =
    $("captainRides");

  if (!currentUser) {
    return;
  }

  if (currentRole !== "captain") {
    return;
  }

  if (unsubscribeCaptainRides) {
    unsubscribeCaptainRides();
  }

  const q =
    query(
      collection(db, "rides"),
      where("status", "==", "open"),
      limit(50)
    );

  unsubscribeCaptainRides =
    onSnapshot(
      q,
      snapshot => {

        const rides =
          snapshot.docs
            .map(d => ({
              id: d.id,
              ...d.data()
            }))
            .sort(
              (a, b) =>
                timestampMillis(b.createdAt) -
                timestampMillis(a.createdAt)
            );

        if (!rides.length) {

          container.innerHTML =
            `<div class="info-box">
              🚕 مفيش رحلات متاحة حاليًا.
            </div>`;

          return;
        }

        container.innerHTML =
          rides
            .map(renderCaptainRide)
            .join("");

        container
          .querySelectorAll(
            ".accept-ride-button"
          )
          .forEach(button => {

            button.onclick = () =>
              acceptRide(
                button.dataset.id
              );

          });

        container
          .querySelectorAll(
            ".map-ride-button"
          )
          .forEach(button => {

            button.onclick = () =>
              openRideMap(
                button.dataset.id
              );

          });

      },
      error => {

        console.error(error);

        container.innerHTML =
          `<div class="card error">
            تعذر تحميل الرحلات.
          </div>`;

      }
    );

}

/* ======================================================
   CAPTAIN RIDE CARD
   ====================================================== */

function renderCaptainRide(ride) {

  return `
    <div class="card ride-card">

      <div class="ride-header">

        <strong>
          🚕 رحلة جديدة
        </strong>

        <span class="pill">
          مفتوحة
        </span>

      </div>

      <div class="ride-line">
        📍 <strong>مكان العميل:</strong>
        <br>
        ${escapeHtml(ride.fromPlace)}
      </div>

      <div class="ride-line">
        🏁 <strong>مكان الوصول:</strong>
        <br>
        ${escapeHtml(ride.toPlace)}
      </div>

      <div class="ride-line">
        💰 السعر المطلوب:
        <strong>
          ${Number(ride.price || 0)}
          جنيه
        </strong>
      </div>

      <div class="ride-line">

        📅 ${escapeHtml(formatDate(ride.rideDate))}

        <br>

        🗓️ ${escapeHtml(ride.dayName || "")}

        <br>

        ⏰ ${escapeHtml(ride.rideTime || "")}

      </div>

      <div class="ride-line">
        👥 الركاب:
        ${Number(ride.passengerCount || 1)}
      </div>

      ${
        ride.notes
          ? `
            <div class="ride-line">
              📝
              ${escapeHtml(ride.notes)}
            </div>
          `
          : ""
      }

      <div class="small-note">
        📞 رقم العميل مخفي لحد ما تقبل الرحلة.
      </div>

      <div class="buttons-row">

        <button
          class="btn outline map-ride-button"
          data-id="${ride.id}"
        >
          🗺️ عرض المسار
        </button>

        <button
          class="btn green accept-ride-button"
          data-id="${ride.id}"
        >
          ✅ قبول الرحلة
        </button>

      </div>

    </div>
  `;

}

/* ======================================================
   ACCEPT RIDE
   ====================================================== */

async function acceptRide(rideId) {

  if (!currentUser) {
    return;
  }

  if (currentRole !== "captain") {
    return;
  }

  if (
    !confirm(
      "هل أنت متأكد من قبول الرحلة؟"
    )
  ) {
    return;
  }

  try {

    const rideRef =
      doc(db, "rides", rideId);

    const captainRef =
      doc(
        db,
        "users",
        currentUser.uid
      );

    const contactRef =
      doc(
        db,
        "rides",
        rideId,
        "contact",
        "info"
      );

    await runTransaction(
      db,
      async transaction => {

        const rideSnap =
          await transaction.get(
            rideRef
          );

        const captainSnap =
          await transaction.get(
            captainRef
          );

        if (!rideSnap.exists()) {
          throw new Error(
            "الرحلة غير موجودة."
          );
        }

        if (!captainSnap.exists()) {
          throw new Error(
            "حساب الكابتن غير موجود."
          );
        }

        const ride =
          rideSnap.data();

        const captain =
          captainSnap.data();

        if (ride.status !== "open") {

          throw new Error(
            "الرحلة اتقبلت بالفعل من كابتن آخر."
          );

        }

        if (captain.role !== "captain") {

          throw new Error(
            "الحساب ده مش حساب كابتن."
          );

        }

        transaction.update(
          rideRef,
          {
            status: "accepted",

            captainId:
              currentUser.uid,

            captainName:
              captain.name || "",

            carType:
              captain.carType || "",

            carModel:
              captain.carModel || "",

            plateNumber:
              captain.plateNumber || "",

            acceptedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()
          }
        );

      }
    );

    await updateDoc(
      contactRef,
      {
        captainPhone:
          profile.phone ||
          currentUser.phoneNumber ||
          "",

        updatedAt:
          serverTimestamp()
      }
    );

    showMessage(
      "تم قبول الرحلة ✅ رقم العميل أصبح متاحًا لك.",
      "success"
    );

    loadCaptainHistory();

  } catch (error) {

    console.error(error);

    showMessage(
      error.message ||
      "تعذر قبول الرحلة.",
      "error"
    );

  }

}

/* ======================================================
   CAPTAIN HISTORY
   ====================================================== */

function loadCaptainHistory() {

  const container =
    $("captainHistory");

  if (!currentUser) {
    return;
  }

  if (unsubscribeCaptainHistory) {
    unsubscribeCaptainHistory();
  }

  const q =
    query(
      collection(db, "rides"),
      where(
        "captainId",
        "==",
        currentUser.uid
      ),
      limit(50)
    );

  unsubscribeCaptainHistory =
    onSnapshot(
      q,
      async snapshot => {

        const rides =
          snapshot.docs
            .map(d => ({
              id: d.id,
              ...d.data()
            }))
            .sort(
              (a, b) =>
                timestampMillis(b.acceptedAt) -
                timestampMillis(a.acceptedAt)
            );

        if (!rides.length) {

          container.innerHTML =
            `<div class="info-box">
              لسه مفيش رحلات مقبولة.
            </div>`;

          return;
        }

        const cards = [];

        for (const ride of rides) {

          let customerPhone = "";

          try {

            const contactSnap =
              await getDoc(
                doc(
                  db,
                  "rides",
                  ride.id,
                  "contact",
                  "info"
                )
              );

            if (contactSnap.exists()) {

              customerPhone =
                contactSnap.data()
                  .customerPhone || "";

            }

          } catch (error) {

            console.error(error);

          }

          cards.push(
            `
              <div class="card ride-card">

                <div class="ride-header">

                  <strong>
                    ✅ رحلة مقبولة
                  </strong>

                  <span class="pill">
                    ${escapeHtml(
                      formatStatus(ride.status)
                    )}
                  </span>

                </div>

                <div class="ride-line">
                  📍
                  ${escapeHtml(
                    ride.fromPlace
                  )}
                </div>

                <div class="ride-line">
                  🏁
                  ${escapeHtml(
                    ride.toPlace
                  )}
                </div>

                <div class="ride-line">
                  💰
                  ${Number(
                    ride.price || 0
                  )}
                  جنيه
                </div>

                <div class="ride-line">
                  📅
                  ${escapeHtml(
                    formatDate(
                      ride.rideDate
                    )
                  )}
                  <br>
                  🗓️
                  ${escapeHtml(
                    ride.dayName || ""
                  )}
                  <br>
                  ⏰
                  ${escapeHtml(
                    ride.rideTime || ""
                  )}
                </div>

                <div class="ride-line">
                  👥
                  ${Number(
                    ride.passengerCount || 1
                  )}
                  راكب
                </div>

                ${
                  ride.notes
                    ? `
                      <div class="ride-line">
                        📝
                        ${escapeHtml(
                          ride.notes
                        )}
                      </div>
                    `
                    : ""
                }

                <a
                  class="phone-button"
                  href="tel:${escapeHtml(
                    customerPhone
                  )}"
                >
                  📞 ${escapeHtml(
                    customerPhone ||
                    "رقم العميل"
                  )}
                </a>

              </div>
            `
          );

        }

        container.innerHTML =
          cards.join("");

      },
      error => {

        console.error(error);

        container.innerHTML =
          `<div class="card error">
            تعذر تحميل الرحلات المقبولة.
          </div>`;

      }
    );

}

/* ======================================================
   OPEN RIDE MAP
   ====================================================== */

async function openRideMap(rideId) {

  try {

    const snap =
      await getDoc(
        doc(db, "rides", rideId)
      );

    if (!snap.exists()) {
      return;
    }

    const ride =
      snap.data();

    pickup =
      ride.pickupCoords || null;

    destination =
      ride.destinationCoords || null;

    $("pickupInput").value =
      ride.fromPlace || "";

    $("destinationInput").value =
      ride.toPlace || "";

    showScreen("customerScreen");

    setTimeout(() => {

      if (pickup) {

        showMap(
          pickup.lat,
          pickup.lng
        );

      }

      if (
        destination &&
        map
      ) {

        if (destinationMarker) {
          map.removeLayer(
            destinationMarker
          );
        }

        destinationMarker =
          L.marker([
            destination.lat,
            destination.lng
          ]).addTo(map);

        drawRoute();

      }

    }, 300);

  } catch (error) {

    console.error(error);

    showMessage(
      "تعذر فتح مسار الرحلة.",
      "error"
    );

  }

}

/* ======================================================
   START
   ====================================================== */

buildApp();
