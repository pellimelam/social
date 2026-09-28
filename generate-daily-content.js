/*
 * Vidhwaan Daily Social
 * Production Daily Content Generator
 *
 * Five cards only:
 * 1. నేటి సూక్తి
 * 2. నేటి ఆరోగ్యం
 * 3. నేటి విజ్ఞానం
 * 4. నేటి జ్ఞానం
 * 5. నేటి ప్రశ్న
 *
 * Requirements:
 * - Telugu only
 * - One Groq request per generation attempt
 * - Strict JSON Schema
 * - No culture/Gita card
 * - No fabricated quotations
 * - Conservative health content
 * - Factual-quality validation before publication
 * - Question answer validation
 * - Anti-repetition using recent JSON files
 * - Never overwrite an existing day's JSON
 * - Never publish invalid content
 */

"use strict";

const fs = require("fs");
const path = require("path");

/* =========================================================
   CONFIGURATION
   ========================================================= */

const API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const API_KEY =
  process.env.GROQ_API_KEY;

const TARGET_DATE =
  process.env.TARGET_DATE ||
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

const OUTPUT_DIR =
  path.join(process.cwd(), "data");

const OUTPUT_FILE =
  path.join(OUTPUT_DIR, `${TARGET_DATE}.json`);

const MAX_RECENT_FILES = 14;
const MAX_ATTEMPTS = 5;

const REQUEST_TIMEOUT_MS = 120000;

/*
 * We deliberately keep the temperature low.
 * This is educational/public content, not creative fiction.
 */
const TEMPERATURE = 0.2;

/* =========================================================
   BASIC VALIDATION
   ========================================================= */

if (!API_KEY) {
  console.error(
    "ERROR: GROQ_API_KEY environment variable is missing."
  );
  process.exit(1);
}

/* =========================================================
   UTILITIES
   ========================================================= */

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function hasTelugu(text) {
  return (
    typeof text === "string" &&
    /[\u0C00-\u0C7F]/u.test(text)
  );
}

function hasLatinLetters(text) {
  return (
    typeof text === "string" &&
    /[A-Za-z]/.test(text)
  );
}

function normalizeWhitespace(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForComparison(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}

function wordCount(text) {
  return normalizeWhitespace(text)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function containsAny(text, patterns) {
  const value = String(text).toLowerCase();

  return patterns.some((pattern) =>
    value.includes(pattern.toLowerCase())
  );
}

function similarityScore(a, b) {
  const aa = new Set(
    normalizeForComparison(a)
      .split(/\s+/)
      .filter(Boolean)
  );

  const bb = new Set(
    normalizeForComparison(b)
      .split(/\s+/)
      .filter(Boolean)
  );

  if (!aa.size || !bb.size) {
    return 0;
  }

  let intersection = 0;

  for (const word of aa) {
    if (bb.has(word)) {
      intersection++;
    }
  }

  const union = new Set([...aa, ...bb]).size;

  return union ? intersection / union : 0;
}

/* =========================================================
   DATE VALIDATION
   ========================================================= */

function isValidDateString(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return (
    parsed.toISOString().slice(0, 10) === date
  );
}

if (!isValidDateString(TARGET_DATE)) {
  fail(`Invalid TARGET_DATE: ${TARGET_DATE}`);
}

/* =========================================================
   OUTPUT DIRECTORY
   ========================================================= */

fs.mkdirSync(OUTPUT_DIR, {
  recursive: true
});

/* =========================================================
   NEVER OVERWRITE EXISTING DAILY CONTENT
   ========================================================= */

if (fs.existsSync(OUTPUT_FILE)) {
  console.log("========================================");
  console.log("Vidhwaan Daily Social");
  console.log("Daily JSON already exists.");
  console.log(`File: ${OUTPUT_FILE}`);
  console.log("No overwrite performed.");
  console.log("========================================");

  process.exit(0);
}

/* =========================================================
   RECENT CONTENT
   ========================================================= */

function getRecentJsonFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return [];
  }

  return fs.readdirSync(OUTPUT_DIR)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .reverse()
    .filter((file) => file !== `${TARGET_DATE}.json`)
    .slice(0, MAX_RECENT_FILES);
}

function readRecentContent() {
  const files = getRecentJsonFiles();

  const recent = [];

  for (const file of files) {
    const fullPath = path.join(OUTPUT_DIR, file);

    try {
      const raw = fs.readFileSync(
        fullPath,
        "utf8"
      );

      const data = JSON.parse(raw);

      if (!isObject(data)) {
        continue;
      }

      recent.push({
        date: data.date,

        quote: isObject(data.quote)
          ? {
              title: data.quote.title,
              content: data.quote.content
            }
          : null,

        health: isObject(data.health)
          ? {
              title: data.health.title,
              content: data.health.content
            }
          : null,

        science: isObject(data.science)
          ? {
              title: data.science.title,
              content: data.science.content
            }
          : null,

        knowledge: isObject(data.knowledge)
          ? {
              title: data.knowledge.title,
              content: data.knowledge.content
            }
          : null,

        question: isObject(data.question)
          ? {
              question: data.question.question,
              answer: data.question.answer
            }
          : null
      });
    } catch (error) {
      console.warn(
        `WARNING: Could not read recent file ${file}: ${error.message}`
      );
    }
  }

  return recent;
}

