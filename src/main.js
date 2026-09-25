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

setPersistence(
  auth,
  browserLocalPersistence
).catch(console.error);


/* ======================================================
   VARIABLES
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

let pickup = null;

let destination = null;

let unsubscribeCustomerRides = null;

let unsubscribeCaptainRides = null;

let unsubscribeCaptainHistory = null;


/* ======================================================
   HELPERS
   ====================================================== */

function $(id) {
  return document.getElementById(id);
}


function escapeHtml(value = "") {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function normalizePhone(value) {

  let phone = String(value || "").trim();

  phone = phone.replace(/\s+/g, "");

  if (phone.startsWith("01")) {

    phone = "+20" + phone.substring(1);

  }

  if (!phone.startsWith("+20")) {

    phone = "+20" + phone.replace(/^0/, "");

  }

  return phone;

}


function loginEmail(phone) {

  return phone.replace(/\D/g, "") +
    "@wasselni-monufia.app";

}


function accountNumber() {

  return "WM-" +
    Math.floor(
      100000 +
      Math.random() * 900000
    );

}


function showMessage(
  message,
  type = "info"
) {

  let box = $("messageBox");

  if (!box) {

    box = document.createElement("div");

    box.id = "messageBox";

    document.body.appendChild(box);

  }

  box.textContent = message;

  box.style.display = "block";

  box.style.position = "fixed";

  box.style.top = "15px";

  box.style.left = "15px";

  box.style.right = "15px";

  box.style.zIndex = "999999";

  box.style.padding = "15px";

  box.style.borderRadius = "12px";

  box.style.background = "#ffffff";

  box.style.boxShadow =
    "0 5px 25px rgba(0,0,0,.2)";

  box.style.textAlign = "center";

  box.style.fontWeight = "bold";

  box.style.color =
    type === "error"
      ? "#c62828"
      : type === "success"
        ? "#087a35"
        : "#0759a8";

  clearTimeout(window.messageTimer);

  window.messageTimer = setTimeout(() => {

    box.style.display = "none";

  }, 5000);

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

  const d =
    new Date(
      date + "T00:00:00"
    );

  return d.toLocaleDateString(
    "ar-EG",
    {
      year: "numeric",
      month: "long",
      day: "numeric"
    }
  );

}


function getDayName(date) {

  if (!date) return "";

  const d =
    new Date(
      date + "T00:00:00"
    );

  return d.toLocaleDateString(
    "ar-EG",
    {
      weekday: "long"
    }
  );

}


function statusText(status) {

  if (status === "open") {

    return "🟡 في انتظار الكابتن";

  }

  if (status === "accepted") {

    return "🟢 تم قبول الرحلة";

  }

  if (status === "completed") {

    return "🔵 مكتملة";

  }

  if (status === "cancelled") {

    return "🔴 ملغاة";

  }

  return status || "";

}


/* ======================================================
   HTML
   ====================================================== */

function buildApp() {

  document.body.innerHTML = `

    <div id="messageBox"></div>


    <!-- LOGIN -->

    <section
      id="loginScreen"
      class="screen"
    >

      <div class="auth-card">

        <h1>
          🚕 وصلني المنوفية
        </h1>

        <h2>
          تسجيل الدخول
        </h2>

        <input
          id="loginPhone"
          type="tel"
          placeholder="رقم الهاتف"
        >

        <input
          id="loginPassword"
          type="password"
          placeholder="كلمة المرور"
        >

        <button
          id="loginBtn"
          class="btn primary"
        >
          تسجيل الدخول
        </button>

        <button
          id="openRegisterBtn"
          class="btn outline"
        >
          إنشاء حساب جديد
        </button>

      </div>

    </section>


    <!-- REGISTER -->

    <section
      id="registerScreen"
      class="screen"
      style="display:none"
    >

      <div class="auth-card">

        <h1>
          إنشاء حساب
        </h1>

        <label>
          نوع الحساب
        </label>

        <select id="registerRole">

          <option value="customer">
            👤 عميل
          </option>

          <option value="captain">
            🚕 كابتن
          </option>

        </select>


        <input
          id="registerName"
          type="text"
          placeholder="الاسم بالكامل"
        >


        <input
          id="registerPhone"
          type="tel"
          placeholder="رقم الهاتف"
        >


        <input
          id="registerPassword"
          type="password"
          placeholder="كلمة المرور"
        >


        <div
          id="captainFields"
          style="display:none"
        >

          <input
            id="captainAge"
            type="number"
            min="18"
            placeholder="السن"
          >

          <input
            id="captainCarType"
            type="text"
            placeholder="نوع العربية"
          >

          <input
            id="captainCarModel"
            type="text"
            placeholder="موديل العربية"
          >

          <input
            id="captainPlate"
            type="text"
            placeholder="رقم اللوحة"
          >

        </div>


        <!-- RECAPTCHA -->

        <div
          id="recaptcha-container"
        ></div>


        <button
          id="sendCodeBtn"
          class="btn primary"
        >
          إرسال كود التحقق
        </button>


        <div
          id="verifyArea"
          style="display:none"
        >

          <input
            id="verificationCode"
            type="number"
            placeholder="اكتب كود التحقق"
          >

          <button
            id="verifyBtn"
            class="btn green"
          >
            تأكيد التسجيل
          </button>

        </div>


        <button
          id="backLoginBtn"
          class="btn outline"
        >
          رجوع لتسجيل الدخول
        </button>

      </div>

    </section>


    <!-- CUSTOMER -->

    <section
      id="customerScreen"
      class="screen"
      style="display:none"
    >

      <div class="topbar">

        <h2>
          🚕 وصلني المنوفية
        </h2>

        <button
          id="customerLogoutBtn"
          class="small-btn"
        >
          خروج
        </button>

      </div>


      <div class="card">

        <h3>
          طلب رحلة جديدة
        </h3>


        <button
          id="locationBtn"
          class="btn outline"
        >
          📍 تحديد موقعي الحالي
        </button>


        <input
          id="pickupInput"
          placeholder="مكان الانطلاق بالتفصيل"
        >


        <input
          id="destinationInput"
          placeholder="مكان الوصول بالتفصيل"
        >


        <button
          id="searchDestinationBtn"
          class="btn outline"
        >
          🔎 البحث عن مكان الوصول
        </button>


        <div
          id="map"
          class="map"
        ></div>


        <label>
          📅 تاريخ الرحلة
        </label>

        <input
          id="rideDate"
          type="date"
        >


        <div
          id="dayNameBox"
          class="info-box"
        >
          اسم اليوم سيظهر هنا
        </div>


        <label>
          ⏰ وقت الرحلة
        </label>

        <input
          id="rideTime"
          type="time"
        >


        <input
          id="ridePrice"
          type="number"
          min="1"
          placeholder="سعر الرحلة بالجنيه"
        >


        <input
          id="passengerCount"
          type="number"
          min="1"
          max="20"
          value="1"
          placeholder="عدد الركاب"
        >


        <textarea
          id="rideNotes"
          placeholder="ملاحظات، مثل شنطة كبيرة"
        ></textarea>


        <button
          id="postRideBtn"
          class="btn primary"
        >
          🚕 نشر الرحلة
        </button>

      </div>


      <div class="card">

        <h3>
          رحلاتي
        </h3>

        <div id="customerRides"></div>

      </div>

    </section>


    <!-- CAPTAIN -->

    <section
      id="captainScreen"
      class="screen"
      style="display:none"
    >

      <div class="topbar">

        <h2>
          🚕 منصة الكابتن
        </h2>

        <button
          id="captainLogoutBtn"
          class="small-btn"
        >
          خروج
        </button>

      </div>


      <div class="card">

        <h3>
          الرحلات المتاحة
        </h3>

        <div id="captainRides"></div>

      </div>


      <div class="card">

        <h3>
          رحلاتي المقبولة
        </h3>

        <div id="captainHistory"></div>

      </div>

    </section>

  `;


  bindEvents();

}


/* ======================================================
   SCREENS
   ====================================================== */

function showScreen(id) {

  document
    .querySelectorAll(".screen")
    .forEach(screen => {

      screen.style.display = "none";

    });


  const screen = $(id);

  if (screen) {

    screen.style.display = "block";

  }

}


/* ======================================================
   EVENTS
   ====================================================== */

function bindEvents() {


  $("openRegisterBtn").onclick =
    () => {

      showScreen(
        "registerScreen"
      );

    };


  $("backLoginBtn").onclick =
    () => {

      showScreen(
        "loginScreen"
      );

    };


  $("registerRole").onchange =
    () => {

      $("captainFields").style.display =
        $("registerRole").value === "captain"
          ? "block"
          : "none";

    };


  $("loginBtn").onclick =
    login;


  $("sendCodeBtn").onclick =
    sendRegistrationCode;


  $("verifyBtn").onclick =
    verifyRegistration;


  $("customerLogoutBtn").onclick =
    logout;


  $("captainLogoutBtn").onclick =
    logout;


  $("locationBtn").onclick =
    useCurrentLocation;


  $("searchDestinationBtn").onclick =
    searchDestination;


  $("rideDate").onchange =
    () => {

      const date =
        $("rideDate").value;

      $("dayNameBox").textContent =
        date
          ? "📅 اليوم: " +
            getDayName(date)
          : "اسم اليوم سيظهر هنا";

    };


  $("postRideBtn").onclick =
    createRide;

}


/* ======================================================
   LOGIN
   ====================================================== */

async function login() {

  const phone =
    normalizePhone(
      $("loginPhone").value
    );

  const password =
    $("loginPassword").value;


  if (!phone || !password) {

    showMessage(
      "اكتب رقم الهاتف وكلمة المرور.",
      "error"
    );

    return;

  }


  try {

    $("loginBtn").disabled = true;


    await signInWithEmailAndPassword(
      auth,
      loginEmail(phone),
      password
    );


    showMessage(
      "تم تسجيل الدخول بنجاح ✅",
      "success"
    );


  } catch (error) {

    console.error(error);

    showMessage(
      "رقم الهاتف أو كلمة المرور غير صحيحة.",
      "error"
    );


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

    recaptchaVerifier = null;

  }


  recaptchaVerifier =
    new RecaptchaVerifier(
      auth,
      "recaptcha-container",
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

  const name =
    $("registerName").value.trim();

  const phone =
    normalizePhone(
      $("registerPhone").value
    );

  const password =
    $("registerPassword").value;

  const role =
    $("registerRole").value;


  if (!name) {

    showMessage(
      "اكتب الاسم.",
      "error"
    );

    return;

  }


  if (
    !phone ||
    phone.length < 13
  ) {

    showMessage(
      "اكتب رقم هاتف مصري صحيح.",
      "error"
    );

    return;

  }


  if (
    !password ||
    password.length < 6
  ) {

    showMessage(
      "كلمة المرور لازم تكون 6 أحرف أو أرقام على الأقل.",
      "error"
    );

    return;

  }


  if (role === "captain") {

    const age =
      Number(
        $("captainAge").value
      );

    const carType =
      $("captainCarType")
        .value
        .trim();

    const carModel =
      $("captainCarModel")
        .value
        .trim();

    const plate =
      $("captainPlate")
        .value
        .trim();


    if (!age || age < 18) {

      showMessage(
        "سن الكابتن لازم يكون 18 سنة أو أكثر.",
        "error"
      );

      return;

    }


    if (
      !carType ||
      !carModel ||
      !plate
    ) {

      showMessage(
        "اكتب نوع العربية والموديل ورقم اللوحة.",
        "error"
      );

      return;

    }

  }


  try {

    $("sendCodeBtn").disabled = true;


    const verifier =
      createRecaptcha();


    confirmationResult =
      await signInWithPhoneNumber(
        auth,
        phone,
        verifier
      );


    $("verifyArea").style.display =
      "block";


    showMessage(
      "تم إرسال كود التحقق 📩",
      "success"
    );


  } catch (error) {

    console.error(error);

    showMessage(
      error.message ||
      "تعذر إرسال كود التحقق.",
      "error"
    );


  } finally {

    $("sendCodeBtn").disabled = false;

  }

}


/* ======================================================
   VERIFY
   ====================================================== */

async function verifyRegistration() {

  const code =
    $("verificationCode")
      .value
      .trim();


  if (!confirmationResult) {

    showMessage(
      "اضغط إرسال كود التحقق أولاً.",
      "error"
    );

    return;

  }


  if (!code) {

    showMessage(
      "اكتب كود التحقق.",
      "error"
    );

    return;

  }


  try {

    const result =
      await confirmationResult.confirm(
        code
      );


    currentUser =
      result.user;


    const phone =
      normalizePhone(
        $("registerPhone").value
      );


    const password =
      $("registerPassword").value;


    const role =
      $("registerRole").value;


    /*
      بعد نجاح OTP:
      نربط حساب الهاتف بحساب Email/Password
      حتى يقدر المستخدم يدخل لاحقًا
      برقم الهاتف + كلمة المرور.
    */

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

      if (
        error.code !==
        "auth/provider-already-linked"
      ) {

        throw error;

      }

    }


    const userData = {

      uid:
        currentUser.uid,

      name:
        $("registerName")
          .value
          .trim(),

      phone,

      role,

      accountNumber:
        accountNumber(),

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()

    };


    if (role === "captain") {

      userData.age =
        Number(
          $("captainAge").value
        );

      userData.carType =
        $("captainCarType")
          .value
          .trim();

      userData.carModel =
        $("captainCarModel")
          .value
          .trim();

      userData.plateNumber =
        $("captainPlate")
          .value
          .trim();

    }


    await setDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      userData
    );


    profile =
      userData;

    currentRole =
      role;


    showMessage(
      "تم إنشاء الحساب بنجاح ✅",
      "success"
    );


    openRoleScreen();


  } catch (error) {

    console.error(error);

    showMessage(
      error.message ||
      "حصل خطأ أثناء إنشاء الحساب.",
      "error"
    );

  }

}


