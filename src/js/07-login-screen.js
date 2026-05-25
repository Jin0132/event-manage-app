import { appState, authSection } from "./01-config-state-dom.js";

let authLoginBusy = false;

function setAuthStatusLine(text) {
  const el = document.getElementById("authStatusLine");
  if (el) {
    el.textContent = text || "";
  }
}

/** 全画面モーダルがクリックを奪わないよう、hidden とインライン display を確実にリセットする（01 の const に依存しない） */
function resetBlockingOverlays() {
  ["emailAuthModal", "qrModal"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.setAttribute("hidden", "");
    el.hidden = true;
    el.style.removeProperty("display");
  });
  try {
    if (typeof qrCodeInstance !== "undefined" && qrCodeInstance && typeof qrCodeInstance.clear === "function") {
      qrCodeInstance.clear();
    }
  } catch (e) {
    console.warn(e);
  }
  const codeEl = document.getElementById("qrModalCode");
  if (codeEl) {
    codeEl.innerHTML = "";
  }
}

function showAuthSelectionUI() {
  appState.authSessionRoute = "login";
  appState.currentRole = null;
  if (typeof closeEmailAuthModal === "function") {
    closeEmailAuthModal();
  }
  if (typeof showView === "function") {
    showView("login-screen");
  }
  if (typeof teardownWaitingRoom === "function") {
    teardownWaitingRoom();
  }
  if (typeof hideJoinByPasscodeFlow === "function") {
    hideJoinByPasscodeFlow();
  }
  if (typeof hideRoleSelectUI === "function") {
    hideRoleSelectUI();
  }
  updateAppNavigation();
}

function hideAuthSelectionUI() {
  if (authSection) {
    authSection.hidden = true;
    const stage = authSection.closest(".auth-entrance-stage");
    if (stage) {
      stage.hidden = true;
    }
  }
}

function openEmailAuthModal() {
  const modal = document.getElementById("emailAuthModal");
  if (!modal) {
    return;
  }
  if (!modal.hidden) {
    return;
  }
  const status = document.getElementById("emailAuthStatusText");
  if (status) {
    status.textContent = "";
  }
  modal.removeAttribute("hidden");
  modal.hidden = false;
  const input = document.getElementById("emailAuthInput");
  window.requestAnimationFrame(() => {
    input?.focus();
  });
}

function closeEmailAuthModal() {
  const modal = document.getElementById("emailAuthModal");
  if (!modal) {
    return;
  }
  modal.setAttribute("hidden", "");
  modal.hidden = true;
  modal.style.removeProperty("display");
  document.getElementById("emailAuthForm")?.reset();
  const status = document.getElementById("emailAuthStatusText");
  if (status) {
    status.textContent = "";
  }
}

/**
 * #authSection への委譲でログインボタンの click を確実に処理する（子要素の SVG 直撃や参照ズレ対策）
 */
function setupLoginAuthDelegation() {
  const section = document.getElementById("authSection");
  if (!section) {
    setAuthStatusLine("エラー: ログイン画面が見つかりません（#authSection）。");
    return;
  }

  section.addEventListener("click", (event) => {
    const raw = event.target;
    if (!(raw instanceof Element)) {
      return;
    }
    const btn = raw.closest("button");
    if (!btn || !section.contains(btn)) {
      return;
    }

    const bid = btn.id;
    if (bid === "googleSignInPopupButton") {
      event.preventDefault();
      void runDelegatedGoogleLogin();
      return;
    }
    if (bid === "emailAuthOpenButton") {
      event.preventDefault();
      setAuthStatusLine("メールでログインする場合は、下のフォームに入力してください。");
      openEmailAuthModal();
      return;
    }
    if (bid === "anonymousSignInButton") {
      event.preventDefault();
      void runDelegatedAnonymousLogin();
      return;
    }
  });
}

function buildGoogleAuthProvider() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/**
 * まずポップアップ（Edge / Safari のトラッキング防止でリダイレクトが失敗しやすい対策）。
 * ブロック時のみ signInWithRedirect にフォールバック。
 */
async function signInWithGooglePopupOrRedirect() {
  const auth = firebase.auth();
  const provider = buildGoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    const code = e?.code || "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      setAuthStatusLine("ポップアップが使えないため、リダイレクトでログインします…");
      await auth.signInWithRedirect(provider);
      return;
    }
    throw e;
  }
}

async function runDelegatedGoogleLogin() {
  if (authLoginBusy) {
    setAuthStatusLine("処理中です。完了までお待ちください。");
    return;
  }
  authLoginBusy = true;
  setAuthStatusLine("Google ログインを準備しています…");
  try {
    await initializeFirebaseAuthReady();
    setAuthStatusLine("Google のログイン画面を開いています…");
    await signInWithGooglePopupOrRedirect();
    // リダイレクトに落ちた場合は直後にページが遷移し、ここ以降は実行されない。
    await startMainUIIfLoggedIn();
    if (firebase.auth().currentUser) {
      setAuthStatusLine("");
    }
  } catch (error) {
    if (typeof isIgnorableAuthPopupLikeError === "function" && isIgnorableAuthPopupLikeError(error)) {
      setAuthStatusLine("ログインをキャンセルしたか、ブラウザがブロックしました。");
      return;
    }
    console.error("Googleログイン（リダイレクト）エラー:", error);
    const msg = error?.message || String(error);
    setAuthStatusLine(`Google ログインに失敗: ${msg}`);
    window.alert(`Googleログインに失敗しました\n${msg}`);
  } finally {
    authLoginBusy = false;
  }
}