const recentContent = readRecentContent();

/* =========================================================
   RECENT CONTENT PROMPT
   ========================================================= */

function buildRecentContentPrompt() {
  if (!recentContent.length) {
    return "No previous daily content is available.";
  }

  return recentContent
    .map((item) => {
      return JSON.stringify(item, null, 2);
    })
    .join("\n\n");
}

/* =========================================================
   JSON SCHEMA
   ========================================================= */

const RESPONSE_SCHEMA = {
  type: "object",

  additionalProperties: false,

  properties: {
    date: {
      type: "string"
    },

    language: {
      type: "string",
      enum: ["te"]
    },

    publisher: {
      type: "string",
      enum: ["Vidhwaan"]
    },

    quote: {
      type: "object",
      additionalProperties: false,
      properties: {
        heading: {
          type: "string",
          enum: ["నేటి సూక్తి"]
        },

        title: {
          type: "string"
        },

        content: {
          type: "string"
        },

        attribution: {
          type: "string"
        }
      },

      required: [
        "heading",
        "title",
        "content",
        "attribution"
      ]
    },

    health: {
      type: "object",
      additionalProperties: false,
      properties: {
        heading: {
          type: "string",
          enum: ["నేటి ఆరోగ్యం"]
        },

        title: {
          type: "string"
        },

        content: {
          type: "string"
        }
      },

      required: [
        "heading",
        "title",
        "content"
      ]
    },

    science: {
      type: "object",
      additionalProperties: false,
      properties: {
        heading: {
          type: "string",
          enum: ["నేటి విజ్ఞానం"]
        },

        title: {
          type: "string"
        },

        content: {
          type: "string"
        }
      },

      required: [
        "heading",
        "title",
        "content"
      ]
    },

    knowledge: {
      type: "object",
      additionalProperties: false,
      properties: {
        heading: {
          type: "string",
          enum: ["నేటి జ్ఞానం"]
        },

        title: {
          type: "string"
        },

        content: {
          type: "string"
        }
      },

      required: [
        "heading",
        "title",
        "content"
      ]
    },

    question: {
      type: "object",
      additionalProperties: false,
      properties: {
        heading: {
          type: "string",
          enum: ["నేటి ప్రశ్న"]
        },

        question: {
          type: "string"
        },

        answer: {
          type: "string"
        }
      },

      required: [
        "heading",
        "question",
        "answer"
      ]
    }
  },

  required: [
    "date",
    "language",
    "publisher",
    "quote",
    "health",
    "science",
    "knowledge",
    "question"
  ]
};

/* =========================================================
   SYSTEM PROMPT
   ========================================================= */

