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
  apiKey: "AIzaSyAZVXuhTTiGKfDflIZUm_8IgzhRjjWsfIc",
  authDomain: "wasselni-monufia-13f28.firebaseapp.com",
  projectId: "wasselni-monufia-13f28",
  storageBucket: "wasselni-monufia-13f28.firebasestorage.app",
  messagingSenderId: "1007737426615",
  appId: "1:1007737426615:web:76492206c1cd5f3fcef332",
  measurementId: "G-7K0MVY6F73"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

setPersistence(
  auth,
  browserLocalPersistence
).catch(console.error);


/* ======================================================
   GLOBAL VARIABLES
   ====================================================== */

let user = null;

let profile = null;

let map = null;

let pickupMarker = null;

let destMarker = null;

let routeLayer = null;

let accuracyCircle = null;

let confirmationResult = null;

let recaptcha = null;

let watchRides = null;

let watchCustomer = null;

let watchCaptainAccepted = null;

let pickup = null;

let destination = null;


/* ======================================================
   HELPERS
   ====================================================== */

const $ = selector =>
  document.querySelector(selector);


const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );


/* ======================================================
   PHONE
   ====================================================== */

function phone(value) {

  value = String(value || "")
    .trim()
    .replace(/[\s()-]/g, "");

  if (value.startsWith("00")) {
    value = "+" + value.slice(2);
  }

  if (value.startsWith("01")) {
    value = "+20" + value;
  }

  if (
    value.startsWith("20") &&
    !value.startsWith("+")
  ) {
    value = "+" + value;
  }

  return value;
}


/* ======================================================
   LOGIN EMAIL
   ====================================================== */

function loginEmail(phoneNumber) {

  return (
    phone(phoneNumber).replace(/\D/g, "") +
    "@phone.wasselni.app"
  );

}


/* ======================================================
   ACCOUNT NUMBER
   ====================================================== */

function accountNo() {

  return String(
    Math.floor(
      10000000 +
      Math.random() * 90000000
    )
  );

}


/* ======================================================
   MESSAGE
   ====================================================== */

function msg(
  text,
  type = "info"
) {

  const element = $("#message");

  if (!element) return;

  element.textContent = text;

  element.className =
    `message-box ${type}`;

  element.style.display = "block";

  clearTimeout(window.__msg);

  window.__msg = setTimeout(
    () => {
      element.style.display = "none";
    },
    4500
  );

}


/* ======================================================
   SCREEN
   ====================================================== */

function screen(id) {

  document
    .querySelectorAll(".screen")
    .forEach(element =>
      element.classList.remove("active")
    );

  $("#" + id)?.classList.add("active");

  if ($("#nav")) {

    $("#nav").style.display =
      ["login", "register"].includes(id)
        ? "none"
        : "flex";

  }

}


/* ======================================================
   STATUS
   ====================================================== */

function statusText(status) {

  return {

    open: "بانتظار كابتن",

    accepted: "تم قبول الرحلة",

    captain_to_customer:
      "الكابتن في الطريق",

    arrived:
      "الكابتن وصل",

    started:
      "الرحلة بدأت",

    completed:
      "انتهت الرحلة",

    cancelled:
      "ملغاة"

  }[status] || status || "غير معروف";

}


/* ======================================================
   DAY NAME
   ====================================================== */

function dayName(date) {

  if (!date) return "";

  return new Intl.DateTimeFormat(
    "ar-EG",
    {
      weekday: "long"
    }
  ).format(
    new Date(`${date}T12:00:00`)
  );

}


/* ======================================================
   FORMAT DATE
   ====================================================== */

function formatDate(value) {

  if (!value) return "";

  return new Intl.DateTimeFormat(
    "ar-EG",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  ).format(
    new Date(`${value}T12:00:00`)
  );

}


/* ======================================================
   HTML
   ====================================================== */

