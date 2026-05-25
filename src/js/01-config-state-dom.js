/* 定数・appState・DOM参照・共有 let — load order matters */
/** firebaseConfig は config.js の var firebaseConfig（および 00 / script.js 先頭の initializeApp で使用） */

const DEFAULT_EVENT_ID = "hanami-yoyogi";
const DEFAULT_EVENT = {
  title: "代々木公園の花見",
  dateText: "2026年4月5日（日） 12:00 - 16:00",
  location: "代々木公園 中央広場",
  is_active: true,
  is_dissolved: false,
  is_premium: false,
  can_edit_rsvp: true,
  notify_on_update: false,
  organizer_uid: "",
  dissolved_at: null,
  will_delete_at: null,
};
const DEFAULT_AVATAR_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='40' fill='%23d7deea'/%3E%3Ccircle cx='40' cy='31' r='16' fill='%23ffffff'/%3E%3Cpath d='M14 70c4-14 16-22 26-22s22 8 26 22' fill='%23ffffff'/%3E%3C/svg%3E";
const UPGRADE_GUIDE_URL = "https://firebase.google.com/pricing";
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // Spark運用を想定して1ファイル2MBまで
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54];

const appState = {
  eventId: "",
  participants: [],
  photos: [],
  messages: [],
  currentPictureUrl: "",
  isEventActive: true,
  isDissolved: false,
  isPremium: false,
  dissolvedAt: null,
  willDeleteAt: null,
  organizerUid: "",
  organizerAuthUid: "",
  /** 現在のイベントのパスコード（主催者向け表示用） */
  eventPasscode: "",
  canPost: true,
  canSeeParticipants: true,
  currentUserName: "",
  canEditRsvp: true,
  notifyOnUpdate: false,
  editingParticipantId: "",
  firebaseAuthUid: "",
  isAuthReady: false,
  isSubmittingRsvp: false,
  /** パスコード検索で複数ヒットしたか（確認画面の「戻る」挙動用） */
  joinPasscodeFlowHadMultiple: false,
  /**
   * イベントページでの閲覧モード（非主催者のコンテンツゲート用）
   * organizer | unlocked | pending | not_joined
   */
  participantAccessMode: "unlocked",
  /**
   * 認証後のトップレベル画面（ログイン〜イベント入場までの単一の真実源）
   * login | role_select | host_workspace | participant_join | event_page
   */
  authSessionRoute: "login",
  /** 主催ダッシュ or イベント詳細シェルへ入場済み（リスナー二重登録防止） */
  appShellEntered: false,
  /** 主催者 / 参加者（L4 の戻り先判定） */
  currentRole: null,
  /** URL の ?eventId=（ログイン直後は L2 で開くまで保持） */
  pendingEventIdFromUrl: "",
  /** showView が最後に表示したビュー id */
  visibleAppView: "login-screen",
  /** イベント詳細（Firestore 原文・編集フォーム用） */
  eventDocTitle: "",
  eventDocDateText: "",
  eventDocLocation: "",
  eventDocLocationUrl: "",
  /** アカウント設定を開く直前の showView id（戻る用） */
  viewBeforeAccountSettings: "",
  /**
   * bootstrap() 完了まで onAuth の画面遷移（プロフィール・役割選択等）を抑止する。
   * 認証状態確定前に登録画面だけが誤って前面に出るのを防ぐ。
   */
  bootstrapAuthRoutingReady: false,
  /** イベント作成直後に参加フォームへ誘導する（主催者クイック参加） */
  organizerQuickJoinAfterCreate: false,
  /** 定員（null = 無制限） */
  eventMaxParticipants: null,
  /** 回答期限 */
  eventAnswerDeadline: null,
  /** 主催者以外に参加者名等を秘匿 */
  eventIsPrivateList: false,
  /** 参加時に主催者承認を必須化 */
  eventRequireApproval: false,
  /** 参加者行から開いたDM対象 */
  activeDmTargetUid: "",
  activeDmTargetName: "",
};

