import "./style.css";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
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
  onSnapshot,
  serverTimestamp,
  limit
} from "firebase/firestore";

import { Geolocation } from "@capacitor/geolocation";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

/* ======================================================
   VARIABLES
====================================================== */

let map = null;
let routeLayer = null;
let fromMarker = null;
let toMarker = null;

let fromPlace = null;
let toPlace = null;

let currentRole = "customer";

let unsubscribeOffers = null;
let unsubscribeRide = null;

/* ======================================================
   HELPERS
====================================================== */

const $ = (selector) => document.querySelector(selector);

const money = (n) =>
  `${Number(n || 0).toLocaleString("ar-EG")} جنيه`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function show(id) {
  document.querySelectorAll("section.screen").forEach((x) => {
    x.classList.add("hidden");
  });

  const screen = $("#" + id);

  if (screen) {
    screen.classList.remove("hidden");
  }

  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.screen === id
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (id === "offers") {
    loadCustomerOffers();
  }

  if (id === "captain") {
    loadCaptainRides();
  }
}

/* ======================================================
   ACCOUNT EMAIL
   Firebase محتاج Email للدخول.
   نحن هنحوّل رقم الحساب إلى Email داخلي.
====================================================== */

function accountEmail(accountNumber) {
  return `${String(accountNumber).trim()}@wasselni.app`;
}

/* ======================================================
   GENERATE ACCOUNT NUMBER
====================================================== */

function generateAccountNumber() {
  return String(
    Math.floor(10000000 + Math.random() * 90000000)
  );
}

/* ======================================================
   CHECK ACCOUNT NUMBER
====================================================== */

async function accountNumberExists(accountNumber) {
  const q = query(
    collection(db, "users"),
    where("accountNumber", "==", accountNumber),
    limit(1)
  );

  const snapshot = await new Promise((resolve, reject) => {
    const unsub = onSnapshot(
      q,
      (snap) => {
        unsub();
        resolve(snap);
      },
      (error) => {
        unsub();
        reject(error);
      }
    );
  });

  return !snapshot.empty;
}

/* ======================================================
   HTML
====================================================== */

