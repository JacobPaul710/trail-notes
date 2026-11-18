# Hall of Scouts: one-time Firebase setup (about 10 minutes)

Do this once. Nothing in the app works for the Hall until step 6 is done.

1. Go to https://console.firebase.google.com and click **Add project**. Name it "Trail Notes". Turn Google Analytics off. Create.
2. **Build > Firestore Database > Create database.** Choose "Production mode" and a location near you (for example us-west).
3. **Build > Authentication > Get started > Sign-in method > Google > Enable.** Pick your email as the support email, Save.
   Then open **Google** again, expand **Safelist client IDs from external projects**, add this Client ID, and Save:
   `109108295301-jt7ss428tifgbt3dlokr22l5og2va1tg.apps.googleusercontent.com`
   (This lets the Google sign-in the app already uses also sign in to Firebase.)
4. **Authentication > Settings > Authorized domains > Add domain.** Add the address Trail Notes runs from (your GitHub Pages address, for example `yourname.github.io`).
5. **Firestore Database > Rules.** Delete what is there, paste the whole contents of `firebase/firestore.rules`, and click **Publish**.
6. **Project settings (gear icon) > General > Your apps > Web (</>)** and register an app named "Trail Notes". It shows `apiKey` and `projectId`. Paste those two values into `js/config.js`:
   `FIREBASE: { apiKey: "...", projectId: "..." }`
   (These two are public identifiers, not passwords. The rules in step 5 are what protect the data.)
7. Publish the new Trail Notes. Everyone signs in with Google once more (the app now also asks for "openid email", which is only used to tell Firebase who you are).

What gets stored: each scout's username, and their totals (trails, miles, longest run, best day, best month, streak). Nothing else leaves the phone for the Hall: no answers, notes, photos or recordings.