/** ログアウト時など、appState を起動直後相当に戻す */
function resetAppState() {
  appState.eventId = "";
  appState.participants = [];
  appState.photos = [];
  appState.messages = [];
  appState.currentPictureUrl = "";
  appState.isEventActive = true;
  appState.isDissolved = false;
  appState.isPremium = false;
  appState.dissolvedAt = null;
  appState.willDeleteAt = null;
  appState.organizerUid = "";
  appState.organizerAuthUid = "";
  appState.eventPasscode = "";
  appState.canPost = true;
  appState.canSeeParticipants = true;
  appState.currentUserName = "";
  appState.canEditRsvp = true;
  appState.notifyOnUpdate = false;
  appState.editingParticipantId = "";
  appState.firebaseAuthUid = "";
  appState.isAuthReady = false;
  appState.isSubmittingRsvp = false;
  appState.joinPasscodeFlowHadMultiple = false;
  appState.participantAccessMode = "unlocked";
  appState.authSessionRoute = "login";
  appState.appShellEntered = false;
  appState.currentRole = null;
  appState.pendingEventIdFromUrl = "";
  appState.visibleAppView = "login-screen";
  appState.eventDocTitle = "";
  appState.eventDocDateText = "";
  appState.eventDocLocation = "";
  appState.eventDocLocationUrl = "";
  appState.viewBeforeAccountSettings = "";
  appState.bootstrapAuthRoutingReady = false;
  appState.organizerQuickJoinAfterCreate = false;
  appState.eventMaxParticipants = null;
  appState.eventAnswerDeadline = null;
  appState.eventIsPrivateList = false;
  appState.eventRequireApproval = false;
  appState.activeDmTargetUid = "";
  appState.activeDmTargetName = "";
}

