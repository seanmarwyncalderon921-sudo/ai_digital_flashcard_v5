function getElement(id) {
  return document.getElementById(id);
}

let cards = [];
let i = 0;
let typingTimeout = null;
let choiceFlipTimeout = null;
let selectedImages = [];

let selectedGrade = "Grade 11";
let selectedStrand = "STEM";
let selectedSubjectMode = "general";
let editingIndex = null;

// --- Persistence Helpers ---
function saveCardsToStorage() {
  localStorage.setItem("sapc_flashcards", JSON.stringify(cards));
}

function loadCardsFromStorage() {
  const saved = localStorage.getItem("sapc_flashcards");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cards = parsed;
        i = 0;
        getElement("study").classList.remove("hidden");
        show();
      }
    } catch (e) {
      console.error("Failed to load saved cards", e);
    }
  }
}

// --- 1. Landing Page & Consent Handler ---
const landingView = getElement("landing-view");
const appView = getElement("app-view");
const studyPanel = getElement("study");
const fullscreenToggle = getElement("fullscreen-toggle");
const consentScreen = getElement("consent-screen");
const consentForm = getElement("consent-form");
const consentCheckbox = getElement("consent-agree");
const consentContinue = getElement("consent-continue");

if (consentCheckbox) {
  consentCheckbox.addEventListener("change", () => {
    consentContinue.disabled = !consentCheckbox.checked;
  });
}

if (consentForm) {
  consentForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!consentCheckbox.checked) return;
    document.body.classList.remove("consent-required");
    consentScreen.remove();
  });
}

if (getElement("consent-decline")) {
  getElement("consent-decline").addEventListener("click", () => {
    getElement("consent-declined-message").classList.remove("hidden");
    consentCheckbox.disabled = true;
    consentContinue.disabled = true;
  });
}

function showAppWorkspace() {
  if (landingView) landingView.classList.add("hidden");
  if (appView) appView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLandingPage() {
  if (appView) appView.classList.add("hidden");
  if (landingView) landingView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (getElement("hero-start-btn")) getElement("hero-start-btn").addEventListener("click", showAppWorkspace);
if (getElement("nav-launch-btn")) getElement("nav-launch-btn").addEventListener("click", showAppWorkspace);
if (getElement("nav-brand-btn")) getElement("nav-brand-btn").addEventListener("click", showLandingPage);

function syncFullscreenToggle() {
  const isFullscreen = document.fullscreenElement === studyPanel || studyPanel.classList.contains("study-fullscreen");
  fullscreenToggle.textContent = isFullscreen ? "Exit fullscreen" : "Fullscreen";
  fullscreenToggle.setAttribute("aria-pressed", String(isFullscreen));
}

if (fullscreenToggle) {
  fullscreenToggle.addEventListener("click", async () => {
    if (document.fullscreenElement === studyPanel) {
      await document.exitFullscreen();
    } else if (studyPanel.classList.contains("study-fullscreen")) {
      studyPanel.classList.remove("study-fullscreen");
    } else if (document.fullscreenEnabled && studyPanel.requestFullscreen) {
      try {
        await studyPanel.requestFullscreen();
      } catch {
        studyPanel.classList.add("study-fullscreen");
      }
    } else {
      studyPanel.classList.add("study-fullscreen");
    }
    syncFullscreenToggle();
  });
}

document.addEventListener("fullscreenchange", syncFullscreenToggle);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && studyPanel.classList.contains("study-fullscreen")) {
    studyPanel.classList.remove("study-fullscreen");
    syncFullscreenToggle();
  }
});

// --- 2. Theme Toggle ---
const themeToggle = getElement("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");
    const isDark = document.body.classList.contains("dark-theme");
    const themeLabel = getElement("theme-label");
    if (themeLabel) themeLabel.textContent = isDark ? "Light" : "Dark";
  });
}

// --- 3. Subject API Mode Switcher ---
document.querySelectorAll("#subject-mode-container .subject-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#subject-mode-container .subject-btn").forEach(b => {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    selectedSubjectMode = btn.getAttribute("data-subject");
    updateSelectionSummary();
  });
});