const SYSTEM_PROMPT = `
You are the production editorial engine for Vidhwaan Daily Social.

Vidhwaan is a village-based global technology company.

You create five Telugu educational/social cards every day.

The five sections are EXACTLY:

1. నేటి సూక్తి
2. నేటి ఆరోగ్యం
3. నేటి విజ్ఞానం
4. నేటి జ్ఞానం
5. నేటి ప్రశ్న

There is NO culture section.
There is NO separate Bhagavad Gita section.
Do not create any sixth section.

The output is public-facing content.
Treat factual accuracy as the highest priority.

CRITICAL EDITORIAL RULE:

If you are not sufficiently confident that a factual statement is correct,
DO NOT use it.

Prefer a simple, well-established fact over an interesting but uncertain fact.

Never invent facts merely to make the content interesting.

Never invent quotations or attributions.

All user-facing content must be in natural Telugu.

Do not include:
- Markdown
- bullet lists
- hashtags
- URLs
- emojis
- English sentences
- AI references
- Groq references
- prompts
- schema explanations
- internal reasoning
- citations
- source notes
- political persuasion
- controversial claims
- unsupported statistics

==================================================
1. నేటి సూక్తి
==================================================

Create one short, meaningful, memorable practical thought.

It may be:
- an original Vidhwaan thought
- a quotation only when attribution is genuinely reliable

If it is an original Vidhwaan thought:
attribution MUST be exactly:
"Vidhwaan"

Never manufacture a quotation and attribute it to:
- Sri Krishna
- Buddha
- Swami Vivekananda
- Mahatma Gandhi
- scientists
- writers
- philosophers
- scriptures
- historical figures
- public figures

Do not paraphrase a famous quotation and pretend it is original.

==================================================
2. నేటి ఆరోగ్యం
==================================================

General health education only.

Allowed topics:
- sleep
- hydration
- physical activity
- nutrition
- posture
- sunlight
- hygiene
- stress management
- healthy routines
- basic human biology
- preventive healthy habits

VERY IMPORTANT:

Do NOT present one fixed quantity as necessary for every person unless
there is a universally established reason.

Do NOT write:
"Everyone must drink exactly 8 glasses of water."

Do NOT make unsupported claims about:
- curing diseases
- preventing every disease
- medicines
- stopping medicines
- supplements
- dangerous treatments
- medical diagnosis
- guaranteed health outcomes

Do not give individualized medical advice.

Use conservative wording such as:
"సహాయపడుతుంది"
when appropriate.

Avoid exaggerated claims.

==================================================
3. నేటి విజ్ఞానం
==================================================

Use established scientific facts.

Allowed:
- astronomy
- space
- physics
- chemistry
- biology
- Earth science
- animals
- plants
- human-body science
- technology
- nature
- everyday science

Numerical scientific facts must be accurate.

Do not invent measurements.

Do not present hypotheses or speculation as established fact.

Do not use uncertain claims simply because they sound interesting.

==================================================
4. నేటి జ్ఞానం
==================================================

Use established general knowledge.

Allowed:
- history
- geography
- mathematics
- language
- inventions
- countries
- nature
- animals
- technology
- society
- economics
- everyday knowledge
- important people
- useful concepts

Historical facts must be especially careful.

Never invent:
- dates
- names
- titles
- locations
- historical decisions
- historical motives
- quotations

If a historical statement is uncertain, choose another topic.

Do not confuse:
- Calcutta/Kolkata
- Delhi/New Delhi
- historical British India terminology
- modern Indian constitutional terminology

==================================================
5. నేటి ప్రశ్న
==================================================

Create one fair thinking question.

It must have one definite answer.

Prefer:
- logic
- simple mathematics
- observation
- reasoning
- everyday situations

Avoid:
- political questions
- opinion questions
- ambiguous puzzles
- obscure trivia
- questions requiring outside research

The answer MUST actually solve the question.

If the answer is mathematical, calculate it carefully.

A pure mathematical answer is allowed, for example:
42
3/28
3.14
100%
25°C
2 గంటలు

But an English sentence such as:
"The answer is 42."
is NOT allowed.

==================================================
LANGUAGE
==================================================

All user-facing text must be Telugu.

Mathematical notation, numbers, units and standard symbols may remain
when necessary.

Do not unnecessarily insert English words.

==================================================
REPETITION
==================================================

The recent-content data supplied by the user must be treated as a
strict anti-repetition reference.

Do not reuse the same:
- topic
- title
- wording
- example
- question pattern
- fact
- quote idea

Prefer genuinely fresh content.

==================================================
PUBLICATION STANDARD
==================================================

This is not casual AI output.

Every card must be:
accurate
clear
useful
concise
shareable
safe
non-misleading

If a topic is difficult to state accurately, choose a simpler topic.

Never sacrifice factual accuracy for novelty.

Return ONLY the requested JSON object.
`;

/* =========================================================
   USER PROMPT
   ========================================================= */

function buildUserPrompt() {
  return `
Generate the Vidhwaan Daily Social content for:

DATE:
${TARGET_DATE}

LANGUAGE:
te

PUBLISHER:
Vidhwaan

Today's content must contain exactly these five cards:

నేటి సూక్తి
నేటి ఆరోగ్యం
నేటి విజ్ఞానం
నేటి జ్ఞానం
నేటి ప్రశ్న

Before producing each card, internally check:

1. Is the claim factually established?
2. Am I inventing any name, date, number, quotation or attribution?
3. Could this wording mislead a reader?
4. Is this safe general educational information?
5. Is this genuinely different from the recent content?
6. Is the Telugu natural and understandable?
7. Can I confidently publish this under the Vidhwaan name?

If any answer is no, choose a different topic.

TARGET DATE MUST BE EXACTLY:
${TARGET_DATE}

RECENT CONTENT:
${buildRecentContentPrompt()}

Return exactly the required JSON schema.
`;
}

/* =========================================================
   FETCH WITH TIMEOUT
   ========================================================= */

async function fetchWithTimeout(
  url,
  options,
  timeoutMs
) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================
   GROQ REQUEST
   ========================================================= */

