const express = require('express');
const dotenv = require('dotenv');
const { Groq } = require('groq-sdk');

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

// Serve static frontend assets from the public directory
app.use(express.static('public'));

function missingKeyError(keyName) {
  const error = new Error(`${keyName} is missing. Add it to .env and restart the server.`);
  error.statusCode = 503;
  return error;
}

function findCardsArray(data, depth = 0) {
  if (Array.isArray(data)) {
    return data.length > 0 && data.every(card =>
      card &&
      typeof card === 'object' &&
      typeof card.question === 'string' &&
      typeof card.answer === 'string'
    ) ? data : null;
  }
  if (!data || typeof data !== 'object' || depth >= 3) return null;

  const entries = Object.entries(data);
  const cardsEntry = entries.find(([key]) => ['cards', 'flashcards'].includes(key.toLowerCase()));
  if (cardsEntry && Array.isArray(cardsEntry[1])) {
    return findCardsArray(cardsEntry[1], depth + 1);
  }

  for (const [, value] of entries) {
    const cards = findCardsArray(value, depth + 1);
    if (cards) return cards;
  }
  return null;
}

function cleanQuestionText(text) {
  if (typeof text !== 'string') return text;
  
  // Hard boundary split: cut off everything starting at the first occurrence of choice labels or merged verdicts
  let cleaned = text.split(/(?:tama\s*(?:o|\/)?\s*mali|true\s*(?:or|\/)?\s*false|tamamali|truefalse|\b(tama|mali|true|false)\b)/i)[0];
  
  return cleaned
    .replace(/^(\s*(true\s*(or|\/)?\s*false|tama\s*(o|\/)?\s*mali|t\s*\/\s*f)\s*[:.-]?\s*)+/gi, '')
    .replace(/[\s.:\-?]+$/, '?')
    .trim();
}

function parseFlashcards(responseText) {
  const data = JSON.parse(responseText.trim());
  const cards = findCardsArray(data);
  if (!cards) {
    const error = new Error('The AI response did not include a valid cards array.');
    error.code = 'MISSING_CARDS_ARRAY';
    throw error;
  }

  const normalizedCards = cards.map(card => {
    if (typeof card.question !== 'string' || typeof card.answer !== 'string') return card;

    const rawAnswer = card.answer.trim();
    const isTrueFalseVerdict = /^(true|false|tama|mali)\b/i.test(rawAnswer);
    let question = isTrueFalseVerdict ? cleanQuestionText(card.question) : card.question;
    let normalizedAnswer = rawAnswer;
    let extractedExplanation = card.explanation || '';

    if (isTrueFalseVerdict) {
      const match = rawAnswer.match(/^(true|false|tama|mali)[.:\s-]*(.*)/i);
      if (match) {
        const rawVerdict = match[1].toLowerCase();
        if (rawVerdict === 'tama') normalizedAnswer = 'Tama';
        else if (rawVerdict === 'mali') normalizedAnswer = 'Mali';
        else normalizedAnswer = rawVerdict.charAt(0).toUpperCase() + rawVerdict.slice(1);

        if (match[2] && !extractedExplanation) {
          extractedExplanation = match[2].trim();
        }
      }
    }

    const answerItems = rawAnswer.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /^\d+[.)]\s+/.test(line));

    if (answerItems.length >= 2) {
      const questionLines = question.split(/\r?\n/);
      const firstAnswerItem = questionLines.findIndex(line => line.trim() === answerItems[0]);
      if (firstAnswerItem >= 0) {
        const duplicatedItems = questionLines.slice(firstAnswerItem, firstAnswerItem + answerItems.length);
        if (answerItems.every((item, index) => duplicatedItems[index]?.trim() === item)) {
          const promptLines = questionLines.slice(0, firstAnswerItem);
          while (promptLines.length && /^(?:answer|functions|these are|they are|mga sagot)\s*:?\s*$/i.test(promptLines[promptLines.length - 1].trim())) {
            promptLines.pop();
          }
          question = promptLines.join('\n').trim() || question;
        }
      }
    }

    const questionHasChoices = question.split(/\r?\n/).some(line => /^\s*[A-D][.)]\s+/.test(line));
    const type = isTrueFalseVerdict
      ? 'true-false'
      : questionHasChoices
        ? 'multiple-choice'
        : answerItems.length >= 2
          ? 'enumeration'
          : 'identification';

    return { 
      ...card, 
      question, 
      answer: normalizedAnswer, 
      explanation: extractedExplanation, 
      type 
    };
  });

  return { cards: normalizedCards };
}