document.querySelector("#app").innerHTML = `

<header>
  <div class="logo">
    وصلني <span>المنوفية</span>
  </div>

  <div id="authMini">👤</div>
</header>


<!-- ================= الرئيسية ================= -->

<section id="home" class="screen">

  <div class="hero">
    <h2>مشوارك يبدأ من هنا 🚕</h2>
    <p>
      اطلب رحلتك وحدد السعر وسيب الكباتن يقدموا عروضهم.
    </p>
  </div>

  <div class="card">

    <div class="map">
      <div id="map"></div>
    </div>

    <button
      class="btn outline"
      id="currentLocationBtn"
      type="button"
    >
      📍 مكاني الحالي
    </button>

    <label>📍 مكان الركوب</label>

    <input
      id="from"
      placeholder="اكتب مكان الركوب"
    />

    <label>📍 مكان الوصول</label>

    <input
      id="to"
      placeholder="اكتب مكان الوصول"
    />

    <div class="row">

      <div>
        <label>💰 السعر المقترح</label>

        <input
          id="price"
          type="number"
          min="1"
          placeholder="مثال 100"
        />
      </div>

      <div>
        <label>👥 عدد الركاب</label>

        <input
          id="passengers"
          type="number"
          min="1"
          max="7"
          value="1"
        />
      </div>

    </div>

    <label>📝 ملاحظات للسائق</label>

    <input
      id="notes"
      placeholder="مثال: شنطة كبيرة"
    />

    <button
      class="btn primary"
      id="requestBtn"
    >
      🚕 اطلب الرحلة
    </button>

  </div>

  <div class="row">

    <button
      class="btn outline"
      id="myRidesBtn"
    >
      رحلاتي
    </button>

    <button
      class="btn outline"
      id="loginBtn"
    >
      تسجيل / دخول
    </button>

  </div>

</section>


<!-- ================= العروض ================= -->

<section id="offers" class="screen hidden">

  <h2>عروض الكباتن</h2>

  <div id="offersList"></div>

</section>


<!-- ================= الكابتن ================= -->

<section id="captain" class="screen hidden">

  <h2>لوحة الكابتن 👨‍✈️</h2>

  <div class="card switch">

    <b>متاح للرحلات</b>

    <input
      id="captainAvailable"
      type="checkbox"
      checked
      style="width:auto"
    />

  </div>

  <div id="captainRides"></div>

</section>


<!-- ================= الرحلة ================= -->

<section id="trip" class="screen hidden">

  <h2>الرحلة الحالية 🚕</h2>

  <div id="tripBox"></div>

</section>


<!-- ================= الحساب ================= -->

<section id="profile" class="screen hidden">

  <h2>حسابي</h2>

  <div
    class="card"
    style="text-align:center"
  >

    <div class="avatar">👤</div>

    <h3 id="profileName">
      زائر
    </h3>

    <div
      id="profileAccount"
      class="muted"
    >
      رقم الحساب: —
    </div>

    <div
      id="profilePhone"
      class="muted"
    >
      —
    </div>

  </div>

  <div class="card">

    <label>الاسم</label>

    <input
      id="profileNameInput"
      placeholder="اسمك"
    />

    <label>نوع الحساب</label>

    <select id="profileRole">

      <option value="customer">
        عميل
      </option>

      <option value="captain">
        كابتن
      </option>

    </select>

    <label>
      نوع العربية
    </label>

    <input
      id="carType"
      placeholder="ملاكي / ميكروباص / نص نقل"
    />

    <label>
      موديل العربية
    </label>

    <input
      id="carModel"
      placeholder="مثال: تويوتا كورولا 2022"
    />

    <label>
      رقم السيارة
    </label>

    <input
      id="plate"
      placeholder="مثال: م ن 1234"
    />

    <button
      class="btn primary"
      id="saveProfile"
    >
      حفظ البيانات
    </button>

    <button
      class="btn danger"
      id="logoutBtn"
    >
      تسجيل الخروج
    </button>

  </div>

</section>


<!-- ================= تسجيل الدخول ================= -->

<section id="auth" class="screen hidden">

  <h2>تسجيل الدخول 🔐</h2>

  <div class="card">

    <label>
      رقم الحساب
    </label>

    <input
      id="loginAccount"
      type="text"
      inputmode="numeric"
      placeholder="مثال: 12345678"
    />

    <label>
      كلمة المرور
    </label>

    <input
      id="loginPassword"
      type="password"
      placeholder="كلمة المرور"
    />

    <button
      class="btn primary"
      id="loginAccountBtn"
    >
      دخول
    </button>

    <div
      id="loginMsg"
      class="notice"
    ></div>

  </div>

  <div class="card register-card">

    <h3>
      معندكش حساب؟
    </h3>

    <p class="muted">
      اعمل حساب جديد مجانًا.
    </p>

    <button
      class="btn green"
      id="openRegisterBtn"
    >
      إنشاء حساب جديد
    </button>

  </div>

</section>


<!-- ================= إنشاء حساب ================= -->

<section id="register" class="screen hidden">

  <h2>إنشاء حساب جديد 📝</h2>

  <div class="card">

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

    <label>
      الاسم بالكامل
    </label>

    <input
      id="registerName"
      placeholder="اكتب اسمك"
    />

    <label>
      رقم الهاتف
    </label>

    <input
      id="registerPhone"
      type="tel"
      inputmode="tel"
      placeholder="010xxxxxxxx"
    />

    <div id="captainFields" class="hidden">

      <label>
        السن
      </label>

      <input
        id="registerAge"
        type="number"
        min="18"
        max="80"
        placeholder="مثال: 30"
      />

      <label>
        نوع العربية
      </label>

      <select id="registerCarType">

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

        <option value="نص نقل">
          نص نقل
        </option>

      </select>

      <label>
        موديل العربية
      </label>

      <input
        id="registerCarModel"
        placeholder="مثال: تويوتا كورولا 2022"
      />

      <label>
        رقم السيارة
      </label>

      <input
        id="registerPlate"
        placeholder="مثال: م ن 1234"
      />

    </div>

    <label>
      كلمة المرور
    </label>

    <input
      id="registerPassword"
      type="password"
      placeholder="6 أحرف أو أكثر"
    />

    <label>
      تأكيد كلمة المرور
    </label>

    <input
      id="registerPassword2"
      type="password"
      placeholder="اكتب كلمة المرور مرة أخرى"
    />

    <button
      class="btn primary"
      id="createAccountBtn"
    >
      إنشاء الحساب
    </button>

    <div
      id="registerMsg"
      class="notice"
    ></div>

  </div>

  <button
    class="btn outline"
    id="backLoginBtn"
  >
    ← رجوع لتسجيل الدخول
  </button>

</section>


<!-- ================= القائمة ================= -->

<nav class="nav">

  <button
    class="active"
    data-screen="home"
  >
    🏠
    <br>
    الرئيسية
  </button>

  <button
    data-screen="offers"
  >
    🚕
    <br>
    العروض
  </button>

  <button
    data-screen="captain"
  >
    👨‍✈️
    <br>
    الكابتن
  </button>

  <button
    data-screen="profile"
  >
    👤
    <br>
    حسابي
  </button>

</nav>
`;