/* ======================================================
   AUTH STATE
   ====================================================== */

onAuthStateChanged(
  auth,
  async user => {

    currentUser = user;


    if (!user) {

      profile = null;

      currentRole = "";

      showScreen(
        "loginScreen"
      );

      return;

    }


    try {

      const snap =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );


      if (!snap.exists()) {

        await signOut(auth);

        showScreen(
          "loginScreen"
        );

        return;

      }


      profile =
        snap.data();


      currentRole =
        profile.role;


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
        "تعذر تحميل بيانات الحساب.",
        "error"
      );

    }

  }
);


/* ======================================================
   ROLE SCREEN
   ====================================================== */

function openRoleScreen() {

  if (
    currentRole === "customer"
  ) {

    showScreen(
      "customerScreen"
    );

    initializeCustomerMap();

    loadCustomerRides();

  }


  if (
    currentRole === "captain"
  ) {

    showScreen(
      "captainScreen"
    );

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


  showScreen(
    "loginScreen"
  );

}


/* ======================================================
   MAP
   ====================================================== */

function initializeCustomerMap() {

  setTimeout(() => {

    if (map) {

      map.invalidateSize();

      return;

    }


    map =
      L.map("map").setView(
        [30.5595, 31.0106],
        12
      );


    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 20,
        attribution:
          "© OpenStreetMap"
      }
    ).addTo(map);


    map.on(
      "click",
      async event => {

        destination = {

          lat:
            event.latlng.lat,

          lng:
            event.latlng.lng

        };


        if (
          destinationMarker
        ) {

          map.removeLayer(
            destinationMarker
          );

        }


        destinationMarker =
          L.marker([
            destination.lat,
            destination.lng
          ])
          .addTo(map)
          .bindPopup(
            "🏁 الوصول"
          )
          .openPopup();


        $("destinationInput").value =
          await reverseGeocode(
            destination.lat,
            destination.lng
          );


        drawRoute();

      }
    );

  }, 300);

}


