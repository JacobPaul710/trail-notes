"use strict";
// Google sign-in for Drive sync. The Client ID is public by design (it is not a password).
(self.TN = self.TN || {}).config = {
  CLIENT_ID: "109108295301-jt7ss428tifgbt3dlokr22l5og2va1tg.apps.googleusercontent.com",
  SCOPE: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets openid email",
  FOLDER: "Trail Notes",
  FIREBASE: { apiKey: "AIzaSyDdtEiJuWkG3smJSDR5j6f-IvOUVVTrF70", projectId: "trail-notes-acd6d" },   // Hall of Scouts: paste these two from the Firebase project (see firebase/SETUP.md)
  REPORT_TO: "",   // where "Report a problem" emails go; empty = the person types the address
};