/* ======================================================
   NAVIGATION
====================================================== */

document
  .querySelectorAll(".nav button")
  .forEach((button) => {

    button.onclick = () => {

      if (
        button.dataset.screen === "captain" &&
        (!auth.currentUser || currentRole !== "captain")
      ) {
        show("auth");
        return;
      }

      show(button.dataset.screen);

    };

  });


$("#loginBtn").onclick = () => {
  show("auth");
};

$("#myRidesBtn").onclick = () => {

  if (!auth.currentUser) {
    show("auth");
    return;
  }

  show("offers");
};


/* ======================================================
   REGISTER ROLE
====================================================== */

$("#registerRole").onchange = () => {

  const role = $("#registerRole").value;

  if (role === "captain") {
    $("#captainFields").classList.remove("hidden");
  } else {
    $("#captainFields").classList.add("hidden");
  }

};


/* ======================================================
   OPEN REGISTER
====================================================== */

$("#openRegisterBtn").onclick = () => {

  $("#registerMsg").innerHTML = "";

  $("#registerName").value = "";
  $("#registerPhone").value = "";
  $("#registerAge").value = "";
  $("#registerCarModel").value = "";
  $("#registerPlate").value = "";
  $("#registerPassword").value = "";
  $("#registerPassword2").value = "";

  show("register");

};


/* ======================================================
   BACK LOGIN
====================================================== */

$("#backLoginBtn").onclick = () => {

  show("auth");

};


/* ======================================================
   CREATE ACCOUNT
====================================================== */

$("#createAccountBtn").onclick = async () => {

  const button = $("#createAccountBtn");

  const role = $("#registerRole").value;

  const name = $("#registerName")
    .value
    .trim();

  const phone = $("#registerPhone")
    .value
    .trim();

  const age = Number(
    $("#registerAge").value
  );

  const carType = $("#registerCarType").value;

  const carModel = $("#registerCarModel")
    .value
    .trim();

  const plate = $("#registerPlate")
    .value
    .trim();

  const password = $("#registerPassword").value;

  const password2 = $("#registerPassword2").value;

  /* -----------------------------
     VALIDATION
  ----------------------------- */

  if (!name) {
    $("#registerMsg").innerHTML =
      "اكتب اسمك.";
    return;
  }

  if (!phone) {
    $("#registerMsg").innerHTML =
      "اكتب رقم الهاتف.";
    return;
  }

  if (role === "captain") {

    if (!age || age < 18) {
      $("#registerMsg").innerHTML =
        "سن الكابتن لازم يكون 18 سنة أو أكثر.";
      return;
    }

    if (!carType) {
      $("#registerMsg").innerHTML =
        "اختار نوع العربية.";
      return;
    }

    if (!carModel) {
      $("#registerMsg").innerHTML =
        "اكتب موديل العربية.";
      return;
    }

    if (!plate) {
      $("#registerMsg").innerHTML =
        "اكتب رقم السيارة.";
      return;
    }

  }

  if (password.length < 6) {

    $("#registerMsg").innerHTML =
      "كلمة المرور لازم تكون 6 أحرف أو أكثر.";

    return;
  }

  if (password !== password2) {

    $("#registerMsg").innerHTML =
      "كلمتا المرور غير متطابقتين.";

    return;
  }

  button.disabled = true;

  $("#registerMsg").innerHTML =
    "جاري إنشاء الحساب...";

  try {

    /* -----------------------------
       CREATE UNIQUE ACCOUNT NUMBER
    ----------------------------- */

    let accountNumber = null;

    for (let i = 0; i < 5; i++) {

      const candidate =
        generateAccountNumber();

      const exists =
        await accountNumberExists(candidate);

      if (!exists) {

        accountNumber = candidate;

        break;

      }

    }

    if (!accountNumber) {

      throw new Error(
        "تعذر إنشاء رقم حساب. حاول مرة أخرى."
      );

    }

    /* -----------------------------
       FIREBASE AUTH
    ----------------------------- */

    const email =
      accountEmail(accountNumber);

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    const user = credential.user;

    /* -----------------------------
       PROFILE
    ----------------------------- */

    await updateProfile(user, {
      displayName: name
    });

    /* -----------------------------
       FIRESTORE USER
    ----------------------------- */

    await setDoc(
      doc(db, "users", user.uid),
      {
        uid: user.uid,

        accountNumber,

        name,

        phone,

        role,

        age:
          role === "captain"
            ? age
            : null,

        carType:
          role === "captain"
            ? carType
            : "",

        carModel:
          role === "captain"
            ? carModel
            : "",

        plate:
          role === "captain"
            ? plate
            : "",

        rating: "جديد",

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      }
    );

    /* -----------------------------
       SHOW ACCOUNT NUMBER
    ----------------------------- */

    $("#registerMsg").innerHTML = `

      <div class="card">

        <h3>
          ✅ تم إنشاء حسابك بنجاح
        </h3>

        <p>
          رقم حسابك:
        </p>

        <h2>
          ${accountNumber}
        </h2>

        <p class="muted">
          احتفظ برقم الحساب ده لأنه هتستخدمه في تسجيل الدخول.
        </p>

      </div>

    `;

    setTimeout(() => {

      show("home");

    }, 3500);

  } catch (error) {

    console.error(error);

    let message =
      "حصل خطأ أثناء إنشاء الحساب.";

    if (
      error.code ===
      "auth/email-already-in-use"
    ) {
      message =
        "رقم الحساب مستخدم بالفعل، حاول مرة أخرى.";
    }

    if (
      error.code ===
      "auth/invalid-email"
    ) {
      message =
        "حصل خطأ في إنشاء الحساب.";
    }

    if (
      error.code ===
      "auth/weak-password"
    ) {
      message =
        "كلمة المرور ضعيفة.";
    }

    $("#registerMsg").innerHTML =
      `<div class="notice error">${escapeHtml(message)}</div>`;

  } finally {

    button.disabled = false;

  }

};