async function runDelegatedAnonymousLogin() {
  if (authLoginBusy) {
    setAuthStatusLine("処理中です。完了までお待ちください。");
    return;
  }
  authLoginBusy = true;
  setAuthStatusLine("お試し利用のログインを実行しています…");
  try {
    await initializeFirebaseAuthReady();
    await firebase.auth().signInAnonymously();
    await startMainUIIfLoggedIn();
    setAuthStatusLine("");
  } catch (error) {
    console.error("お試しログインエラー:", error);
    const msg = error?.message || String(error);
    setAuthStatusLine(`お試しログインに失敗: ${msg}`);
    window.alert(`お試しログインに失敗しました\n${msg}`);
  } finally {
    authLoginBusy = false;
  }
}

function setupEmailAuthUi() {
  const closeBtn = document.getElementById("emailAuthCloseButton");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeEmailAuthModal());
  }
  const modal = document.getElementById("emailAuthModal");
  if (modal) {
    modal.addEventListener("click", (event) => {
      const t = event.target;
      if (t instanceof HTMLElement && t.hasAttribute("data-close-email-modal")) {
        closeEmailAuthModal();
      }
    });
  }
  const form = document.getElementById("emailAuthForm");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const emailInput = document.getElementById("emailAuthInput");
      const passInput = document.getElementById("emailAuthPassword");
      const email = String(emailInput?.value || "").trim();
      const password = String(passInput?.value || "");
      const emailStatus = document.getElementById("emailAuthStatusText");
      if (!email || password.length < 6) {
        if (emailStatus) {
          emailStatus.textContent = "メールとパスワード（6文字以上）を入力してください。";
        }
        return;
      }
      try {
        setAuthStatusLine("メールでログインしています…");
        await initializeFirebaseAuthReady();
        await firebase.auth().signInWithEmailAndPassword(email, password);
        closeEmailAuthModal();
        await startMainUIIfLoggedIn();
        setAuthStatusLine("");
      } catch (error) {
        console.error("メールログインエラー:", error);
        if (emailStatus) {
          emailStatus.textContent = error?.message || "ログインに失敗しました。";
        }
        setAuthStatusLine("メールログインに失敗しました。モーダル内のメッセージを確認してください。");
      }
    });
  }
  const signUpBtn = document.getElementById("emailAuthSignUpButton");
  if (signUpBtn) {
    signUpBtn.addEventListener("click", async () => {
      const emailInput = document.getElementById("emailAuthInput");
      const passInput = document.getElementById("emailAuthPassword");
      const email = String(emailInput?.value || "").trim();
      const password = String(passInput?.value || "");
      const emailStatus = document.getElementById("emailAuthStatusText");
      if (!email || password.length < 6) {
        if (emailStatus) {
          emailStatus.textContent = "メールとパスワード（6文字以上）を入力してください。";
        }
        return;
      }
      try {
        setAuthStatusLine("アカウントを作成しています…");
        await initializeFirebaseAuthReady();
        await firebase.auth().createUserWithEmailAndPassword(email, password);
        closeEmailAuthModal();
        await startMainUIIfLoggedIn();
        setAuthStatusLine("");
      } catch (error) {
        console.error("メール登録エラー:", error);
        if (emailStatus) {
          emailStatus.textContent = error?.message || "登録に失敗しました。";
        }
        setAuthStatusLine("登録に失敗しました。モーダル内のメッセージを確認してください。");
      }
    });
  }
}

async function signInWithGoogleRedirect() {
  const auth = firebase.auth();
  await auth.signInWithRedirect(buildGoogleAuthProvider());
}

function setupGoogleAuthButtons() {
  const redirectBtn = document.getElementById("googleSignInRedirectButton");
  if (redirectBtn) {
    redirectBtn.addEventListener("click", async () => {
      try {
        await initializeFirebaseAuthReady();
        await signInWithGooglePopupOrRedirect();
        await startMainUIIfLoggedIn();
      } catch (error) {
        if (typeof isIgnorableAuthPopupLikeError === "function" && isIgnorableAuthPopupLikeError(error)) {
          setAuthStatusLine("ログインをキャンセルしたか、ブラウザがブロックしました。");
          return;
        }
        console.error("Googleログインエラー:", error);
        window.alert(`Googleログインに失敗しました\n${error?.message || String(error)}`);
      }
    });
  }
}

const LOGIN_SCREEN_EXPORTS = {
  setAuthStatusLine,
  resetBlockingOverlays,
  showAuthSelectionUI,
  hideAuthSelectionUI,
  openEmailAuthModal,
  closeEmailAuthModal,
  setupLoginAuthDelegation,
  buildGoogleAuthProvider,
  signInWithGooglePopupOrRedirect,
  runDelegatedGoogleLogin,
  runDelegatedAnonymousLogin,
  setupEmailAuthUi,
  signInWithGoogleRedirect,
  setupGoogleAuthButtons,
};

Object.assign(window, LOGIN_SCREEN_EXPORTS);

export {
  setAuthStatusLine,
  resetBlockingOverlays,
  showAuthSelectionUI,
  hideAuthSelectionUI,
  openEmailAuthModal,
  closeEmailAuthModal,
  setupLoginAuthDelegation,
  buildGoogleAuthProvider,
  signInWithGooglePopupOrRedirect,
  runDelegatedGoogleLogin,
  runDelegatedAnonymousLogin,
  setupEmailAuthUi,
  signInWithGoogleRedirect,
  setupGoogleAuthButtons,
};

