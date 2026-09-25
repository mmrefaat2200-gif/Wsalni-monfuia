import "./style.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  initializeApp
} from "firebase/app";

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
  apiKey: "AIzaSyAZVXuhTTiGKfDflIZUm_8IgzhRjjWsfIc",
  authDomain: "wasselni-monufia-13f28.firebaseapp.com",
  projectId: "wasselni-monufia-13f28",
  storageBucket: "wasselni-monufia-13f28.firebasestorage.app",
  messagingSenderId: "1007737426615",
  appId: "1:1007737426615:web:76492206c1cd5f3fcef332",
  measurementId: "G-GGBSNFP0MS"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(console.error);


/* ======================================================
   GLOBAL
====================================================== */

let user = null;
let profile = null;

let map = null;
let pickupMarker = null;
let destMarker = null;
let routeLayer = null;
let accuracyCircle = null;

let pickup = null;
let destination = null;

let confirmationResult = null;
let recaptcha = null;

let watchCustomer = null;
let watchRides = null;
let watchCaptainAccepted = null;

let captainTabActive = "rides";


/* ======================================================
   HELPERS
====================================================== */

const $ = (s) => document.querySelector(s);

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[m]
  );

function phone(v) {
  v = String(v || "").trim().replace(/[\s()-]/g, "");

  if (v.startsWith("00")) {
    v = "+" + v.slice(2);
  }

  if (v.startsWith("01")) {
    v = "+20" + v;
  }

  if (v.startsWith("20") && !v.startsWith("+")) {
    v = "+" + v;
  }

  return v;
}

function loginEmail(p) {
  return phone(p).replace(/\D/g, "") + "@phone.wasselni.app";
}

function accountNo() {
  return String(
    Math.floor(10000000 + Math.random() * 90000000)
  );
}

function msg(text, type = "info") {
  const e = $("#message");

  if (!e) return;

  e.textContent = text;
  e.className = `message-box ${type}`;
  e.style.display = "block";

  clearTimeout(window.__msg);

  window.__msg = setTimeout(() => {
    e.style.display = "none";
  }, 4500);
}

function screen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((x) => x.classList.remove("active"));

  const target = $("#" + id);

  if (target) {
    target.classList.add("active");
  }

  const nav = $("#nav");

  if (nav) {
    nav.style.display =
      id === "login" || id === "register"
        ? "none"
        : "flex";
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function statusText(s) {
  return (
    {
      open: "بانتظار كابتن",
      accepted: "تم قبول الرحلة",
      captain_to_customer: "الكابتن في الطريق",
      arrived: "الكابتن وصل",
      started: "الرحلة بدأت",
      completed: "انتهت الرحلة",
      cancelled: "ملغاة"
    }[s] ||
    s ||
    "غير معروف"
  );
}

function dayName(date) {
  if (!date) return "";

  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long"
  }).format(new Date(`${date}T12:00:00`));
}