$("#app").innerHTML = `

<div class="app">

<header class="header">

<div class="logo">
🚕 وصلني
<span>المنوفية</span>
</div>

<button
id="profileTop"
class="icon-button">
👤
</button>

</header>


<div
id="message"
class="message-box"
style="display:none">
</div>


<!-- LOGIN -->

<section
id="login"
class="screen active">

<div class="auth-card">

<div class="auth-logo">
🚕
</div>

<h1>
وصلني المنوفية
</h1>

<p class="muted">
تسجيل الدخول برقم الموبايل وكلمة المرور
</p>


<label>
📱 رقم الموبايل
</label>

<input
id="loginPhone"
type="tel"
inputmode="tel"
placeholder="010xxxxxxxx"
/>


<label>
🔐 كلمة المرور
</label>

<input
id="loginPass"
type="password"
placeholder="كلمة المرور"
/>


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


<div
id="loginMsg"
class="status">
</div>

</div>

</section>


<!-- REGISTER -->

<section
id="register"
class="screen">

<div class="auth-card">


<button
id="backLogin"
class="back-btn">

← رجوع

</button>


<h2>
إنشاء حساب
</h2>


<label>
نوع الحساب
</label>

<select id="role">

<option value="customer">
👤 عميل
</option>

<option value="captain">
🚗 كابتن
</option>

</select>


<label>
الاسم بالكامل
</label>

<input
id="name"
placeholder="الاسم"
/>


<label>
📱 رقم الموبايل
</label>

<input
id="regPhone"
type="tel"
inputmode="tel"
placeholder="010xxxxxxxx"
/>


<label>
🔐 كلمة المرور
</label>

<input
id="regPass"
type="password"
placeholder="6 أحرف أو أرقام على الأقل"
/>


<label>
🔐 تأكيد كلمة المرور
</label>

<input
id="regPass2"
type="password"
placeholder="تأكيد كلمة المرور"
/>


<div
id="captainFields"
style="display:none">


<label>
🎂 السن
</label>

<input
id="age"
type="number"
min="18"
placeholder="السن"
/>


<label>
🚗 نوع العربية
</label>

<input
id="carType"
placeholder="سيدان / ميكروباص / نص نقل"
/>


<label>
🚘 موديل العربية
</label>

<input
id="carModel"
placeholder="مثال: لانسر 2018"
/>


<label>
🔢 رقم اللوحة
</label>

<input
id="plate"
placeholder="رقم اللوحة"
/>

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

<label>
🔢 كود التحقق
</label>

<input
id="code"
inputmode="numeric"
placeholder="الكود"
/>


<button
id="finishReg"
class="btn green">

تأكيد وإنشاء الحساب

</button>

</div>


<div
id="regMsg"
class="status">
</div>


</div>

</section>


<!-- CUSTOMER HOME -->

<section
id="home"
class="screen">


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


<label>
📅 يوم الرحلة
</label>

<input
id="rideDate"
type="date"
/>


<div
id="dayPreview"
class="status">
</div>


<label>
🕐 وقت الرحلة
</label>

<input
id="rideTime"
type="time"
/>


<label>
👥 عدد الركاب
</label>

<select id="passengers">

${Array.from(
  { length: 8 },
  (_, i) =>
    `<option value="${i + 1}">
      ${i + 1}
    </option>`
).join("")}

</select>


<label>
💰 السعر المقترح
</label>

<input
id="price"
type="number"
min="1"
placeholder="مثال 150"
/>


<label>
📝 الرسالة / الملاحظات
</label>

<textarea
id="notes"
rows="3"
placeholder="شنطة كبيرة، طفل، شارع ضيق، أي ملاحظة للكابتن...">
</textarea>


<button
id="request"
class="btn primary">

🚕 نشر الرحلة للكباتن

</button>

</div>

</section>


<!-- MAP -->

<section
id="mapScreen"
class="screen">


<div class="card">


<div class="map-head">

<div>

<h2>
🗺️ تحديد المكان
</h2>

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
/>


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


<!-- RIDES -->

<section
id="rides"
class="screen">


<div class="hero">

<h2>
📋 رحلاتي
</h2>

<p>
تابع الرحلة من النشر حتى الانتهاء.
</p>

</div>


<div id="ridesList">
</div>


</section>


<!-- CAPTAIN -->

<section
id="captain"
class="screen">


<div class="hero">

<h2>
🚗 منصة الكابتن
</h2>

<p>
فعّل حالتك وشوف الرحلات الجديدة.
</p>

</div>


<div class="card captain-toggle">


<button
id="captainAvailable"
class="btn green">

🟢 أنا متاح

</button>


<button
id="captainUnavailable"
class="btn outline">

⚫ غير متاح

</button>


<div
id="captainState"
class="status">
</div>

</div>


<h3>
📢 الرحلات الجديدة
</h3>


<div id="captainList">
</div>


<h3>
🚕 رحلات قبلتها
</h3>


<div id="captainAcceptedList">
</div>


</section>


<!-- PROFILE -->

<section
id="profile"
class="screen">


<div class="card">

<div class="avatar">
👤
</div>


<h2>
حسابي
</h2>


<div id="profileInfo">
</div>


<button
id="logout"
class="btn danger">

تسجيل الخروج

</button>

</div>

</section>


<!-- NAV -->

<nav
id="nav"
class="nav">


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

  const permissions =
    await Geolocation.checkPermissions();

  if (permissions.location !== "granted") {

    const result =
      await Geolocation.requestPermissions();

    if (result.location !== "granted") {

      throw Error(
        "LOCATION_DENIED"
      );

    }

  }


  const position =
    await Geolocation.getCurrentPosition({

      enableHighAccuracy: true,

      timeout: 20000,

      maximumAge: 0

    });


  return {

    lat:
      position.coords.latitude,

    lng:
      position.coords.longitude,

    accuracy:
      position.coords.accuracy

  };

}


/* ======================================================
   REVERSE GEOCODING
   ====================================================== */

async function reverse(
  lat,
  lng
) {

  try {

    const response =
      await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ar`
      );


    const data =
      await response.json();


    return (
      data.display_name ||
      `موقع ${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );

  } catch {

    return `موقع ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  }

}


