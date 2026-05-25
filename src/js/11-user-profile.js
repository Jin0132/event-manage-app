/* プロフィール初期設定・アカウント設定（Storage / Auth / users コレクション） */
import {
  appState,
  userProfileAvatarInput,
  userProfilePreviewWrap,
  userProfilePreviewImg,
  userProfileTitle,
  userProfileLead,
  userProfileSubmitButton,
  userProfileNameInput,
  userProfileStatusLine,
  accountAvatarImg,
  userProfileForm,
  accountSettingsSection,
  menuAccountSettings,
  menuNotificationSettings,
  menuLogout,
  storage,
} from "./01-config-state-dom.js";
import { showView, refreshAuthEntranceStages } from "./02-ui-common.js";
import { ensureReadyForFirestoreWrite, initializeFirebaseAuthReady, optimizeImageForSpark } from "./04-firebase-data.js";
import { showToast } from "./02-invite-nav-auth-ui.js";
import { hideAuthSelectionUI } from "./07-login-screen.js";
import { handleLogoutAndReturnToLogin, showRoleSelectUI } from "./01-auth.js";
import { updateAppNavigation } from "./02-invite-nav-auth-ui.js";

let userProfilePendingFile = null;

function isUserProfileComplete(user) {
  if (!user) {
    return false;
  }
  const name = String(user.displayName || "").trim();
  const photo = String(user.photoURL || "").trim();
  return name.length > 0 && photo.length > 0;
}