function formatDate(v) {
  if (!v) return "";

  return new Intl.DateTimeFormat("ar-EG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${v}T12:00:00`));
}


/* ======================================================
   APP HTML
====================================================== */

$("#app").innerHTML = `

<div class="app">

<header class="header">
  <div class="logo">
    🚕 وصلني <span>المنوفية</span>
  </div>

  <button id="profileTop" class="icon-button">
    👤
  </button>
</header>

<div id="message"
     class="message-box"
     style="display:none">
</div>


<!-- ==================================================
     LOGIN
================================================== -->

<section id="login" class="screen active">

  <div class="auth-card">

    <div class="auth-logo">🚕</div>

    <h1>وصلني المنوفية</h1>

    <p class="muted">
      تسجيل الدخول برقم الموبايل وكلمة المرور
    </p>

    <label>📱 رقم الموبايل</label>

    <input
      id="loginPhone"
      type="tel"
      inputmode="tel"
      placeholder="010xxxxxxxx"
    >

    <label>🔐 كلمة المرور</label>

    <input
      id="loginPass"
      type="password"
      placeholder="كلمة المرور"
    >

    <button
      id="loginBtn"
      class="btn primary">
      تسجيل الدخول
    </button>

    <button
      id="registerOpen"
      class="btn outline">
      إنشاء حساب جديد
    </button>

    <div id="loginMsg" class="status"></div>

  </div>

</section>


<!-- ==================================================
     REGISTER
================================================== -->

<section id="register" class="screen">

  <div class="auth-card">

    <button
      id="backLogin"
      class="back-btn">
      ← رجوع
    </button>

    <h2>إنشاء حساب</h2>

    <label>نوع الحساب</label>

    <select id="role">

      <option value="customer">
        👤 عميل
      </option>

      <option value="captain">
        🚗 كابتن
      </option>

    </select>

    <label>الاسم بالكامل</label>

    <input
      id="name"
      placeholder="الاسم"
    >

    <label>📱 رقم الموبايل</label>

    <input
      id="regPhone"
      type="tel"
      inputmode="tel"
      placeholder="010xxxxxxxx"
    >

    <label>🔐 كلمة المرور</label>

    <input
      id="regPass"
      type="password"
      placeholder="6 أحرف أو أرقام على الأقل"
    >

    <label>🔐 تأكيد كلمة المرور</label>

    <input
      id="regPass2"
      type="password"
      placeholder="تأكيد كلمة المرور"
    >


    <!-- بيانات الكابتن -->

    <div
      id="captainFields"
      style="display:none">

      <label>🎂 السن</label>

      <input
        id="age"
        type="number"
        min="18"
        placeholder="السن"
      >

      <label>🚗 نوع العربية</label>

      <input
        id="carType"
        placeholder="سيدان / ميكروباص / نص نقل"
      >

      <label>🚘 موديل العربية</label>

      <input
        id="carModel"
        placeholder="مثال: لانسر 2018"
      >

      <label>🔢 رقم اللوحة</label>

      <input
        id="plate"
        placeholder="رقم اللوحة"
      >

    </div>


    <div id="regRecaptcha"></div>

    <button
      id="sendCode"
      class="btn primary">
      إرسال كود التحقق
    </button>


    <div
      id="codeBox"
      style="display:none">

      <label>🔢 كود التحقق</label>

      <input
        id="code"
        inputmode="numeric"
        placeholder="الكود"
      >

      <button
        id="finishReg"
        class="btn green">
        تأكيد وإنشاء الحساب
      </button>

    </div>

    <div id="regMsg" class="status"></div>

  </div>

</section>


<!-- ==================================================
     CUSTOMER HOME
================================================== -->

<section id="home" class="screen">

  <div class="hero">

    <h2>
      أهلاً بيك 👋
    </h2>

    <p>
      اطلب رحلتك وحدد كل التفاصيل.
    </p>

  </div>


  <div class="card">

    <label>
      📍 الانطلاق
    </label>

    <button
      id="myLocation"
      class="btn outline">
      🎯 تحديد موقعي بدقة
    </button>

    <div
      id="pickupText"
      class="status">
      لم يتم تحديد موقعك
    </div>

  </div>


  <div class="card">

    <label>
      🏁 الوصول
    </label>

    <button
      id="chooseDest"
      class="btn outline">
      🗺️ تحديد مكان النزول على الخريطة
    </button>

    <div
      id="destText"
      class="status">
      لم يتم تحديد مكان الوصول
    </div>

  </div>


  <div class="card">

    <label>📅 يوم الرحلة</label>

    <input
      id="rideDate"
      type="date"
    >

    <div
      id="dayPreview"
      class="status">
    </div>


    <label>🕐 وقت الرحلة</label>

    <input
      id="rideTime"
      type="time"
    >


    <label>👥 عدد الركاب</label>

    <select id="passengers">

      ${Array.from(
        { length: 8 },
        (_, i) =>
          `<option value="${i + 1}">
             ${i + 1}
           </option>`
      ).join("")}

    </select>


    <label>💰 السعر المقترح</label>

    <input
      id="price"
      type="number"
      min="1"
      placeholder="مثال 150"
    >


    <label>
      📝 الرسالة / الملاحظات
    </label>

    <textarea
      id="notes"
      rows="3"
      placeholder="شنطة كبيرة، طفل، شارع ضيق، أي ملاحظة للكابتن..."
    ></textarea>


    <button
      id="request"
      class="btn primary">
      🚕 نشر الرحلة للكباتن
    </button>

  </div>

</section>


<!-- ==================================================
     MAP
================================================== -->

<section id="mapScreen" class="screen">

  <div class="card">

    <div class="map-head">

      <div>
        <h2>🗺️ تحديد المكان</h2>

        <small>
          حرّك الخريطة حتى الدبوس فوق المكان المطلوب.
        </small>
      </div>

      <button
        id="closeMap"
        class="btn danger small-btn">
        إلغاء
      </button>

    </div>


    <input
      id="search"
      placeholder="🔎 ابحث عن شارع، قرية، منزل أو مكان"
    >

    <div
      id="results"
      class="search-results">
    </div>

  </div>


  <div class="map-wrapper">

    <div id="map"></div>

    <div class="map-center-pin">
      📍
    </div>

    <button
      id="mapLocation"
      class="map-control">
      🎯
    </button>

  </div>


  <div class="card">

    <div
      id="address"
      class="status">
      حدد المكان.
    </div>

    <div
      id="coords"
      class="coords">
    </div>

    <button
      id="confirmDest"
      class="btn primary">
      ✅ تأكيد المكان
    </button>

  </div>

</section>


<!-- ==================================================
     CUSTOMER RIDES
================================================== -->

<section id="rides" class="screen">

  <div class="hero">

    <h2>📋 رحلاتي</h2>

    <p>
      تابع الرحلة من النشر حتى الانتهاء.
    </p>

  </div>

  <div id="ridesList"></div>

</section>


<!-- ==================================================
     CAPTAIN DASHBOARD
================================================== -->

<section id="captain" class="screen">

  <div class="hero">

    <h2>
      🚗 لوحة الكابتن
    </h2>

    <p>
      كل أدوات الكابتن في مكان واحد.
    </p>

  </div>


  <!-- حالة الكابتن -->

  <div class="card captain-status-card">

    <div class="captain-status-title">
      <b>حالة استقبال الرحلات</b>
    </div>

    <div class="captain-toggle">

      <button
        id="captainAvailable"
        class="btn green">
        🟢 متاح
      </button>

      <button
        id="captainUnavailable"
        class="btn outline">
        ⚫ غير متاح
      </button>

    </div>

    <div
      id="captainState"
      class="status">
    </div>

  </div>


  <!-- تبويبات الكابتن -->

  <div class="captain-tabs">

    <button
      id="captainTabRides"
      class="captain-tab active">
      🚕
      <span>منصة الرحلات</span>
    </button>

    <button
      id="captainTabData"
      class="captain-tab">
      👤
      <span>بياناتي</span>
    </button>

    <button
      id="captainTabRating"
      class="captain-tab">
      ⭐
      <span>تقييمي</span>
    </button>

  </div>


  <!-- ================================================
       TAB 1 - RIDES PLATFORM
  ================================================= -->

  <div
    id="captainRidesTab"
    class="captain-tab-content">

    <div class="card">

      <h3>
        📡 منصة الرحلات المباشرة
      </h3>

      <p class="muted">
        الرحلات الجديدة تظهر هنا تلقائيًا من Firebase.
      </p>

      <div
        id="liveIndicator"
        class="live-indicator">
        🟢 متصل بالمنصة
      </div>

    </div>


    <h3>
      🆕 الرحلات الجديدة
    </h3>

    <div id="captainList"></div>


    <h3>
      🚕 رحلات قبلتها
    </h3>

    <div id="captainAcceptedList"></div>

  </div>


  <!-- ================================================
       TAB 2 - CAPTAIN DATA
  ================================================= -->

  <div
    id="captainDataTab"
    class="captain-tab-content"
    style="display:none">

    <div class="card">

      <div class="avatar">
        🚗
      </div>

      <h2>
        بيانات الكابتن
      </h2>


      <label>
        👤 الاسم
      </label>

      <input
        id="captainDataName"
        placeholder="الاسم"
      >


      <label>
        📱 رقم الهاتف
      </label>

      <input
        id="captainDataPhone"
        readonly
      >


      <label>
        🎂 السن
      </label>

      <input
        id="captainDataAge"
        type="number"
      >


      <label>
        🚗 نوع العربية
      </label>

      <input
        id="captainDataCarType"
      >


      <label>
        🚘 موديل العربية
      </label>

      <input
        id="captainDataCarModel"
      >


      <label>
        🔢 رقم اللوحة
      </label>

      <input
        id="captainDataPlate"
      >


      <button
        id="saveCaptainData"
        class="btn primary">
        💾 حفظ البيانات
      </button>

    </div>

  </div>


  <!-- ================================================
       TAB 3 - RATING
  ================================================= -->

  <div
    id="captainRatingTab"
    class="captain-tab-content"
    style="display:none">

    <div class="card rating-main">

      <div class="big-rating">
        ⭐
      </div>

      <h1 id="captainRatingValue">
        0.0
      </h1>

      <div class="muted">
        متوسط تقييمك
      </div>

      <hr>

      <h3>
        عدد التقييمات
      </h3>

      <div
        id="captainRatingCount"
        class="big-number">
        0
      </div>

    </div>


    <div class="card">

      <h3>
        💡 حافظ على تقييمك
      </h3>

      <p>
        تعامل باحترام مع العميل،
        والتزم بموعد الرحلة،
        وحافظ على نظافة السيارة.
      </p>

    </div>

  </div>

</section>


<!-- ==================================================
     PROFILE
================================================== -->

<section id="profile" class="screen">

  <div class="card">

    <div class="avatar">
      👤
    </div>

    <h2>
      حسابي
    </h2>

    <div id="profileInfo"></div>

    <button
      id="logout"
      class="btn danger">
      تسجيل الخروج
    </button>

  </div>

</section>


<!-- ==================================================
     NAV
================================================== -->

<nav id="nav" class="nav">

  <button id="navHome">
    🏠
    <br>
    الرئيسية
  </button>

  <button id="navRides">
    📋
    <br>
    رحلاتي
  </button>

  <button id="navCaptain">
    🚗
    <br>
    الكابتن
  </button>

  <button id="navProfile">
    👤
    <br>
    حسابي
  </button>

</nav>

</div>
`;


/* ======================================================
   LOCATION
====================================================== */

async function exactLocation() {

  const p =
    await Geolocation.checkPermissions();

  if (p.location !== "granted") {

    const r =
      await Geolocation.requestPermissions();

    if (r.location !== "granted") {
      throw Error("LOCATION_DENIED");
    }
  }

  const x =
    await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    });

  return {
    lat: x.coords.latitude,
    lng: x.coords.longitude,
    accuracy: x.coords.accuracy
  };
}