/* ======================================================
   MAP MARKER
   ====================================================== */

function marker(
  type,
  position
) {

  const icon =
    L.divIcon({

      className:
        "custom-marker",

      html:
        `<div class="${type}-marker">
          ${
            type === "pickup"
              ? "🚕"
              : "📍"
          }
        </div>`,

      iconSize:
        [48, 48],

      iconAnchor:
        [24, 42]

    });


  return L.marker(
    [
      position.lat,
      position.lng
    ],
    {
      icon
    }
  ).addTo(map);

}


/* ======================================================
   MAP CENTER
   ====================================================== */

async function centerChanged() {

  if (!map) return;


  const center =
    map.getCenter();


  destination = {

    lat:
      center.lat,

    lng:
      center.lng

  };


  if (destMarker) {

    destMarker.setLatLng([
      center.lat,
      center.lng
    ]);

  } else {

    destMarker =
      marker(
        "destination",
        destination
      );

  }


  $("#coords").textContent =
    `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;


  $("#address").textContent =
    "جاري تحديد العنوان...";


  $("#address").innerHTML =
    `🏁 <strong>
      ${esc(
        await reverse(
          center.lat,
          center.lng
        )
      )}
    </strong>`;


  drawRoute();

}


/* ======================================================
   INIT MAP
   ====================================================== */

function initMap() {

  if (map) {

    setTimeout(
      () => map.invalidateSize(),
      200
    );

    return;

  }


  map =
    L.map(
      "map",
      {
        zoomControl: false
      }
    ).setView(

      pickup
        ? [
            pickup.lat,
            pickup.lng
          ]
        : [
            30.5526,
            31.0106
          ],

      pickup
        ? 18
        : 13

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
      marker(
        "pickup",
        pickup
      );

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


/* ======================================================
   SET PICKUP
   ====================================================== */

async function setPickup() {

  try {

    const position =
      await exactLocation();


    pickup = {

      lat:
        position.lat,

      lng:
        position.lng

    };


    if (pickupMarker) {

      pickupMarker.setLatLng([
        position.lat,
        position.lng
      ]);

    } else if (map) {

      pickupMarker =
        marker(
          "pickup",
          pickup
        );

    }


    if (
      accuracyCircle &&
      map
    ) {

      accuracyCircle.remove();

    }


    if (map) {

      accuracyCircle =
        L.circle(
          [
            position.lat,
            position.lng
          ],
          {
            radius:
              Math.max(
                10,
                position.accuracy
              ),

            weight: 2,

            fillOpacity: 0.08

          }
        ).addTo(map);

    }


    const address =
      await reverse(
        position.lat,
        position.lng
      );


    $("#pickupText").innerHTML =
      `📍 <strong>
        ${esc(address)}
      </strong>
      <br>
      <small>
        دقة GPS تقريباً
        ${Math.round(position.accuracy)}
        متر
      </small>`;


    if (map) {

      map.setView(
        [
          position.lat,
          position.lng
        ],
        19
      );

    }


    msg(
      "تم تحديد موقعك بدقة 📍",
      "success"
    );


  } catch (error) {

    console.error(error);

    msg(
      "اسمح للتطبيق بالموقع وشغّل GPS ثم حاول مرة أخرى.",
      "error"
    );

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
      !data.routes?.length
    ) {

      return;

    }


    if (routeLayer) {

      routeLayer.remove();

    }


    routeLayer =
      L.geoJSON(
        data.routes[0].geometry,
        {
          style: {
            weight: 6,
            opacity: 0.85
          }
        }
      ).addTo(map);


  } catch (error) {

    console.error(error);

  }

}


/* ======================================================
   SEARCH PLACES
   ====================================================== */

async function searchPlaces(queryText) {

  const box =
    $("#results");


  if (
    queryText.length < 3
  ) {

    box.innerHTML = "";

    return;

  }


  box.innerHTML =
    "<div class='status'>🔎 جاري البحث...</div>";


  try {

    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        queryText + ", Egypt"
      )}&limit=8&addressdetails=1&accept-language=ar&countrycodes=eg`;


    const response =
      await fetch(url);


    const data =
      await response.json();


    box.innerHTML =
      data.length

        ? data
            .map(
              place =>
                `<button
                  class="search-result"
                  data-lat="${place.lat}"
                  data-lon="${place.lon}"
                  data-name="${esc(place.display_name)}">

                  📍
                  ${esc(place.display_name)}

                </button>`
            )
            .join("")

        : "<div class='status'>لا توجد نتائج.</div>";


    box
      .querySelectorAll(
        ".search-result"
      )
      .forEach(button => {

        button.onclick = () => {

          destination = {

            lat:
              Number(
                button.dataset.lat
              ),

            lng:
              Number(
                button.dataset.lon
              )

          };


          map.setView(
            [
              destination.lat,
              destination.lng
            ],
            19
          );


          $("#search").value =
            button.dataset.name;


          box.innerHTML = "";

        };

      });


  } catch {

    box.innerHTML =
      "<div class='status'>تعذر البحث.</div>";

  }

}
/* ======================================================
   MAP / HOME EVENTS
   ====================================================== */

