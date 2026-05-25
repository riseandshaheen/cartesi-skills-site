import "./style.css";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  fetchSkillMarkdown,
  skillContributeUrl,
} from "./skillRemote.js";

marked.use({
  gfm: true,
});

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "A") return;
  const href = node.getAttribute("href");
  if (!href || !/^https?:\/\//i.test(href)) return;
  node.setAttribute("target", "_blank");
  node.setAttribute("rel", "noopener noreferrer");
});

/**
 * Cursor / agent skills use YAML frontmatter (--- … ---) for name and description.
 * A markdown renderer treats that as headings, HRs, blockquotes, etc., so we drop
 * it for display only. Clipboard copy still uses the full file from the network.
 *
 * @param {string} markdown
 * @returns {string}
 */
function stripLeadingYamlFrontmatter(markdown) {
  return markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function markdownToSafeHtml(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown));
}

const INSTALL =
  "npx skills add https://github.com/Mugen-Builders/cartesi-skills";

/** Modal copy label reset (ms). */
const COPY_FEEDBACK_MS = 1100;

/** Hero strip: how long the checkmark / “copied” state stays visible. */
const HERO_COPY_FEEDBACK_MS = 720;

/** Prompt cards: how long the “Copied” label stays visible. */
const PROMPT_COPY_FEEDBACK_MS = 1100;

const copyInstallBtn = document.getElementById("copy-install");

const COPY_INSTALL_LABEL = "Copy install command";

copyInstallBtn?.addEventListener("click", async (e) => {
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(INSTALL);
    copyInstallBtn.classList.add("is-copied");
    copyInstallBtn.title = "Copied";
    copyInstallBtn.setAttribute("aria-label", "Copied to clipboard");
    setTimeout(() => {
      copyInstallBtn.classList.remove("is-copied");
      copyInstallBtn.title = "Copy";
      copyInstallBtn.setAttribute("aria-label", COPY_INSTALL_LABEL);
    }, HERO_COPY_FEEDBACK_MS);
  } catch {
    copyInstallBtn.title = "Could not copy";
    copyInstallBtn.setAttribute("aria-label", "Could not copy");
    setTimeout(() => {
      copyInstallBtn.title = "Copy";
      copyInstallBtn.setAttribute("aria-label", COPY_INSTALL_LABEL);
    }, 900);
  }
});

const modal = document.getElementById("skill-modal");
const modalTitle = document.getElementById("skill-modal-title");
const modalBody = document.getElementById("skill-modal-body");
const modalClose = document.getElementById("skill-modal-close");
const modalCopy = document.getElementById("skill-modal-copy");
const modalContribute = document.getElementById("skill-modal-contribute");

/** @type {string | null} */
let openSkillMarkdown = null;

/** @type {AbortController | null} */
let skillFetchAbort = null;

function setModalLoading(isLoading) {
  modal?.setAttribute("aria-busy", isLoading ? "true" : "false");
  if (modalBody) {
    modalBody.classList.toggle("skill-modal__md--loading", isLoading);
  }
  if (modalCopy) {
    modalCopy.disabled = isLoading || !openSkillMarkdown;
  }
}