async function generateWithGroq(messages, subjectMode = 'general', temperature = 0.5) {
  let apiKey = process.env.GROQ_API_KEY;
  if (subjectMode === 'math' && process.env.GROQ_API_KEY_MATH) {
    apiKey = process.env.GROQ_API_KEY_MATH;
  } else if (subjectMode === 'filipino' && process.env.GROQ_API_KEY_FILIPINO) {
    apiKey = process.env.GROQ_API_KEY_FILIPINO;
  }

  if (!apiKey) throw missingKeyError('GROQ_API_KEY');

  const groq = new Groq({ apiKey: apiKey.trim() });
  const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

  const requestCompletion = requestMessages => groq.chat.completions.create({
    messages: requestMessages,
    model,
    response_format: { type: 'json_object' },
    temperature
  });

  const getResponseText = completion => completion.choices?.[0]?.message?.content;

  const completion = await requestCompletion(messages);
  const responseText = getResponseText(completion);
  if (!responseText) throw new Error('Groq returned an empty response.');

  try {
    return parseFlashcards(responseText);
  } catch (error) {
    if (error.code !== 'MISSING_CARDS_ARRAY') throw error;

    const correctedCompletion = await requestCompletion([
      ...messages,
      { role: 'assistant', content: responseText },
      {
        role: 'user',
        content: 'Reformat your previous answer as a valid JSON object with a top-level "cards" array. Each array item must contain string "question" and "answer" fields. Preserve the same study content and return only that JSON object.'
      }
    ]);
    const correctedResponseText = getResponseText(correctedCompletion);
    if (!correctedResponseText) throw new Error('Groq returned an empty response while correcting the flashcard format.');
    return parseFlashcards(correctedResponseText);
  }
}