const participantsBody = document.getElementById("participantsBody");
const participantsCount = document.getElementById("participantsCount");
const joinGateSection = document.getElementById("joinGateSection");
const joinSection = joinGateSection;
const joinForm = document.getElementById("joinForm");
const joinButton = document.getElementById("joinButton");
const nameInput = document.getElementById("nameInput");
const commentInput = document.getElementById("commentInput");
const joinStatusText = document.getElementById("joinStatusText");
const joinFormGateMessage = document.getElementById("joinFormGateMessage");
const calendarAfterRsvpRow = document.getElementById("calendarAfterRsvpRow");
const calendarAfterRsvpButton = document.getElementById("calendarAfterRsvpButton");
const eventCalendarQuickAddButton = document.getElementById("eventCalendarQuickAddButton");
const calendarPromptModal = document.getElementById("calendarPromptModal");
const calendarPromptCloseButton = document.getElementById("calendarPromptCloseButton");
const calendarPromptCloseSecondaryButton = document.getElementById("calendarPromptCloseSecondaryButton");
const calendarPromptAddButton = document.getElementById("calendarPromptAddButton");
const eventTitle = document.getElementById("eventTitle");
const eventDate = document.getElementById("eventDate");
const eventLocation = document.getElementById("eventLocation");
const createLocationUrlInput = document.getElementById("eventLocationUrl");
const eventClosedMessage = document.getElementById("eventClosedMessage");
const eventDissolveCountdownBanner = document.getElementById("eventDissolveCountdownBanner");
const eventEditButton = document.getElementById("eventEditButton");
const eventEditOverlay = document.getElementById("eventEditOverlay");
const eventEditForm = document.getElementById("eventEditForm");
const eventEditNameInput = document.getElementById("eventEditNameInput");
const eventEditDateInput = document.getElementById("eventEditDateInput");
const eventEditTimeInput = document.getElementById("eventEditTimeInput");
const eventEditLocationInput = document.getElementById("eventEditLocationInput");
const eventEditCancelButton = document.getElementById("eventEditCancelButton");
const eventEditCloseButton = document.getElementById("eventEditCloseButton");
const organizerControls = document.getElementById("organizerControls");
const dissolveButton = document.getElementById("dissolveButton");
const accessNotice = document.getElementById("accessNotice");
const participantsSection = document.getElementById("participantsSection");
const photosSection = document.getElementById("photosSection");
const photosGrid = document.getElementById("photosGrid");
const photosCount = document.getElementById("photosCount");
const photoFileInput = document.getElementById("photoFileInput");
const uploadPhotoButton = document.getElementById("uploadPhotoButton");
const photoStatusText = document.getElementById("photoStatusText");
const photoUploadControls = document.getElementById("photoUploadControls");
const chatSection = document.getElementById("chatSection");
const messagesList = document.getElementById("messagesList");
const messagesCount = document.getElementById("messagesCount");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const chatStatusText = document.getElementById("chatStatusText");
const chatPhotoInput = document.getElementById("chatPhotoInput");
const chatPhotoButton = document.getElementById("chatPhotoButton");
const premiumCountdownText = document.getElementById("premiumCountdownText");
const premiumTopTimer = document.getElementById("premiumTopTimer");
const photosLockOverlay = document.getElementById("photosLockOverlay");
const messagesLockOverlay = document.getElementById("messagesLockOverlay");
const upgradeButtonPhotos = document.getElementById("upgradeButtonPhotos");
const upgradeButtonMessages = document.getElementById("upgradeButtonMessages");
const eventDetailCard = document.getElementById("eventDetailCard");
const eventShareButton = document.getElementById("eventShareButton");
const createEventSection = document.getElementById("createEventSection");
const createEventForm = document.getElementById("createEventForm");
const createTitleInput = document.getElementById("createTitleInput");
const createDateInput = document.getElementById("createDateInput");
const createLocationInput = document.getElementById("createLocationInput");
const createPasscodeInput = document.getElementById("createPasscodeInput");
const createPasscodeLimitCheckbox = document.getElementById("createPasscodeLimitCheckbox");
const createPasscodeFieldsWrap = document.getElementById("createPasscodeFieldsWrap");
const createPremiumInput = document.getElementById("createPremiumInput");
const createMaxParticipantsInput = document.getElementById("createMaxParticipantsInput");
const createAnswerDeadlineInput = document.getElementById("createAnswerDeadlineInput");
const createPrivateListCheckbox = document.getElementById("createPrivateListCheckbox");
const createRequireApprovalCheckbox = document.getElementById("createRequireApprovalCheckbox");
const createStatusText = document.getElementById("createStatusText");
const googleSignInPopupButton = document.getElementById("googleSignInPopupButton");
const googleSignInRedirectButton = document.getElementById("googleSignInRedirectButton");
const anonymousSignInButton = document.getElementById("anonymousSignInButton");
const authSection = document.getElementById("authSection");
const accountAvatarWrap = document.getElementById("accountAvatarWrap");
const accountAvatarDropdown = document.getElementById("accountAvatarDropdown");
const accountAvatarImg = document.getElementById("account-avatar");
const myEventsSection = document.getElementById("myEventsSection");
const myEventsGrid = document.getElementById("myEventsGrid");
const myEventsStatusText = document.getElementById("myEventsStatusText");
const rsvpSummaryBlock = document.getElementById("rsvpSummaryBlock");
const rsvpBars = document.getElementById("rsvpBars");
const rsvpSummaryCounts = document.getElementById("rsvpSummaryCounts");
const organizerAnnouncementBlock = document.getElementById("organizerAnnouncementBlock");
const organizerAnnouncementForm = document.getElementById("organizerAnnouncementForm");
const organizerAnnouncementInput = document.getElementById("organizerAnnouncementInput");
const organizerAnnouncementStatus = document.getElementById("organizerAnnouncementStatus");
const globalToast = document.getElementById("globalToast");
const globalToastText = document.getElementById("globalToastText");
const qrModal = document.getElementById("qrModal");
const qrModalCode = document.getElementById("qrModalCode");
const qrModalCloseButton = document.getElementById("qrModalCloseButton");
const appHeader = document.getElementById("appHeader");
const appFooter = document.getElementById("appFooter");
const appFooterTabHome = document.getElementById("appFooterTabHome");
const appFooterTabChat = document.getElementById("appFooterTabChat");
const appFooterTabSettings = document.getElementById("appFooterTabSettings");
const navBackButton = document.getElementById("appHeaderBackButton");
const navRoleSelect = document.getElementById("navRoleSelect");
const emailAuthModal = document.getElementById("emailAuthModal");
const emailAuthOpenButton = document.getElementById("emailAuthOpenButton");
const emailAuthForm = document.getElementById("emailAuthForm");
const emailAuthInput = document.getElementById("emailAuthInput");
const emailAuthPassword = document.getElementById("emailAuthPassword");
const emailAuthStatusText = document.getElementById("emailAuthStatusText");
const emailAuthSignUpButton = document.getElementById("emailAuthSignUpButton");
const emailAuthCloseButton = document.getElementById("emailAuthCloseButton");
const roleSelectSection = document.getElementById("roleSelectSection");
const roleSelectHostButton = document.getElementById("roleSelectHostButton");
const roleSelectParticipantButton = document.getElementById("roleSelectParticipantButton");
const roleSelectStatusLine = document.getElementById("roleSelectStatusLine");
const joinByPasscodeSection = document.getElementById("joinByPasscodeSection");
const joinPasscodeInput = document.getElementById("joinPasscodeInput");
const joinPasscodeSearchButton = document.getElementById("joinPasscodeSearchButton");
const joinPasscodeStatusLine = document.getElementById("joinPasscodeStatusLine");
const joinPasscodeInputPanel = document.getElementById("joinPasscodeInputPanel");
const joinPasscodeResultsPanel = document.getElementById("joinPasscodeResultsPanel");
const joinPasscodeResultsMessage = document.getElementById("joinPasscodeResultsMessage");
const joinPasscodeResultsList = document.getElementById("joinPasscodeResultsList");
const joinPasscodeConfirmPanel = document.getElementById("joinPasscodeConfirmPanel");
const joinPasscodeConfirmEventName = document.getElementById("joinPasscodeConfirmEventName");
const joinPasscodeConfirmHostName = document.getElementById("joinPasscodeConfirmHostName");
const joinPasscodeConfirmDate = document.getElementById("joinPasscodeConfirmDate");
const joinRequestApplyButton = document.getElementById("joinRequestApplyButton");
const participantDashboardSection = document.getElementById("participantDashboardSection");
const participantEventsGrid = document.getElementById("participantEventsGrid");
const participantEventsStatusText = document.getElementById("participantEventsStatusText");
const waitingRoomSection = document.getElementById("waitingRoomSection");
const waitingRoomHostDisplay = document.getElementById("waitingRoomHostDisplay");
const waitingRoomStatusLine = document.getElementById("waitingRoomStatusLine");
const userProfileSection = document.getElementById("userProfileSection");
const userProfileForm = document.getElementById("userProfileForm");
const userProfileNameInput = document.getElementById("userProfileNameInput");
const userProfileAvatarInput = document.getElementById("userProfileAvatarInput");
const userProfilePreviewWrap = document.getElementById("userProfilePreviewWrap");
const userProfilePreviewImg = document.getElementById("userProfilePreviewImg");
const userProfileStatusLine = document.getElementById("userProfileStatusLine");
const userProfileSubmitButton = document.getElementById("userProfileSubmitButton");
const userProfileTitle = document.getElementById("userProfileTitle");
const userProfileLead = document.getElementById("userProfileLead");
const accountSettingsSection = document.getElementById("accountSettingsSection");
const menuAccountSettings = document.getElementById("menuAccountSettings");
const menuNotificationSettings = document.getElementById("menuNotificationSettings");
const menuLogout = document.getElementById("menuLogout");
const accountMenuSettingsButton = document.getElementById("accountMenuSettingsButton");
const accountMenuPwaButton = document.getElementById("accountMenuPwaButton");
const accountMenuNotifyButton = document.getElementById("accountMenuNotifyButton");
const accountMenuNotifyButtonLabel = document.getElementById("accountMenuNotifyButtonLabel");
const pwaInstallBanner = document.getElementById("pwaInstallBanner");
const pwaInstallBannerButton = document.getElementById("pwaInstallBannerButton");
const pwaInstallBannerDismiss = document.getElementById("pwaInstallBannerDismiss");
const iosAddToHomeModal = document.getElementById("iosAddToHomeModal");
const iosAddToHomeCloseButton = document.getElementById("iosAddToHomeCloseButton");
const organizerPendingParticipantsBlock = document.getElementById("organizerPendingParticipantsBlock");
const organizerPendingParticipantsList = document.getElementById("organizerPendingParticipantsList");
const organizerPendingEmptyHint = document.getElementById("organizerPendingEmptyHint");
const organizerPasscodePanel = document.getElementById("organizerPasscodePanel");
const organizerPasscodeValue = document.getElementById("organizerPasscodeValue");
const organizerPasscodeCopyButton = document.getElementById("organizerPasscodeCopyButton");
const participantAccessPendingPanel = document.getElementById("participantAccessPendingPanel");
const participantAccessNotJoinedPanel = document.getElementById("participantAccessNotJoinedPanel");
const rsvpEditModal = document.getElementById("rsvpEditModal");
const rsvpEditForm = document.getElementById("rsvpEditForm");
const rsvpEditCloseButton = document.getElementById("rsvpEditCloseButton");
const rsvpEditCommentInput = document.getElementById("rsvpEditCommentInput");
const rsvpEditStatusText = document.getElementById("rsvpEditStatusText");
const dmModal = document.getElementById("dmModal");
const dmModalTitle = document.getElementById("dmModalTitle");
const dmModalCloseButton = document.getElementById("dmModalCloseButton");
const dmMessagesList = document.getElementById("dmMessagesList");
const dmForm = document.getElementById("dmForm");
const dmMessageInput = document.getElementById("dmMessageInput");
const dmStatusText = document.getElementById("dmStatusText");

