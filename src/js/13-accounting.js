/**
 * 会計・割り勘（フェーズ1: UI + ダミーデータ計算）
 * 既存ルートとは独立した accounting-view で表示する。
 * 画面遷移はケバブメニュー等から showView("accounting-view") を呼んだ後に openAccountingView() を実行する。
 */
const DUMMY_MEMBERS = [
  { uid: "dummy-uid-alpha", name: "山田太郎" },
  { uid: "dummy-uid-bravo", name: "佐藤花子" },
  { uid: "dummy-uid-charlie", name: "鈴木一郎" },
];

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roundUp100(n) {
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return Math.ceil(n / 100) * 100;
}

function getAccountingEls() {
  return {
    list: document.getElementById("accountingParticipantsList"),
    totalInput: document.getElementById("accountingTotalInput"),
    membersCount: document.getElementById("accountingMembersCount"),
    calculatedTotal: document.getElementById("accountingCalculatedTotal"),
    differenceNotice: document.getElementById("accountingDifferenceNotice"),
  };
}

function renderDummyParticipants(listEl) {
  if (!listEl) {
    return;
  }
  listEl.innerHTML = "";
  DUMMY_MEMBERS.forEach((m) => {
    const li = document.createElement("li");
    li.className = "accounting-list-item";
    li.dataset.uid = m.uid;
    li.innerHTML = `
      <div class="accounting-list-item__row">
        <span class="accounting-participant-name">${escapeHtml(m.name)}</span>
        <span class="accounting-participant-amount"><span class="accounting-amount-value">0</span> 円</span>
      </div>
      <select class="accounting-adjust-select" aria-label="${escapeHtml(m.name)}の金額調整">
        <option value="normal">通常</option>
        <option value="free">無料</option>
        <option value="plus1000">+1000円</option>
        <option value="minus1000">-1000円</option>
      </select>
    `;
    listEl.appendChild(li);
  });
}

function collectRows() {
  const list = document.getElementById("accountingParticipantsList");
  if (!list) {
    return [];
  }
  return Array.from(list.querySelectorAll(".accounting-list-item")).map((li) => ({
    adjust: String(li.querySelector(".accounting-adjust-select")?.value || "normal"),
    amountEl: li.querySelector(".accounting-amount-value"),
  }));
}

/**
 * 無料は0円。+1000/-1000 は総額プールを増減したうえで、
 * 残りを「通常」の人数で均等割（100円単位切り上げ）。通常が0人なら +/- 系のみでプールを分割。
 */
function calculateSplit() {
  const { totalInput, calculatedTotal, differenceNotice } = getAccountingEls();
  const T = Math.max(0, Math.floor(Number(totalInput?.value) || 0));
  const rows = collectRows();
  let nNormal = 0;
  let nPlus = 0;
  let nMinus = 0;
  rows.forEach(({ adjust }) => {
    if (adjust === "free") {
      return;
    }
    if (adjust === "normal") {
      nNormal += 1;
    } else if (adjust === "plus1000") {
      nPlus += 1;
    } else if (adjust === "minus1000") {
      nMinus += 1;
    }
  });
  const pool = T - 1000 * nPlus + 1000 * nMinus;
  let perNormal = 0;
  let perSplit = 0;
  const nAdjOnly = nPlus + nMinus;
  if (nNormal > 0) {
    perNormal = roundUp100(pool / nNormal);
  } else if (nAdjOnly > 0) {
    perSplit = roundUp100(pool / nAdjOnly);
  }
  let sum = 0;
  rows.forEach(({ adjust, amountEl }) => {
    let amt = 0;
    if (adjust === "free") {
      amt = 0;
    } else if (adjust === "normal") {
      amt = perNormal;
    } else if (adjust === "plus1000") {
      amt = nNormal > 0 ? perNormal + 1000 : perSplit + 1000;
    } else if (adjust === "minus1000") {
      amt = nNormal > 0 ? Math.max(0, perNormal - 1000) : Math.max(0, perSplit - 1000);
    }
    if (amountEl) {
      amountEl.textContent = String(amt);
    }
    sum += amt;
  });
  if (calculatedTotal) {
    calculatedTotal.textContent = String(sum);
  }
  if (differenceNotice) {
    const diff = T - sum;
    differenceNotice.classList.remove("is-warn");
    if (T <= 0) {
      differenceNotice.textContent = "総額を入力すると集金予定額を計算します。";
    } else if (diff === 0) {
      differenceNotice.textContent = "総額と集金予定額が一致しています。";
    } else {
      differenceNotice.classList.add("is-warn");
      if (diff > 0) {
        differenceNotice.textContent = `総額より ${diff} 円少ない見込みです（端数切り上げの影響で差が出る場合があります）。`;
      } else {
        differenceNotice.textContent = `総額より ${-diff} 円多い見込みです（端数切り上げの影響で差が出る場合があります）。`;
      }
    }
  }
}

/** @deprecated 互換用エイリアス */
const recalculateAccounting = calculateSplit;

function updateMembersCount() {
  const { list, membersCount } = getAccountingEls();
  if (!membersCount || !list) {
    return;
  }
  const n = list.querySelectorAll(".accounting-list-item").length;
  membersCount.textContent = `${n}人`;
}

/**
 * ダミーメンバー描画と再計算（showView は呼ばない）
 */
function openAccountingView() {
  const { list } = getAccountingEls();
  if (list && list.children.length === 0) {
    renderDummyParticipants(list);
  }
  updateMembersCount();
  calculateSplit();
}

function setupAccountingModule() {
  const { list, totalInput } = getAccountingEls();
  if (list && list.dataset.accountingBound !== "1") {
    list.dataset.accountingBound = "1";
    list.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLSelectElement && t.classList.contains("accounting-adjust-select")) {
        calculateSplit();
      }
    });
  }
  if (totalInput && totalInput.dataset.accountingBound !== "1") {
    totalInput.dataset.accountingBound = "1";
    totalInput.addEventListener("input", () => {
      calculateSplit();
    });
    totalInput.addEventListener("change", () => {
      calculateSplit();
    });
  }
}

setupAccountingModule();

const ACCOUNTING_EXPORTS = {
  openAccountingView,
  calculateSplit,
  recalculateAccounting,
};

Object.assign(window, ACCOUNTING_EXPORTS);

export { openAccountingView, calculateSplit, recalculateAccounting };