/* ======================================================
   LOGIN WITH ACCOUNT NUMBER + PASSWORD
====================================================== */

$("#loginAccountBtn").onclick = async () => {

  const accountNumber =
    $("#loginAccount")
      .value
      .trim();

  const password =
    $("#loginPassword")
      .value;

  if (!accountNumber) {

    $("#loginMsg").innerHTML =
      "اكتب رقم الحساب.";

    return;
  }

  if (!password) {

    $("#loginMsg").innerHTML =
      "اكتب كلمة المرور.";

    return;
  }

  $("#loginMsg").innerHTML =
    "جاري تسجيل الدخول...";

  try {

    const email =
      accountEmail(accountNumber);

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    $("#loginMsg").innerHTML =
      "تم تسجيل الدخول بنجاح ✅";

    setTimeout(() => {

      show("home");

    }, 500);

  } catch (error) {

    console.error(error);

    let message =
      "رقم الحساب أو كلمة المرور غير صحيحة.";

    if (
      error.code ===
      "auth/too-many-requests"
    ) {
      message =
        "محاولات كثيرة. حاول بعد قليل.";
    }

    $("#loginMsg").innerHTML =
      `<div class="notice error">${escapeHtml(message)}</div>`;

  }

};


/* ======================================================
   MAP - GEOCODING
====================================================== */

async function geocode(queryText) {

  const q =
    encodeURIComponent(
      queryText + ", Egypt"
    );

  const response =
    await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=ar&q=${q}`,
      {
        headers: {
          Accept:
            "application/json"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      "تعذر البحث عن المكان"
    );
  }

  return await response.json();

}


/* ======================================================
   MARKER
====================================================== */

function setMarker(
  which,
  lat,
  lng,
  label
) {

  const marker =
    L.marker(
      [lat, lng],
      {
        draggable: true
      }
    )
      .addTo(map)
      .bindPopup(label)
      .openPopup();

  marker.on(
    "dragend",
    async () => {

      try {

        const p =
          marker.getLatLng();

        const response =
          await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&accept-language=ar`,
            {
              headers: {
                Accept:
                  "application/json"
              }
            }
          );

        const data =
          await response.json();

        if (which === "from") {

          $("#from").value =
            data.display_name ||
            label;

          fromPlace = {
            lat: p.lat,
            lng: p.lng
          };

        } else {

          $("#to").value =
            data.display_name ||
            label;

          toPlace = {
            lat: p.lat,
            lng: p.lng
          };

        }

        drawRoute();

      } catch (error) {

        console.error(error);

      }

    }
  );

  return marker;

}