let db = null;
let storage = null;
let firebaseInitPromise = null;
let isFirebaseReady = false;
let authReadyPromise = null;
let mergeChatBuffer = [];
let mergeDirectBuffer = [];
let directMessagesUnsub = null;
let globalToastTimerId = null;
let qrCodeInstance = null;

const SHARED_EXPORTS = {
  DEFAULT_EVENT_ID,
  DEFAULT_EVENT,
  DEFAULT_AVATAR_URL,
  UPGRADE_GUIDE_URL,
  MAX_UPLOAD_BYTES,
  MAX_IMAGE_EDGE,
  JPEG_QUALITY_STEPS,
  appState,
  resetAppState,
  participantsBody,
  participantsCount,
  joinSection,
  joinForm,
  joinButton,
  nameInput,
  commentInput,
  joinStatusText,
  joinFormGateMessage,
  calendarAfterRsvpRow,
  calendarAfterRsvpButton,
  eventCalendarQuickAddButton,
  calendarPromptModal,
  calendarPromptCloseButton,
  calendarPromptCloseSecondaryButton,
  calendarPromptAddButton,
  eventTitle,
  eventDate,
  eventLocation,
  createLocationUrlInput,
  eventClosedMessage,
  eventDissolveCountdownBanner,
  eventEditButton,
  eventEditOverlay,
  eventEditForm,
  eventEditNameInput,
  eventEditDateInput,
  eventEditTimeInput,
  eventEditLocationInput,
  eventEditCancelButton,
  eventEditCloseButton,
  organizerControls,
  dissolveButton,
  accessNotice,
  participantsSection,
  photosSection,
  photosGrid,
  photosCount,
  photoFileInput,
  uploadPhotoButton,
  photoStatusText,
  photoUploadControls,
  chatSection,
  messagesList,
  messagesCount,
  chatForm,
  messageInput,
  chatStatusText,
  chatPhotoInput,
  chatPhotoButton,
  premiumCountdownText,
  premiumTopTimer,
  photosLockOverlay,
  messagesLockOverlay,
  upgradeButtonPhotos,
  upgradeButtonMessages,
  eventDetailCard,
  eventShareButton,
  createEventSection,
  createEventForm,
  createTitleInput,
  createDateInput,
  createLocationInput,
  createPasscodeInput,
  createPasscodeLimitCheckbox,
  createPasscodeFieldsWrap,
  createPremiumInput,
  createMaxParticipantsInput,
  createAnswerDeadlineInput,
  createPrivateListCheckbox,
  createRequireApprovalCheckbox,
  createStatusText,
  googleSignInPopupButton,
  googleSignInRedirectButton,
  anonymousSignInButton,
  authSection,
  accountAvatarWrap,
  accountAvatarDropdown,
  accountAvatarImg,
  myEventsSection,
  myEventsGrid,
  myEventsStatusText,
  rsvpSummaryBlock,
  rsvpBars,
  rsvpSummaryCounts,
  organizerAnnouncementBlock,
  organizerAnnouncementForm,
  organizerAnnouncementInput,
  organizerAnnouncementStatus,
  globalToast,
  globalToastText,
  qrModal,
  qrModalCode,
  qrModalCloseButton,
  appHeader,
  appFooter,
  appFooterTabHome,
  appFooterTabChat,
  appFooterTabSettings,
  navBackButton,
  navRoleSelect,
  emailAuthModal,
  emailAuthOpenButton,
  emailAuthForm,
  emailAuthInput,
  emailAuthPassword,
  emailAuthStatusText,
  emailAuthSignUpButton,
  emailAuthCloseButton,
  roleSelectSection,
  roleSelectHostButton,
  roleSelectParticipantButton,
  roleSelectStatusLine,
  joinByPasscodeSection,
  joinPasscodeInput,
  joinPasscodeSearchButton,
  joinPasscodeStatusLine,
  joinPasscodeInputPanel,
  joinPasscodeResultsPanel,
  joinPasscodeResultsMessage,
  joinPasscodeResultsList,
  joinPasscodeConfirmPanel,
  joinPasscodeConfirmEventName,
  joinPasscodeConfirmHostName,
  joinPasscodeConfirmDate,
  joinRequestApplyButton,
  participantDashboardSection,
  participantEventsGrid,
  participantEventsStatusText,
  waitingRoomSection,
  waitingRoomHostDisplay,
  waitingRoomStatusLine,
  userProfileSection,
  userProfileForm,
  userProfileNameInput,
  userProfileAvatarInput,
  userProfilePreviewWrap,
  userProfilePreviewImg,
  userProfileStatusLine,
  userProfileSubmitButton,
  userProfileTitle,
  userProfileLead,
  accountSettingsSection,
  menuAccountSettings,
  menuNotificationSettings,
  menuLogout,
  accountMenuSettingsButton,
  accountMenuPwaButton,
  accountMenuNotifyButton,
  accountMenuNotifyButtonLabel,
  pwaInstallBanner,
  pwaInstallBannerButton,
  pwaInstallBannerDismiss,
  iosAddToHomeModal,
  iosAddToHomeCloseButton,
  organizerPendingParticipantsBlock,
  organizerPendingParticipantsList,
  organizerPendingEmptyHint,
  organizerPasscodePanel,
  organizerPasscodeValue,
  organizerPasscodeCopyButton,
  participantAccessPendingPanel,
  participantAccessNotJoinedPanel,
  joinGateSection,
  rsvpEditModal,
  rsvpEditForm,
  rsvpEditCloseButton,
  rsvpEditCommentInput,
  rsvpEditStatusText,
  dmModal,
  dmModalTitle,
  dmModalCloseButton,
  dmMessagesList,
  dmForm,
  dmMessageInput,
  dmStatusText,
};