$("#myLocation").onclick = async () => {
  await setPickup();
};

$("#mapLocation").onclick = async () => {
  await setPickup();
};

$("#chooseDest").onclick = () => {

  screen("mapScreen");

  setTimeout(() => {

    initMap();

    if (map) {
      map.invalidateSize();
    }

  }, 150);

};

$("#closeMap").onclick = () => {
  screen("home");
};


$("#confirmDest").onclick = async () => {

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
    `🏁 <strong>
      ${esc(address)}
    </strong>`;


  screen("home");


  msg(
    "تم تحديد مكان الوصول بدقة ✅",
    "success"
  );

};


let searchTimer;

$("#search").oninput = () => {

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


$("#rideDate").onchange = () => {

  const day =
    dayName(
      $("#rideDate").value
    );

  $("#dayPreview").textContent =
    day
      ? `📆 ${day}`
      : "";

};


/* ======================================================
   CREATE RIDE
   ====================================================== */

$("#request").onclick = async () => {

  if (!user) {

    screen("login");

    return;

  }


  if (
    profile?.role !== "customer"
  ) {

    msg(
      "حساب الكابتن لا يطلب رحلة.",
      "error"
    );

    return;

  }


  if (
    !pickup ||
    !destination
  ) {

    msg(
      "حدد الانطلاق والوصول أولاً.",
      "error"
    );

    return;

  }


  const price =
    Number(
      $("#price").value
    );

  const date =
    $("#rideDate").value;

  const time =
    $("#rideTime").value;


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


    const ride =
      await addDoc(
        collection(
          db,
          "rides"
        ),
        {

          customerId:
            user.uid,

          customerName:
            profile.name || "",

          fromPlace,

          toPlace,

          pickupCoords:
            pickup,

          destinationCoords:
            destination,

          price,

          passengers:
            Number(
              $("#passengers").value
            ),

          notes:
            $("#notes")
              .value
              .trim(),

          rideDate:
            date,

          rideTime:
            time,

          dayName:
            dayName(date),

          status:
            "open",

          captainId:
            "",

          createdAt:
            serverTimestamp()

        }
      );


    localStorage.setItem(
      "lastRide",
      ride.id
    );


    $("#price").value = "";

    $("#notes").value = "";


    msg(
      "تم نشر الرحلة للكباتن 🚕",
      "success"
    );


    screen("rides");

    loadCustomerRides();


  } catch (error) {

    console.error(error);

    msg(
      "تعذر إرسال الرحلة.",
      "error"
    );

  }

};


/* ======================================================
   REGISTER ROLE
   ====================================================== */

$("#role").onchange = () => {

  $("#captainFields").style.display =
    $("#role").value === "captain"
      ? "block"
      : "none";

};


/* ======================================================
   OPEN REGISTER
   ====================================================== */