/* ======================================================
   LOCATION
   ====================================================== */

async function useCurrentLocation() {

  try {

    const permissions =
      await Geolocation.checkPermissions();


    if (
      permissions.location !==
      "granted"
    ) {

      const requested =
        await Geolocation.requestPermissions();


      if (
        requested.location !==
        "granted"
      ) {

        showMessage(
          "اسمح للتطبيق باستخدام الموقع من إعدادات الهاتف.",
          "error"
        );

        return;

      }

    }


    const position =
      await Geolocation.getCurrentPosition(
        {
          enableHighAccuracy: true,
          timeout: 15000
        }
      );


    pickup = {

      lat:
        position.coords.latitude,

      lng:
        position.coords.longitude

    };


    $("pickupInput").value =
      await reverseGeocode(
        pickup.lat,
        pickup.lng
      );


    initializeCustomerMap();


    setTimeout(() => {

      if (!map) return;


      map.setView(
        [
          pickup.lat,
          pickup.lng
        ],
        16
      );


      if (pickupMarker) {

        map.removeLayer(
          pickupMarker
        );

      }


      pickupMarker =
        L.marker([
          pickup.lat,
          pickup.lng
        ])
        .addTo(map)
        .bindPopup(
          "📍 الانطلاق"
        )
        .openPopup();


      drawRoute();

    }, 400);


  } catch (error) {

    console.error(error);

    showMessage(
      "تعذر تحديد موقعك. تأكد من تشغيل GPS.",
      "error"
    );

  }

}