Object.assign(window, SHARED_EXPORTS);

Object.defineProperty(window, "db", {
  get: () => db,
  set: (v) => {
    db = v;
  },
});
Object.defineProperty(window, "storage", {
  get: () => storage,
  set: (v) => {
    storage = v;
  },
});
Object.defineProperty(window, "firebaseInitPromise", {
  get: () => firebaseInitPromise,
  set: (v) => {
    firebaseInitPromise = v;
  },
});
Object.defineProperty(window, "isFirebaseReady", {
  get: () => isFirebaseReady,
  set: (v) => {
    isFirebaseReady = v;
  },
});
Object.defineProperty(window, "authReadyPromise", {
  get: () => authReadyPromise,
  set: (v) => {
    authReadyPromise = v;
  },
});
Object.defineProperty(window, "mergeChatBuffer", {
  get: () => mergeChatBuffer,
  set: (v) => {
    mergeChatBuffer = v;
  },
});
Object.defineProperty(window, "mergeDirectBuffer", {
  get: () => mergeDirectBuffer,
  set: (v) => {
    mergeDirectBuffer = v;
  },
});
Object.defineProperty(window, "directMessagesUnsub", {
  get: () => directMessagesUnsub,
  set: (v) => {
    directMessagesUnsub = v;
  },
});
Object.defineProperty(window, "globalToastTimerId", {
  get: () => globalToastTimerId,
  set: (v) => {
    globalToastTimerId = v;
  },
});
Object.defineProperty(window, "qrCodeInstance", {
  get: () => qrCodeInstance,
  set: (v) => {
    qrCodeInstance = v;
  },
});

