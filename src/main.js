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
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";


// ======================================================
// FIREBASE
// ======================================================

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


// ======================================================
// STATE
// ======================================================

let currentUser = null;
let currentRole = "customer";

let selectedPickup = "";
let selectedDestination = "";

let selectedPickupCoords = null;
let selectedDestinationCoords = null;

let recaptcha = null;
let confirmationResult = null;

let unsubscribeCaptainRides = null;


// ======================================================
// HELPERS
// ======================================================

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

  setTimeout(() => {
    box.style.display = "none";
  }, 5000);
}


// ======================================================
// OPEN PHONE MAP
// ======================================================

async function openPhoneMap(type) {

  if (type === "pickup") {

    // محاولة الحصول على موقع الهاتف الحالي
    if ("geolocation" in navigator) {

      navigator.geolocation.getCurrentPosition(
        (position) => {

          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          selectedPickupCoords = {
            lat,
            lng
          };

          selectedPickup =
            `موقعك الحالي (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

          updateLocationFields();

          openMapApp(lat, lng, "موقع الانطلاق");

        },

        () => {

          openMapApp(
            30.5526,
            31.0106,
            "موقع الانطلاق"
          );

        },

        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );

    } else {

      openMapApp(
        30.5526,
        31.0106,
        "موقع الانطلاق"
      );
    }

    return;
  }


  // destination

  const destinationText =
    selectedDestination ||
    "اختر مكان الوصول";

  openMapSearch(destinationText);
}


// ======================================================
// OPEN MAP APP
// ======================================================

function openMapApp(lat, lng, label) {

  const geoUrl =
    `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`;

  const googleUrl =
    `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  try {

    window.location.href = geoUrl;

    setTimeout(() => {
      window.open(googleUrl, "_blank");
    }, 1000);

  } catch (error) {

    window.open(googleUrl, "_blank");
  }
}


// ======================================================
// SEARCH LOCATION ON MAP
// ======================================================

function openMapSearch(text) {

  const queryText =
    text && text !== "اختر مكان الوصول"
      ? text
      : "المنوفية مصر";

  const geoUrl =
    `geo:0,0?q=${encodeURIComponent(queryText)}`;

  const googleUrl =
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`;

  try {

    window.location.href = geoUrl;

    setTimeout(() => {
      window.open(googleUrl, "_blank");
    }, 1000);

  } catch (error) {

    window.open(googleUrl, "_blank");
  }
}


// ======================================================
// LOCATION INPUTS
// ======================================================

function updateLocationFields() {

  const from = $("#fromPlace");
  const to = $("#toPlace");

  if (from) {

    from.innerHTML = `
      <span class="location-icon pickup-icon">📍</span>
      <div>
        <small>موقع الانطلاق</small>
        <strong>
          ${
            selectedPickup ||
            "اضغط لاختيار مكان الانطلاق"
          }
        </strong>
      </div>
    `;
  }

  if (to) {

    to.innerHTML = `
      <span class="location-icon destination-icon">📍</span>
      <div>
        <small>مكان الوصول</small>
        <strong>
          ${
            selectedDestination ||
            "اضغط لاختيار مكان الوصول"
          }
        </strong>
      </div>
    `;
  }
}


// ======================================================
// MAIN HTML
// ======================================================

const appElement = $("#app");

appElement.innerHTML = `

  <div class="app">

    <!-- HEADER -->

    <header class="header">

      <div class="logo">
        🚕
        <span>وصلني المنوفية</span>
      </div>

      <button
        id="profileBtn"
        class="icon-button"
      >
        👤
      </button>

    </header>


    <!-- MESSAGE -->

    <div
      id="messageBox"
      class="message-box"
      style="display:none"
    ></div>


    <!-- HOME -->

    <section
      id="homeScreen"
      class="screen active"
    >

      <div class="welcome">

        <h1>اطلب رحلتك بسهولة</h1>

        <p>
          اختار مكان الانطلاق والوصول
        </p>

      </div>


      <div class="location-card">

        <!-- PICKUP -->

        <button
          id="fromPlace"
          class="location-field"
          type="button"
        >

          <span class="location-icon pickup-icon">
            📍
          </span>

          <div>

            <small>
              موقع الانطلاق
            </small>

            <strong>
              اضغط لاختيار مكان الانطلاق
            </strong>

          </div>

        </button>


        <div class="line"></div>


        <!-- DESTINATION -->

        <button
          id="toPlace"
          class="location-field"
          type="button"
        >

          <span class="location-icon destination-icon">
            📍
          </span>

          <div>

            <small>
              مكان الوصول
            </small>

            <strong>
              اضغط لاختيار مكان الوصول
            </strong>

          </div>

        </button>

      </div>


      <!-- PRICE -->

      <div class="price-card">

        <label>
          سعر الرحلة المقترح
        </label>

        <div class="price-input">

          <input
            id="ridePrice"
            type="number"
            min="0"
            placeholder="مثال: 100"
          />

          <span>
            جنيه
          </span>

        </div>

      </div>


      <!-- REQUEST -->

      <button
        id="requestBtn"
        class="primary-button"
      >
        🚕 اطلب رحلة
      </button>


      <!-- CAPTAIN -->

      <button
        id="captainBtn"
        class="secondary-button"
      >
        🚗 منصة الكباتن
      </button>


    </section>


    <!-- AUTH -->

    <section
      id="authScreen"
      class="screen"
    >

      <div class="auth-card">

        <h2>
          تسجيل الدخول
        </h2>

        <p>
          سجل برقم هاتفك
        </p>


        <input
          id="phone"
          type="tel"
          placeholder="+20xxxxxxxxxx"
          class="text-input"
        />


        <div id="recaptcha"></div>


        <button
          id="sendCodeBtn"
          class="primary-button"
        >
          إرسال الكود
        </button>


        <div
          id="codeSection"
          style="display:none"
        >

          <input
            id="verificationCode"
            type="number"
            placeholder="كود التحقق"
            class="text-input"
          />


          <button
            id="verifyCodeBtn"
            class="primary-button"
          >
            تأكيد الكود
          </button>

        </div>


        <div
          id="authMsg"
          class="auth-message"
        ></div>

      </div>

    </section>


    <!-- CAPTAIN -->

    <section
      id="captainScreen"
      class="screen"
    >

      <div class="captain-header">

        <button
          id="backHomeBtn"
          class="back-button"
        >
          ←
        </button>

        <h2>
          منصة الكباتن
        </h2>

      </div>


      <div
        id="captainRides"
        class="rides-list"
      >

        <div class="empty-state">
          لا توجد رحلات حالياً
        </div>

      </div>

    </section>


    <!-- PROFILE -->

    <section
      id="profileScreen"
      class="screen"
    >

      <div class="profile-card">

        <h2>
          حسابي
        </h2>

        <div id="profileInfo">
          غير مسجل
        </div>

        <button
          id="logoutBtn"
          class="secondary-button"
        >
          تسجيل الخروج
        </button>

      </div>

    </section>

  </div>
`;


// ======================================================
// SCREEN NAVIGATION
// ======================================================

function showScreen(screenId) {

  document
    .querySelectorAll(".screen")
    .forEach(screen => {
      screen.classList.remove("active");
    });

  const screen = $(`#${screenId}`);

  if (screen) {
    screen.classList.add("active");
  }
}


// ======================================================
// PICKUP BUTTON
// ======================================================

$("#fromPlace").addEventListener("click", () => {

  openPhoneMap("pickup");

});


// ======================================================
// DESTINATION BUTTON
// ======================================================

$("#toPlace").addEventListener("click", () => {

  openPhoneMap("destination");

});


// ======================================================
// PROFILE
// ======================================================

$("#profileBtn").addEventListener("click", () => {

  if (!currentUser) {

    showScreen("authScreen");

    setupRecaptcha();

    return;
  }

  showScreen("profileScreen");

});


// ======================================================
// CAPTAIN SCREEN
// ======================================================

$("#captainBtn").addEventListener("click", () => {

  if (!currentUser) {

    showScreen("authScreen");

    setupRecaptcha();

    return;
  }

  showScreen("captainScreen");

  loadCaptainRides();

});


// ======================================================
// BACK HOME
// ======================================================

$("#backHomeBtn").addEventListener("click", () => {

  showScreen("homeScreen");

});


// ======================================================
// RECAPTCHA
// ======================================================

function setupRecaptcha() {

  if (recaptcha) return;

  try {

    recaptcha = new RecaptchaVerifier(
      auth,
      "recaptcha",
      {
        size: "normal"
      }
    );

    recaptcha.render();

  } catch (error) {

    console.error(
      "reCAPTCHA error:",
      error
    );

    $("#authMsg").textContent =
      "تعذر تشغيل التحقق. حاول مرة أخرى.";

  }
}


// ======================================================
// SEND PHONE CODE
// ======================================================

$("#sendCodeBtn").addEventListener(
  "click",
  async () => {

    const phone =
      $("#phone").value.trim();

    if (!phone) {

      $("#authMsg").textContent =
        "اكتب رقم الهاتف أولاً.";

      return;
    }


    if (!phone.startsWith("+")) {

      $("#authMsg").textContent =
        "اكتب الرقم بصيغة دولية، مثال: +201xxxxxxxxx";

      return;
    }


    try {

      setupRecaptcha();

      $("#sendCodeBtn").disabled = true;

      $("#authMsg").textContent =
        "جاري إرسال الكود...";


      confirmationResult =
        await signInWithPhoneNumber(
          auth,
          phone,
          recaptcha
        );


      $("#codeSection").style.display =
        "block";


      $("#authMsg").textContent =
        "تم إرسال كود التحقق.";

    } catch (error) {

      console.error(error);

      $("#authMsg").textContent =
        error.message ||
        "حدث خطأ أثناء إرسال الكود.";

      $("#sendCodeBtn").disabled =
        false;
    }

  }
);


// ======================================================
// VERIFY CODE
// ======================================================

$("#verifyCodeBtn").addEventListener(
  "click",
  async () => {

    const code =
      $("#verificationCode").value.trim();

    if (!confirmationResult) {

      $("#authMsg").textContent =
        "اطلب كود التحقق أولاً.";

      return;
    }


    if (!code) {

      $("#authMsg").textContent =
        "اكتب كود التحقق.";

      return;
    }


    try {

      await confirmationResult.confirm(code);

      $("#authMsg").textContent =
        "تم تسجيل الدخول بنجاح.";

      showScreen("homeScreen");

    } catch (error) {

      console.error(error);

      $("#authMsg").textContent =
        error.message ||
        "كود التحقق غير صحيح.";

    }

  }
);


// ======================================================
// REQUEST RIDE
// ======================================================

$("#requestBtn").addEventListener(
  "click",
  async () => {

    if (!currentUser) {

      showScreen("authScreen");

      setupRecaptcha();

      return;
    }


    if (!selectedPickup) {

      showMessage(
        "اختار مكان الانطلاق أولاً.",
        "error"
      );

      return;
    }


    if (!selectedDestination) {

      showMessage(
        "اختار مكان الوصول أولاً.",
        "error"
      );

      return;
    }


    const price =
      Number($("#ridePrice").value);


    if (!price || price <= 0) {

      showMessage(
        "اكتب سعر الرحلة.",
        "error"
      );

      return;
    }


    try {

      $("#requestBtn").disabled =
        true;

      $("#requestBtn").textContent =
        "جاري إرسال الطلب...";


      const ride = {

        userId: currentUser.uid,

        fromPlace:
          selectedPickup,

        toPlace:
          selectedDestination,

        pickupCoords:
          selectedPickupCoords,

        destinationCoords:
          selectedDestinationCoords,

        price,

        status:
          "open",

        createdAt:
          serverTimestamp()

      };


      const rideRef =
        await addDoc(
          collection(db, "rides"),
          ride
        );


      localStorage.setItem(
        "lastRide",
        JSON.stringify({
          id: rideRef.id,
          ...ride
        })
      );


      showMessage(
        "تم إرسال الرحلة للكباتن بنجاح 🚕",
        "success"
      );


      $("#ridePrice").value = "";


      setTimeout(() => {

        $("#requestBtn").disabled =
          false;

        $("#requestBtn").textContent =
          "🚕 اطلب رحلة";

      }, 1000);


    } catch (error) {

      console.error(error);

      showMessage(
        error.message ||
        "حدث خطأ أثناء إرسال الرحلة.",
        "error"
      );


      $("#requestBtn").disabled =
        false;

      $("#requestBtn").textContent =
        "🚕 اطلب رحلة";
    }

  }
);


// ======================================================
// LOAD CAPTAIN RIDES
// ======================================================

function loadCaptainRides() {

  const container =
    $("#captainRides");

  if (!currentUser) {

    container.innerHTML = `
      <div class="empty-state">
        سجل الدخول أولاً
      </div>
    `;

    return;
  }


  if (
    unsubscribeCaptainRides
  ) {

    unsubscribeCaptainRides();

    unsubscribeCaptainRides =
      null;
  }


  const ridesQuery = query(
    collection(db, "rides"),
    where("status", "==", "open"),
    orderBy("createdAt", "desc"),
    limit(50)
  );


  unsubscribeCaptainRides =
    onSnapshot(

      ridesQuery,

      (snapshot) => {

        if (snapshot.empty) {

          container.innerHTML = `
            <div class="empty-state">
              لا توجد رحلات مفتوحة حالياً
            </div>
          `;

          return;
        }


        container.innerHTML = "";


        snapshot.forEach(
          (rideDoc) => {

            const ride =
              rideDoc.data();


            const card =
              document.createElement("div");

            card.className =
              "ride-card";


            card.innerHTML = `

              <div class="ride-title">
                🚕 رحلة جديدة
              </div>

              <div class="ride-location">
                📍 من:
                <strong>
                  ${escapeHtml(
                    ride.fromPlace ||
                    "غير محدد"
                  )}
                </strong>
              </div>

              <div class="ride-location">
                🏁 إلى:
                <strong>
                  ${escapeHtml(
                    ride.toPlace ||
                    "غير محدد"
                  )}
                </strong>
              </div>

              <div class="ride-price">
                💰 السعر المقترح:
                <strong>
                  ${ride.price || 0} جنيه
                </strong>
              </div>

              <button
                class="offer-button"
                data-id="${rideDoc.id}"
                data-price="${ride.price || 0}"
              >
                تقديم عرض
              </button>

            `;


            container.appendChild(card);

          }
        );


        container
          .querySelectorAll(".offer-button")
          .forEach(button => {

            button.addEventListener(
              "click",
              () => {

                sendOffer(
                  button.dataset.id,
                  Number(
                    button.dataset.price
                  )
                );

              }
            );

          });

      },

      (error) => {

        console.error(error);

        container.innerHTML = `

          <div class="empty-state error">
            تعذر تحميل الرحلات
            <br><br>
            ${escapeHtml(
              error.message
            )}
          </div>

        `;
      }

    );

}


// ======================================================
// SEND CAPTAIN OFFER
// ======================================================

async function sendOffer(
  rideId,
  originalPrice
) {

  if (!currentUser) {

    showScreen("authScreen");

    setupRecaptcha();

    return;
  }


  const offerPrice =
    prompt(
      `سعر الرحلة المقترح ${originalPrice} جنيه\nاكتب عرضك:`
    );


  if (!offerPrice) return;


  const price =
    Number(offerPrice);


  if (!price || price <= 0) {

    showMessage(
      "اكتب سعر صحيح.",
      "error"
    );

    return;
  }


  try {

    await addDoc(
      collection(
        db,
        "rides",
        rideId,
        "offers"
      ),
      {

        captainId:
          currentUser.uid,

        price,

        createdAt:
          serverTimestamp(),

        status:
          "pending"

      }
    );


    showMessage(
      "تم إرسال عرضك للعميل.",
      "success"
    );


  } catch (error) {

    console.error(error);

    showMessage(
      error.message ||
      "تعذر إرسال العرض.",
      "error"
    );
  }

}


// ======================================================
// PROFILE
// ======================================================

async function loadProfile() {

  if (!currentUser) return;


  try {

    const userRef =
      doc(
        db,
        "users",
        currentUser.uid
      );


    const userSnap =
      await getDoc(userRef);


    if (userSnap.exists()) {

      const data =
        userSnap.data();


      currentRole =
        data.role ||
        "customer";


      $("#profileInfo").innerHTML = `

        <div>
          📱 ${escapeHtml(
            currentUser.phoneNumber ||
            ""
          )}
        </div>

        <div>
          👤 النوع:
          ${
            currentRole === "captain"
              ? "كابتن"
              : "عميل"
          }
        </div>

      `;

    } else {

      await setDoc(
        userRef,
        {

          uid:
            currentUser.uid,

          phone:
            currentUser.phoneNumber ||
            "",

          role:
            "customer",

          createdAt:
            serverTimestamp()

        }
      );


      currentRole =
        "customer";


      $("#profileInfo").textContent =
        "تم إنشاء حسابك بنجاح.";
    }


  } catch (error) {

    console.error(error);

    $("#profileInfo").textContent =
      "تعذر تحميل الحساب.";

  }

}


// ======================================================
// AUTH STATE
// ======================================================

onAuthStateChanged(
  auth,
  async (user) => {

    currentUser = user;


    if (user) {

      await loadProfile();

      console.log(
        "Logged in:",
        user.phoneNumber
      );

    } else {

      currentRole =
        "customer";

      $("#profileInfo").textContent =
        "غير مسجل";

    }

  }
);


// ======================================================
// LOGOUT
// ======================================================

$("#logoutBtn").addEventListener(
  "click",
  async () => {

    try {

      await signOut(auth);

      currentUser = null;

      showMessage(
        "تم تسجيل الخروج.",
        "success"
      );

      showScreen("homeScreen");

    } catch (error) {

      console.error(error);

      showMessage(
        "تعذر تسجيل الخروج.",
        "error"
      );
    }

  }
);


// ======================================================
// INITIAL LOCATION UI
// ======================================================

updateLocationFields();


// ======================================================
// START
// ======================================================

console.log(
  "وصلني المنوفية يعمل بنجاح 🚕"
);
