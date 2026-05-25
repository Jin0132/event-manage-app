import {
  createEventForm,
  createPasscodeLimitCheckbox,
  createPasscodeFieldsWrap,
  createPasscodeInput,
  createTitleInput,
  createDateInput,
  createLocationInput,
  createLocationUrlInput,
  createPremiumInput,
  createMaxParticipantsInput,
  createAnswerDeadlineInput,
  createPrivateListCheckbox,
  createRequireApprovalCheckbox,
  createStatusText,
  appState,
} from "./01-config-state-dom.js";

const CREATE_PASSCODE_PATTERN = /^[a-zA-Z0-9]{4,12}$/;

function formatDateTimeLocalToJapaneseDateText(value) {
  const v = String(value || "").trim();
  if (!v) {
    return "";
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    return v;
  }
  const lang = typeof getCurrentAppLanguage === "function" ? getCurrentAppLanguage() : "ja";
  if (lang === "en") {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  }
  const wdays = ["日", "月", "火", "水", "木", "金", "土"];
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const wd = wdays[d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}年${mo}月${day}日（${wd}） ${hh}:${mm}`;
}

function syncCreatePasscodeFieldsVisibility() {
  const on = !!(createPasscodeLimitCheckbox && createPasscodeLimitCheckbox.checked);
  if (createPasscodeFieldsWrap) {
    createPasscodeFieldsWrap.hidden = !on;
  }
  if (createPasscodeInput) {
    createPasscodeInput.required = on;
    if (!on) {
      createPasscodeInput.value = "";
    }
  }
}

function setupCreatePasscodeToggle() {
  if (createPasscodeLimitCheckbox && !createPasscodeLimitCheckbox.dataset.bound) {
    createPasscodeLimitCheckbox.dataset.bound = "1";
    createPasscodeLimitCheckbox.addEventListener("change", () => {
      syncCreatePasscodeFieldsVisibility();
    });
  }
  syncCreatePasscodeFieldsVisibility();
}

export function setupCreateForm() {
  if (!createEventForm) {
    return;
  }
  setupCreatePasscodeToggle();
  const createSubmitButton = createEventForm.querySelector('button[type="submit"]');
  const createSubmitDefaultLabel = createSubmitButton
    ? String(createSubmitButton.textContent || "作成")
    : "作成";
  createEventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (createSubmitButton?.disabled) {
      return;
    }
    const title = String(createTitleInput.value || "").trim();
    const rawLocal = String(createDateInput.value || "").trim();
    const dateText = formatDateTimeLocalToJapaneseDateText(rawLocal);
    const location = String(createLocationInput.value || "").trim();
    const locationUrlRaw = String(createLocationUrlInput?.value || "").trim();
    let locationUrl = "";
    if (locationUrlRaw) {
      try {
        const parsed = new URL(locationUrlRaw);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          locationUrl = parsed.toString();
        } else {
          createStatusText.textContent = "場所URLは http:// または https:// で入力してください。";
          return;
        }
      } catch (e) {
        createStatusText.textContent = "場所URLの形式が不正です。";
        return;
      }
    }
    const usePasscode = !!(createPasscodeLimitCheckbox && createPasscodeLimitCheckbox.checked);
    const passcode = usePasscode
      ? String(createPasscodeInput && createPasscodeInput.value ? createPasscodeInput.value : "").trim()
      : "";
    const isPremium = isPremiumFeaturesEnabled() ? !!createPremiumInput.checked : false;
    const maxRaw = String(createMaxParticipantsInput?.value || "").trim();
    let maxParticipants = null;
    if (maxRaw !== "") {
      const n = parseInt(maxRaw, 10);
      if (Number.isNaN(n) || n < 1) {
        createStatusText.textContent = "定員は1以上の整数で入力するか、空欄にしてください。";
        return;
      }
      maxParticipants = Math.min(99999, n);
    }
    const rawDeadline = String(createAnswerDeadlineInput?.value || "").trim();
    let answerDeadlineTs = null;
    if (rawDeadline) {
      const ddl = new Date(rawDeadline);
      if (Number.isNaN(ddl.getTime())) {
        createStatusText.textContent = "回答期限の日時が不正です。";
        return;
      }
      answerDeadlineTs = firebase.firestore.Timestamp.fromDate(ddl);
    }
    const isPrivateList = !!(createPrivateListCheckbox && createPrivateListCheckbox.checked);
    const requireApproval = !!(
      createRequireApprovalCheckbox && createRequireApprovalCheckbox.checked
    );
    if (!title || !rawLocal || !location) {
      createStatusText.textContent = "イベント名・日時・場所を入力してください。";
      return;
    }
    if (usePasscode) {
      if (!CREATE_PASSCODE_PATTERN.test(passcode)) {
        createStatusText.textContent = "パスコードは4〜12桁の英数字で入力してください。";
        return;
      }
    }
    await initializeFirebaseAuthReady();
    const authUser = firebase.auth().currentUser;
    const authUid = authUser && authUser.uid ? String(authUser.uid) : "";
    if (!authUid) {
      createStatusText.textContent = "ログインが必要です。";
      return;
    }
    if (createSubmitButton) {
      createSubmitButton.disabled = true;
      createSubmitButton.textContent = "作成中...";
    }
    try {
      await ensureReadyForFirestoreWrite();
      createStatusText.textContent = "イベント作成中...";
      const hostName = String(
        (authUser && (authUser.displayName || authUser.email || "").trim()) || ""
      );
      const payload = {
        title,
        dateText,
        location,
        location_url: locationUrl,
        passcode,
        host_name: hostName,
        is_active: true,
        is_dissolved: false,
        is_premium: isPremium,
        max_participants: maxParticipants,
        answer_deadline: answerDeadlineTs,
        is_private_list: isPrivateList,
        require_approval: requireApproval,
        organizerId: authUid,
        organizer_uid: authUid,
        organizer_auth_uid: authUid,
        dissolved_at: null,
        will_delete_at: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      const newEventRef = await db.collection("events").add(payload);
      try {
        const url = getEventInviteUrl(newEventRef.id);
        await copyToClipboard(url);
        showToast("招待リンクをコピーしました！");
        if (passcode) {
          createStatusText.innerHTML =
            "作成完了！<strong>参加用パスコード: " +
            escapeHtml(passcode) +
            "</strong><br>このURLをメンバーに共有してください。<br><code>" +
            escapeHtml(url) +
            "</code>";
        } else {
          createStatusText.innerHTML =
            "作成完了！<strong>オープンなイベント</strong>です（パスコードなし）。<br>このURLをメンバーに共有してください。<br><code>" +
            escapeHtml(url) +
            "</code>";
        }
      } catch (error) {
        console.error("作成直後の招待リンクコピーエラー:", error);
        createStatusText.textContent =
          "イベントを作成しました。このページのURLをメンバーに共有してください。";
      }
      window.setTimeout(async () => {
        appState.eventId = newEventRef.id;
        appState.pendingEventIdFromUrl = "";
        appState.appShellEntered = false;
        appState.currentRole = "host";
        appState.authSessionRoute = "event_page";
        appState.participantAccessMode = "not_joined";
        const path = window.location.pathname || "/";
        window.history.replaceState(
          {},
          "",
          `${path}?eventId=${encodeURIComponent(newEventRef.id)}`
        );
        appState.organizerQuickJoinAfterCreate = true;
        if (typeof showView === "function") {
          showView("join-gate");
        }
        if (typeof enterEventMainUiFromInviteLink === "function") {
          await enterEventMainUiFromInviteLink();
        }
      }, 1500);
    } catch (error) {
      console.error("イベント作成エラー:", error);
      createStatusText.textContent = "イベント作成に失敗しました。";
      alert(`イベント作成に失敗しました\n${error?.message || String(error)}`);
    } finally {
      if (createSubmitButton) {
        createSubmitButton.disabled = false;
        createSubmitButton.textContent = createSubmitDefaultLabel;
      }
    }
  });
}

window.setupCreateForm = setupCreateForm;