$("#registerOpen").onclick = () => {

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


/* ======================================================
   BACK LOGIN
   ====================================================== */

$("#backLogin").onclick = () => {

  screen("login");

};


/* ======================================================
   SEND OTP
   ====================================================== */

$("#sendCode").onclick =
  async () => {

    const p =
      phone(
        $("#regPhone").value
      );


    const pass =
      $("#regPass").value;


    const name =
      $("#name")
        .value
        .trim();


    const pass2 =
      $("#regPass2").value;


    if (
      !name ||
      !/^\+20\d{10}$/.test(p) ||
      pass.length < 6 ||
      pass !== pass2
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

      $("#sendCode").disabled =
        true;


      confirmationResult =
        await signInWithPhoneNumber(
          auth,
          p,
          recaptcha
        );


      $("#codeBox").style.display =
        "block";


      $("#regMsg").textContent =
        "تم إرسال كود التحقق إلى الرقم.";


    } catch (error) {

      console.error(error);


      if (
        error.code ===
        "auth/operation-not-allowed"
      ) {

        $("#regMsg").textContent =
          "تسجيل الدخول برقم الهاتف غير مفعل في Firebase.";

      } else if (
        error.code ===
        "auth/invalid-phone-number"
      ) {

        $("#regMsg").textContent =
          "رقم الموبايل غير صحيح.";

      } else {

        $("#regMsg").textContent =
          error.message ||
          "تعذر إرسال الكود.";

      }


      $("#sendCode").disabled =
        false;

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


      const code =
        $("#code")
          .value
          .trim();


      if (!code) {

        $("#regMsg").textContent =
          "اكتب كود التحقق.";

        return;

      }


      const p =
        phone(
          $("#regPhone").value
        );


      const pass =
        $("#regPass").value;


      /*
       * تأكيد OTP
       */

      const credential =
        await confirmationResult.confirm(
          code
        );


      const newUser =
        credential.user;


      /*
       * ربط كلمة السر بحساب الهاتف
       */

      const email =
        loginEmail(p);


      const emailCredential =
        EmailAuthProvider.credential(
          email,
          pass
        );


      try {

        await linkWithCredential(
          newUser,
          emailCredential
        );


      } catch (error) {

        console.error(
          "LINK ERROR:",
          error
        );


        /*
         * الحساب بالفعل مربوط بكلمة السر
         * نكمل عادي.
         */

        if (
          error.code ===
          "auth/provider-already-linked"
        ) {

          console.log(
            "Email/password already linked."
          );


        /*
         * المشكلة التي كانت بتظهر للمستخدم
         */

        } else if (
          error.code ===
          "auth/email-already-in-use"
        ) {

          await signOut(auth);


          $("#regMsg").textContent =
            "الرقم ده مرتبط بحساب قديم في Firebase. " +
            "لو ده رقم اختبار، احذف حساب الاختبار من " +
            "Firebase > Authentication > Users " +
            "وبعدين جرّب التسجيل تاني.";


          $("#sendCode").disabled =
            false;


          return;


        } else {

          throw error;

        }

      }


      /* ==================================================
         CREATE USER PROFILE
         ================================================== */

      const role =
        $("#role").value;


      const data = {

        uid:
          newUser.uid,

        name:
          $("#name")
            .value
            .trim(),

        phone:
          p,

        role,

        accountNumber:
          accountNo(),

        createdAt:
          serverTimestamp(),

        rating:
          0,

        ratingCount:
          0

      };


      /*
       * بيانات الكابتن
       */

      if (
        role === "captain"
      ) {

        data.age =
          Number(
            $("#age").value
          );


        data.carType =
          $("#carType")
            .value
            .trim();


        data.carModel =
          $("#carModel")
            .value
            .trim();


        data.plateNumber =
          $("#plate")
            .value
            .trim();


        data.captainStatus =
          "available";

      }


      await setDoc(
        doc(
          db,
          "users",
          newUser.uid
        ),
        data,
        {
          merge: true
        }
      );


      profile =
        data;


      user =
        newUser;


      $("#regMsg").textContent =
        "تم إنشاء الحساب بنجاح ✅";


      msg(
        "تم إنشاء الحساب وتسجيل الدخول ✅",
        "success"
      );


      /*
       * تحويل المستخدم حسب نوع الحساب
       */

      if (
        role === "captain"
      ) {

        screen("captain");

        loadCaptain();

      } else {

        screen("home");

        loadCustomerRides();

      }


    } catch (error) {

      console.error(
        "REGISTER ERROR:",
        error
      );


      /*
       * رسائل أخطاء مفهومة
       */

      if (
        error.code ===
        "auth/invalid-verification-code"
      ) {

        $("#regMsg").textContent =
          "كود التحقق غير صحيح.";

        return;

      }


      if (
        error.code ===
        "auth/code-expired"
      ) {

        $("#regMsg").textContent =
          "كود التحقق انتهت صلاحيته. اطلب كود جديد.";

        return;

      }


      if (
        error.code ===
        "auth/email-already-in-use"
      ) {

        $("#regMsg").textContent =
          "الرقم مرتبط بحساب قديم. استخدم تسجيل الدخول أو احذف حساب الاختبار من Firebase.";

        return;

      }


      $("#regMsg").textContent =
        error.message ||
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

      $("#loginBtn").disabled =
        true;


      await signInWithEmailAndPassword(
        auth,
        loginEmail(p),
        pass
      );


      $("#loginMsg").textContent =
        "";


    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );


      $("#loginMsg").textContent =
        "رقم الموبايل أو كلمة المرور غير صحيحة.";

    } finally {

      $("#loginBtn").disabled =
        false;

    }

  };