export {
  DEFAULT_EVENT_ID,
  DEFAULT_EVENT,
  DEFAULT_AVATAR_URL,
  UPGRADE_GUIDE_URL,
  MAX_UPLOAD_BYTES,
  MAX_IMAGE_EDGE,
  JPEG_QUALITY_STEPS,
  appState,
  resetAppState,
  participantsBody,
  participantsCount,
  joinSection,
  joinForm,
  joinButton,
  nameInput,
  commentInput,
  joinStatusText,
  joinFormGateMessage,
  calendarAfterRsvpRow,
  calendarAfterRsvpButton,
  eventCalendarQuickAddButton,
  calendarPromptModal,
  calendarPromptCloseButton,
  calendarPromptCloseSecondaryButton,
  calendarPromptAddButton,
  eventTitle,
  eventDate,
  eventLocation,
  createLocationUrlInput,
  eventClosedMessage,
  eventDissolveCountdownBanner,
  eventEditButton,
  eventEditOverlay,
  eventEditForm,
  eventEditNameInput,
  eventEditDateInput,
  eventEditTimeInput,
  eventEditLocationInput,
  eventEditCancelButton,
  eventEditCloseButton,
  organizerControls,
  dissolveButton,
  accessNotice,
  participantsSection,
  photosSection,
  photosGrid,
  photosCount,
  photoFileInput,
  uploadPhotoButton,
  photoStatusText,
  photoUploadControls,
  chatSection,
  messagesList,
  messagesCount,
  chatForm,
  messageInput,
  chatStatusText,
  chatPhotoInput,
  chatPhotoButton,
  premiumCountdownText,
  premiumTopTimer,
  photosLockOverlay,
  messagesLockOverlay,
  upgradeButtonPhotos,
  upgradeButtonMessages,
  eventDetailCard,
  eventShareButton,
  createEventSection,
  createEventForm,
  createTitleInput,
  createDateInput,
  createLocationInput,
  createPasscodeInput,
  createPasscodeLimitCheckbox,
  createPasscodeFieldsWrap,
  createPremiumInput,
  createMaxParticipantsInput,
  createAnswerDeadlineInput,
  createPrivateListCheckbox,
  createRequireApprovalCheckbox,
  createStatusText,
  googleSignInPopupButton,
  googleSignInRedirectButton,
  anonymousSignInButton,
  authSection,
  accountAvatarWrap,
  accountAvatarDropdown,
  accountAvatarImg,
  myEventsSection,
  myEventsGrid,
  myEventsStatusText,
  rsvpSummaryBlock,
  rsvpBars,
  rsvpSummaryCounts,
  organizerAnnouncementBlock,
  organizerAnnouncementForm,
  organizerAnnouncementInput,
  organizerAnnouncementStatus,
  globalToast,
  globalToastText,
  qrModal,
  qrModalCode,
  qrModalCloseButton,
  appHeader,
  appFooter,
  appFooterTabHome,
  appFooterTabChat,
  appFooterTabSettings,
  navBackButton,
  navRoleSelect,
  emailAuthModal,
  emailAuthOpenButton,
  emailAuthForm,
  emailAuthInput,
  emailAuthPassword,
  emailAuthStatusText,
  emailAuthSignUpButton,
  emailAuthCloseButton,
  roleSelectSection,
  roleSelectHostButton,
  roleSelectParticipantButton,
  roleSelectStatusLine,
  joinByPasscodeSection,
  joinPasscodeInput,
  joinPasscodeSearchButton,
  joinPasscodeStatusLine,
  joinPasscodeInputPanel,
  joinPasscodeResultsPanel,
  joinPasscodeResultsMessage,
  joinPasscodeResultsList,
  joinPasscodeConfirmPanel,
  joinPasscodeConfirmEventName,
  joinPasscodeConfirmHostName,
  joinPasscodeConfirmDate,
  joinRequestApplyButton,
  participantDashboardSection,
  participantEventsGrid,
  participantEventsStatusText,
  waitingRoomSection,
  waitingRoomHostDisplay,
  waitingRoomStatusLine,
  userProfileSection,
  userProfileForm,
  userProfileNameInput,
  userProfileAvatarInput,
  userProfilePreviewWrap,
  userProfilePreviewImg,
  userProfileStatusLine,
  userProfileSubmitButton,
  userProfileTitle,
  userProfileLead,
  accountSettingsSection,
  menuAccountSettings,
  menuNotificationSettings,
  menuLogout,
  accountMenuSettingsButton,
  accountMenuPwaButton,
  accountMenuNotifyButton,
  accountMenuNotifyButtonLabel,
  pwaInstallBanner,
  pwaInstallBannerButton,
  pwaInstallBannerDismiss,
  iosAddToHomeModal,
  iosAddToHomeCloseButton,
  organizerPendingParticipantsBlock,
  organizerPendingParticipantsList,
  organizerPendingEmptyHint,
  organizerPasscodePanel,
  organizerPasscodeValue,
  organizerPasscodeCopyButton,
  participantAccessPendingPanel,
  participantAccessNotJoinedPanel,
  joinGateSection,
  rsvpEditModal,
  rsvpEditForm,
  rsvpEditCloseButton,
  rsvpEditCommentInput,
  rsvpEditStatusText,
  dmModal,
  dmModalTitle,
  dmModalCloseButton,
  dmMessagesList,
  dmForm,
  dmMessageInput,
  dmStatusText,
  db,
  storage,
  firebaseInitPromise,
  isFirebaseReady,
  authReadyPromise,
  mergeChatBuffer,
  mergeDirectBuffer,
  directMessagesUnsub,
  globalToastTimerId,
  qrCodeInstance,
};