/* ======================================================
   SEARCH
   ====================================================== */

async function searchDestination() {

  const text =
    $("destinationInput")
      .value
      .trim();


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
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json"
          }
        }
      );


    const results =
      await response.json();


    if (!results.length) {

      showMessage(
        "المكان غير موجود.",
        "error"
      );

      return;

    }


    const result =
      results[0];


    destination = {

      lat:
        Number(result.lat),

      lng:
        Number(result.lon)

    };


    $("destinationInput").value =
      result.display_name;


    initializeCustomerMap();


    setTimeout(() => {

      if (destinationMarker) {

        map.removeLayer(
          destinationMarker
        );

      }


      destinationMarker =
        L.marker([
          destination.lat,
          destination.lng
        ])
        .addTo(map);


      map.setView(
        [
          destination.lat,
          destination.lng
        ],
        15
      );


      drawRoute();

    }, 400);


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

async function reverseGeocode(
  lat,
  lng
) {

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
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json"
          }
        }
      );


    const data =
      await response.json();


    return (
      data.display_name ||
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );


  } catch {

    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  }

}


/* ======================================================
   ROUTE
   ====================================================== */

async function drawRoute() {

  if (
    !pickup ||
    !destination ||
    !map
  ) {

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


    if (routeLayer) {

      map.removeLayer(
        routeLayer
      );

    }


    routeLayer =
      L.geoJSON(
        data.routes[0].geometry,
        {
          style: {
            weight: 5
          }
        }
      ).addTo(map);


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

    showMessage(
      "سجل الدخول أولاً.",
      "error"
    );

    return;

  }


  if (
    currentRole !== "customer"
  ) {

    showMessage(
      "إنشاء الرحلات متاح للعميل فقط.",
      "error"
    );

    return;

  }


  const fromPlace =
    $("pickupInput")
      .value
      .trim();


  const toPlace =
    $("destinationInput")
      .value
      .trim();


  const rideDate =
    $("rideDate").value;


  const rideTime =
    $("rideTime").value;


  const price =
    Number(
      $("ridePrice").value
    );


  const passengers =
    Number(
      $("passengerCount").value
    );


  const notes =
    $("rideNotes")
      .value
      .trim();


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


  if (!pickup || !destination) {

    showMessage(
      "حدد الانطلاق والوصول على الخريطة.",
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
    !passengers ||
    passengers < 1
  ) {

    showMessage(
      "اكتب عدد الركاب.",
      "error"
    );

    return;

  }


  try {

    $("postRideBtn").disabled = true;


    const rideRef =
      await addDoc(
        collection(
          db,
          "rides"
        ),
        {

          customerId:
            currentUser.uid,

          fromPlace,

          toPlace,

          pickupCoords:
            pickup,

          destinationCoords:
            destination,

          price,

          passengers,

          notes,

          rideDate,

          rideTime,

          dayName:
            getDayName(rideDate),

          status:
            "open",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()

        }
      );


    /*
      رقم العميل موجود هنا،
      لكن قواعد Firestore تمنع الكابتن
      من قراءته قبل قبول الرحلة.
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

        captainPhone:
          "",

        createdAt:
          serverTimestamp()

      }
    );


    showMessage(
      "تم نشر الرحلة للكباتن ✅",
      "success"
    );


    $("ridePrice").value = "";

    $("rideNotes").value = "";


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

  if (!currentUser) return;


  const container =
    $("customerRides");


  if (
    unsubscribeCustomerRides
  ) {

    unsubscribeCustomerRides();

  }


  const q =
    query(
      collection(
        db,
        "rides"
      ),

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
            .map(
              d => ({
                id: d.id,
                ...d.data()
              })
            )
            .sort(
              (a, b) =>
                timestampMillis(
                  b.createdAt
                ) -
                timestampMillis(
                  a.createdAt
                )
            );


        if (!rides.length) {

          container.innerHTML =
            `
              <div class="info-box">
                لسه مفيش رحلات.
              </div>
            `;

          return;

        }


        const cards = [];


        for (
          const ride of rides
        ) {

          let contact = null;


          if (
            ride.status ===
            "accepted"
          ) {

            try {

              const snap =
                await getDoc(
                  doc(
                    db,
                    "rides",
                    ride.id,
                    "contact",
                    "info"
                  )
                );


              if (
                snap.exists()
              ) {

                contact =
                  snap.data();

              }

            } catch {}

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
          `
            <div class="info-box">
              تعذر تحميل الرحلات.
            </div>
          `;

      }
    );

}


/* ======================================================
   CUSTOMER RIDE
   ====================================================== */

function renderCustomerRide(
  ride,
  contact
) {

  return `

    <div class="card ride-card">

      <div class="ride-header">

        <strong>
          🚕 رحلتي
        </strong>

        <span class="pill">
          ${escapeHtml(
            statusText(
              ride.status
            )
          )}
        </span>

      </div>


      <div class="ride-line">

        📍 <b>من:</b>

        <br>

        ${escapeHtml(
          ride.fromPlace
        )}

      </div>


      <div class="ride-line">

        🏁 <b>إلى:</b>

        <br>

        ${escapeHtml(
          ride.toPlace
        )}

      </div>


      <div class="ride-line">

        💰 السعر:

        <b>
          ${Number(
            ride.price || 0
          )}

          جنيه
        </b>

      </div>


      <div class="ride-line">

        👥 عدد الركاب:

        ${Number(
          ride.passengers || 1
        )}

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


      ${
        ride.status ===
        "accepted"

          ? `

            <div class="accepted-contact">

              <strong>
                🟢 تم قبول الرحلة
              </strong>

              <br><br>

              👤 الكابتن:

              ${escapeHtml(
                ride.captainName ||
                "كابتن"
              )}

              <br><br>

              ${
                contact &&
                contact.captainPhone
                  ? `
                    <a
                      href="tel:${escapeHtml(
                        contact.captainPhone
                      )}"
                      class="phone-button"
                    >
                      📞
                      ${escapeHtml(
                        contact.captainPhone
                      )}
                    </a>
                  `
                  : `
                    <span>
                      📞 جاري تجهيز رقم الكابتن
                    </span>
                  `
              }

              <br><br>

              🚗
              ${escapeHtml(
                ride.carType || ""
              )}

              <br>

              🚘
              ${escapeHtml(
                ride.carModel || ""
              )}

              <br>

              🔢
              ${escapeHtml(
                ride.plateNumber || ""
              )}

            </div>

          `

          : `

            <div class="info-box">

              ⏳
              الرحلة ظاهرة للكباتن
              وفي انتظار القبول.

            </div>

          `
      }

    </div>

  `;

}


/* ======================================================
   CAPTAIN RIDES
   ====================================================== */

function loadCaptainRides() {

  if (!currentUser) return;

  if (
    currentRole !== "captain"
  ) return;


  const container =
    $("captainRides");


  if (
    unsubscribeCaptainRides
  ) {

    unsubscribeCaptainRides();

  }


  const q =
    query(
      collection(
        db,
        "rides"
      ),

      where(
        "status",
        "==",
        "open"
      ),

      limit(50)
    );


  unsubscribeCaptainRides =
    onSnapshot(
      q,

      snapshot => {

        const rides =
          snapshot.docs
            .map(
              d => ({
                id: d.id,
                ...d.data()
              })
            )
            .sort(
              (a, b) =>
                timestampMillis(
                  b.createdAt
                ) -
                timestampMillis(
                  a.createdAt
                )
            );


        if (!rides.length) {

          container.innerHTML =
            `
              <div class="info-box">
                🚕 لا توجد رحلات متاحة حاليًا.
              </div>
            `;

          return;

        }


        container.innerHTML =
          rides
            .map(
              renderCaptainRide
            )
            .join("");


        container
          .querySelectorAll(
            ".acceptRideBtn"
          )
          .forEach(
            button => {

              button.onclick =
                () =>
                  acceptRide(
                    button.dataset.id
                  );

            }
          );

      },

      error => {

        console.error(error);

        container.innerHTML =
          `
            <div class="info-box">
              تعذر تحميل الرحلات.
            </div>
          `;

      }
    );

}


/* ======================================================
   CAPTAIN RIDE CARD
   ====================================================== */

function renderCaptainRide(
  ride
) {

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

        📍 <b>مكان العميل:</b>

        <br>

        ${escapeHtml(
          ride.fromPlace
        )}

      </div>


      <div class="ride-line">

        🏁 <b>مكان الوصول:</b>

        <br>

        ${escapeHtml(
          ride.toPlace
        )}

      </div>


      <div class="ride-line">

        💰 السعر:

        <b>
          ${Number(
            ride.price || 0
          )}

          جنيه
        </b>

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

        👥 عدد الركاب:

        ${Number(
          ride.passengers || 1
        )}

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


      <div class="info-box">

        📞 رقم العميل مخفي
        حتى تقبل الرحلة.

      </div>


      <button
        class="btn green acceptRideBtn"
        data-id="${ride.id}"
      >

        ✅ قبول الرحلة

      </button>

    </div>

  `;

}


/* ======================================================
   ACCEPT RIDE
   ====================================================== */

async function acceptRide(
  rideId
) {

  if (!currentUser) return;


  if (
    currentRole !== "captain"
  ) {

    showMessage(
      "الحساب ده مش حساب كابتن.",
      "error"
    );

    return;

  }


  try {

    const rideRef =
      doc(
        db,
        "rides",
        rideId
      );


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


        if (
          !rideSnap.exists()
        ) {

          throw new Error(
            "الرحلة غير موجودة."
          );

        }


        if (
          !captainSnap.exists()
        ) {

          throw new Error(
            "بيانات الكابتن غير موجودة."
          );

        }


        const ride =
          rideSnap.data();


        const captain =
          captainSnap.data();


        if (
          ride.status !==
          "open"
        ) {

          throw new Error(
            "الرحلة اتقبلت بالفعل."
          );

        }


        if (
          captain.role !==
          "captain"
        ) {

          throw new Error(
            "الحساب ده مش كابتن."
          );

        }


        transaction.update(
          rideRef,
          {

            status:
              "accepted",

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
      "تم قبول الرحلة ✅ ورقم العميل أصبح ظاهرًا لك.",
      "success"
    );


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

  if (!currentUser) return;


  const container =
    $("captainHistory");


  if (
    unsubscribeCaptainHistory
  ) {

    unsubscribeCaptainHistory();

  }


  const q =
    query(
      collection(
        db,
        "rides"
      ),

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
            .map(
              d => ({
                id: d.id,
                ...d.data()
              })
            )
            .sort(
              (a, b) =>
                timestampMillis(
                  b.acceptedAt
                ) -
                timestampMillis(
                  a.acceptedAt
                )
            );


        if (!rides.length) {

          container.innerHTML =
            `
              <div class="info-box">
                لسه مفيش رحلات مقبولة.
              </div>
            `;

          return;

        }


        const cards = [];


        for (
          const ride of rides
        ) {

          let phone = "";


          try {

            const snap =
              await getDoc(
                doc(
                  db,
                  "rides",
                  ride.id,
                  "contact",
                  "info"
                )
              );


            if (
              snap.exists()
            ) {

              phone =
                snap.data()
                  .customerPhone || "";

            }

          } catch {}


          cards.push(`

            <div class="card ride-card">

              <div class="ride-header">

                <strong>
                  ✅ رحلة مقبولة
                </strong>

                <span class="pill">
                  ${escapeHtml(
                    statusText(
                      ride.status
                    )
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
                  ride.passengers || 1
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
                  phone
                )}"
              >

                📞

                ${escapeHtml(
                  phone ||
                  "رقم العميل"
                )}

              </a>

            </div>

          `);

        }


        container.innerHTML =
          cards.join("");

      },

      error => {

        console.error(error);

        container.innerHTML =
          `
            <div class="info-box">
              تعذر تحميل الرحلات المقبولة.
            </div>
          `;

      }
    );

}


/* ======================================================
   START
   ====================================================== */

buildApp();