async function reverse(lat, lng) {

  try {

    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ar`
    );

    const d = await r.json();

    return (
      d.display_name ||
      `موقع ${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );

  } catch {

    return `موقع ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  }
}


/* ======================================================
   MAP
====================================================== */

function marker(type, p) {

  const icon = L.divIcon({
    className: "custom-marker",

    html: `
      <div class="${type}-marker">
        ${type === "pickup" ? "🚕" : "📍"}
      </div>
    `,

    iconSize: [48, 48],
    iconAnchor: [24, 42]
  });

  return L.marker(
    [p.lat, p.lng],
    { icon }
  ).addTo(map);
}


async function centerChanged() {

  if (!map) return;

  const c = map.getCenter();

  destination = {
    lat: c.lat,
    lng: c.lng
  };

  if (destMarker) {

    destMarker.setLatLng([
      c.lat,
      c.lng
    ]);

  } else {

    destMarker =
      marker("destination", destination);

  }

  $("#coords").textContent =
    `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;

  $("#address").textContent =
    "جاري تحديد العنوان...";

  const address =
    await reverse(c.lat, c.lng);

  $("#address").innerHTML =
    `🏁 <strong>${esc(address)}</strong>`;

  drawRoute();
}


function initMap() {

  if (map) {

    setTimeout(
      () => map.invalidateSize(),
      200
    );

    return;
  }

  map = L.map("map", {
    zoomControl: false
  }).setView(
    pickup
      ? [pickup.lat, pickup.lng]
      : [30.5526, 31.0106],
    pickup ? 18 : 13
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
      attribution:
        "© OpenStreetMap contributors"
    }
  ).addTo(map);

  L.control
    .zoom({
      position: "bottomright"
    })
    .addTo(map);

  map.on(
    "moveend",
    centerChanged
  );

  if (pickup) {
    pickupMarker =
      marker("pickup", pickup);
  }

  if (destination) {

    destMarker =
      marker(
        "destination",
        destination
      );

    map.setView(
      [
        destination.lat,
        destination.lng
      ],
      19
    );
  }
}


async function setPickup() {

  try {

    const p =
      await exactLocation();

    pickup = {
      lat: p.lat,
      lng: p.lng
    };

    if (pickupMarker) {

      pickupMarker.setLatLng([
        p.lat,
        p.lng
      ]);

    } else if (map) {

      pickupMarker =
        marker("pickup", pickup);

    }

    if (accuracyCircle && map) {
      accuracyCircle.remove();
    }

    if (map) {

      accuracyCircle =
        L.circle(
          [p.lat, p.lng],
          {
            radius: Math.max(
              10,
              p.accuracy
            ),
            weight: 2,
            fillOpacity: 0.08
          }
        ).addTo(map);

    }

    const a =
      await reverse(
        p.lat,
        p.lng
      );

    $("#pickupText").innerHTML =
      `📍 <strong>${esc(a)}</strong>
       <br>
       <small>
       دقة GPS تقريباً
       ${Math.round(p.accuracy)}
       متر
       </small>`;

    if (map) {

      map.setView(
        [p.lat, p.lng],
        19
      );

    }

    msg(
      "تم تحديد موقعك بدقة 📍",
      "success"
    );

  } catch (e) {

    console.error(e);

    msg(
      "اسمح للتطبيق بالموقع وشغّل GPS ثم حاول مرة أخرى.",
      "error"
    );
  }
}


async function drawRoute() {

  if (
    !pickup ||
    !destination ||
    !map
  ) return;

  try {

    const u =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${pickup.lng},${pickup.lat};` +
      `${destination.lng},${destination.lat}` +
      `?overview=full&geometries=geojson`;

    const d =
      await (
        await fetch(u)
      ).json();

    if (!d.routes?.length) {
      return;
    }

    if (routeLayer) {
      routeLayer.remove();
    }

    routeLayer =
      L.geoJSON(
        d.routes[0].geometry,
        {
          style: {
            weight: 6,
            opacity: 0.85
          }
        }
      ).addTo(map);

  } catch (e) {

    console.error(e);

  }
}


async function searchPlaces(q) {

  const box =
    $("#results");

  if (q.length < 3) {

    box.innerHTML = "";

    return;
  }

  box.innerHTML =
    "<div class='status'>🔎 جاري البحث...</div>";

  try {

    const u =
      `https://nominatim.openstreetmap.org/search?` +
      `format=jsonv2` +
      `&q=${encodeURIComponent(q + ", Egypt")}` +
      `&limit=8` +
      `&addressdetails=1` +
      `&accept-language=ar` +
      `&countrycodes=eg`;

    const d =
      await (
        await fetch(u)
      ).json();

    box.innerHTML =
      d.length
        ? d
            .map(
              (x) => `
                <button
                  class="search-result"
                  data-lat="${x.lat}"
                  data-lon="${x.lon}"
                  data-name="${esc(x.display_name)}">

                  📍 ${esc(x.display_name)}

                </button>
              `
            )
            .join("")

        : "<div class='status'>لا توجد نتائج.</div>";

    box
      .querySelectorAll(".search-result")
      .forEach((b) => {

        b.onclick = () => {

          destination = {
            lat: Number(b.dataset.lat),
            lng: Number(b.dataset.lon)
          };

          map.setView(
            [
              destination.lat,
              destination.lng
            ],
            19
          );

          $("#search").value =
            b.dataset.name;

          box.innerHTML = "";
        };

      });

  } catch {

    box.innerHTML =
      "<div class='status'>تعذر البحث.</div>";
  }
}


/* ======================================================
   MAP EVENTS
====================================================== */

$("#myLocation").onclick =
  async () => {

    await setPickup();

  };


$("#mapLocation").onclick =
  setPickup;