app.post('/api/flashcards', async (req, res) => {
  const { notes, count, images, image, mimeType, gradeLevel, academicStrand, difficulty, subjectMode } = req.body;

  try {
    const activeSubjectMode = String(subjectMode || 'general').toLowerCase();
    const parsedCount = Number.parseInt(count, 10);
    const requestedCount = Number.isInteger(parsedCount) && parsedCount > 0
      ? Math.min(parsedCount, 50)
      : 10;
    const requestedDifficulty = String(difficulty || 'medium').toLowerCase();
    const difficultyLevel = ['easy', 'medium', 'hard'].includes(requestedDifficulty)
      ? requestedDifficulty
      : 'medium';

    const difficultyGuidance = {
      easy: 'Focus on foundational facts, direct recall, and clear wording.',
      medium: 'Use a balanced mix of recall and understanding appropriate to the target grade.',
      hard: 'Focus on detailed understanding, application, and connections between concepts.'
    }[difficultyLevel];

    const difficultyCardMix = {
      easy: 'Favor Multiple Choice and True/False (about 40% each), with the remaining cards as Identification. Do not use Enumeration.',
      medium: 'Use Multiple Choice, True/False, and Identification in roughly equal shares. Do not force Enumeration into this level.',
      hard: 'Keep the deck varied: use Enumeration for about one-third of cards, and split the remaining cards as evenly as possible among Multiple Choice, True/False, and Identification.'
    }[difficultyLevel];

    const diversityGuidance = requestedCount >= 20
      ? 'This is a large deck. Assign one different fact, problem, or concept to each card without repeating formats.'
      : 'Give each card a distinct fact, problem, or concept.';

    let subjectSpecificInstructions = "";
    if (activeSubjectMode === 'math') {
      subjectSpecificInstructions = "SUBJECT FOCUS: MATHEMATICS / GEN MATH / CALCULUS / STATISTICS.\n" +
        "- Focus on step-by-step problem solving, formulas, mathematical theorems, variable identifications, and word problems.\n" +
        "- Ensure clean standard text formatting for equations (e.g., x^2 + 5x + 6 = 0).\n" +
        "- For True/False questions, test mathematical properties, statements, or identity validity.\n" +
        "- Include final evaluated numerical answers or step solutions in the 'answer' or 'explanation' fields.";
    } else if (activeSubjectMode === 'filipino') {
      subjectSpecificInstructions = "SUBJECT FOCUS: FILIPINO / KOMUNIKASYON / PANITIKAN / PAGBASA AT PAGSUSURI.\n" +
        "- Generate all flashcards primarily in Tagalog / Filipino language.\n" +
        "- Focus on literary analysis, vocabulary (talasalitaan), grammar (balarila), rhetorical concepts, and historical literary works.\n" +
        "- STRICT TRUE/FALSE RULE: Place ONLY the statement inside 'question'. NEVER append 'Tama o Mali', 'Tama/Mali', choices, or explanations inside 'question'. Set 'answer' strictly to 'Tama' or 'Mali'. Place reasoning in 'explanation'.";
    } else {
      subjectSpecificInstructions = "SUBJECT FOCUS: GENERAL ACADEMIC SUBJECTS (STEM, ABM, HUMSS, TVL).";
    }

    let systemInstructions = "You are an expert academic reviewer. Generate " + requestedCount + " structured study flashcards when the source supports that many unique facts.\n" +
                             "Target Level: " + (gradeLevel || 'Senior High School') + "\n" +
                             "Target Track/Strand: " + (academicStrand || 'General') + "\n" +
                             subjectSpecificInstructions + "\n\n" +
                             "Target Difficulty: " + difficultyLevel + ". " + difficultyGuidance + "\n\n" +
                             "Card type mix for this difficulty: " + difficultyCardMix + "\n\n" +
                             "Coverage and variety: " + diversityGuidance + "\n\n" +
                             "CRITICAL FORMAT RULES:\n" +
                             "1. Follow the card type mix for the selected difficulty.\n" +
                             "2. For Multiple Choice, put the question and options A, B, C, and D in the \"question\" string on separate lines, and make \"answer\" the correct option string.\n" +
                             "3. For Identification, make \"question\" a clear prompt and \"answer\" the exact term or solution.\n" +
                             "4. For Enumeration, put numbered items only in \"answer\". Never include answer items in \"question\".\n" +
                             "5. For True/False (or Tama/Mali): Put ONLY the statement in \"question\". Do NOT add options or explanations into \"question\". Make \"answer\" strictly \"True\" or \"False\" (or \"Tama\" or \"Mali\"), and add a concise \"explanation\" field for reasoning.\n" +
                             "6. You must respond with a pure, raw JSON object containing a single top-level array property called \"cards\". Each item must contain string properties \"question\" and \"answer\".";

    const messages = [
      { role: "system", content: systemInstructions }
    ];

    const inputImages = Array.isArray(images)
      ? images
      : image && mimeType ? [{ data: image, mimeType }] : [];

    const validImages = inputImages.filter(file => file && typeof file.data === 'string');

    const normalizedImages = validImages.map(file => {
      const cleanBase64 = file.data.replace(/^data:image\/\w+;base64,/, '');
      const type = file.mimeType || 'image/jpeg';
      return { data: cleanBase64, mimeType: type };
    });

    if (normalizedImages.length > 0) {
      const content = [
        { type: "text", text: "Analyze these study note images along with any text inputs provided: " + (notes || "") }
      ];
      normalizedImages.forEach(file => {
        content.push({
          type: "image_url",
          image_url: { url: `data:${file.mimeType};base64,${file.data}` }
        });
      });
      messages.push({ role: "user", content });
    } else {
      messages.push({
        role: "user",
        content: "Here is the raw text study material: " + (notes || "Generate default relevant track items.")
      });
    }

    const parsedData = await generateWithGroq(messages, activeSubjectMode, requestedCount >= 20 ? 0.65 : 0.5);
    res.json(parsedData);

  } catch (error) {
    console.error("Flashcard generation error:", error.message);
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to process flashcard data via Groq." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});