# وصلني المنوفية — Android Ready

المشروع مجهز ليتم تحويله إلى تطبيق Android باستخدام Capacitor.

## على الكمبيوتر
```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```
ثم من Android Studio اختر Build > Generate App Bundle / APK.

## على الهاتف فقط
يمكن تشغيل أوامر Node/Capacitor من بيئة مثل Termux، لكن بناء APK يحتاج Android SDK وJava/Gradle مثبتين.

## هوية التطبيق
- الاسم: وصلني المنوفية
- Package ID: com.wasselni.monufia.app

## الخرائط
هذه النسخة تستخدم OpenStreetMap + Nominatim + OSRM، ولا تحتاج Google Maps API key للجزء الخاص بالخريطة. راجع سياسات الاستخدام للخدمات العامة قبل الإطلاق التجاري.