$("#chooseDest").onclick =
  () => {

    screen("mapScreen");

    setTimeout(() => {

      initMap();

      map.invalidateSize();

    }, 150);
  };


$("#closeMap").onclick =
  () => screen("home");


$("#confirmDest").onclick =
  async () => {

    if (!destination) {

      msg(
        "حدد مكان الوصول أولاً",
        "error"
      );

      return;
    }

    const address =
      await reverse(
        destination.lat,
        destination.lng
      );

    $("#destText").innerHTML =
      `🏁 <strong>${esc(address)}</strong>`;

    screen("home");

    msg(
      "تم تحديد مكان الوصول بدقة ✅",
      "success"
    );
  };


let searchTimer;

$("#search").oninput =
  () => {

    clearTimeout(searchTimer);

    searchTimer =
      setTimeout(
        () =>
          searchPlaces(
            $("#search").value.trim()
          ),
        650
      );

  };


$("#rideDate").onchange =
  () => {

    const d =
      dayName(
        $("#rideDate").value
      );

    $("#dayPreview").textContent =
      d ? `📆 ${d}` : "";

  };


/* ======================================================
   CREATE CUSTOMER RIDE
====================================================== */

$("#request").onclick =
  async () => {

    if (!user) {

      screen("login");

      return;
    }

    if (profile?.role !== "customer") {

      msg(
        "حساب الكابتن لا يطلب رحلة.",
        "error"
      );

      return;
    }

    if (!pickup || !destination) {

      msg(
        "حدد الانطلاق والوصول أولاً.",
        "error"
      );

      return;
    }

    const price =
      Number($("#price").value);

    const date =
      $("#rideDate").value;

    const time =
      $("#rideTime").value;

    const passengers =
      Number($("#passengers").value);

    if (
      !price ||
      !date ||
      !time
    ) {

      msg(
        "اكتب السعر والتاريخ والوقت.",
        "error"
      );

      return;
    }

    try {

      const fromPlace =
        await reverse(
          pickup.lat,
          pickup.lng
        );

      const toPlace =
        await reverse(
          destination.lat,
          destination.lng
        );

      const ride = {

        customerId: user.uid,

        customerName:
          profile.name || "",

        /*
          رقم العميل لا يتم نشره في
          الرحلة المفتوحة.
        */

        fromPlace,

        toPlace,

        pickupCoords:
          pickup,

        destinationCoords:
          destination,

        price,

        passengers,

        notes:
          $("#notes").value.trim(),

        rideDate: date,

        rideTime: time,

        dayName:
          dayName(date),

        status: "open",

        captainId: "",

        createdAt:
          serverTimestamp()

      };

      const r =
        await addDoc(
          collection(db, "rides"),
          ride
        );

      localStorage.setItem(
        "lastRide",
        r.id
      );

      $("#price").value = "";
      $("#notes").value = "";

      msg(
        "تم نشر الرحلة للكباتن 🚕",
        "success"
      );

      screen("rides");

      loadCustomerRides();

    } catch (e) {

      console.error(e);

      msg(
        e.message ||
        "تعذر إرسال الرحلة.",
        "error"
      );
    }
  };


/* ======================================================
   REGISTER
====================================================== */

$("#role").onchange =
  () => {

    $("#captainFields").style.display =
      $("#role").value === "captain"
        ? "block"
        : "none";

  };


$("#registerOpen").onclick =
  () => {

    screen("register");

    if (!recaptcha) {

      recaptcha =
        new RecaptchaVerifier(
          auth,
          "regRecaptcha",
          {
            size: "normal"
          }
        );

      recaptcha
        .render()
        .catch(console.error);

    }

  };


$("#backLogin").onclick =
  () => screen("login");


$("#sendCode").onclick =
  async () => {

    const p =
      phone($("#regPhone").value);

    const pass =
      $("#regPass").value;

    const name =
      $("#name").value.trim();

    if (
      !name ||
      !/^\+20\d{10}$/.test(p) ||
      pass.length < 6 ||
      pass !== $("#regPass2").value
    ) {

      $("#regMsg").textContent =
        "راجع الاسم ورقم الموبايل وكلمة المرور.";

      return;
    }


    if (
      $("#role").value === "captain" &&
      (
        !$("#age").value ||
        Number($("#age").value) < 18 ||
        !$("#carType").value.trim() ||
        !$("#carModel").value.trim() ||
        !$("#plate").value.trim()
      )
    ) {

      $("#regMsg").textContent =
        "أكمل بيانات الكابتن.";

      return;
    }


    try {

      $("#sendCode").disabled = true;

      if (!recaptcha) {

        recaptcha =
          new RecaptchaVerifier(
            auth,
            "regRecaptcha",
            {
              size: "normal"
            }
          );

        await recaptcha.render();

      }

      confirmationResult =
        await signInWithPhoneNumber(
          auth,
          p,
          recaptcha
        );

      $("#codeBox").style.display =
        "block";

      $("#regMsg").textContent =
        "تم إرسال الكود.";

    } catch (e) {

      console.error(e);

      $("#regMsg").textContent =
        e.message ||
        "تعذر إرسال الكود.";

      $("#sendCode").disabled = false;

    }

  };


/* ======================================================
   FINISH REGISTER
====================================================== */

$("#finishReg").onclick =
  async () => {

    try {

      if (!confirmationResult) {

        throw Error(
          "اطلب كود التحقق أولاً"
        );

      }

      const p =
        phone(
          $("#regPhone").value
        );

      const password =
        $("#regPass").value;

      const cred =
        await confirmationResult.confirm(
          $("#code").value.trim()
        );

      const u =
        cred.user;


      /*
        ربط كلمة المرور بحساب الهاتف.
      */

      try {

        await linkWithCredential(
          u,
          EmailAuthProvider.credential(
            loginEmail(p),
            password
          )
        );

      } catch (e) {

        /*
          لو الرابط موجود بالفعل
          نكمل عادي.
        */

        if (
          e.code !==
          "auth/provider-already-linked"
        ) {

          if (
            e.code ===
            "auth/email-already-in-use"
          ) {

            $("#regMsg").textContent =
              "الرقم ده مرتبط بحساب قديم في Firebase. لو ده حساب اختبار، احذف المستخدم القديم من Authentication > Users ثم جرّب مرة أخرى.";

            return;
          }

          throw e;
        }

      }


      const role =
        $("#role").value;


      const data = {

        uid: u.uid,

        name:
          $("#name").value.trim(),

        phone: p,

        role,

        accountNumber:
          accountNo(),

        createdAt:
          serverTimestamp(),

        rating: 0,

        ratingCount: 0

      };


      if (role === "captain") {

        data.age =
          Number($("#age").value);

        data.carType =
          $("#carType").value.trim();

        data.carModel =
          $("#carModel").value.trim();

        data.plateNumber =
          $("#plate").value.trim();

        data.captainStatus =
          "available";

      }


      await setDoc(
        doc(db, "users", u.uid),
        data,
        { merge: true }
      );


      user = u;

      profile = data;


      $("#sendCode").disabled =
        false;


      msg(
        "تم إنشاء الحساب وتسجيل الدخول ✅",
        "success"
      );


      /*
        التوجيه حسب نوع الحساب
      */

      if (role === "captain") {

        screen("captain");

        captainTab(
          "rides"
        );

        loadCaptain();

      } else {

        screen("home");

        loadCustomerRides();

      }

    } catch (e) {

      console.error(e);

      $("#regMsg").textContent =
        e.message ||
        "تعذر إنشاء الحساب.";

    }

  };


