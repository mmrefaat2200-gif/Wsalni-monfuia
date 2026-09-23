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

let map = null;
let destinationMarker = null;

let mapMode = "destination";

let googleMapsPromise = null;


// ======================================================
// HELPERS
// ======================================================

const $ = (selector) =>
  document.querySelector(selector);


function escapeHtml(value = "") {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function showMessage(
  message,
  type = "info"
) {

  const box =
    $("#messageBox");

  if (!box) return;

  box.textContent =
    message;

  box.className =
    `message-box ${type}`;

  box.style.display =
    "block";

  clearTimeout(
    window.__messageTimer
  );

  window.__messageTimer =
    setTimeout(() => {

      box.style.display =
        "none";

    }, 5000);

}


// ======================================================
// LOAD GOOGLE MAPS
// ======================================================

function loadGoogleMaps() {

  if (
    typeof window.google !== "undefined" &&
    window.google.maps
  ) {

    return Promise.resolve(
      window.google
    );

  }


  if (googleMapsPromise) {

    return googleMapsPromise;

  }


  googleMapsPromise =
    new Promise(
      (resolve, reject) => {

        const existing =
          document.getElementById(
            "google-maps-script"
          );


        if (existing) {

          const checkLoaded =
            setInterval(() => {

              if (
                typeof window.google !== "undefined" &&
                window.google.maps
              ) {

                clearInterval(
                  checkLoaded
                );

                resolve(
                  window.google
                );

              }

            }, 100);


          setTimeout(() => {

            clearInterval(
              checkLoaded
            );

            if (
              !window.google ||
              !window.google.maps
            ) {

              reject(
                new Error(
                  "Google Maps لم يتم تحميلها"
                )
              );

            }

          }, 15000);


          return;

        }


        const apiKey =
          import.meta.env
            .