/* ======================================================
   PROFILE
   ====================================================== */

async function loadProfile() {

  if (!user) return;


  const snapshot =
    await getDoc(
      doc(
        db,
        "users",
        user.uid
      )
    );


  if (
    snapshot.exists()
  ) {

    profile =
      snapshot.data();

  }


  if (!profile) return;


  $("#profileInfo").innerHTML = `

    <div class="profile-row">

      <span>
        👤 الاسم
      </span>

      <strong>
        ${esc(profile.name)}
      </strong>

    </div>


    <div class="profile-row">

      <span>
        📱 الموبايل
      </span>

      <strong>
        ${esc(profile.phone)}
      </strong>

    </div>


    <div class="profile-row">

      <span>
        🔢 رقم الحساب
      </span>

      <strong>
        ${esc(profile.accountNumber)}
      </strong>

    </div>


    <div class="profile-row">

      <span>
        النوع
      </span>

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

            <span>
              🚘 العربية
            </span>

            <strong>
              ${esc(profile.carType)}
              ${esc(profile.carModel)}
              -
              ${esc(profile.plateNumber)}
            </strong>

          </div>


          <div class="profile-row">

            <span>
              ⭐ التقييم
            </span>

            <strong>
              ${Number(profile.rating || 0).toFixed(1)}
              (${profile.ratingCount || 0})
            </strong>

          </div>

        `

        : ""

    }

  `;

}


/* ======================================================
   CUSTOMER RIDE CARD
   ====================================================== */

function customerCard(ride) {

  let contact = "";


  if (
    ride.status === "accepted" ||
    ride.status === "captain_to_customer" ||
    ride.status === "arrived" ||
    ride.status === "started" ||
    ride.status === "completed"
  ) {

    contact =
      ride.captainPhone

        ? `

          <div class="contact-box">

            📞

            <a
              href="tel:${esc(
                ride.captainPhone
              )}">

              ${esc(
                ride.captainPhone
              )}

            </a>

            —

            ${esc(
              ride.captainName ||
              "الكابتن"
            )}

          </div>

        `

        : "";

  }


  return `

    <div class="card">

      <div class="ride-status">

        ${statusText(
          ride.status
        )}

      </div>


      <b>
        📍
        ${esc(
          ride.fromPlace
        )}
      </b>

      <br>


      🏁
      ${esc(
        ride.toPlace
      )}


      <p>
        💰
        ${ride.price}
        جنيه
        •
        👥
        ${ride.passengers}
      </p>


      <p>
        📅
        ${formatDate(
          ride.rideDate
        )}

        •

        ${esc(
          ride.dayName
        )}

        •

        🕐
        ${esc(
          ride.rideTime
        )}

      </p>


      ${
        ride.notes

          ? `
            <p>
              📝
              ${esc(
                ride.notes
              )}
            </p>
          `

          : ""
      }


      ${contact}


      ${
        ride.status === "accepted"

          ? `

            <button
              class="btn outline"
              data-start-customer="${ride.id}">

              📞 الكابتن قبل الرحلة

            </button>

          `

          : ""
      }


      ${
        ride.status === "started"

          ? `

            <button
              class="btn green"
              data-complete-customer="${ride.id}">

              ✅ انتهت الرحلة

            </button>

          `

          : ""
      }

    </div>

  `;

}


/* ======================================================
   CUSTOMER RIDES
   ====================================================== */

async function loadCustomerRides() {

  if (
    !user ||
    profile?.role !== "customer"
  ) {

    return;

  }


  if (watchCustomer) {

    watchCustomer();

  }


  watchCustomer =
    onSnapshot(

      query(
        collection(
          db,
          "rides"
        ),

        where(
          "customerId",
          "==",
          user.uid
        ),

        limit(50)
      ),

      snapshot => {

        const rides =
          snapshot.docs
            .map(
              item => ({
                id:
                  item.id,

                ...item.data()

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
                .map(
                  customerCard
                )
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
          .forEach(button => {

            button.onclick =
              () =>
                updateDoc(

                  doc(
                    db,
                    "rides",
                    button.dataset
                      .completeCustomer
                  ),

                  {
                    status:
                      "completed",

                    completedAt:
                      serverTimestamp()
                  }

                );

          });

      }

    );

}


/* ======================================================
   CAPTAIN
   ====================================================== */

async function loadCaptain() {

  if (
    profile?.role !== "captain"
  ) {

    $("#captainList").innerHTML =
      `

        <div class="card">

          هذه الصفحة للكابتن فقط.

        </div>

      `;

    return;

  }


  $("#captainState").textContent =

    profile.captainStatus ===
    "available"

      ? "🟢 أنت متاح لاستقبال الرحلات"

      : "⚫ أنت غير متاح";


  if (watchRides) {

    watchRides();

  }


  watchRides =
    onSnapshot(

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
      ),

      snapshot => {

        $("#captainList").innerHTML =

          profile.captainStatus ===
            "available" &&
          snapshot.docs.length

            ? snapshot.docs
                .map(
                  item => {

                    const ride =
                      item.data();


                    return `

                      <div class="card">

                        <div class="ride-status">

                          🆕 رحلة جديدة

                        </div>


                        <b>
                          📍
                          ${esc(
                            ride.fromPlace
                          )}
                        </b>

                        <br>


                        🏁
                        ${esc(
                          ride.toPlace
                        )}


                        <p>
                          💰
                          ${ride.price}
                          جنيه
                          •
                          👥
                          ${ride.passengers}
                        </p>


                        <p>
                          📅
                          ${formatDate(
                            ride.rideDate
                          )}

                          •

                          ${esc(
                            ride.dayName
                          )}

                          •

                          🕐
                          ${esc(
                            ride.rideTime
                          )}

                        </p>


                        ${
                          ride.notes

                            ? `

                              <p>
                                📝
                                ${esc(
                                  ride.notes
                                )}
                              </p>

                            `

                            : ""
                        }


                        <button
                          class="btn green"
                          data-accept="${item.id}">

                          ✅ قبول الرحلة

                        </button>

                      </div>

                    `;

                  }
                )
                .join("")

            : `

              <div class="card">

                لا توجد رحلات متاحة الآن.

              </div>

            `;


        document
          .querySelectorAll(
            "[data-accept]"
          )
          .forEach(button => {

            button.onclick =
              () =>
                acceptRide(
                  button.dataset.accept
                );

          });

      }

    );


  if (watchCaptainAccepted) {

    watchCaptainAccepted();

  }


  watchCaptainAccepted =
    onSnapshot(

      query(
        collection(
          db,
          "rides"
        ),

        where(
          "captainId",
          "==",
          user.uid
        ),

        limit(30)
      ),

      snapshot => {

        $("#captainAcceptedList").innerHTML =

          snapshot.docs.length

            ? snapshot.docs
                .map(
                  item => {

                    const ride =
                      item.data();


                    return `

                      <div class="card">

                        <div class="ride-status">

                          ${statusText(
                            ride.status
                          )}

                        </div>


                        <b>
                          📍
                          ${esc(
                            ride.fromPlace
                          )}
                        </b>

                        <br>


                        🏁
                        ${esc(
                          ride.toPlace
                        )}


                        <p>
                          💰
                          ${ride.price}
                          جنيه
                          •
                          👥
                          ${ride.passengers}
                        </p>


                        <p>
                          📅
                          ${formatDate(
                            ride.rideDate
                          )}

                          •

                          ${esc(
                            ride.dayName
                          )}

                          •

                          🕐
                          ${esc(
                            ride.rideTime
                          )}

                        </p>


                        ${
                          ride.notes

                            ? `

                              <p>
                                📝
                                ${esc(
                                  ride.notes
                                )}
                              </p>

                            `

                            : ""
                        }


                        ${
                          ride.customerPhone

                            ? `

                              <div class="contact-box">

                                📞

                                <a
                                  href="tel:${esc(
                                    ride.customerPhone
                                  )}">

                                  ${esc(
                                    ride.customerPhone
                                  )}

                                </a>

                                —

                                ${esc(
                                  ride.customerName ||
                                  "العميل"
                                )}

                              </div>

                            `

                            : ""
                        }


                        ${
                          ride.status ===
                          "accepted"

                            ? `

                              <button
                                class="btn primary"
                                data-customer-route="${item.id}">

                                🚗 أنا في الطريق للعميل

                              </button>

                            `

                            : ""
                        }


                        ${
                          ride.status ===
                          "captain_to_customer"

                            ? `

                              <button
                                class="btn green"
                                data-arrived="${item.id}">

                                📍 وصلت للعميل

                              </button>

                            `

                            : ""
                        }


                        ${
                          ride.status ===
                          "arrived"

                            ? `

                              <button
                                class="btn primary"
                                data-start="${item.id}">

                                ▶️ بدء الرحلة

                              </button>

                            `

                            : ""
                        }


                        ${
                          ride.status ===
                          "started"

                            ? `

                              <button
                                class="btn green"
                                data-complete="${item.id}">

                                🏁 إنهاء الرحلة

                              </button>

                            `

                            : ""
                        }

                      </div>

                    `;

                  }
                )
                .join("")

            : `

              <div class="card">

                لا توجد رحلات قبلتها.

              </div>

            `;


        bindCaptainActions();

      }

    );

}


/* ======================================================
   CAPTAIN ACTIONS
   ====================================================== */

function bindCaptainActions() {

  document
    .querySelectorAll(
      "[data-customer-route]"
    )
    .forEach(button => {

      button.onclick =
        () =>
          updateDoc(

            doc(
              db,
              "rides",
              button.dataset
                .customerRoute
            ),

            {
              status:
                "captain_to_customer",

              updatedAt:
                serverTimestamp()

            }

          );

    });


  document
    .querySelectorAll(
      "[data-arrived]"
    )
    .forEach(button => {

      button.onclick =
        () =>
          updateDoc(

            doc(
              db,
              "rides",
              button.dataset
                .arrived
            ),

            {
              status:
                "arrived",

              updatedAt:
                serverTimestamp()

            }

          );

    });


  document
    .querySelectorAll(
      "[data-start]"
    )
    .forEach(button => {

      button.onclick =
        () =>
          updateDoc(

            doc(
              db,
              "rides",
              button.dataset
                .start
            ),

            {
              status:
                "started",

              startedAt:
                serverTimestamp()

            }

          );

    });


  document
    .querySelectorAll(
      "[data-complete]"
    )
    .forEach(button => {

      button.onclick =
        () =>
          updateDoc(

            doc(
              db,
              "rides",
              button.dataset
                .complete
            ),

            {
              status:
                "completed",

              completedAt:
                serverTimestamp()

            }

          );

    });

}


/* ======================================================
   ACCEPT RIDE
   ====================================================== */

async function acceptRide(id) {

  if (
    !user ||
    profile?.role !== "captain"
  ) {

    return;

  }


  try {

    await runTransaction(
      db,
      async transaction => {

        const reference =
          doc(
            db,
            "rides",
            id
          );


        const snapshot =
          await transaction.get(
            reference
          );


        if (
          !snapshot.exists()
        ) {

          throw Error(
            "الرحلة غير موجودة"
          );

        }


        const ride =
          snapshot.data();


        if (
          ride.status !== "open"
        ) {

          throw Error(
            "الرحلة اتقبلت بالفعل"
          );

        }


        transaction.update(
          reference,
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

            acceptedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()

          }
        );

      }
    );


    msg(
      "تم قبول الرحلة. رقم العميل ظهر لك 📞",
      "success"
    );


    loadCaptain();


  } catch (error) {

    console.error(error);


    msg(
      error.message ||
      "تعذر قبول الرحلة",
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
    ) {

      return;

    }


    await updateDoc(

      doc(
        db,
        "users",
        user.uid
      ),

      {
        captainStatus:
          "available"
      }

    );


    profile.captainStatus =
      "available";


    loadCaptain();

  };


$("#captainUnavailable").onclick =
  async () => {

    if (
      profile?.role !== "captain"
    ) {

      return;

    }


    await updateDoc(

      doc(
        db,
        "users",
        user.uid
      ),

      {
        captainStatus:
          "unavailable"
      }

    );


    profile.captainStatus =
      "unavailable";


    loadCaptain();

  };


/* ======================================================
   NAVIGATION
   ====================================================== */

$("#navHome").onclick =
  () => {

    if (
      profile?.role ===
      "captain"
    ) {

      screen("captain");

    } else {

      screen("home");

    }

  };


$("#navRides").onclick =
  () => {

    if (
      profile?.role !==
      "customer"
    ) {

      msg(
        "رحلاتي هنا للعميل.",
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
      profile?.role !==
      "captain"
    ) {

      msg(
        "صفحة الكابتن للحسابات المسجلة ككابتن فقط.",
        "error"
      );

      return;

    }


    screen("captain");

    loadCaptain();

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

    }


    if (watchCustomer) {

      watchCustomer();

    }


    if (watchCaptainAccepted) {

      watchCaptainAccepted();

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
  async currentUser => {

    user =
      currentUser;


    if (!currentUser) {

      profile = null;

      screen("login");

      return;

    }


    await loadProfile();


    if (
      profile?.role ===
      "captain"
    ) {

      screen("captain");

      loadCaptain();


    } else if (
      profile?.role ===
      "customer"
    ) {

      screen("home");

      loadCustomerRides();


    } else {

      await signOut(auth);

      screen("login");

    }

  }
);


/* ======================================================
   START
   ====================================================== */

screen("login");