/* ======================================================
   LOGIN
====================================================== */

$("#loginBtn").onclick =
  async () => {

    const p =
      phone(
        $("#loginPhone").value
      );

    const pass =
      $("#loginPass").value;

    if (
      !/^\+20\d{10}$/.test(p) ||
      !pass
    ) {

      $("#loginMsg").textContent =
        "اكتب رقم موبايل مصري صحيح وكلمة المرور.";

      return;
    }


    try {

      await signInWithEmailAndPassword(
        auth,
        loginEmail(p),
        pass
      );

    } catch (e) {

      console.error(e);

      $("#loginMsg").textContent =
        "رقم الموبايل أو كلمة المرور غير صحيحة.";

    }

  };


/* ======================================================
   LOAD PROFILE
====================================================== */

async function loadProfile() {

  if (!user) return;

  const s =
    await getDoc(
      doc(db, "users", user.uid)
    );

  if (s.exists()) {

    profile =
      s.data();

  }

  if (!profile) return;


  $("#profileInfo").innerHTML = `

    <div class="profile-row">
      <span>👤 الاسم</span>
      <strong>
        ${esc(profile.name)}
      </strong>
    </div>

    <div class="profile-row">
      <span>📱 الموبايل</span>
      <strong>
        ${esc(profile.phone)}
      </strong>
    </div>

    <div class="profile-row">
      <span>🔢 رقم الحساب</span>
      <strong>
        ${esc(profile.accountNumber)}
      </strong>
    </div>

    <div class="profile-row">
      <span>النوع</span>
      <strong>
        ${
          profile.role === "captain"
            ? "🚗 كابتن"
            : "👤 عميل"
        }
      </strong>
    </div>

    ${
      profile.role === "captain"
        ? `

          <div class="profile-row">
            <span>🚘 العربية</span>
            <strong>
              ${esc(profile.carType)}
              ${esc(profile.carModel)}
            </strong>
          </div>

          <div class="profile-row">
            <span>🔢 اللوحة</span>
            <strong>
              ${esc(profile.plateNumber)}
            </strong>
          </div>

          <div class="profile-row">
            <span>⭐ التقييم</span>
            <strong>
              ${Number(
                profile.rating || 0
              ).toFixed(1)}
              (
              ${profile.ratingCount || 0}
              )
            </strong>
          </div>

        `
        : ""
    }

  `;


  if (
    profile.role === "captain"
  ) {

    $("#captainDataName").value =
      profile.name || "";

    $("#captainDataPhone").value =
      profile.phone ||
      user.phoneNumber ||
      "";

    $("#captainDataAge").value =
      profile.age || "";

    $("#captainDataCarType").value =
      profile.carType || "";

    $("#captainDataCarModel").value =
      profile.carModel || "";

    $("#captainDataPlate").value =
      profile.plateNumber || "";

    updateCaptainRating();

  }

}


/* ======================================================
   CUSTOMER RIDES
====================================================== */

function customerCard(r) {

  let contact = "";

  /*
    رقم الكابتن يظهر بعد قبول الرحلة فقط.
  */

  if (
    [
      "accepted",
      "captain_to_customer",
      "arrived",
      "started",
      "completed"
    ].includes(r.status)
  ) {

    if (r.captainPhone) {

      contact = `
        <div class="contact-box">

          📞

          <a
            href="tel:${esc(
              r.captainPhone
            )}">
            ${esc(
              r.captainPhone
            )}
          </a>

          —
          ${esc(
            r.captainName ||
            "الكابتن"
          )}

        </div>
      `;

    }

  }


  return `

    <div class="card">

      <div class="ride-status">
        ${statusText(r.status)}
      </div>

      <b>
        📍 ${esc(r.fromPlace)}
      </b>

      <br>

      🏁
      ${esc(r.toPlace)}

      <p>
        💰 ${r.price} جنيه
        •
        👥 ${r.passengers}
      </p>

      <p>
        📅 ${formatDate(r.rideDate)}
        •
        ${esc(r.dayName)}
        •
        🕐 ${esc(r.rideTime)}
      </p>

      ${
        r.notes
          ? `<p>📝 ${esc(r.notes)}</p>`
          : ""
      }

      ${contact}

      ${
        r.status === "started"
          ? `
            <button
              class="btn green"
              data-complete-customer="${r.id}">
              ✅ انتهت الرحلة
            </button>
          `
          : ""
      }

    </div>

  `;
}


async function loadCustomerRides() {

  if (
    !user ||
    profile?.role !== "customer"
  ) return;


  if (watchCustomer) {
    watchCustomer();
  }


  const q =
    query(
      collection(db, "rides"),
      where(
        "customerId",
        "==",
        user.uid
      ),
      limit(50)
    );


  watchCustomer =
    onSnapshot(
      q,
      (s) => {

        const rides =
          s.docs
            .map(
              (x) => ({
                id: x.id,
                ...x.data()
              })
            )
            .sort(
              (a, b) =>
                (
                  b.createdAt?.seconds ||
                  0
                ) -
                (
                  a.createdAt?.seconds ||
                  0
                )
            );


        $("#ridesList").innerHTML =
          rides.length
            ? rides
                .map(customerCard)
                .join("")
            : `
              <div class="card">
                لا توجد رحلات حتى الآن.
              </div>
            `;


        document
          .querySelectorAll(
            "[data-complete-customer]"
          )
          .forEach((b) => {

            b.onclick =
              async () => {

                try {

                  await updateDoc(
                    doc(
                      db,
                      "rides",
                      b.dataset
                        .completeCustomer
                    ),
                    {
                      status:
                        "completed",

                      completedAt:
                        serverTimestamp()
                    }
                  );

                } catch (e) {

                  console.error(e);

                  msg(
                    "تعذر إنهاء الرحلة.",
                    "error"
                  );

                }

              };

          });

      }
    );

}


/* ======================================================
   CAPTAIN TABS
====================================================== */