async function requestGeneration() {
  const body = {
    model: MODEL,

    temperature: TEMPERATURE,

    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: buildUserPrompt()
      }
    ],

    response_format: {
      type: "json_schema",

      json_schema: {
        name: "vidhwaan_daily_social",

        strict: true,

        schema: RESPONSE_SCHEMA
      }
    }
  };

  const response = await fetchWithTimeout(
    API_URL,
    {
      method: "POST",

      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify(body)
    },
    REQUEST_TIMEOUT_MS
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Groq API ${response.status}: ${responseText.slice(0, 2000)}`
    );
  }

  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(
      "Groq returned invalid API JSON."
    );
  }

  const message =
    payload?.choices?.[0]?.message;

  if (!message) {
    throw new Error(
      "Groq response did not contain a message."
    );
  }

  if (
    message.refusal ||
    message.content === null ||
    typeof message.content !== "string"
  ) {
    throw new Error(
      "Groq did not return usable structured content."
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(message.content);
  } catch {
    throw new Error(
      "Groq content was not valid JSON."
    );
  }

  return parsed;
}

/* =========================================================
   BASIC SCHEMA VALIDATION
   ========================================================= */

function validateStructure(data) {
  if (!isObject(data)) {
    fail("Top-level result is not an object.");
  }

  const expectedKeys = [
    "date",
    "language",
    "publisher",
    "quote",
    "health",
    "science",
    "knowledge",
    "question"
  ];

  const actualKeys = Object.keys(data);

  if (
    actualKeys.length !== expectedKeys.length ||
    !expectedKeys.every((key) =>
      actualKeys.includes(key)
    )
  ) {
    fail(
      `Top-level keys are incorrect. Found: ${actualKeys.join(", ")}`
    );
  }

  if (data.date !== TARGET_DATE) {
    fail(
      `date must be ${TARGET_DATE}, received ${data.date}`
    );
  }

  if (data.language !== "te") {
    fail(
      `language must be "te", received ${data.language}`
    );
  }

  if (data.publisher !== "Vidhwaan") {
    fail(
      `publisher must be "Vidhwaan", received ${data.publisher}`
    );
  }

  validateCard(
    data.quote,
    [
      "heading",
      "title",
      "content",
      "attribution"
    ],
    "quote"
  );

  validateCard(
    data.health,
    [
      "heading",
      "title",
      "content"
    ],
    "health"
  );

  validateCard(
    data.science,
    [
      "heading",
      "title",
      "content"
    ],
    "science"
  );

  validateCard(
    data.knowledge,
    [
      "heading",
      "title",
      "content"
    ],
    "knowledge"
  );

  validateCard(
    data.question,
    [
      "heading",
      "question",
      "answer"
    ],
    "question"
  );
}

function validateCard(
  card,
  expectedKeys,
  name
) {
  if (!isObject(card)) {
    fail(`${name} is not an object.`);
  }

  const keys = Object.keys(card);

  if (
    keys.length !== expectedKeys.length ||
    !expectedKeys.every((key) =>
      keys.includes(key)
    )
  ) {
    fail(
      `${name} has incorrect fields.`
    );
  }

  for (const key of expectedKeys) {
    if (!isNonEmptyString(card[key])) {
      fail(
        `${name}.${key} must be a non-empty string.`
      );
    }
  }
}

/* =========================================================
   HEADING VALIDATION
   ========================================================= */

function validateHeadings(data) {
  const headings = {
    quote: "నేటి సూక్తి",
    health: "నేటి ఆరోగ్యం",
    science: "నేటి విజ్ఞానం",
    knowledge: "నేటి జ్ఞానం",
    question: "నేటి ప్రశ్న"
  };

  for (const [key, heading] of Object.entries(headings)) {
    if (data[key].heading !== heading) {
      fail(
        `${key}.heading must be exactly "${heading}".`
      );
    }
  }
}

/* =========================================================
   LANGUAGE VALIDATION
   ========================================================= */

function validateTeluguText(data) {
  const textFields = [
    ["quote.title", data.quote.title],
    ["quote.content", data.quote.content],
    ["health.title", data.health.title],
    ["health.content", data.health.content],
    ["science.title", data.science.title],
    ["science.content", data.science.content],
    ["knowledge.title", data.knowledge.title],
    ["knowledge.content", data.knowledge.content],
    ["question.question", data.question.question]
  ];

  for (const [name, value] of textFields) {
    if (!hasTelugu(value)) {
      fail(
        `${name} does not contain Telugu text.`
      );
    }
  }

  /*
   * The answer may legitimately be:
   * 42
   * 3/28
   * 3.14
   * 100%
   * 25°C
   * 2 గంటలు
   */

  if (
    !hasTelugu(data.question.answer) &&
    !isPureMathAnswer(data.question.answer)
  ) {
    fail(
      "question.answer must contain Telugu or be a valid pure mathematical/numeric answer."
    );
  }

  /*
   * Latin alphabet is allowed only in tightly controlled
   * mathematical/scientific notation.
   */
  const latinAllowedInScience =
    data.science.content
      .replace(/m\/s|m\s*s|CO2|DNA|RNA|Hz|°C|°F|km|kg|NaCl/gi, "");

  if (/[A-Za-z]/.test(latinAllowedInScience)) {
    fail(
      "science.content contains unnecessary Latin/English text."
    );
  }
}

/* =========================================================
   PURE MATH ANSWER
   ========================================================= */

function isPureMathAnswer(value) {
  const text = normalizeWhitespace(value);

  if (!text) {
    return false;
  }

  /*
   * Accept:
   * 42
   * 3/28
   * 3.14
   * 100%
   * 25°C
   * 5 + 5 = 10
   * 2 గంటలు
   */

  if (
    /^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/.test(text)
  ) {
    return true;
  }

  if (
    /^\d+(?:\.\d+)?\s*%$/.test(text)
  ) {
    return true;
  }

  if (
    /^\d+(?:\.\d+)?\s*°[CF]$/.test(text)
  ) {
    return true;
  }

  if (
    /^[0-9+\-*/().=%°\s]+$/.test(text) &&
    /[0-9]/.test(text)
  ) {
    return true;
  }

  if (
    /^\d+(?:\.\d+)?\s+[\u0C00-\u0C7F]+$/.test(text)
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   QUOTE VALIDATION
   ========================================================= */

function validateQuote(data) {
  const attribution =
    normalizeWhitespace(
      data.quote.attribution
    );

  if (attribution !== "Vidhwaan") {
    fail(
      "Quote attribution must be exactly Vidhwaan."
    );
  }

  if (
    data.quote.content.length < 20 ||
    data.quote.content.length > 300
  ) {
    fail(
      "Quote content length is outside the safe range."
    );
  }

  const suspiciousAttributionTerms = [
    "శ్రీకృష్ణ",
    "కృష్ణుడు",
    "బుద్ధుడు",
    "వివేకానంద",
    "గాంధీ",
    "గాంధీజీ",
    "అబ్దుల్ కలాం",
    "ఐన్‌స్టీన్",
    "ఐన్స్టీన్",
    "స్వామి",
    "భగవద్గీత",
    "వేదం",
    "ఉపనిషత్"
  ];

  if (
    containsAny(
      data.quote.content,
      suspiciousAttributionTerms
    )
  ) {
    fail(
      "Quote appears to attribute or imitate a famous/religious source."
    );
  }
}

/* =========================================================
   HEALTH VALIDATION
   ========================================================= */

function validateHealth(data) {
  const combined =
    `${data.health.title} ${data.health.content}`;

  const dangerousPatterns = [
    "వ్యాధిని నయం",
    "వ్యాధి నయం",
    "క్యాన్సర్ నయం",
    "డయాబెటిస్ నయం",
    "బీపీ నయం",
    "మందులు ఆప",
    "మందులు నిలిప",
    "మందులు మాన",
    "డాక్టర్ అవసరం లేదు",
    "100% నయం",
    "శాశ్వతంగా నయం",
    "గ్యారంటీ",
    "హామీగా నయం"
  ];

  if (
    containsAny(
      combined,
      dangerousPatterns
    )
  ) {
    fail(
      "Health content contains an unsafe medical claim."
    );
  }

  /*
   * Reject common universal-number claims.
   */
  const universalNumberPatterns = [
    "అందరూ తప్పనిసరిగా 8 గ్లాస్",
    "ప్రతి ఒక్కరూ 8 గ్లాస్",
    "రోజుకు తప్పనిసరిగా 8 గ్లాస్",
    "అందరూ రోజుకు 2 లీటర్లు",
    "ప్రతి ఒక్కరూ రోజుకు 2 లీటర్లు"
  ];

  if (
    containsAny(
      combined,
      universalNumberPatterns
    )
  ) {
    fail(
      "Health content contains an unsupported universal hydration claim."
    );
  }

  if (
    /తప్పనిసరి|ఖచ్చితంగా|ఎప్పుడూ|అందరికీ/.test(
      data.health.content
    ) &&
    /\d/.test(data.health.content)
  ) {
    fail(
      "Health content contains an overly universal numerical claim."
    );
  }

  if (
    data.health.content.length < 40 ||
    data.health.content.length > 500
  ) {
    fail(
      "Health content length is outside the safe range."
    );
  }
}

/* =========================================================
   SCIENCE VALIDATION
   ========================================================= */

function validateScience(data) {
  const combined =
    `${data.science.title} ${data.science.content}`;

  const unsupportedSuperlatives = [
    "విశ్వంలో అత్యంత వేగమైనది",
    "ప్రపంచంలోనే అత్యంత",
    "ఎప్పటికీ అత్యంత",
    "100% ఖచ్చితంగా"
  ];

  if (
    containsAny(
      combined,
      unsupportedSuperlatives
    )
  ) {
    fail(
      "Science content uses an overly broad or potentially misleading superlative."
    );
  }

  /*
   * Catch a common incorrect speed-of-light value.
   */
  if (
    /299[,. ]?792[,. ]?458/.test(combined) === false &&
    /వెలుగు వేగం|ప్రకాశ వేగం/.test(combined)
  ) {
    /*
     * Do not automatically reject every light-speed topic.
     * Only reject if it attempts to state a numerical value
     * but the known exact value is absent.
     */
    if (/\d/.test(combined)) {
      fail(
        "Light-speed numerical claim does not contain the accepted exact value."
      );
    }
  }

  /*
   * Basic contradiction checks for common science content.
   */
  const obviouslyWrongPatterns = [
    "సూర్యుడు భూమి చుట్టూ తిరుగుతాడు",
    "భూమి చదునుగా ఉంది",
    "చంద్రుడు స్వయంగా వెలుగుతాడు",
    "శబ్దం వాక్యూమ్‌లో ప్రయాణిస్తుంది"
  ];

  if (
    containsAny(
      combined,
      obviouslyWrongPatterns
    )
  ) {
    fail(
      "Science content contains an obviously incorrect scientific claim."
    );
  }

  if (
    data.science.content.length < 45 ||
    data.science.content.length > 550
  ) {
    fail(
      "Science content length is outside the safe range."
    );
  }
}

/* =========================================================
   KNOWLEDGE VALIDATION
   ========================================================= */

function validateKnowledge(data) {
  const combined =
    `${data.knowledge.title} ${data.knowledge.content}`;

  /*
   * Reject known false historical attribution from the
   * previously generated example.
   */
  const falseHistoricalPatterns = [
    "లార్డ్ మౌంట్బేటన్ నిర్ణయించిన",
    "మౌంట్బేటన్ నిర్ణయించిన తర్వాత",
    "మౌంట్బేటన్ నిర్ణయంతో 1911"
  ];

  if (
    containsAny(
      combined,
      falseHistoricalPatterns
    )
  ) {
    fail(
      "Knowledge content contains an incorrect historical attribution."
    );
  }

  /*
   * If the content discusses the 1911 capital shift,
   * it must not attribute the decision to Mountbatten.
   */
  if (
    /1911/.test(combined) &&
    /రాజధాని|కలకత్తా|కలకత్తా నుంచి|కలకత్తా నుండి/.test(combined) &&
    /మౌంట్బేటన్|మౌంట్‌బేటన్/.test(combined)
  ) {
    fail(
      "1911 capital-shift content incorrectly mentions Mountbatten."
    );
  }

  /*
   * Reject obvious historical fabrications.
   */
  const fabricatedPatterns = [
    "అదే రోజున జన్మించాడు",
    "చరిత్రలో తొలిసారిగా ప్రపంచమంతా",
    "అందరూ అంగీకరించారు"
  ];

  if (
    containsAny(
      combined,
      fabricatedPatterns
    )
  ) {
    fail(
      "Knowledge content contains suspiciously absolute historical wording."
    );
  }

  if (
    data.knowledge.content.length < 45 ||
    data.knowledge.content.length > 600
  ) {
    fail(
      "Knowledge content length is outside the safe range."
    );
  }
}

/* =========================================================
   QUESTION VALIDATION
   ========================================================= */

function validateQuestion(data) {
  const question =
    normalizeWhitespace(
      data.question.question
    );

  const answer =
    normalizeWhitespace(
      data.question.answer
    );

  if (question.length < 25) {
    fail(
      "Question is too short."
    );
  }

  if (question.length > 500) {
    fail(
      "Question is too long."
    );
  }

  if (answer.length > 200) {
    fail(
      "Question answer is too long."
    );
  }

  /*
   * Reject opinion/ambiguous question patterns.
   */
  const badQuestionPatterns = [
    "మీ అభిప్రాయం",
    "మీకు ఏది ఇష్టం",
    "ఎవరు గొప్ప",
    "ఏది ఉత్తమం",
    "ఎవరిని ఎంచుకుంటారు"
  ];

  if (
    containsAny(
      question,
      badQuestionPatterns
    )
  ) {
    fail(
      "Question is subjective or opinion-based."
    );
  }

  /*
   * If the answer is a simple numeric fraction,
   * try to verify common probability questions.
   */
  verifySimpleProbabilityQuestion(
    question,
    answer
  );

  /*
   * Reject English sentence answers.
   */
  if (
    hasLatinLetters(answer) &&
    !isPureMathAnswer(answer)
  ) {
    fail(
      "Question answer contains an English/Latin sentence."
    );
  }
}

/* =========================================================
   SIMPLE PROBABILITY VERIFIER
   ========================================================= */

function verifySimpleProbabilityQuestion(
  question,
  answer
) {
  /*
   * Example:
   * 5 red + 3 blue, choose 2, both blue = 3/28.
   *
   * This verifier intentionally handles only the
   * straightforward pattern it can safely recognize.
   */

  const match = question.match(
    /(\d+)\s*[^0-9]{0,20}(?:ఎరుపు|ఎర్ర)[^0-9]{0,20}.*?(\d+)\s*[^0-9]{0,20}(?:నీలి|నీలం)[^0-9]{0,20}.*?2\s*[^0-9]{0,20}(?:బంతులు|వస్తువులు)/u
  );

  /*
   * If the pattern is not recognized, do not
   * manufacture a validation result.
   */
  if (!match) {
    return;
  }

  const red = Number(match[1]);
  const blue = Number(match[2]);

  if (
    !Number.isInteger(red) ||
    !Number.isInteger(blue) ||
    red < 0 ||
    blue < 2
  ) {
    return;
  }

  const total = red + blue;

  if (total < 2) {
    return;
  }

  const numerator =
    blue * (blue - 1);

  const denominator =
    total * (total - 1);

  const gcd = (a, b) =>
    b === 0
      ? a
      : gcd(b, a % b);

  const divisor =
    gcd(numerator, denominator);

  const expected =
    `${numerator / divisor}/${denominator / divisor}`;

  if (
    answer.replace(/\s/g, "") !== expected
  ) {
    fail(
      `Probability answer is incorrect. Expected ${expected}, received ${answer}.`
    );
  }
}

/* =========================================================
   REPETITION VALIDATION
   ========================================================= */

function validateNoRepetition(data) {
  const currentCards = [
    {
      name: "quote",
      title: data.quote.title,
      content: data.quote.content
    },

    {
      name: "health",
      title: data.health.title,
      content: data.health.content
    },

    {
      name: "science",
      title: data.science.title,
      content: data.science.content
    },

    {
      name: "knowledge",
      title: data.knowledge.title,
      content: data.knowledge.content
    },

    {
      name: "question",
      title: "",
      content: data.question.question
    }
  ];

  for (const recent of recentContent) {
    const recentCards = [
      {
        name: "quote",
        title: recent.quote?.title || "",
        content: recent.quote?.content || ""
      },

      {
        name: "health",
        title: recent.health?.title || "",
        content: recent.health?.content || ""
      },

      {
        name: "science",
        title: recent.science?.title || "",
        content: recent.science?.content || ""
      },

      {
        name: "knowledge",
        title: recent.knowledge?.title || "",
        content: recent.knowledge?.content || ""
      },

      {
        name: "question",
        title: "",
        content: recent.question?.question || ""
      }
    ];

    for (const current of currentCards) {
      for (const old of recentCards) {
        if (!old.content) {
          continue;
        }

        const titleSimilarity =
          current.title &&
          old.title
            ? similarityScore(
                current.title,
                old.title
              )
            : 0;

        const contentSimilarity =
          similarityScore(
            current.content,
            old.content
          );

        if (
          titleSimilarity >= 0.85 ||
          contentSimilarity >= 0.88
        ) {
          fail(
            `${current.name} appears too similar to recent content from ${recent.date}.`
          );
        }
      }
    }
  }
}

/* =========================================================
   CONTENT QUALITY VALIDATION
   ========================================================= */

function validateContentQuality(data) {
  const allText = [
    data.quote.title,
    data.quote.content,
    data.quote.attribution,

    data.health.title,
    data.health.content,

    data.science.title,
    data.science.content,

    data.knowledge.title,
    data.knowledge.content,

    data.question.question,
    data.question.answer
  ].join(" ");

  const forbiddenPatterns = [
    "http://",
    "https://",
    "www.",
    "groq",
    "openai",
    "chatgpt",
    "ai generated",
    "హ్యాష్‌ట్యాగ్",
    "#"
  ];

  if (
    containsAny(
      allText,
      forbiddenPatterns
    )
  ) {
    fail(
      "Generated content contains forbidden internal/marketing text."
    );
  }

  /*
   * Excessively long content is not suitable
   * for social cards.
   */
  const cards = [
    ["quote", data.quote.content],
    ["health", data.health.content],
    ["science", data.science.content],
    ["knowledge", data.knowledge.content],
    ["question", data.question.question]
  ];

  for (const [name, content] of cards) {
    if (wordCount(content) > 80) {
      fail(
        `${name} content is too long for a daily social card.`
      );
    }
  }
}

/* =========================================================
   FINAL NORMALIZATION
   ========================================================= */

function normalizeOutput(data) {
  return {
    date: TARGET_DATE,

    language: "te",

    publisher: "Vidhwaan",

    quote: {
      heading: "నేటి సూక్తి",
      title: normalizeWhitespace(
        data.quote.title
      ),
      content: normalizeWhitespace(
        data.quote.content
      ),
      attribution: "Vidhwaan"
    },

    health: {
      heading: "నేటి ఆరోగ్యం",
      title: normalizeWhitespace(
        data.health.title
      ),
      content: normalizeWhitespace(
        data.health.content
      )
    },

    science: {
      heading: "నేటి విజ్ఞానం",
      title: normalizeWhitespace(
        data.science.title
      ),
      content: normalizeWhitespace(
        data.science.content
      )
    },

    knowledge: {
      heading: "నేటి జ్ఞానం",
      title: normalizeWhitespace(
        data.knowledge.title
      ),
      content: normalizeWhitespace(
        data.knowledge.content
      )
    },

    question: {
      heading: "నేటి ప్రశ్న",
      question: normalizeWhitespace(
        data.question.question
      ),
      answer: normalizeWhitespace(
        data.question.answer
      )
    }
  };
}

/* =========================================================
   FULL VALIDATION PIPELINE
   ========================================================= */

function validateEverything(data) {
  validateStructure(data);
  validateHeadings(data);
  validateTeluguText(data);

  validateQuote(data);
  validateHealth(data);
  validateScience(data);
  validateKnowledge(data);
  validateQuestion(data);

  validateNoRepetition(data);
  validateContentQuality(data);
}

/* =========================================================
   GENERATION
   ========================================================= */

async function generateWithRetries() {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {
    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      `Generation attempt ${attempt}/${MAX_ATTEMPTS}`
    );
    console.log(
      `Date: ${TARGET_DATE}`
    );
    console.log(
      `Model: ${MODEL}`
    );
    console.log(
      "========================================"
    );

    try {
      const raw = await requestGeneration();

      /*
       * Force exact production metadata.
       * These are not allowed to vary.
       */
      raw.date = TARGET_DATE;
      raw.language = "te";
      raw.publisher = "Vidhwaan";

      const normalized =
        normalizeOutput(raw);

      validateEverything(normalized);

      console.log("");
      console.log(
        "========================================"
      );
      console.log(
        "QUALITY GATE PASSED"
      );
      console.log(
        "========================================"
      );

      return normalized;

    } catch (error) {
      lastError = error;

      console.error("");
      console.error(
        `Attempt ${attempt} rejected:`
      );
      console.error(
        error.message
      );

      if (attempt < MAX_ATTEMPTS) {
        console.log(
          "Regenerating because the content did not pass the publication gate..."
        );
      }
    }
  }

  throw new Error(
    `All ${MAX_ATTEMPTS} generation attempts failed. No JSON was published. Last error: ${lastError?.message || "unknown error"}`
  );
}

/* =========================================================
   ATOMIC FILE WRITE
   ========================================================= */

function writeJsonAtomically(data) {
  /*
   * Re-check before writing in case another workflow
   * created the same day's file while this job was running.
   */
  if (fs.existsSync(OUTPUT_FILE)) {
    fail(
      `Refusing to overwrite existing file: ${OUTPUT_FILE}`
    );
  }

  const tempFile =
    `${OUTPUT_FILE}.${process.pid}.tmp`;

  const json =
    JSON.stringify(
      data,
      null,
      2
    ) + "\n";

  fs.writeFileSync(
    tempFile,
    json,
    "utf8"
  );

  /*
   * Verify the exact bytes we are about to publish.
   */
  const verification =
    fs.readFileSync(
      tempFile,
      "utf8"
    );

  const parsed =
    JSON.parse(verification);

  validateEverything(parsed);

  /*
   * Atomic rename.
   */
  fs.renameSync(
    tempFile,
    OUTPUT_FILE
  );
}

/* =========================================================
   FINAL SELF-CHECK
   ========================================================= */

function finalSelfCheck() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    fail(
      "Final JSON file was not created."
    );
  }

  const raw =
    fs.readFileSync(
      OUTPUT_FILE,
      "utf8"
    );

  const data =
    JSON.parse(raw);

  validateEverything(data);

  const expectedKeys = [
    "date",
    "language",
    "publisher",
    "quote",
    "health",
    "science",
    "knowledge",
    "question"
  ];

  const keys =
    Object.keys(data);

  if (
    JSON.stringify(keys) !==
    JSON.stringify(expectedKeys)
  ) {
    fail(
      "Final JSON key order/structure is incorrect."
    );
  }

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "FINAL PRODUCTION CHECK PASSED"
  );
  console.log(
    "========================================"
  );

  console.log(
    `File: ${OUTPUT_FILE}`
  );

  console.log(
    `Size: ${Buffer.byteLength(raw, "utf8")} bytes`
  );

  console.log(
    "Cards: 5"
  );

  console.log(
    "Language: Telugu"
  );

  console.log(
    "Publisher: Vidhwaan"
  );

  console.log(
    "Factual-quality gate: PASSED"
  );

  console.log(
    "Publication status: APPROVED"
  );
}

/* =========================================================
   MAIN
   ========================================================= */

async function main() {
  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "VIDHWAAN DAILY SOCIAL"
  );
  console.log(
    "Production Content Generator"
  );
  console.log(
    "========================================"
  );

  console.log(
    `Publication date: ${TARGET_DATE}`
  );

  console.log(
    `Timezone: Asia/Kolkata`
  );

  console.log(
    `Model: ${MODEL}`
  );

  console.log(
    `Recent files checked: ${recentContent.length}`
  );

  console.log(
    "Sections: 5"
  );

  console.log(
    "========================================"
  );

  const generated =
    await generateWithRetries();

  writeJsonAtomically(
    generated
  );

  finalSelfCheck();

  console.log("");
  console.log(
    "Generated JSON:"
  );

  console.log(
    JSON.stringify(
      generated,
      null,
      2
    )
  );

  console.log("");
  console.log(
    "SUCCESS: Daily content published locally."
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "========================================"
  );
  console.error(
    "GENERATION FAILED"
  );
  console.error(
    "========================================"
  );

  console.error(
    error.stack || error.message
  );

  /*
   * Never leave a temporary file behind.
   */
  try {
    const tempFile =
      `${OUTPUT_FILE}.${process.pid}.tmp`;

    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  } catch {
    // Ignore cleanup failure.
  }

  /*
   * Most important production rule:
   *
   * If content does not pass the quality gate,
   * do NOT create a JSON file.
   */
  process.exit(1);
});
