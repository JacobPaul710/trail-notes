"use strict";
// Google sign-in for Drive sync. The Client ID is public by design (it is not a password).
(self.TN = self.TN || {}).config = {
  CLIENT_ID: "109108295301-jt7ss428tifgbt3dlokr22l5og2va1tg.apps.googleusercontent.com",
  SCOPE: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets",
  FOLDER: "Trail Notes",
};