function captainTab(tab) {

  captainTabActive = tab;


  document
    .querySelectorAll(
      ".captain-tab"
    )
    .forEach(
      (b) =>
        b.classList.remove(
          "active"
        )
    );


  const ridesButton =
    $("#captainTabRides");

  const dataButton =
    $("#captainTabData");

  const ratingButton =
    $("#captainTabRating");


  if (tab === "rides") {

    ridesButton?.classList.add(
      "active"
    );

    $("#captainRidesTab").style.display =
      "block";

    $("#captainDataTab").style.display =
      "none";

    $("#captainRatingTab").style.display =
      "none";

    loadCaptain();

  }


  if (tab === "data") {

    dataButton?.classList.add(
      "active"
    );

    $("#captainRidesTab").style.display =
      "none";

    $("#captainDataTab").style.display =
      "block";

    $("#captainRatingTab").style.display =
      "none";

    loadCaptainData();

  }


  if (tab === "rating") {

    ratingButton?.classList.add(
      "active"
    );

    $("#captainRidesTab").style.display =
      "none";

    $("#captainDataTab").style.display =
      "none";

    $("#captainRatingTab").style.display =
      "block";

    updateCaptainRating();

  }

}


$("#captainTabRides").onclick =
  () => captainTab("rides");

$("#captainTabData").onclick =
  () => captainTab("data");

$("#captainTabRating").onclick =
  () => captainTab("rating");


/* ======================================================
   CAPTAIN DATA
====================================================== */

function loadCaptainData() {

  if (
    !profile ||
    profile.role !== "captain"
  ) return;


  $("#captainDataName").value =
    profile.name || "";

  $("#captainDataPhone").value =
    profile.phone ||
    user?.phoneNumber ||
    "";

  $("#captainDataAge").value =
    profile.age || "";

  $("#captainDataCarType").value =
    profile.carType || "";

  $("#captainDataCarModel").value =
    profile.carModel || "";

  $("#captainDataPlate").value =
    profile.plateNumber || "";

}


$("#saveCaptainData").onclick =
  async () => {

    if (
      !user ||
      profile?.role !== "captain"
    ) return;


    const name =
      $("#captainDataName")
        .value
        .trim();

    const age =
      Number(
        $("#captainDataAge").value
      );

    const carType =
      $("#captainDataCarType")
        .value
        .trim();

    const carModel =
      $("#captainDataCarModel")
        .value
        .trim();

    const plate =
      $("#captainDataPlate")
        .value
        .trim();


    if (
      !name ||
      !age ||
      !carType ||
      !carModel ||
      !plate
    ) {

      msg(
        "أكمل كل بيانات الكابتن.",
        "error"
      );

      return;
    }


    try {

      await updateDoc(
        doc(
          db,
          "users",
          user.uid
        ),
        {

          name,

          age,

          carType,

          carModel,

          plateNumber:
            plate,

          updatedAt:
            serverTimestamp()

        }
      );


      profile.name = name;
      profile.age = age;
      profile.carType = carType;
      profile.carModel = carModel;
      profile.plateNumber = plate;


      await loadProfile();


      msg(
        "تم حفظ بيانات الكابتن ✅",
        "success"
      );

    } catch (e) {

      console.error(e);

      msg(
        "تعذر حفظ البيانات.",
        "error"
      );

    }

  };


/* ======================================================
   CAPTAIN RATING
====================================================== */

function updateCaptainRating() {

  const rating =
    Number(
      profile?.rating || 0
    );

  const count =
    Number(
      profile?.ratingCount || 0
    );


  $("#captainRatingValue")
    .textContent =
      rating.toFixed(1);


  $("#captainRatingCount")
    .textContent =
      count;

}


/* ======================================================
   CAPTAIN PLATFORM
====================================================== */