function openSkillModal(skillId, displayTitle) {
  if (!modal || !modalTitle || !modalBody) return;

  skillFetchAbort?.abort();
  const ac = new AbortController();
  skillFetchAbort = ac;

  if (modalContribute) {
    modalContribute.href = skillContributeUrl(skillId);
    modalContribute.setAttribute(
      "aria-label",
      `Contribute to ${displayTitle} on GitHub`,
    );
  }

  modalTitle.textContent = `${displayTitle} — SKILL.md`;
  if (modalBody) {
    modalBody.classList.remove("skill-modal__md--error");
    modalBody.textContent = "Loading…";
  }
  openSkillMarkdown = null;
  setModalLoading(true);

  if (typeof modal.showModal === "function") {
    modal.showModal();
  }

  void (async () => {
    try {
      const text = await fetchSkillMarkdown(skillId, { signal: ac.signal });
      if (ac.signal.aborted) return;
      modalBody.classList.remove("skill-modal__md--error");
      modalBody.innerHTML = markdownToSafeHtml(
        stripLeadingYamlFrontmatter(text),
      );
      openSkillMarkdown = text;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (ac.signal.aborted) return;
      const msg =
        e instanceof Error ? e.message : "Something went wrong loading SKILL.md.";
      modalBody.classList.add("skill-modal__md--error");
      modalBody.textContent = `Could not load SKILL.md.\n\n${msg}\n\nUse Contribute to open the file on GitHub, or try again later.`;
      openSkillMarkdown = null;
    } finally {
      if (skillFetchAbort === ac) {
        skillFetchAbort = null;
      }
      if (!ac.signal.aborted) {
        setModalLoading(false);
      }
    }
  })();
}

function closeSkillModal() {
  skillFetchAbort?.abort();
  skillFetchAbort = null;
  if (modal && typeof modal.close === "function") {
    modal.close();
  }
  openSkillMarkdown = null;
  if (modalCopy) {
    modalCopy.disabled = false;
  }
  modal?.setAttribute("aria-busy", "false");
  if (modalBody) {
    modalBody.classList.remove("skill-modal__md--loading");
    modalBody.textContent = "";
  }
}

document.querySelectorAll(".prompt-card__copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const card = btn.closest(".card--prompt");
    const source = card?.querySelector(".prompt-card__text");
    const label = btn.querySelector(".prompt-card__copy-label");
    const text = source?.value?.trim();
    if (!text) return;

    const prevLabel = label?.textContent ?? "Copy prompt";
    const prevAria = btn.getAttribute("aria-label") ?? "Copy prompt";

    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add("is-copied");
      if (label) label.textContent = "Copied";
      btn.setAttribute("aria-label", "Copied to clipboard");
      setTimeout(() => {
        btn.classList.remove("is-copied");
        if (label) label.textContent = prevLabel;
        btn.setAttribute("aria-label", prevAria);
        btn.blur();
      }, PROMPT_COPY_FEEDBACK_MS);
    } catch {
      if (label) label.textContent = "Failed";
      btn.setAttribute("aria-label", "Could not copy");
      setTimeout(() => {
        if (label) label.textContent = prevLabel;
        btn.setAttribute("aria-label", prevAria);
        btn.blur();
      }, PROMPT_COPY_FEEDBACK_MS);
    }
  });
});

document.querySelectorAll(".card[data-skill]").forEach((el) => {
  el.addEventListener("click", () => {
    const id = el.getAttribute("data-skill");
    const titleEl = el.querySelector(".card__title");
    const title = titleEl?.textContent?.trim() ?? id ?? "Skill";
    if (id) openSkillModal(id, title);
  });
});

modalClose?.addEventListener("click", closeSkillModal);

modal?.addEventListener("click", (e) => {
  const rect = modal.getBoundingClientRect();
  const inDialog =
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom;
  if (!inDialog) {
    closeSkillModal();
  }
});

modal?.addEventListener("cancel", () => {
  skillFetchAbort?.abort();
  skillFetchAbort = null;
  openSkillMarkdown = null;
});

modalCopy?.addEventListener("click", async () => {
  if (!openSkillMarkdown) return;
  const label = modalCopy.querySelector(".skill-modal__copy-label");
  const prev = label?.textContent ?? "";
  try {
    await navigator.clipboard.writeText(openSkillMarkdown);
    if (label) label.textContent = "Copied";
    setTimeout(() => {
      if (label) label.textContent = prev || "Copy";
    }, COPY_FEEDBACK_MS);
  } catch {
    if (label) label.textContent = "Failed";
    setTimeout(() => {
      if (label) label.textContent = prev || "Copy";
    }, COPY_FEEDBACK_MS);
  }
});