async function syncUserDocFromAuth(user) {
  await ensureReadyForFirestoreWrite();
  const u = user;
  await db
    .collection("users")
    .doc(u.uid)
    .set(
      {
        displayName: u.displayName || "",
        photoURL: u.photoURL || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

/**
 * プロフィール未完了なら初期設定画面へ。完了なら Firestore を同期して false。
 * @returns {Promise<boolean>} true = ここで打ち切り（初期設定を表示中）
 */
async function applyUserProfileGate(user) {
  if (!user) {
    return false;
  }
  try {
    await user.reload();
  } catch (e) {
    console.warn("user.reload", e);
  }
  const u = firebase.auth().currentUser;
  if (!u) {
    return false;
  }
  if (isUserProfileComplete(u)) {
    try {
      await syncUserDocFromAuth(u);
    } catch (e) {
      console.warn("syncUserDocFromAuth", e);
    }
    return false;
  }
  appState.authSessionRoute = "profile_setup";
  openUserProfilePanel({ mode: "initial" });
  if (typeof showView === "function") {
    showView("profile-setup");
  }
  if (typeof updateAppNavigation === "function") {
    updateAppNavigation();
  }
  return true;
}

async function assertProfileCompleteForMainFlow() {
  await initializeFirebaseAuthReady();
  const u = firebase.auth().currentUser;
  if (!u) {
    return;
  }
  try {
    await u.reload();
  } catch (e) {
    console.warn(e);
  }
  const cu = firebase.auth().currentUser;
  if (!cu || isUserProfileComplete(cu)) {
    return;
  }
  openUserProfilePanel({ mode: "initial" });
  if (typeof showView === "function") {
    showView("profile-setup");
  }
  if (typeof updateAppNavigation === "function") {
    updateAppNavigation();
  }
  throw new Error("profile_incomplete");
}

function resetUserProfilePreview() {
  userProfilePendingFile = null;
  if (userProfileAvatarInput) {
    userProfileAvatarInput.value = "";
  }
  if (userProfilePreviewWrap) {
    userProfilePreviewWrap.hidden = true;
  }
  if (userProfilePreviewImg) {
    userProfilePreviewImg.removeAttribute("src");
  }
}

function openUserProfilePanel(options) {
  const mode = options && options.mode === "settings" ? "settings" : "initial";
  const u = firebase.auth().currentUser;
  if (userProfileTitle) {
    userProfileTitle.textContent =
      mode === "settings" ? "アカウント設定" : "プロフィールを設定";
  }
  if (userProfileLead) {
    userProfileLead.textContent =
      mode === "settings"
        ? "表示名とアイコン画像を変更できます。"
        : "表示名とアイコンを設定してください。完了するまでアプリのメイン機能は利用できません。";
  }
  if (userProfileSubmitButton) {
    userProfileSubmitButton.textContent = mode === "settings" ? "保存" : "保存して次へ";
  }
  resetUserProfilePreview();
  if (userProfileNameInput) {
    userProfileNameInput.value = u ? String(u.displayName || "").trim() : "";
  }
  if (u && u.photoURL && userProfilePreviewWrap && userProfilePreviewImg) {
    userProfilePreviewImg.referrerPolicy = "no-referrer";
    userProfilePreviewImg.src = u.photoURL;
    userProfilePreviewWrap.hidden = false;
  }
  if (userProfileStatusLine) {
    userProfileStatusLine.textContent = "";
  }
  if (accountSettingsSection) {
    accountSettingsSection.hidden = true;
  }
  if (userProfileForm) {
    userProfileForm.hidden = false;
  }
  if (mode === "settings" && typeof showView === "function") {
    showView("account-profile-edit");
  }
}

function applyAccountSettingsMenuChrome() {
  if (userProfileTitle) {
    userProfileTitle.textContent = "設定";
  }
  if (userProfileLead) {
    userProfileLead.textContent = "項目を選択してください。";
  }
}

function openAccountSettingsFromMenu() {
  const u = firebase.auth().currentUser;
  if (!u) {
    return;
  }
  appState.viewBeforeAccountSettings = appState.visibleAppView || "host-dashboard";
  applyAccountSettingsMenuChrome();
  if (accountSettingsSection) {
    accountSettingsSection.hidden = false;
  }
  if (userProfileForm) {
    userProfileForm.hidden = true;
  }
  if (userProfileStatusLine) {
    userProfileStatusLine.textContent = "";
  }
  if (typeof showView === "function") {
    showView("account-settings");
  }
  if (typeof updateAppNavigation === "function") {
    updateAppNavigation();
  }
  if (typeof refreshAuthEntranceStages === "function") {
    refreshAuthEntranceStages();
  }
}

function closeAccountSettingsToPreviousView() {
  const back = appState.viewBeforeAccountSettings || "host-dashboard";
  appState.viewBeforeAccountSettings = "";
  if (typeof showView === "function") {
    showView(back);
  }
  if (typeof updateAppNavigation === "function") {
    updateAppNavigation();
  }
}

function setupAccountSettingsListHandlers() {
  if (menuAccountSettings && !menuAccountSettings.dataset.bound) {
    menuAccountSettings.dataset.bound = "1";
    menuAccountSettings.addEventListener("click", () => {
      openUserProfilePanel({ mode: "settings" });
    });
  }
  if (menuNotificationSettings && !menuNotificationSettings.dataset.bound) {
    menuNotificationSettings.dataset.bound = "1";
    menuNotificationSettings.addEventListener("click", () => {
      if (typeof showToast === "function") {
        showToast("通知設定は準備中です。");
      } else {
        window.alert("通知設定は準備中です。");
      }
    });
  }
  if (menuLogout && !menuLogout.dataset.bound) {
    menuLogout.dataset.bound = "1";
    menuLogout.addEventListener("click", () => {
      const ok = window.confirm("ログアウトしますか？");
      if (!ok) {
        return;
      }
      void handleLogoutAndReturnToLogin();
    });
  }
}

async function saveUserProfileFromForm(event) {
  if (event) {
    event.preventDefault();
  }
  const mode =
    appState.visibleAppView === "account-settings" ||
    appState.visibleAppView === "account-profile-edit"
      ? "settings"
      : "initial";
  await initializeFirebaseAuthReady();
  const u = firebase.auth().currentUser;
  if (!u) {
    return;
  }
  const displayName = String(userProfileNameInput?.value || "").trim();
  if (!displayName) {
    if (userProfileStatusLine) {
      userProfileStatusLine.textContent = "表示名を入力してください。";
    }
    return;
  }

  let photoURL = String(u.photoURL || "").trim();
  const file = userProfilePendingFile;
  if (file) {
    try {
      if (userProfileStatusLine) {
        userProfileStatusLine.textContent = "画像をアップロードしています…";
      }
      const optimized = await optimizeImageForSpark(file);
      const uid = u.uid;
      const storagePath = `users/${uid}/profile/avatar.${optimized.ext}`;
      const storageRef = storage.ref(storagePath);
      await storageRef.put(optimized.blob, {
        contentType: "image/jpeg",
      });
      photoURL = await storageRef.getDownloadURL();
    } catch (e) {
      console.error(e);
      if (userProfileStatusLine) {
        userProfileStatusLine.textContent = `画像の保存に失敗しました: ${e?.message || String(e)}`;
      }
      return;
    }
  } else if (!photoURL) {
    if (userProfileStatusLine) {
      userProfileStatusLine.textContent = "アイコン用の画像を選択してください。";
    }
    return;
  }

  try {
    if (userProfileStatusLine) {
      userProfileStatusLine.textContent = "プロフィールを保存しています…";
    }
    await u.updateProfile({ displayName, photoURL });
    await u.reload();
    await syncUserDocFromAuth(firebase.auth().currentUser);
    if (accountAvatarImg && firebase.auth().currentUser?.photoURL) {
      accountAvatarImg.referrerPolicy = "no-referrer";
      accountAvatarImg.src = firebase.auth().currentUser.photoURL;
    }
    if (userProfileStatusLine) {
      userProfileStatusLine.textContent =
        mode === "settings" ? "保存しました。" : "保存しました。次の画面へ進みます。";
    }
    userProfilePendingFile = null;
    if (mode === "settings") {
      if (typeof showToast === "function") {
        showToast("アカウント情報を保存しました。");
      }
      closeAccountSettingsToPreviousView();
    } else {
      appState.authSessionRoute = "role_select";
      if (typeof hideAuthSelectionUI === "function") {
        hideAuthSelectionUI();
      }
      if (typeof showRoleSelectUI === "function") {
        showRoleSelectUI();
      }
    }
  } catch (e) {
    console.error(e);
    if (userProfileStatusLine) {
      userProfileStatusLine.textContent = `保存に失敗しました: ${e?.message || String(e)}`;
    }
  }
}

function setupUserProfileForm() {
  if (!userProfileForm || userProfileForm.dataset.profileBound) {
    return;
  }
  userProfileForm.dataset.profileBound = "1";
  userProfileAvatarInput?.addEventListener("change", () => {
    const input = userProfileAvatarInput;
    if (!input || !input.files || !input.files[0]) {
      userProfilePendingFile = null;
      const u = firebase.auth().currentUser;
      if (u && u.photoURL && userProfilePreviewWrap && userProfilePreviewImg) {
        userProfilePreviewImg.referrerPolicy = "no-referrer";
        userProfilePreviewImg.src = u.photoURL;
        userProfilePreviewWrap.hidden = false;
      } else if (userProfilePreviewWrap) {
        userProfilePreviewWrap.hidden = true;
      }
      return;
    }
    const file = input.files[0];
    if (!file.type.startsWith("image/")) {
      if (userProfileStatusLine) {
        userProfileStatusLine.textContent = "画像ファイルを選んでください。";
      }
      return;
    }
    userProfilePendingFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      if (userProfilePreviewImg && reader.result) {
        userProfilePreviewImg.src = String(reader.result);
        if (userProfilePreviewWrap) {
          userProfilePreviewWrap.hidden = false;
        }
      }
    };
    reader.readAsDataURL(file);
  });
  userProfileForm.addEventListener("submit", (e) => {
    void saveUserProfileFromForm(e);
  });
  setupAccountSettingsListHandlers();
}

const USER_PROFILE_EXPORTS = {
  isUserProfileComplete,
  syncUserDocFromAuth,
  applyUserProfileGate,
  assertProfileCompleteForMainFlow,
  resetUserProfilePreview,
  openUserProfilePanel,
  applyAccountSettingsMenuChrome,
  openAccountSettingsFromMenu,
  closeAccountSettingsToPreviousView,
  setupAccountSettingsListHandlers,
  saveUserProfileFromForm,
  setupUserProfileForm,
};

Object.assign(window, USER_PROFILE_EXPORTS);

export {
  isUserProfileComplete,
  syncUserDocFromAuth,
  applyUserProfileGate,
  assertProfileCompleteForMainFlow,
  resetUserProfilePreview,
  openUserProfilePanel,
  applyAccountSettingsMenuChrome,
  openAccountSettingsFromMenu,
  closeAccountSettingsToPreviousView,
  setupAccountSettingsListHandlers,
  saveUserProfileFromForm,
  setupUserProfileForm,
};