async function loadCaptain() {

  if (
    profile?.role !== "captain"
  ) {

    $("#captainList").innerHTML = `
      <div class="card">
        هذه الصفحة للكابتن فقط.
      </div>
    `;

    return;
  }


  const available =
    profile.captainStatus ===
    "available";


  $("#captainState").innerHTML =
    available
      ? "🟢 أنت متاح لاستقبال الرحلات"
      : "⚫ أنت غير متاح حاليًا";


  if (!available) {

    $("#liveIndicator").innerHTML =
      "⚫ أنت غير متاح — فعّل «متاح» لرؤية الرحلات الجديدة.";

  } else {

    $("#liveIndicator").innerHTML =
      "🟢 متصل بالمنصة — الرحلات تظهر تلقائيًا";

  }


  /*
    مهم جدًا:

    onSnapshot معناها أن الكابتن لا يحتاج
    يعمل Refresh.

    بمجرد أن العميل يعمل addDoc للرحلة،
    Firebase يرسل التغيير للمستمع هنا.
  */


  if (watchRides) {
    watchRides();
  }


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


  watchRides =
    onSnapshot(
      q,
      (s) => {

        const rides =
          s.docs
            .map(
              (d) => ({
                id: d.id,
                ...d.data()
              })
            )
            .sort(
              (a, b) =>
                (
                  b.createdAt?.seconds ||
                  0
                ) -
                (
                  a.createdAt?.seconds ||
                  0
                )
            );


        if (
          !available
        ) {

          $("#captainList").innerHTML = `
            <div class="card">
              ⚫ أنت غير متاح حاليًا.
              <br><br>
              اضغط «متاح» لاستقبال الرحلات الجديدة.
            </div>
          `;

        } else if (!rides.length) {

          $("#captainList").innerHTML = `
            <div class="card">
              لا توجد رحلات مفتوحة الآن.
              <br><br>
              <span class="muted">
                المنصة تعمل Online وتنتظر رحلات جديدة...
              </span>
            </div>
          `;

        } else {

          $("#captainList").innerHTML =
            rides
              .map(
                (r) => `

                  <div class="card">

                    <div class="ride-status">
                      🆕 رحلة جديدة
                    </div>

                    <b>
                      📍 ${esc(r.fromPlace)}
                    </b>

                    <br>

                    🏁
                    ${esc(r.toPlace)}

                    <p>
                      💰
                      <strong>
                        ${r.price}
                        جنيه
                      </strong>

                      • 👥
                      ${r.passengers}
                    </p>

                    <p>
                      📅
                      ${formatDate(r.rideDate)}

                      •
                      ${esc(r.dayName)}

                      •
                      🕐
                      ${esc(r.rideTime)}
                    </p>

                    ${
                      r.notes
                        ? `
                          <p>
                            📝
                            ${esc(r.notes)}
                          </p>
                        `
                        : ""
                    }

                    <div class="row">

                      <button
                        class="btn outline"
                        data-show-ride-map="${r.id}">
                        🗺️ عرض المسار
                      </button>

                      <button
                        class="btn green"
                        data-accept="${r.id}">
                        ✅ قبول الرحلة
                      </button>

                    </div>

                  </div>

                `
              )
              .join("");

        }


        /*
          أزرار قبول الرحلة
        */

        document
          .querySelectorAll(
            "[data-accept]"
          )
          .forEach(
            (b) => {

              b.onclick =
                () =>
                  acceptRide(
                    b.dataset.accept
                  );

            }
          );


        /*
          زر عرض المسار
        */

        document
          .querySelectorAll(
            "[data-show-ride-map]"
          )
          .forEach(
            (b) => {

              b.onclick =
                () =>
                  openCaptainRideMap(
                    b.dataset
                      .showRideMap
                  );

            }
          );

      },
      (error) => {

        console.error(
          "Captain rides listener:",
          error
        );

        $("#captainList").innerHTML = `
          <div class="card">
            حصل خطأ في تحميل الرحلات.
            <br>
            ${esc(error.message)}
          </div>
        `;

      }
    );


  /*
    رحلات الكابتن التي قبلها
  */

  if (watchCaptainAccepted) {
    watchCaptainAccepted();
  }


  const acceptedQuery =
    query(
      collection(db, "rides"),
      where(
        "captainId",
        "==",
        user.uid
      ),
      limit(50)
    );


  watchCaptainAccepted =
    onSnapshot(
      acceptedQuery,
      (s) => {

        const rides =
          s.docs
            .map(
              (d) => ({
                id: d.id,
                ...d.data()
              })
            )
            .sort(
              (a, b) =>
                (
                  b.updatedAt?.seconds ||
                  b.createdAt?.seconds ||
                  0
                ) -
                (
                  a.updatedAt?.seconds ||
                  a.createdAt?.seconds ||
                  0
                )
            );


        if (!rides.length) {

          $("#captainAcceptedList").innerHTML = `
            <div class="card">
              لا توجد رحلات قبلتها حتى الآن.
            </div>
          `;

          return;
        }


        $("#captainAcceptedList").innerHTML =
          rides
            .map(
              (r) => `

                <div class="card">

                  <div class="ride-status">
                    ${statusText(r.status)}
                  </div>

                  <b>
                    📍
                    ${esc(r.fromPlace)}
                  </b>

                  <br>

                  🏁
                  ${esc(r.toPlace)}

                  <p>
                    💰
                    ${r.price}
                    جنيه

                    • 👥
                    ${r.passengers}
                  </p>

                  <p>
                    📅
                    ${formatDate(r.rideDate)}

                    •
                    ${esc(r.dayName)}

                    •
                    🕐
                    ${esc(r.rideTime)}
                  </p>

                  ${
                    r.notes
                      ? `
                        <p>
                          📝
                          ${esc(r.notes)}
                        </p>
                      `
                      : ""
                  }


                  ${
                    r.customerPhone
                      ? `
                        <div class="contact-box">

                          📞

                          <a
                            href="tel:${esc(
                              r.customerPhone
                            )}">

                            ${esc(
                              r.customerPhone
                            )}

                          </a>

                          —
                          ${esc(
                            r.customerName ||
                            "العميل"
                          )}

                        </div>
                      `
                      : ""
                  }


                  <div class="row">

                    <button
                      class="btn outline"
                      data-show-accepted-map="${r.id}">
                      🗺️ الخريطة
                    </button>


                    ${
                      r.status === "accepted"
                        ? `
                          <button
                            class="btn primary"
                            data-customer-route="${r.id}">
                            🚗 أنا في الطريق
                          </button>
                        `
                        : ""
                    }


                    ${
                      r.status ===
                      "captain_to_customer"
                        ? `
                          <button
                            class="btn green"
                            data-arrived="${r.id}">
                            📍 وصلت للعميل
                          </button>
                        `
                        : ""
                    }


                    ${
                      r.status === "arrived"
                        ? `
                          <button
                            class="btn primary"
                            data-start="${r.id}">
                            ▶️ بدء الرحلة
                          </button>
                        `
                        : ""
                    }


                    ${
                      r.status === "started"
                        ? `
                          <button
                            class="btn green"
                            data-complete="${r.id}">
                            🏁 إنهاء الرحلة
                          </button>
                        `
                        : ""
                    }

                  </div>

                </div>

              `
            )
            .join("");


        bindCaptainActions();

      }
    );

}


/* ======================================================
   CAPTAIN MAP
====================================================== */

async function openCaptainRideMap(
  rideId
) {

  try {

    const s =
      await getDoc(
        doc(
          db,
          "rides",
          rideId
        )
      );

    if (!s.exists()) {

      msg(
        "الرحلة غير موجودة.",
        "error"
      );

      return;
    }


    const r =
      s.data();


    if (
      !r.pickupCoords ||
      !r.destinationCoords
    ) {

      msg(
        "إحداثيات الرحلة غير متاحة.",
        "error"
      );

      return;
    }


    pickup =
      r.pickupCoords;

    destination =
      r.destinationCoords;


    screen("mapScreen");


    setTimeout(
      () => {

        initMap();

        map.invalidateSize();

        map.setView(
          [
            pickup.lat,
            pickup.lng
          ],
          12
        );

        if (pickupMarker) {
          pickupMarker.remove();
        }

        if (destMarker) {
          destMarker.remove();
        }

        pickupMarker =
          marker(
            "pickup",
            pickup
          );

        destMarker =
          marker(
            "destination",
            destination
          );

        drawRoute();

      },
      200
    );


    $("#address").innerHTML = `
      📍
      ${esc(r.fromPlace)}
      <br>
      🏁
      ${esc(r.toPlace)}
    `;

    $("#coords").textContent =
      "مسار الرحلة";

    $("#confirmDest").textContent =
      "⬅️ الرجوع لمنصة الكابتن";

    $("#confirmDest").onclick =
      () => {

        $("#confirmDest").textContent =
          "✅ تأكيد المكان";

        screen("captain");

        captainTab("rides");

      };

  } catch (e) {

    console.error(e);

    msg(
      "تعذر فتح خريطة الرحلة.",
      "error"
    );

  }

}


/* ======================================================
   CAPTAIN ACTIONS
====================================================== */

function bindCaptainActions() {


  document
    .querySelectorAll(
      "[data-customer-route]"
    )
    .forEach(
      (b) => {

        b.onclick =
          () =>
            updateRideStatus(
              b.dataset
                .customerRoute,
              "captain_to_customer"
            );

      }
    );


  document
    .querySelectorAll(
      "[data-arrived]"
    )
    .forEach(
      (b) => {

        b.onclick =
          () =>
            updateRideStatus(
              b.dataset.arrived,
              "arrived"
            );

      }
    );


  document
    .querySelectorAll(
      "[data-start]"
    )
    .forEach(
      (b) => {

        b.onclick =
          () =>
            updateRideStatus(
              b.dataset.start,
              "started"
            );

      }
    );


  document
    .querySelectorAll(
      "[data-complete]"
    )
    .forEach(
      (b) => {

        b.onclick =
          () =>
            updateRideStatus(
              b.dataset.complete,
              "completed"
            );

      }
    );


  document
    .querySelectorAll(
      "[data-show-accepted-map]"
    )
    .forEach(
      (b) => {

        b.onclick =
          () =>
            openCaptainRideMap(
              b.dataset
                .showAcceptedMap
            );

      }
    );

}