// --- 4. Image Previews & Drag-and-Drop ---
const imageInput = getElement("image");
const uploadDropZone = getElement("upload-drop-zone");
const imagePreviewUrls = new Map();

function renderImagePreviews() {
  const previewContainer = getElement("image-previews");
  imagePreviewUrls.forEach((url, file) => {
    if (!selectedImages.includes(file)) {
      URL.revokeObjectURL(url);
      imagePreviewUrls.delete(file);
    }
  });
  previewContainer.replaceChildren();
  previewContainer.classList.toggle("hidden", selectedImages.length === 0);

  selectedImages.forEach((file, index) => {
    const preview = document.createElement("div");
    preview.className = "image-preview";

    const image = document.createElement("img");
    if (!imagePreviewUrls.has(file)) {
      imagePreviewUrls.set(file, URL.createObjectURL(file));
    }
    image.src = imagePreviewUrls.get(file);
    image.alt = file.name || `Pasted image ${index + 1}`;

    const name = document.createElement("span");
    name.className = "image-preview-name";
    name.textContent = file.name || `Pasted image ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-image-btn";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${name.textContent}`);
    removeButton.addEventListener("click", () => {
      selectedImages = selectedImages.filter((_, fileIndex) => fileIndex !== index);
      setSelectedImages(selectedImages);
    });

    preview.append(image, name, removeButton);
    previewContainer.append(preview);
  });
}

function setSelectedImages(files) {
  selectedImages = Array.from(files);
  const fileStatus = getElement("file-name");

  if (selectedImages.length === 1) {
    fileStatus.textContent = selectedImages[0].name || "1 image selected";
  } else if (selectedImages.length > 1) {
    fileStatus.textContent = `${selectedImages.length} images selected`;
  } else {
    fileStatus.textContent = "No files selected";
  }

  renderImagePreviews();
}

if (imageInput) {
  imageInput.addEventListener("change", () => {
    setSelectedImages(imageInput.files);
    imageInput.value = "";
  });
}

if (getElement("notes")) {
  getElement("notes").addEventListener("paste", (event) => {
    const pastedImages = Array.from(event.clipboardData?.items || [])
      .filter(item => item.type.startsWith("image/"))
      .map(item => item.getAsFile())
      .filter(Boolean);

    if (pastedImages.length === 0) return;

    event.preventDefault();
    setSelectedImages([...selectedImages, ...pastedImages]);
  });
}

if (uploadDropZone) {
  uploadDropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      imageInput.click();
    }
  });

  uploadDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadDropZone.classList.add("drag-over");
  });

  uploadDropZone.addEventListener("dragleave", (event) => {
    if (!uploadDropZone.contains(event.relatedTarget)) {
      uploadDropZone.classList.remove("drag-over");
    }
  });

  uploadDropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadDropZone.classList.remove("drag-over");
    setSelectedImages(event.dataTransfer.files);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
  });
}

function typeWriter(element, text, speed = 15) {
  element.textContent = "";
  let index = 0;
  if (typingTimeout) clearTimeout(typingTimeout);

  function type() {
    if (index < text.length) {
      element.textContent += text.charAt(index);
      index++;
      typingTimeout = setTimeout(type, speed);
    }
  }
  type();
}