/* ======================================================
   CHOOSE PLACE
====================================================== */

async function choosePlace(
  inputId,
  which
) {

  const input =
    $(inputId);

  const value =
    input.value.trim();

  if (!value) return;

  try {

    const results =
      await geocode(value);

    if (!results.length) {

      alert(
        "المكان غير موجود، جرّب كتابة اسم شارع أو منطقة بشكل أوضح."
      );

      return;
    }

    const result =
      results[0];

    const lat =
      Number(result.lat);

    const lng =
      Number(result.lon);

    if (which === "from") {

      fromPlace = {
        lat,
        lng
      };

      if (fromMarker) {
        map.removeLayer(
          fromMarker
        );
      }

      fromMarker =
        setMarker(
          "from",
          lat,
          lng,
          "مكان الركوب"
        );

    } else {

      toPlace = {
        lat,
        lng
      };

      if (toMarker) {
        map.removeLayer(
          toMarker
        );
      }

      toMarker =
        setMarker(
          "to",
          lat,
          lng,
          "مكان الوصول"
        );

    }

    map.setView(
      [lat, lng],
      14
    );

    drawRoute();

  } catch (error) {

    console.error(error);

    alert(
      "حصلت مشكلة أثناء البحث عن المكان."
    );

  }

}


/* ======================================================
   ROUTE
====================================================== */

async function drawRoute() {

  if (!fromPlace || !toPlace) {
    return;
  }

  try {

    const url =
      `https://router.project-osrm.org/route/v1/driving/${fromPlace.lng},${fromPlace.lat};${toPlace.lng},${toPlace.lat}?overview=full&geometries=geojson`;

    const response =
      await fetch(url);

    const data =
      await response.json();

    if (
      data.code !== "Ok" ||
      !data.routes?.length
    ) {

      alert(
        "لم أجد طريقًا بين النقطتين."
      );

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
            weight: 6
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
   MAP INIT
====================================================== */

function initMaps() {

  map =
    L.map("map")
      .setView(
        [30.5877, 30.5950],
        10
      );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,

      attribution:
        "© OpenStreetMap contributors"
    }
  ).addTo(map);

  $("#from").addEventListener(
    "change",
    () =>
      choosePlace(
        "#from",
        "from"
      )
  );

  $("#to").addEventListener(
    "change",
    () =>
      choosePlace(
        "#to",
        "to"
      )
  );

  $("#from").addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        choosePlace(
          "#from",
          "from"
        );

      }

    }
  );

  $("#to").addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        choosePlace(
          "#to",
          "to"
        );

      }

    }
  );

}


/* ======================================================
   CURRENT LOCATION
====================================================== */