async function updateRideStatus(
  rideId,
  status
) {

  try {

    await updateDoc(
      doc(
        db,
        "rides",
        rideId
      ),
      {

        status,

        updatedAt:
          serverTimestamp(),

        ...(status === "started"
          ? {
              startedAt:
                serverTimestamp()
            }
          : {}),

        ...(status === "completed"
          ? {
              completedAt:
                serverTimestamp()
            }
          : {})

      }
    );


    msg(
      statusText(status),
      "success"
    );

  } catch (e) {

    console.error(e);

    msg(
      "تعذر تحديث حالة الرحلة.",
      "error"
    );

  }

}


/* ======================================================
   ACCEPT RIDE
====================================================== */

async function acceptRide(
  rideId
) {

  if (
    !user ||
    profile?.role !== "captain"
  ) {

    msg(
      "سجل بحساب كابتن أولاً.",
      "error"
    );

    return;
  }


  if (
    profile.captainStatus !==
    "available"
  ) {

    msg(
      "فعّل حالة «متاح» أولاً.",
      "error"
    );

    return;
  }


  try {

    await runTransaction(
      db,
      async (tx) => {

        const ref =
          doc(
            db,
            "rides",
            rideId
          );

        const snap =
          await tx.get(ref);


        if (!snap.exists()) {

          throw Error(
            "الرحلة غير موجودة."
          );

        }


        const r =
          snap.data();


        if (
          r.status !== "open"
        ) {

          throw Error(
            "الرحلة اتقبلت بالفعل من كابتن آخر."
          );

        }


        /*
          هنا فقط بعد القبول
          يتم وضع رقم العميل.
        */

        tx.update(
          ref,
          {

            status:
              "accepted",

            captainId:
              user.uid,

            captainName:
              profile.name || "",

            captainPhone:
              profile.phone ||
              user.phoneNumber ||
              "",

            customerPhone:
              r.customerPhone ||
              profile.customerPhone ||
              "",

            acceptedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()

          }
        );

      }
    );


    /*
      جلب رقم العميل من users
      بعد قبول الرحلة.
    */

    try {

      const rideSnap =
        await getDoc(
          doc(
            db,
            "rides",
            rideId
          )
        );

      if (rideSnap.exists()) {

        const ride =
          rideSnap.data();

        const customerSnap =
          await getDoc(
            doc(
              db,
              "users",
              ride.customerId
            )
          );

        if (
          customerSnap.exists()
        ) {

          const customer =
            customerSnap.data();

          await updateDoc(
            doc(
              db,
              "rides",
              rideId
            ),
            {
              customerPhone:
                customer.phone ||
                "",
              customerName:
                customer.name ||
                "",
              updatedAt:
                serverTimestamp()
            }
          );

        }

      }

    } catch (e) {

      console.error(
        "customer contact:",
        e
      );

    }


    msg(
      "تم قبول الرحلة. بيانات العميل ظهرت لك 📞",
      "success"
    );


    captainTab("rides");

  } catch (e) {

    console.error(e);

    msg(
      e.message ||
      "تعذر قبول الرحلة.",
      "error"
    );

  }

}


/* ======================================================
   CAPTAIN AVAILABILITY
====================================================== */

$("#captainAvailable").onclick =
  async () => {

    if (
      profile?.role !== "captain"
    ) return;


    try {

      await updateDoc(
        doc(
          db,
          "users",
          user.uid
        ),
        {
          captainStatus:
            "available",

          updatedAt:
            serverTimestamp()
        }
      );


      profile.captainStatus =
        "available";


      msg(
        "أنت الآن متاح لاستقبال الرحلات 🟢",
        "success"
      );


      loadCaptain();

    } catch (e) {

      console.error(e);

      msg(
        "تعذر تغيير حالتك.",
        "error"
      );

    }

  };


$("#captainUnavailable").onclick =
  async () => {

    if (
      profile?.role !== "captain"
    ) return;


    try {

      await updateDoc(
        doc(
          db,
          "users",
          user.uid
        ),
        {
          captainStatus:
            "unavailable",

          updatedAt:
            serverTimestamp()
        }
      );


      profile.captainStatus =
        "unavailable";


      msg(
        "تم إيقاف استقبال الرحلات ⚫",
        "success"
      );


      loadCaptain();

    } catch (e) {

      console.error(e);

      msg(
        "تعذر تغيير حالتك.",
        "error"
      );

    }

  };


/* ======================================================
   NAVIGATION
====================================================== */

$("#navHome").onclick =
  () => {

    if (
      profile?.role === "captain"
    ) {

      screen("captain");

      captainTab("rides");

    } else {

      screen("home");

    }

  };


$("#navRides").onclick =
  () => {

    if (
      profile?.role !== "customer"
    ) {

      msg(
        "قسم رحلاتي هنا للعميل.",
        "error"
      );

      return;
    }

    screen("rides");

    loadCustomerRides();

  };


$("#navCaptain").onclick =
  () => {

    if (
      profile?.role !== "captain"
    ) {

      msg(
        "صفحة الكابتن للحسابات المسجلة ككابتن فقط.",
        "error"
      );

      return;
    }


    screen("captain");

    captainTab(
      captainTabActive ||
      "rides"
    );

  };


$("#navProfile").onclick =
  async () => {

    await loadProfile();

    screen("profile");

  };


$("#profileTop").onclick =
  async () => {

    await loadProfile();

    screen("profile");

  };


/* ======================================================
   LOGOUT
====================================================== */

$("#logout").onclick =
  async () => {

    if (watchRides) {
      watchRides();
      watchRides = null;
    }

    if (watchCustomer) {
      watchCustomer();
      watchCustomer = null;
    }

    if (watchCaptainAccepted) {
      watchCaptainAccepted();
      watchCaptainAccepted = null;
    }


    await signOut(auth);


    user = null;
    profile = null;


    screen("login");

  };


/* ======================================================
   AUTH STATE
====================================================== */

onAuthStateChanged(
  auth,
  async (u) => {

    user = u;


    /*
      المستخدم خرج من الحساب
    */

    if (!u) {

      profile = null;

      screen("login");

      return;
    }


    try {

      await loadProfile();


      /*
        لو مفيش Profile
        ما ندخلوش جوه التطبيق.
      */

      if (!profile) {

        await signOut(auth);

        screen("login");

        return;
      }


      /*
        الكابتن
      */

      if (
        profile.role ===
        "captain"
      ) {

        screen("captain");

        captainTab(
          "rides"
        );

        loadCaptain();

        return;
      }


      /*
        العميل
      */

      if (
        profile.role ===
        "customer"
      ) {

        screen("home");

        loadCustomerRides();

        return;
      }


      /*
        أي Role غير معروف
      */

      await signOut(auth);

      screen("login");

    } catch (e) {

      console.error(e);

      await signOut(auth);

      screen("login");

    }

  }
);


/* ======================================================
   START
====================================================== */

screen("login");