function normalizeTypedAnswer(value) {
  return value.trim()
    .replace(/^\s*\d+\s*[.)-]\s*/, "")
    .toLocaleLowerCase()
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function getEnumerationItems(value) {
  return value.split(/\r?\n|[,;]+/)
    .map(item => item.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .map(normalizeTypedAnswer);
}

function attachChoiceFeedback(choiceButtons) {
  choiceButtons.forEach(option => {
    option.addEventListener("click", event => {
      event.stopPropagation();
      if (choiceButtons.some(choice => choice.disabled)) return;

      choiceButtons.forEach(choice => { choice.disabled = true; });
      if (option.dataset.correct === "true") {
        option.classList.add("correct");
        return;
      }

      option.classList.add("incorrect");
      const correctChoice = choiceButtons.find(choice => choice.dataset.correct === "true");
      if (correctChoice) correctChoice.classList.add("correct");
      getElement("back").classList.add("revealed-correct");
      choiceFlipTimeout = setTimeout(() => {
        getElement("card").classList.add("flipped");
        choiceFlipTimeout = null;
      }, 850);
    });
  });
}

function updateSelectionSummary() {
  const subjectDisplayNames = {
    general: "General",
    math: "Mathematics",
    filipino: "Filipino"
  };
  getElement("selection-summary").textContent = `Generating for ${selectedGrade} / ${selectedStrand} (${subjectDisplayNames[selectedSubjectMode]})`;
}

document.querySelectorAll("#grade-container .selector-badge").forEach(badge => {
  badge.addEventListener("click", () => {
    document.querySelectorAll("#grade-container .selector-badge").forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    badge.classList.add("active");
    badge.setAttribute("aria-pressed", "true");
    selectedGrade = badge.getAttribute("data-value");
    updateSelectionSummary();
  });
});

document.querySelectorAll("#strand-container .selector-badge").forEach(badge => {
  badge.addEventListener("click", () => {
    document.querySelectorAll("#strand-container .selector-badge").forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    badge.classList.add("active");
    badge.setAttribute("aria-pressed", "true");
    selectedStrand = badge.getAttribute("data-value");
    updateSelectionSummary();
  });
});

if (getElement("generate")) {
  getElement("generate").addEventListener("click", async () => {
    const notes = getElement("notes").value;
    const count = getElement("count").value;
    const difficulty = getElement("difficulty").value;

    getElement("status").textContent = `Generating ${selectedSubjectMode.toUpperCase()} flashcards...`;
    getElement("generate").disabled = true;

    try {
      const images = await Promise.all(selectedImages.map(async file => ({
        data: await fileToBase64(file),
        mimeType: file.type,
        name: file.name
      })));

      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          notes, 
          count,
          images,
          gradeLevel: selectedGrade,
          academicStrand: selectedStrand,
          difficulty,
          subjectMode: selectedSubjectMode
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      cards = data.cards;
      i = 0;
      saveCardsToStorage();
      getElement("study").classList.remove("hidden");
      getElement("status").textContent = cards.length < Number(count)
        ? `Done! ${cards.length} unique cards ready. The source may not support ${count} distinct cards without repetition.`
        : `Done! ${cards.length} cards ready.`;
      show();
    } catch (err) {
      getElement("status").textContent = "Error: " + err.message;
    } finally {
      getElement("generate").disabled = false;
    }
  });
}

function cleanQuestionDisplay(text) {
  if (!text) return "";
  let cleaned = text.split(/(?:tama\s*(?:o|\/)?\s*mali|true\s*(?:or|\/)?\s*false|tamamali|truefalse|\b(tama|mali|true|false)\b)/i)[0];

  return cleaned
    .replace(/^(\s*(true\s*(or|\/)?\s*false|tama\s*(o|\/)?\s*mali|t\s*\/\s*f)\s*[:.-]?\s*)+/gi, '')
    .replace(/[\s.:\-?]+$/, '?')
    .trim();
}

function show() {
  if (choiceFlipTimeout) {
    clearTimeout(choiceFlipTimeout);
    choiceFlipTimeout = null;
  }
  getElement("card").classList.remove("flipped");
  getElement("back").classList.remove("revealed-correct");
  const answerEntry = getElement("typed-answer-entry");
  answerEntry.replaceChildren();
  answerEntry.classList.add("hidden");

  const front = getElement("front");
  const questionLines = cards[i].question.split(/\r?\n/);
  const optionPattern = /^\s*[A-D][.)]\s+/;
  const firstOptionIndex = questionLines.findIndex(line => optionPattern.test(line));

  const isTrueFalse = cards[i].type === "true-false" || /^(true|false|tama|mali)$/i.test(cards[i].answer.trim());
  const isMultipleChoice = cards[i].type === "multiple-choice" || firstOptionIndex !== -1;
  const isLongQuestion = cards[i].question.length > 260 || questionLines.length > 7;

  front.replaceChildren();
  front.classList.toggle("multiple-choice", isMultipleChoice);
  front.classList.toggle("true-false", isTrueFalse);
  front.classList.toggle("long-content", isLongQuestion);

  if (isTrueFalse) {
    const question = document.createElement("div");
    question.className = "question-text";
    front.append(question);

    const cleanText = cleanQuestionDisplay(cards[i].question);
    typeWriter(question, cleanText);

    const options = document.createElement("div");
    options.className = "choice-options true-false-options";
    const correctAnswer = normalizeTypedAnswer(cards[i].answer);
    
    const isFilipinoAnswer = /^(tama|mali)$/i.test(cards[i].answer.trim());
    const labels = isFilipinoAnswer ? ["Tama", "Mali"] : ["True", "False"];

    const choiceButtons = labels.map(choiceText => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "choice-option";
      option.textContent = choiceText;
      option.dataset.correct = String(normalizeTypedAnswer(choiceText) === correctAnswer);
      options.append(option);
      return option;
    });
    attachChoiceFeedback(choiceButtons);
    front.append(options);

  } else if (!isMultipleChoice) {
    typeWriter(front, cards[i].question);
    const answerLines = cards[i].answer.split(/\r?\n/).filter(Boolean);
    const isEnumeration = answerLines.length > 1 && answerLines.every(line => /^\s*\d+[.)]\s+/.test(line));
    const expectedAnswer = isEnumeration
      ? getEnumerationItems(cards[i].answer).sort()
      : [normalizeTypedAnswer(cards[i].answer)];

    const form = document.createElement("form");
    form.className = "typed-answer-form";

    const label = document.createElement("label");
    label.htmlFor = "typed-answer-1";
    label.textContent = isEnumeration
      ? `Enter all ${expectedAnswer.length} items, one per box, in any order`
      : "Your answer";

    const answerFields = [];
    let answerControl = isEnumeration ? document.createElement("div") : document.createElement("input");
    if (isEnumeration) answerControl.className = "enumeration-answer-fields";
    
    expectedAnswer.forEach((_, index) => {
      const field = document.createElement("input");
      field.type = "text";
      field.id = `typed-answer-${index + 1}`;
      field.name = `typed-answer-${index + 1}`;
      field.autocomplete = "off";
      field.placeholder = isEnumeration ? "Enter one item" : "Type your answer";
      field.setAttribute("aria-label", isEnumeration ? `Enumeration item ${index + 1}, any order` : "Your answer");
      answerFields.push(field);
      if (isEnumeration) answerControl.append(field);
      else answerControl = field;
    });

    const checkButton = document.createElement("button");
    checkButton.type = "submit";
    checkButton.className = "primary-btn";
    checkButton.textContent = "Check answer";

    const feedback = document.createElement("p");
    feedback.className = "typed-answer-feedback";
    feedback.setAttribute("aria-live", "polite");

    form.addEventListener("submit", event => {
      event.preventDefault();
      const submittedAnswer = answerFields
        .map(field => normalizeTypedAnswer(field.value))
        .filter(Boolean)
        .sort();
      const isCorrect = submittedAnswer.length === expectedAnswer.length &&
        JSON.stringify(submittedAnswer) === JSON.stringify(expectedAnswer);

      form.classList.toggle("is-correct", isCorrect);
      form.classList.toggle("is-incorrect", !isCorrect);
      feedback.textContent = isCorrect ? "Correct!" : "Not quite. Try again.";
      if (isCorrect) {
        answerFields.forEach(field => { field.disabled = true; });
        checkButton.disabled = true;
      }
    });

    form.append(label, answerControl, checkButton, feedback);
    answerEntry.append(form);
    answerEntry.classList.remove("hidden");
  } else {
    const question = document.createElement("div");
    question.className = "question-text";
    front.append(question);
    typeWriter(question, questionLines.slice(0, firstOptionIndex).join("\n").trim());

    const options = document.createElement("div");
    options.className = "choice-options";
    const answer = cards[i].answer.trim();
    const answerLetter = answer.match(/^([A-D])(?:[.)]\s*|$)/i)?.[1]?.toUpperCase();
    const answerText = answer.replace(/^[A-D][.)]\s*/i, "").trim().toLowerCase();
    const choiceButtons = [];

    questionLines.slice(firstOptionIndex).filter(line => optionPattern.test(line)).forEach(line => {
      const choiceMatch = line.trim().match(/^([A-D])[.)]\s*(.+)$/i);
      const option = document.createElement("button");
      option.type = "button";
      option.className = "choice-option";
      option.textContent = line.trim();
      const isCorrect = answerLetter
        ? choiceMatch?.[1].toUpperCase() === answerLetter
        : choiceMatch?.[2].trim().toLowerCase() === answerText;
      option.dataset.correct = String(Boolean(isCorrect));
      if (choiceMatch) option.dataset.choice = choiceMatch[1].toUpperCase();
      choiceButtons.push(option);
      options.append(option);
    });
    attachChoiceFeedback(choiceButtons);
    front.append(options);
  }

  const back = getElement("back");
  back.replaceChildren();
  const answerLength = cards[i].answer.length + (cards[i].explanation?.length || 0);
  const answerLineCount = cards[i].answer.split(/\r?\n/).length;
  back.classList.toggle("long-content", answerLength > 260 || answerLineCount > 7);
  
  const answerText = document.createElement("div");
  answerText.className = "answer-result";
  answerText.textContent = cards[i].answer;
  back.append(answerText);

  if (cards[i].explanation) {
    const explanation = document.createElement("p");
    explanation.className = "answer-explanation";
    explanation.textContent = cards[i].explanation;
    back.append(explanation);
  }

  getElement("counter").textContent = `Card ${i + 1} of ${cards.length}`;
  getElement("bar").style.width = ((i + 1) / cards.length) * 100 + "%";
}