$("#currentLocationBtn").onclick =
  async () => {

    try {

      const permission =
        await Geolocation.checkPermissions();

      if (
        permission.location !==
        "granted"
      ) {

        const requested =
          await Geolocation.requestPermissions();

        if (
          requested.location !==
          "granted"
        ) {

          alert(
            "لازم تسمح للتطبيق بالوصول إلى موقعك."
          );

          return;
        }

      }

      const position =
        await Geolocation.getCurrentPosition(
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 5000
          }
        );

      const lat =
        position.coords.latitude;

      const lng =
        position.coords.longitude;

      fromPlace = {
        lat,
        lng
      };

      if (fromMarker) {
        map.removeLayer(
          fromMarker
        );
      }

      fromMarker =
        setMarker(
          "from",
          lat,
          lng,
          "مكاني الحالي"
        );

      map.setView(
        [lat, lng],
        16
      );

      try {

        const response =
          await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ar`,
            {
              headers: {
                Accept:
                  "application/json"
              }
            }
          );

        const data =
          await response.json();

        $("#from").value =
          data.display_name ||
          "مكاني الحالي";

      } catch {

        $("#from").value =
          "مكاني الحالي";

      }

    } catch (error) {

      console.error(error);

      alert(
        "تعذر تحديد موقعك. تأكد من تشغيل الموقع والسماح للتطبيق باستخدامه."
      );

    }

  };


initMaps();


/* ======================================================
   REQUIRE LOGIN
====================================================== */

function requireUser() {

  if (!auth.currentUser) {

    show("auth");

    return false;

  }

  return true;

}


/* ======================================================
   CREATE RIDE
====================================================== */

$("#requestBtn").onclick =
  async () => {

    if (!requireUser()) {
      return;
    }

    if (!fromPlace || !toPlace) {

      alert(
        "اكتب مكان الركوب والوصول أولًا."
      );

      return;
    }

    const price =
      Number(
        $("#price").value
      );

    if (!price) {

      alert(
        "اكتب السعر المقترح."
      );

      return;
    }

    const passengers =
      Number(
        $("#passengers").value || 1
      );

    const user =
      auth.currentUser;

    const profileSnapshot =
      await getDoc(
        doc(
          db,
          "users",
          user.uid
        )
      );

    const profile =
      profileSnapshot.exists()
        ? profileSnapshot.data()
        : {};

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
            profile.name ||
            user.displayName ||
            "عميل",

          customerPhone:
            profile.phone ||
            "",

          from:
            $("#from").value,

          to:
            $("#to").value,

          fromLat:
            fromPlace.lat,

          fromLng:
            fromPlace.lng,

          toLat:
            toPlace.lat,

          toLng:
            toPlace.lng,

          price,

          passengers,

          notes:
            $("#notes").value
              .trim(),

          status:
            "open",

          createdAt:
            serverTimestamp()

        }
      );

    localStorage.setItem(
      "lastRide",
      ride.id
    );

    show("offers");

  };


/* ======================================================
   CUSTOMER OFFERS
====================================================== */

async function loadCustomerOffers() {

  if (!auth.currentUser) {

    $("#offersList").innerHTML =
      `
      <div class="card">
        سجل دخولك أولًا لمتابعة الرحلات.
      </div>
      `;

    return;

  }

  const rideId =
    localStorage.getItem(
      "lastRide"
    );

  if (!rideId) {

    $("#offersList").innerHTML =
      `
      <div class="card">
        لا توجد رحلة حالية.
      </div>
      `;

    return;

  }

  if (unsubscribeOffers) {
    unsubscribeOffers();
  }

  const rideSnapshot =
    await getDoc(
      doc(
        db,
        "rides",
        rideId
      )
    );

  if (!rideSnapshot.exists()) {

    $("#offersList").innerHTML =
      `
      <div class="card">
        الرحلة غير موجودة.
      </div>
      `;

    return;

  }

  const ride =
    rideSnapshot.data();

  $("#offersList").innerHTML =
    `
    <div class="card">

      <b>
        ${escapeHtml(ride.from)}
        →
        ${escapeHtml(ride.to)}
      </b>

      <p class="muted">
        السعر المطلوب:
        ${money(ride.price)}
      </p>

      <p class="muted">
        👥 ${ride.passengers} راكب
      </p>

      ${
        ride.notes
          ? `<p class="muted">📝 ${escapeHtml(ride.notes)}</p>`
          : ""
      }

      <span class="pill">
        ${escapeHtml(ride.status)}
      </span>

    </div>

    <div id="offerCards"></div>
    `;

  const offersQuery =
    query(
      collection(
        db,
        "rides",
        rideId,
        "offers"
      ),
      limit(30)
    );

  unsubscribeOffers =
    onSnapshot(
      offersQuery,
      (snapshot) => {

        const cards =
          snapshot.docs.map(
            (d) => ({
              id: d.id,
              ...d.data()
            })
          );

        cards.sort(
          (a, b) =>
            Number(a.price || 0) -
            Number(b.price || 0)
        );

        $("#offerCards").innerHTML =
          cards.length
            ? cards
                .map(
                  (offer) =>
                    `
                    <div class="card offer">

                      <div>

                        <b>
                          ${escapeHtml(
                            offer.captainName ||
                            "كابتن"
                          )}
                        </b>

                        <div class="muted">

                          ⭐
                          ${escapeHtml(
                            offer.rating ||
                            "جديد"
                          )}

                          •
                          ${escapeHtml(
                            offer.carType ||
                            ""
                          )}

                          •
                          ${escapeHtml(
                            offer.carModel ||
                            "سيارة"
                          )}

                        </div>

                        <div class="muted">

                          🚘
                          ${escapeHtml(
                            offer.plate ||
                            ""
                          )}

                        </div>

                      </div>

                      <div class="price">
                        ${money(
                          offer.price
                        )}
                      </div>

                    </div>

                    <button
                      class="btn green"
                      data-accept="${offer.id}"
                      data-ride="${rideId}"
                    >
                      قبول العرض
                    </button>
                    `
                )
                .join("")
            : `
              <div class="card muted">
                في انتظار عروض الكباتن...
              </div>
              `;

        document
          .querySelectorAll(
            "[data-accept]"
          )
          .forEach(
            (button) => {

              button.onclick =
                () =>
                  acceptOffer(
                    button.dataset.ride,
                    button.dataset.accept
                  );

            }
          );

      }
    );

}


/* ======================================================
   ACCEPT OFFER
====================================================== */

async function acceptOffer(
  rideId,
  offerId
) {

  try {

    const offerSnapshot =
      await getDoc(
        doc(
          db,
          "rides",
          rideId,
          "offers",
          offerId
        )
      );

    if (!offerSnapshot.exists()) {
      return;
    }

    const offer =
      offerSnapshot.data();

    await updateDoc(
      doc(
        db,
        "rides",
        rideId
      ),
      {

        status:
          "accepted",

        acceptedOfferId:
          offerId,

        captainId:
          offer.captainId,

        captainName:
          offer.captainName,

        finalPrice:
          offer.price

      }
    );

    localStorage.setItem(
      "activeRide",
      rideId
    );

    show("trip");

    listenTrip(rideId);

  } catch (error) {

    console.error(error);

    alert(
      "حصل خطأ أثناء قبول العرض."
    );

  }

}


/* ======================================================
   CAPTAIN RIDES
====================================================== */

function loadCaptainRides() {

  if (!auth.currentUser) {

    $("#captainRides").innerHTML =
      `
      <div class="card">
        سجل دخولك أولًا.
      </div>
      `;

    return;

  }

  if (currentRole !== "captain") {

    $("#captainRides").innerHTML =
      `
      <div class="card">
        هذه الصفحة للكابتن فقط.
      </div>
      `;

    return;

  }

  if (unsubscribeRide) {
    unsubscribeRide();
  }

  const ridesQuery =
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
      limit(30)
    );

  unsubscribeRide =
    onSnapshot(
      ridesQuery,
      (snapshot) => {

        const rides =
          snapshot.docs
            .map(
              (d) => ({
                id: d.id,
                ...d.data()
              })
            );

        rides.sort(
          (a, b) => {

            const aTime =
              a.createdAt?.seconds ||
              0;

            const bTime =
              b.createdAt?.seconds ||
              0;

            return bTime - aTime;

          }
        );

        $("#captainRides").innerHTML =
          rides.length
            ? rides
                .map(
                  (ride) =>
                    `
                    <div class="card">

                      <b>
                        ${escapeHtml(
                          ride.from
                        )}
                        →
                        ${escapeHtml(
                          ride.to
                        )}
                      </b>

                      <p class="muted">
                        👥
                        ${ride.passengers}
                        راكب
                      </p>

                      <p class="muted">
                        السعر المقترح:
                        ${money(
                          ride.price
                        )}
                      </p>

                      ${
                        ride.notes
                          ? `
                            <p class="muted">
                              📝
                              ${escapeHtml(
                                ride.notes
                              )}
                            </p>
                          `
                          : ""
                      }

                      <div class="row">

                        <input
                          id="offer-${ride.id}"
                          type="number"
                          min="1"
                          placeholder="اكتب سعرك"
                        />

                        <button
                          class="btn green"
                          data-offer="${ride.id}"
                        >
                          إرسال العرض
                        </button>

                      </div>

                    </div>
                    `
                )
                .join("")
            : `
              <div class="card muted">
                لا توجد رحلات مفتوحة الآن.
              </div>
              `;

        document
          .querySelectorAll(
            "[data-offer]"
          )
          .forEach(
            (button) => {

              button.onclick =
                () =>
                  sendOffer(
                    button.dataset.offer
                  );

            }
          );

      }
    );

}


/* ======================================================
   SEND CAPTAIN OFFER
====================================================== */

async function sendOffer(
  rideId
) {

  const input =
    $(
      "#offer-" +
      rideId
    );

  const price =
    Number(
      input.value
    );

  if (!price) {

    alert(
      "اكتب سعرك."
    );

    return;

  }

  const user =
    auth.currentUser;

  if (!user) {

    show("auth");

    return;

  }

  const profileSnapshot =
    await getDoc(
      doc(
        db,
        "users",
        user.uid
      )
    );

  const profile =
    profileSnapshot.exists()
      ? profileSnapshot.data()
      : {};

  await setDoc(
    doc(
      db,
      "rides",
      rideId,
      "offers",
      user.uid
    ),
    {

      captainId:
        user.uid,

      captainName:
        profile.name ||
        "كابتن",

      captainPhone:
        profile.phone ||
        "",

      carType:
        profile.carType ||
        "",

      carModel:
        profile.carModel ||
        "",

      plate:
        profile.plate ||
        "",

      rating:
        profile.rating ||
        "جديد",

      price,

      createdAt:
        serverTimestamp()

    }
  );

  alert(
    "تم إرسال عرضك للعميل ✅"
  );

}


/* ======================================================
   ACTIVE TRIP
====================================================== */

function listenTrip(
  rideId
) {

  if (unsubscribeRide) {
    unsubscribeRide();
  }

  unsubscribeRide =
    onSnapshot(
      doc(
        db,
        "rides",
        rideId
      ),
      (snapshot) => {

        if (!snapshot.exists()) {
          return;
        }

        const ride =
          snapshot.data();

        $("#tripBox").innerHTML =
          `
          <div class="card">

            <span class="pill">
              ${escapeHtml(
                ride.status
              )}
            </span>

            <h3>
              ${escapeHtml(
                ride.from
              )}
              →
              ${escapeHtml(
                ride.to
              )}
            </h3>

            <p>
              السعر النهائي:
              <b>
                ${money(
                  ride.finalPrice ||
                  ride.price
                )}
              </b>
            </p>

            <p>
              الكابتن:
              <b>
                ${escapeHtml(
                  ride.captainName ||
                  "—"
                )}
              </b>
            </p>

            <button
              class="btn primary"
              onclick="alert('يمكن إضافة الاتصال بالكابتن هنا')"
            >
              📞 الاتصال بالكابتن
            </button>

            <button
              class="btn outline"
              onclick="show('home')"
            >
              العودة للرئيسية
            </button>

          </div>
          `;

      }
    );

}


/* ======================================================
   SAVE PROFILE
====================================================== */

async function saveUserProfile() {

  if (!auth.currentUser) {
    return;
  }

  const user =
    auth.currentUser;

  const role =
    $("#profileRole").value;

  const name =
    $("#profileNameInput")
      .value
      .trim();

  const carType =
    $("#carType")
      .value
      .trim();

  const carModel =
    $("#carModel")
      .value
      .trim();

  const plate =
    $("#plate")
      .value
      .trim();

  if (!name) {

    alert(
      "اكتب الاسم."
    );

    return;

  }

  const data = {

    name,

    role,

    carType:
      role === "captain"
        ? carType
        : "",

    carModel:
      role === "captain"
        ? carModel
        : "",

    plate:
      role === "captain"
        ? plate
        : "",

    updatedAt:
      serverTimestamp()

  };

  await setDoc(
    doc(
      db,
      "users",
      user.uid
    ),
    data,
    {
      merge: true
    }
  );

  await updateProfile(
    user,
    {
      displayName:
        name
    }
  );

  currentRole =
    role;

  $("#profileName").textContent =
    name;

  alert(
    "تم حفظ البيانات ✅"
  );

}

$("#saveProfile").onclick =
  saveUserProfile;


/* ======================================================
   LOGOUT
====================================================== */

$("#logoutBtn").onclick =
  async () => {

    try {

      await signOut(auth);

      localStorage.removeItem(
        "lastRide"
      );

      localStorage.removeItem(
        "activeRide"
      );

      show("auth");

    } catch (error) {

      console.error(error);

    }

  };


/* ======================================================
   AUTH STATE
====================================================== */

onAuthStateChanged(
  auth,
  async (user) => {

    if (!user) {

      $("#authMini").textContent =
        "👤";

      currentRole =
        "customer";

      return;

    }

    $("#authMini").textContent =
      "🟢";

    try {

      const profileSnapshot =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );

      if (
        profileSnapshot.exists()
      ) {

        const profile =
          profileSnapshot.data();

        currentRole =
          profile.role ||
          "customer";

        $("#profileName")
          .textContent =
          profile.name ||
          user.displayName ||
          "مستخدم";

        $("#profileAccount")
          .textContent =
          `رقم الحساب: ${
            profile.accountNumber ||
            "—"
          }`;

        $("#profilePhone")
          .textContent =
          profile.phone ||
          "";

        $("#profileNameInput")
          .value =
          profile.name ||
          "";

        $("#profileRole")
          .value =
          currentRole;

        $("#carType")
          .value =
          profile.carType ||
          "";

        $("#carModel")
          .value =
          profile.carModel ||
          "";

        $("#plate")
          .value =
          profile.plate ||
          "";

      }

    } catch (error) {

      console.error(error);

    }

    const activeRide =
      localStorage.getItem(
        "activeRide"
      );

    if (activeRide) {

      show("trip");

      listenTrip(
        activeRide
      );

    }

  }
);