if (getElement("card")) {
  getElement("card").addEventListener("click", () => getElement("card").classList.toggle("flipped"));
}
if (getElement("next")) {
  getElement("next").addEventListener("click", () => { i = (i + 1) % cards.length; show(); });
}
if (getElement("prev")) {
  getElement("prev").addEventListener("click", () => { i = (i - 1 + cards.length) % cards.length; show(); });
}
if (getElement("shuffle")) {
  getElement("shuffle").addEventListener("click", () => {
    cards.sort(() => Math.random() - 0.5);
    i = 0;
    saveCardsToStorage();
    show();
  });
}

// --- 5. Export and Import JSON Flashcards (Mobile-Optimized) ---
const exportBtn = getElement("export-cards-btn");
const importBtn = getElement("import-cards-btn");
const importFileInput = getElement("import-file-input");

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const cardActionsMenu = getElement("card-actions");
    if (cardActionsMenu) cardActionsMenu.open = false;

    if (cards.length === 0) {
      alert("No flashcards available to export. Generate or create cards first.");
      return;
    }

    const jsonBlob = new Blob([JSON.stringify({ cards }, null, 2)], { type: "application/json" });
    const blobUrl = URL.createObjectURL(jsonBlob);
    
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", blobUrl);
    downloadAnchor.setAttribute("download", `SAPC_Flashcards_${selectedSubjectMode}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(blobUrl);
  });
}

if (importBtn && importFileInput) {
  importBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const cardActionsMenu = getElement("card-actions");
    if (cardActionsMenu) cardActionsMenu.open = false;

    importFileInput.value = "";
    importFileInput.click();
  });

  importFileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        const newCards = Array.isArray(importedData) ? importedData : importedData.cards;

        if (Array.isArray(newCards) && newCards.length > 0 && newCards[0].question && newCards[0].answer) {
          cards = newCards;
          i = 0;
          saveCardsToStorage();
          const studyElement = getElement("study");
          if (studyElement) studyElement.classList.remove("hidden");
          const statusElement = getElement("status");
          if (statusElement) statusElement.textContent = `Successfully imported ${cards.length} cards from JSON!`;
          show();
        } else {
          alert("Invalid flashcard JSON format. File must contain an array of cards with question and answer strings.");
        }
      } catch (err) {
        alert("Failed to parse JSON file: " + err.message);
      }
    };

    reader.onerror = () => {
      alert("Error reading file from storage.");
    };

    reader.readAsText(file);
  });
}

// --- 6. Modal Management ---
const cardModal = getElement("card-modal");
const modalTitle = getElement("modal-title");
const modalQuestion = getElement("modal-question");
const modalAnswer = getElement("modal-answer");
const modalCardType = getElement("modal-card-type");

function inferCardType(card) {
  if (["identification", "multiple-choice", "enumeration", "true-false"].includes(card.type)) {
    return card.type;
  }
  if (/^(true|false|tama|mali)$/i.test(card.answer.trim())) {
    return "true-false";
  }
  if (card.question.split(/\r?\n/).some(line => /^\s*[A-D][.)]\s+/.test(line))) {
    return "multiple-choice";
  }
  if (card.answer.split(/\r?\n/).filter(line => /^\s*\d+[.)]\s+/.test(line)).length > 1) {
    return "enumeration";
  }
  return "identification";
}

function updateModalCardTypeFields() {
  document.querySelectorAll(".custom-card-fields").forEach(fields => {
    fields.classList.toggle("hidden", fields.dataset.cardType !== modalCardType.value);
  });
}

if (modalCardType) {
  modalCardType.addEventListener("change", updateModalCardTypeFields);
}

function openModal(isEdit = false) {
  if (!cardModal) return;
  cardModal.classList.remove("hidden");
  
  if (isEdit && cards.length > 0) {
    const card = cards[i];
    const cardType = inferCardType(card);
    const questionLines = card.question.split(/\r?\n/);
    const firstOptionIndex = questionLines.findIndex(line => /^\s*[A-D][.)]\s+/.test(line));

    modalTitle.textContent = "Edit Flashcard";
    modalCardType.value = cardType;
    
    modalQuestion.value = cardType === "true-false"
      ? cleanQuestionDisplay(card.question)
      : cardType === "multiple-choice" && firstOptionIndex !== -1
        ? questionLines.slice(0, firstOptionIndex).join("\n").trim()
        : card.question;

    modalAnswer.value = cardType === "identification" ? card.answer : "";
    getElement("modal-enumeration-answer").value = cardType === "enumeration"
      ? card.answer.split(/\r?\n/).map(line => line.replace(/^\s*\d+[.)]\s*/, "")).join("\n")
      : "";
    getElement("modal-explanation").value = card.explanation || "";
    const correctOption = card.answer.match(/^\s*([A-D])[.)]\s*/i)?.[1]?.toUpperCase() || "A";
    getElement("modal-correct-option").value = correctOption;

    ["a", "b", "c", "d"].forEach((letter) => {
      const optionLine = cardType === "multiple-choice"
        ? questionLines.slice(firstOptionIndex).find(line => new RegExp(`^\\s*${letter}[.)]\\s+`, "i").test(line))
        : null;
      getElement(`modal-option-${letter}`).value = optionLine ? optionLine.replace(/^\s*[A-D][.)]\s+/i, "") : "";
    });

    getElement("modal-true-false-answer").value = /^(false|mali)$/i.test(card.answer.trim()) ? "False" : "True";
    updateModalCardTypeFields();
    editingIndex = i;
  } else {
    modalTitle.textContent = "Create Custom Flashcard";
    modalCardType.value = "identification";
    modalQuestion.value = "";
    modalAnswer.value = "";
    getElement("modal-enumeration-answer").value = "";
    getElement("modal-explanation").value = "";
    ["a", "b", "c", "d"].forEach(letter => { getElement(`modal-option-${letter}`).value = ""; });
    getElement("modal-correct-option").value = "A";
    getElement("modal-true-false-answer").value = "True";
    updateModalCardTypeFields();
    editingIndex = null;
  }
}

function closeModal() {
  if (cardModal) cardModal.classList.add("hidden");
}

if (getElement("manual-add-btn")) getElement("manual-add-btn").addEventListener("click", () => openModal(false));
if (getElement("edit-card-btn")) getElement("edit-card-btn").addEventListener("click", () => {
  const cardActionsMenu = getElement("card-actions");
  if (cardActionsMenu) cardActionsMenu.open = false;
  openModal(true);
});
if (getElement("close-modal-btn")) getElement("close-modal-btn").addEventListener("click", closeModal);
if (getElement("cancel-modal-btn")) getElement("cancel-modal-btn").addEventListener("click", closeModal);

if (getElement("save-card-btn")) {
  getElement("save-card-btn").addEventListener("click", () => {
    const question = modalQuestion.value.trim();
    const cardType = modalCardType.value;
    if (!question) return alert("Please enter a question.");

    let card;
    if (cardType === "multiple-choice") {
      const letters = ["A", "B", "C", "D"];
      const choices = letters.map(letter => getElement(`modal-option-${letter.toLowerCase()}`).value.trim());
      if (choices.some(choice => !choice)) return alert("Please fill in all four choices.");
      const correctOption = getElement("modal-correct-option").value;
      card = {
        question: `${question}\n${choices.map((choice, index) => `${letters[index]}.${choice}`).join("\n")}`,
        answer: `${correctOption}. ${choices[letters.indexOf(correctOption)]}`,
        type: cardType
      };
    } else if (cardType === "enumeration") {
      const items = getElement("modal-enumeration-answer").value.split(/\r?\n/)
        .map(item => item.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      if (items.length < 2) return alert("Please enter at least two expected items, one per line.");
      card = { question, answer: items.map((item, index) => `${index + 1}. ${item}`).join("\n"), type: cardType };
    } else if (cardType === "true-false") {
      card = {
        question: question,
        answer: getElement("modal-true-false-answer").value,
        explanation: getElement("modal-explanation").value.trim(),
        type: cardType
      };
    } else {
      const answer = modalAnswer.value.trim();
      if (!answer) return alert("Please enter the answer.");
      card = { question, answer, type: "identification" };
    }

    if (editingIndex !== null) {
      cards[editingIndex] = card;
    } else {
      cards.push(card);
      i = cards.length - 1;
      getElement("study").classList.remove("hidden");
    }
    saveCardsToStorage();
    show();
    closeModal();
  });
}

if (getElement("delete-card-btn")) {
  getElement("delete-card-btn").addEventListener("click", () => {
    const cardActionsMenu = getElement("card-actions");
    if (cardActionsMenu) cardActionsMenu.open = false;

    if (cards.length === 0) return;
    if (confirm("Are you sure you want to delete this flashcard?")) {
      cards.splice(i, 1);
      saveCardsToStorage();
      if (cards.length === 0) {
        getElement("study").classList.add("hidden");
      } else {
        i = Math.max(0, i - 1);
        show();
      }
    }
  });
}

// --- Clear All / Delete All Flashcards ---
const clearAllCardsBtn = getElement("clear-all-cards-btn");

if (clearAllCardsBtn) {
  clearAllCardsBtn.addEventListener("click", () => {
    const cardActionsMenu = getElement("card-actions");
    if (cardActionsMenu) cardActionsMenu.open = false;

    if (cards.length === 0) {
      alert("No flashcards available to clear.");
      return;
    }

    if (confirm("Are you sure you want to delete ALL flashcards? This action cannot be undone.")) {
      cards = [];
      i = 0;
      localStorage.removeItem("sapc_flashcards");
      
      const studyElement = getElement("study");
      if (studyElement) studyElement.classList.add("hidden");
      
      const statusElement = getElement("status");
      if (statusElement) statusElement.textContent = "All flashcards have been cleared.";
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (cardModal && !cardModal.classList.contains("hidden")) return;
  if (e.target.closest("button, summary, input, textarea, select")) return;

  if (e.code === "Space") { 
    e.preventDefault(); 
    if (cards.length > 0) getElement("card").classList.toggle("flipped"); 
  }
  if (e.key === "ArrowRight" && cards.length > 0) getElement("next").click();
  if (e.key === "ArrowLeft" && cards.length > 0) getElement("prev").click();
});

// Load saved flashcards on startup
loadCardsFromStorage();