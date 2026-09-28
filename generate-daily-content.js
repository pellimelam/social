/*
 * Vidhwaan Daily Social
 * Production Daily Content Generator
 *
 * Generates exactly ONE daily JSON containing exactly FIVE cards:
 *
 * 1. నేటి సూక్తి
 * 2. నేటి ఆరోగ్యం
 * 3. నేటి విజ్ఞానం
 * 4. నేటి జ్ఞానం
 * 5. నేటి ప్రశ్న
 *
 * Model:
 *   openai/gpt-oss-120b
 *
 * API:
 *   Groq
 *
 * Production principles:
 *   - Accuracy before novelty
 *   - Conservative factual generation
 *   - Telugu-only user-facing content
 *   - Strict JSON Schema
 *   - One generation request for all five cards
 *   - Anti-repetition
 *   - Deterministic validation
 *   - Question verification
 *   - Safe health rules
 *   - No fabricated quotations
 *   - Never overwrite an existing daily JSON
 *   - Never publish failed content
 */

"use strict";

const fs = require("fs");
const path = require("path");

/* =========================================================
   CONFIGURATION
   ========================================================= */

const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const GROQ_API_KEY =
  process.env.GROQ_API_KEY;

const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";

const TARGET_DATE =
  process.env.TARGET_DATE ||
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

const DATA_DIRECTORY =
  path.join(process.cwd(), "data");

const OUTPUT_FILE =
  path.join(
    DATA_DIRECTORY,
    `${TARGET_DATE}.json`
  );

const MAX_RECENT_FILES = 14;

const MAX_GENERATION_ATTEMPTS = 5;

const REQUEST_TIMEOUT_MS = 120000;

/*
 * Low temperature because this is factual/public content,
 * not creative fiction.
 */
const TEMPERATURE = 0.15;

/*
 * GPT-OSS supports reasoning effort.
 *
 * High reasoning is preferred because the task includes:
 * - factual caution
 * - five different editorial categories
 * - question reasoning
 * - anti-repetition
 */
const REASONING_EFFORT = "high";

/* =========================================================
   BASIC ENVIRONMENT VALIDATION
   ========================================================= */

if (!GROQ_API_KEY) {
  console.error(
    "ERROR: GROQ_API_KEY is not available."
  );

  process.exit(1);
}

/* =========================================================
   UTILITY FUNCTIONS
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

function normalizeWhitespace(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function hasTelugu(value) {
  return (
    typeof value === "string" &&
    /[\u0C00-\u0C7F]/u.test(value)
  );
}

function hasLatinLetters(value) {
  return (
    typeof value === "string" &&
    /[A-Za-z]/.test(value)
  );
}

function wordCount(value) {
  return normalizeWhitespace(value)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function containsAny(value, patterns) {
  const text =
    String(value).toLowerCase();

  return patterns.some((pattern) =>
    text.includes(
      String(pattern).toLowerCase()
    )
  );
}

function normalizeForComparison(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
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

  const union =
    new Set([
      ...aa,
      ...bb
    ]).size;

  return union
    ? intersection / union
    : 0;
}

/* =========================================================
   DATE VALIDATION
   ========================================================= */

function validateDateString(date) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    fail(
      `Invalid date format: ${date}`
    );
  }

  const parsed =
    new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    fail(
      `Invalid calendar date: ${date}`
    );
  }

  if (
    parsed.toISOString().slice(0, 10) !==
    date
  ) {
    fail(
      `Invalid calendar date: ${date}`
    );
  }
}

validateDateString(
  TARGET_DATE
);

/* =========================================================
   DATA DIRECTORY
   ========================================================= */

fs.mkdirSync(
  DATA_DIRECTORY,
  {
    recursive: true
  }
);

/* =========================================================
   NEVER OVERWRITE EXISTING JSON
   ========================================================= */

if (
  fs.existsSync(OUTPUT_FILE)
) {
  console.log(
    "========================================"
  );

  console.log(
    "VIDHWAAN DAILY SOCIAL"
  );

  console.log(
    "Daily JSON already exists."
  );

  console.log(
    `File: ${OUTPUT_FILE}`
  );

  console.log(
    "No overwrite performed."
  );

  console.log(
    "========================================"
  );

  process.exit(0);
}

/* =========================================================
   RECENT DAILY JSON FILES
   ========================================================= */

function getRecentFiles() {
  if (
    !fs.existsSync(
      DATA_DIRECTORY
    )
  ) {
    return [];
  }

  return fs
    .readdirSync(
      DATA_DIRECTORY
    )
    .filter((file) =>
      /^\d{4}-\d{2}-\d{2}\.json$/.test(file)
    )
    .filter(
      (file) =>
        file !== `${TARGET_DATE}.json`
    )
    .sort()
    .reverse()
    .slice(
      0,
      MAX_RECENT_FILES
    );
}

/* =========================================================
   READ RECENT CONTENT
   ========================================================= */

function readRecentContent() {
  const files =
    getRecentFiles();

  const recent = [];

  for (const file of files) {
    const fullPath =
      path.join(
        DATA_DIRECTORY,
        file
      );

    try {
      const raw =
        fs.readFileSync(
          fullPath,
          "utf8"
        );

      const data =
        JSON.parse(raw);

      if (
        !isObject(data)
      ) {
        continue;
      }

      recent.push({
        date: data.date,

        quote:
          isObject(data.quote)
            ? {
                title:
                  data.quote.title,
                content:
                  data.quote.content,
                attribution:
                  data.quote.attribution
              }
            : null,

        health:
          isObject(data.health)
            ? {
                title:
                  data.health.title,
                content:
                  data.health.content
              }
            : null,

        science:
          isObject(data.science)
            ? {
                title:
                  data.science.title,
                content:
                  data.science.content
              }
            : null,

        knowledge:
          isObject(data.knowledge)
            ? {
                title:
                  data.knowledge.title,
                content:
                  data.knowledge.content
              }
            : null,

        question:
          isObject(data.question)
            ? {
                question:
                  data.question.question,
                answer:
                  data.question.answer
              }
            : null
      });

    } catch (error) {
      console.warn(
        `WARNING: Could not read ${file}: ${error.message}`
      );
    }
  }

  return recent;
}

const recentContent =
  readRecentContent();

/* =========================================================
   RECENT CONTENT FOR MODEL
   ========================================================= */

function buildRecentContent() {
  if (
    !recentContent.length
  ) {
    return (
      "No previous daily content is available."
    );
  }

  return recentContent
    .map(
      (item) =>
        JSON.stringify(
          item,
          null,
          2
        )
    )
    .join("\n\n");
}

/* =========================================================
   STRICT JSON SCHEMA
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

Your output will be published publicly and may be read and shared by
a very large audience.

Therefore:

FACTUAL ACCURACY IS MORE IMPORTANT THAN NOVELTY.

Never invent a fact simply because it sounds interesting.

If you are uncertain about a factual claim, DO NOT USE IT.

Choose a simpler, well-established fact instead.

Do not guess dates, names, numbers, quotations, historical events,
scientific measurements, medical claims, or attributions.

==================================================
EXACT OUTPUT
==================================================

Generate EXACTLY FIVE cards:

1. నేటి సూక్తి
2. నేటి ఆరోగ్యం
3. నేటి విజ్ఞానం
4. నేటి జ్ఞానం
5. నేటి ప్రశ్న

There is NO sixth card.

There is NO culture card.

There is NO separate Bhagavad Gita card.

Do not add any other field or section.

==================================================
LANGUAGE
==================================================

All user-facing content must be natural Telugu.

Do not write English sentences.

Do not include:
- URLs
- hashtags
- emojis
- markdown
- bullet lists
- AI references
- Groq references
- prompts
- schema explanations
- internal reasoning
- source notes

Numbers, mathematical notation and internationally recognized scientific
symbols may be used when necessary.

==================================================
MOST IMPORTANT INTERNAL REVIEW
==================================================

Before returning the JSON, internally review all five cards.

For every factual statement ask:

1. Is this established knowledge?
2. Am I certain the fact is correct?
3. Did I invent a date, number, name or attribution?
4. Did I overstate the claim?
5. Could the wording mislead a normal reader?
6. Is there a simpler and safer way to state it?

If uncertain, replace the topic with a safer established fact.

==================================================
CARD 1 — నేటి సూక్తి
==================================================

Create one concise, meaningful and practical thought.

Prefer an original Vidhwaan thought.

For an original thought:

attribution MUST be exactly:
Vidhwaan

Do not manufacture quotations.

Do not attribute an invented statement to:
- Sri Krishna
- Buddha
- Vivekananda
- Gandhi
- scientists
- writers
- philosophers
- historical figures
- scriptures
- public figures

Do not take a famous quotation, paraphrase it and present it as an
original quotation.

==================================================
CARD 2 — నేటి ఆరోగ్యం
==================================================

Provide general educational health information.

Good topics include:
- sleep
- hydration
- physical activity
- nutrition
- hygiene
- posture
- sunlight
- stress management
- healthy routines
- basic human biology

Do NOT:
- diagnose
- prescribe
- tell people to stop medication
- recommend dangerous treatment
- promise cures
- claim one food cures disease
- make unsupported medical claims
- make universal rules that do not apply to everyone

Be especially careful with numerical health claims.

Do NOT say that every person must drink exactly a fixed amount of water.

Use conservative language.

==================================================
CARD 3 — నేటి విజ్ఞానం
==================================================

Use one well-established scientific fact.

Possible subjects:
- physics
- chemistry
- biology
- astronomy
- space
- Earth science
- plants
- animals
- human biology
- technology
- everyday science

Scientific numbers must be accurate.

Do not present hypotheses, speculation or uncertain claims as facts.

Do not use exaggerated superlatives unless the statement is genuinely
and precisely justified.

==================================================
CARD 4 — నేటి జ్ఞానం
==================================================

Provide one useful, established general-knowledge fact.

Possible subjects:
- history
- geography
- mathematics
- language
- inventions
- countries
- nature
- animals
- technology
- economics
- everyday knowledge
- important concepts

Historical claims require special caution.

Never invent:
- dates
- names
- historical decisions
- motives
- quotations
- inventors
- titles

If you are uncertain, select another fact.

==================================================
CARD 5 — నేటి ప్రశ్న
==================================================

Create one enjoyable question with exactly one definite answer.

Prefer:
- logic
- mathematics
- probability
- reasoning
- observation
- everyday situations

Avoid:
- opinions
- politics
- ambiguous puzzles
- obscure trivia
- questions requiring external research

The question itself must contain enough information to solve it.

The answer must actually be correct.

Pure mathematical answers are allowed, for example:
42
3/28
3.14
100%
25°C
2 గంటలు

Do not return an English sentence as the answer.

==================================================
ANTI-REPETITION
==================================================

The recent content supplied below represents content that has already
been published.

Do not repeat:
- the same topic
- the same fact
- the same quote idea
- the same question
- the same example
- substantially identical wording

Choose genuinely different content.

==================================================
FINAL QUALITY STANDARD
==================================================

This is public Vidhwaan content.

Accuracy is more important than being clever.

Useful and established is better than obscure and uncertain.

Simple and correct is better than impressive and questionable.

If a topic cannot be stated confidently and accurately,
choose another topic.

Return ONLY the JSON object.
`;

/* =========================================================
   USER PROMPT
   ========================================================= */

function buildUserPrompt() {
  return `
Generate today's Vidhwaan Daily Social content.

DATE:
${TARGET_DATE}

LANGUAGE:
te

PUBLISHER:
Vidhwaan

Generate exactly these five cards:

నేటి సూక్తి
నేటి ఆరోగ్యం
నేటి విజ్ఞానం
నేటి జ్ఞానం
నేటి ప్రశ్న

The five cards must be different from one another in subject and purpose.

Do not let one card repeat the subject of another card.

The date MUST be exactly:
${TARGET_DATE}

Before returning the JSON, perform an internal editorial review of
all five cards for accuracy, safety, Telugu quality, usefulness,
originality and non-repetition.

RECENT PUBLISHED CONTENT:

${buildRecentContent()}

Return only the required JSON object.
`;
}

/* =========================================================
   GROQ REQUEST
   ========================================================= */

async function requestGroq() {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        GROQ_API_URL,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${GROQ_API_KEY}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            model: GROQ_MODEL,

            temperature:
              TEMPERATURE,

            reasoning_effort:
              REASONING_EFFORT,

            messages: [
              {
                role: "system",
                content:
                  SYSTEM_PROMPT
              },
              {
                role: "user",
                content:
                  buildUserPrompt()
              }
            ],

            response_format: {
              type: "json_schema",

              json_schema: {
                name:
                  "vidhwaan_daily_social",

                strict: true,

                schema:
                  RESPONSE_SCHEMA
              }
            }
          }),

          signal:
            controller.signal
        }
      );

    const responseText =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `Groq API error ${response.status}: ${responseText.slice(
          0,
          2000
        )}`
      );
    }

    let payload;

    try {
      payload =
        JSON.parse(
          responseText
        );
    } catch {
      throw new Error(
        "Groq API returned invalid JSON."
      );
    }

    const message =
      payload?.choices?.[0]?.message;

    if (!message) {
      throw new Error(
        "Groq response does not contain a message."
      );
    }

    if (
      message.refusal
    ) {
      throw new Error(
        `Groq refused the request: ${message.refusal}`
      );
    }

    if (
      typeof message.content !==
      "string"
    ) {
      throw new Error(
        "Groq response content is not a string."
      );
    }

    let parsed;

    try {
      parsed =
        JSON.parse(
          message.content
        );
    } catch {
      throw new Error(
        "Groq returned content that is not valid JSON."
      );
    }

    return parsed;

  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   STRUCTURE VALIDATION
   ========================================================= */

function validateStructure(data) {
  if (
    !isObject(data)
  ) {
    fail(
      "Generated result is not an object."
    );
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

  const actualKeys =
    Object.keys(data);

  if (
    JSON.stringify(actualKeys) !==
    JSON.stringify(expectedKeys)
  ) {
    fail(
      `Invalid top-level structure. Received: ${actualKeys.join(
        ", "
      )}`
    );
  }

  if (
    data.date !==
    TARGET_DATE
  ) {
    fail(
      `Wrong date. Expected ${TARGET_DATE}, received ${data.date}.`
    );
  }

  if (
    data.language !== "te"
  ) {
    fail(
      `language must be "te".`
    );
  }

  if (
    data.publisher !==
    "Vidhwaan"
  ) {
    fail(
      `publisher must be "Vidhwaan".`
    );
  }

  const sections = [
    "quote",
    "health",
    "science",
    "knowledge",
    "question"
  ];

  for (
    const section of sections
  ) {
    if (
      !isObject(
        data[section]
      )
    ) {
      fail(
        `${section} is missing or invalid.`
      );
    }
  }

  if (
    "culture" in data
  ) {
    fail(
      "Forbidden culture section exists."
    );
  }
}

/* =========================================================
   CARD FIELD VALIDATION
   ========================================================= */

function validateCardFields(
  card,
  section,
  expectedFields
) {
  const actualFields =
    Object.keys(card);

  if (
    JSON.stringify(actualFields) !==
    JSON.stringify(expectedFields)
  ) {
    fail(
      `${section} has invalid fields.`
    );
  }

  for (
    const field of expectedFields
  ) {
    if (
      !isNonEmptyString(
        card[field]
      )
    ) {
      fail(
        `${section}.${field} must be a non-empty string.`
      );
    }
  }
}

/* =========================================================
   HEADINGS
   ========================================================= */

function validateHeadings(data) {
  const headings = {
    quote:
      "నేటి సూక్తి",

    health:
      "నేటి ఆరోగ్యం",

    science:
      "నేటి విజ్ఞానం",

    knowledge:
      "నేటి జ్ఞానం",

    question:
      "నేటి ప్రశ్న"
  };

  for (
    const [section, heading]
    of Object.entries(headings)
  ) {
    if (
      data[section].heading !==
      heading
    ) {
      fail(
        `${section}.heading is incorrect.`
      );
    }
  }
}

/* =========================================================
   LANGUAGE VALIDATION
   ========================================================= */

function validateLanguage(data) {
  const fields = [
    [
      "quote.title",
      data.quote.title
    ],
    [
      "quote.content",
      data.quote.content
    ],
    [
      "health.title",
      data.health.title
    ],
    [
      "health.content",
      data.health.content
    ],
    [
      "science.title",
      data.science.title
    ],
    [
      "science.content",
      data.science.content
    ],
    [
      "knowledge.title",
      data.knowledge.title
    ],
    [
      "knowledge.content",
      data.knowledge.content
    ],
    [
      "question.question",
      data.question.question
    ]
  ];

  for (
    const [name, value]
    of fields
  ) {
    if (
      !hasTelugu(value)
    ) {
      fail(
        `${name} does not contain Telugu text.`
      );
    }
  }

  const answer =
    data.question.answer;

  if (
    !hasTelugu(answer) &&
    !isPureMathematicalAnswer(
      answer
    )
  ) {
    fail(
      "question.answer must be Telugu or a valid mathematical/numeric answer."
    );
  }
}

/* =========================================================
   PURE MATHEMATICAL ANSWER
   ========================================================= */

function isPureMathematicalAnswer(
  value
) {
  const text =
    normalizeWhitespace(
      value
    );

  if (!text) {
    return false;
  }

  if (
    /^\d+(?:\.\d+)?$/.test(text)
  ) {
    return true;
  }

  if (
    /^\d+\s*\/\s*\d+$/.test(text)
  ) {
    return true;
  }

  if (
    /^\d+(?:\.\d+)?\s*%$/.test(text)
  ) {
    return true;
  }

  if (
    /^\d+(?:\.\d+)?\s*°[CF]$/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /^[0-9+\-*/().=%°\s]+$/.test(
      text
    ) &&
    /\d/.test(text)
  ) {
    return true;
  }

  if (
    /^\d+(?:\.\d+)?\s+[\u0C00-\u0C7F]+$/u.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   QUOTE VALIDATION
   ========================================================= */

function validateQuote(data) {
  const quote =
    data.quote;

  if (
    quote.attribution !==
    "Vidhwaan"
  ) {
    fail(
      "Quote attribution must be exactly Vidhwaan."
    );
  }

  if (
    quote.content.length <
      20 ||
    quote.content.length >
      300
  ) {
    fail(
      "Quote content length is unsuitable."
    );
  }

  const fabricatedAttributionPatterns = [
    "శ్రీకృష్ణ",
    "శ్రీ కృష్ణ",
    "కృష్ణుడు",
    "బుద్ధుడు",
    "వివేకానంద",
    "గాంధీ",
    "గాంధీజీ",
    "అబ్దుల్ కలాం",
    "ఐన్‌స్టీన్",
    "ఐన్స్టీన్",
    "స్వామి వివేకానంద",
    "భగవద్గీత",
    "వేదం",
    "ఉపనిషత్"
  ];

  if (
    containsAny(
      quote.content,
      fabricatedAttributionPatterns
    )
  ) {
    fail(
      "Quote appears to contain a famous/religious attribution."
    );
  }
}

/* =========================================================
   HEALTH VALIDATION
   ========================================================= */

function validateHealth(data) {
  const text =
    [
      data.health.title,
      data.health.content
    ].join(" ");

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
    "గ్యారంటీగా నయం",
    "హామీగా నయం",
    "ఒక్కసారిగా నయం"
  ];

  if (
    containsAny(
      text,
      dangerousPatterns
    )
  ) {
    fail(
      "Unsafe medical claim detected."
    );
  }

  const unsupportedUniversalHealthPatterns = [
    "అందరూ తప్పనిసరిగా 8 గ్లాస్",
    "ప్రతి ఒక్కరూ 8 గ్లాస్",
    "రోజుకు తప్పనిసరిగా 8 గ్లాస్",
    "అందరూ రోజుకు 2 లీటర్లు",
    "ప్రతి ఒక్కరూ రోజుకు 2 లీటర్లు",
    "అందరికీ రోజుకు 2 లీటర్లు"
  ];

  if (
    containsAny(
      text,
      unsupportedUniversalHealthPatterns
    )
  ) {
    fail(
      "Unsupported universal hydration claim detected."
    );
  }

  if (
    text.length < 40 ||
    text.length > 500
  ) {
    fail(
      "Health content length is unsuitable."
    );
  }
}

/* =========================================================
   SCIENCE VALIDATION
   ========================================================= */

function validateScience(data) {
  const text =
    [
      data.science.title,
      data.science.content
    ].join(" ");

  const obviouslyFalsePatterns = [
    "భూమి చదునుగా ఉంది",
    "సూర్యుడు భూమి చుట్టూ తిరుగుతాడు",
    "చంద్రుడు స్వయంగా వెలుగుతాడు",
    "శబ్దం వాక్యూమ్‌లో ప్రయాణిస్తుంది"
  ];

  if (
    containsAny(
      text,
      obviouslyFalsePatterns
    )
  ) {
    fail(
      "Obvious scientific error detected."
    );
  }

  /*
   * Prevent careless superlatives.
   */
  const broadSuperlatives = [
    "విశ్వంలో అత్యంత వేగమైనది",
    "ప్రపంచంలోనే అత్యంత",
    "100% ఖచ్చితంగా"
  ];

  if (
    containsAny(
      text,
      broadSuperlatives
    )
  ) {
    fail(
      "Potentially misleading scientific superlative detected."
    );
  }

  if (
    data.science.content.length <
      45 ||
    data.science.content.length >
      550
  ) {
    fail(
      "Science content length is unsuitable."
    );
  }
}

/* =========================================================
   KNOWLEDGE VALIDATION
   ========================================================= */

function validateKnowledge(data) {
  const text =
    [
      data.knowledge.title,
      data.knowledge.content
    ].join(" ");

  /*
   * Specific known historical error that must never
   * appear again.
   */
  const falseHistoricalPatterns = [
    "లార్డ్ మౌంట్బేటన్ నిర్ణయించిన",
    "మౌంట్బేటన్ నిర్ణయించిన తర్వాత",
    "మౌంట్బేటన్ నిర్ణయంతో 1911"
  ];

  if (
    containsAny(
      text,
      falseHistoricalPatterns
    )
  ) {
    fail(
      "Incorrect historical attribution detected."
    );
  }

  if (
    /1911/.test(text) &&
    /రాజధాని|కలకత్తా|ఢిల్లీ/.test(text) &&
    /మౌంట్బేటన్|మౌంట్‌బేటన్/.test(text)
  ) {
    fail(
      "1911 Indian capital statement incorrectly mentions Mountbatten."
    );
  }

  if (
    data.knowledge.content.length <
      45 ||
    data.knowledge.content.length >
      600
  ) {
    fail(
      "Knowledge content length is unsuitable."
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

  if (
    question.length < 25
  ) {
    fail(
      "Question is too short."
    );
  }

  if (
    question.length > 500
  ) {
    fail(
      "Question is too long."
    );
  }

  if (
    answer.length > 200
  ) {
    fail(
      "Question answer is too long."
    );
  }

  const subjectivePatterns = [
    "మీ అభిప్రాయం",
    "మీకు ఏది ఇష్టం",
    "ఎవరు గొప్ప",
    "ఏది ఉత్తమం",
    "ఎవరిని ఎంచుకుంటారు"
  ];

  if (
    containsAny(
      question,
      subjectivePatterns
    )
  ) {
    fail(
      "Question is subjective."
    );
  }

  if (
    hasLatinLetters(answer) &&
    !isPureMathematicalAnswer(
      answer
    )
  ) {
    fail(
      "Question answer contains an English sentence."
    );
  }
}

/* =========================================================
   GENERAL CONTENT QUALITY
   ========================================================= */

function validateGeneralQuality(data) {
  const allText =
    [
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
    "prompt",
    "schema",
    "#"
  ];

  if (
    containsAny(
      allText,
      forbiddenPatterns
    )
  ) {
    fail(
      "Forbidden internal or technical content detected."
    );
  }

  const cards = [
    [
      "quote",
      data.quote.content
    ],
    [
      "health",
      data.health.content
    ],
    [
      "science",
      data.science.content
    ],
    [
      "knowledge",
      data.knowledge.content
    ],
    [
      "question",
      data.question.question
    ]
  ];

  for (
    const [name, content]
    of cards
  ) {
    if (
      wordCount(content) >
      80
    ) {
      fail(
        `${name} is too long for a shareable card.`
      );
    }
  }
}

/* =========================================================
   SAME-DAY CARD REPETITION
   ========================================================= */

function validateInternalCardDifference(
  data
) {
  const cards = [
    {
      name: "quote",
      title:
        data.quote.title,
      content:
        data.quote.content
    },

    {
      name: "health",
      title:
        data.health.title,
      content:
        data.health.content
    },

    {
      name: "science",
      title:
        data.science.title,
      content:
        data.science.content
    },

    {
      name: "knowledge",
      title:
        data.knowledge.title,
      content:
        data.knowledge.content
    },

    {
      name: "question",
      title: "",
      content:
        data.question.question
    }
  ];

  for (
    let i = 0;
    i < cards.length;
    i++
  ) {
    for (
      let j = i + 1;
      j < cards.length;
      j++
    ) {
      const a =
        cards[i];

      const b =
        cards[j];

      const score =
        similarityScore(
          `${a.title} ${a.content}`,
          `${b.title} ${b.content}`
        );

      if (
        score >= 0.75
      ) {
        fail(
          `Today's ${a.name} and ${b.name} are too similar.`
        );
      }
    }
  }
}

/* =========================================================
   RECENT CONTENT REPETITION
   ========================================================= */

function validateRecentRepetition(
  data
) {
  const currentCards = [
    {
      section: "quote",
      title:
        data.quote.title,
      content:
        data.quote.content
    },

    {
      section: "health",
      title:
        data.health.title,
      content:
        data.health.content
    },

    {
      section: "science",
      title:
        data.science.title,
      content:
        data.science.content
    },

    {
      section: "knowledge",
      title:
        data.knowledge.title,
      content:
        data.knowledge.content
    },

    {
      section: "question",
      title: "",
      content:
        data.question.question
    }
  ];

  for (
    const recent of recentContent
  ) {
    const oldCards = [
      {
        section: "quote",
        title:
          recent.quote?.title ||
          "",
        content:
          recent.quote?.content ||
          ""
      },

      {
        section: "health",
        title:
          recent.health?.title ||
          "",
        content:
          recent.health?.content ||
          ""
      },

      {
        section: "science",
        title:
          recent.science?.title ||
          "",
        content:
          recent.science?.content ||
          ""
      },

      {
        section: "knowledge",
        title:
          recent.knowledge?.title ||
          "",
        content:
          recent.knowledge?.content ||
          ""
      },

      {
        section: "question",
        title: "",
        content:
          recent.question?.question ||
          ""
      }
    ];

    for (
      const current of currentCards
    ) {
      for (
        const old of oldCards
      ) {
        if (
          !old.content
        ) {
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
          titleSimilarity >=
            0.85 ||
          contentSimilarity >=
            0.88
        ) {
          fail(
            `${current.section} is too similar to content from ${recent.date}.`
          );
        }
      }
    }
  }
}

/* =========================================================
   NORMALIZE FINAL PUBLIC JSON
   ========================================================= */

function normalizeOutput(
  data
) {
  return {
    date:
      TARGET_DATE,

    language:
      "te",

    publisher:
      "Vidhwaan",

    quote: {
      heading:
        "నేటి సూక్తి",

      title:
        normalizeWhitespace(
          data.quote.title
        ),

      content:
        normalizeWhitespace(
          data.quote.content
        ),

      attribution:
        "Vidhwaan"
    },

    health: {
      heading:
        "నేటి ఆరోగ్యం",

      title:
        normalizeWhitespace(
          data.health.title
        ),

      content:
        normalizeWhitespace(
          data.health.content
        )
    },

    science: {
      heading:
        "నేటి విజ్ఞానం",

      title:
        normalizeWhitespace(
          data.science.title
        ),

      content:
        normalizeWhitespace(
          data.science.content
        )
    },

    knowledge: {
      heading:
        "నేటి జ్ఞానం",

      title:
        normalizeWhitespace(
          data.knowledge.title
        ),

      content:
        normalizeWhitespace(
          data.knowledge.content
        )
    },

    question: {
      heading:
        "నేటి ప్రశ్న",

      question:
        normalizeWhitespace(
          data.question.question
        ),

      answer:
        normalizeWhitespace(
          data.question.answer
        )
    }
  };
}

/* =========================================================
   COMPLETE VALIDATION
   ========================================================= */

function validateEverything(
  data
) {
  validateStructure(
    data
  );

  validateCardFields(
    data.quote,
    "quote",
    [
      "heading",
      "title",
      "content",
      "attribution"
    ]
  );

  validateCardFields(
    data.health,
    "health",
    [
      "heading",
      "title",
      "content"
    ]
  );

  validateCardFields(
    data.science,
    "science",
    [
      "heading",
      "title",
      "content"
    ]
  );

  validateCardFields(
    data.knowledge,
    "knowledge",
    [
      "heading",
      "title",
      "content"
    ]
  );

  validateCardFields(
    data.question,
    "question",
    [
      "heading",
      "question",
      "answer"
    ]
  );

  validateHeadings(
    data
  );

  validateLanguage(
    data
  );

  validateQuote(
    data
  );

  validateHealth(
    data
  );

  validateScience(
    data
  );

  validateKnowledge(
    data
  );

  validateQuestion(
    data
  );

  validateGeneralQuality(
    data
  );

  validateInternalCardDifference(
    data
  );

  validateRecentRepetition(
    data
  );
}

/* =========================================================
   GENERATION WITH RETRIES
   ========================================================= */

async function generateDailyContent() {
  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <=
    MAX_GENERATION_ATTEMPTS;
    attempt++
  ) {
    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      `GENERATION ATTEMPT ${attempt}/${MAX_GENERATION_ATTEMPTS}`
    );

    console.log(
      `Date: ${TARGET_DATE}`
    );

    console.log(
      `Model: ${GROQ_MODEL}`
    );

    console.log(
      `Reasoning: ${REASONING_EFFORT}`
    );

    console.log(
      "========================================"
    );

    try {
      const generated =
        await requestGroq();

      /*
       * Metadata is controlled by the application,
       * not the model.
       */
      generated.date =
        TARGET_DATE;

      generated.language =
        "te";

      generated.publisher =
        "Vidhwaan";

      const normalized =
        normalizeOutput(
          generated
        );

      validateEverything(
        normalized
      );

      console.log("");

      console.log(
        "========================================"
      );

      console.log(
        "PUBLICATION QUALITY GATE PASSED"
      );

      console.log(
        "========================================"
      );

      return normalized;

    } catch (error) {
      lastError =
        error;

      console.error("");

      console.error(
        `Attempt ${attempt} rejected:`
      );

      console.error(
        error.message
      );

      if (
        attempt <
        MAX_GENERATION_ATTEMPTS
      ) {
        console.log("");

        console.log(
          "The content was NOT published."
        );

        console.log(
          "Generating a fresh attempt..."
        );
      }
    }
  }

  throw new Error(
    `All ${MAX_GENERATION_ATTEMPTS} attempts failed. No daily JSON was created. Last error: ${
      lastError?.message ||
      "Unknown error"
    }`
  );
}

/* =========================================================
   ATOMIC WRITE
   ========================================================= */

function writeAtomically(
  data
) {
  /*
   * Final race-condition protection.
   */
  if (
    fs.existsSync(
      OUTPUT_FILE
    )
  ) {
    fail(
      `Refusing to overwrite existing file: ${OUTPUT_FILE}`
    );
  }

  const temporaryFile =
    `${OUTPUT_FILE}.${process.pid}.tmp`;

  const json =
    JSON.stringify(
      data,
      null,
      2
    ) + "\n";

  try {
    fs.writeFileSync(
      temporaryFile,
      json,
      "utf8"
    );

    /*
     * Verify the exact temporary file
     * before it becomes official.
     */
    const verification =
      fs.readFileSync(
        temporaryFile,
        "utf8"
      );

    const parsed =
      JSON.parse(
        verification
      );

    validateEverything(
      parsed
    );

    /*
     * Only now does it become the official file.
     */
    fs.renameSync(
      temporaryFile,
      OUTPUT_FILE
    );

  } catch (error) {
    try {
      if (
        fs.existsSync(
          temporaryFile
        )
      ) {
        fs.unlinkSync(
          temporaryFile
        );
      }
    } catch {
      // Ignore cleanup errors.
    }

    throw error;
  }
}

/* =========================================================
   FINAL FILE VERIFICATION
   ========================================================= */

function verifyFinalFile() {
  if (
    !fs.existsSync(
      OUTPUT_FILE
    )
  ) {
    fail(
      "Final daily JSON was not created."
    );
  }

  const raw =
    fs.readFileSync(
      OUTPUT_FILE,
      "utf8"
    );

  const parsed =
    JSON.parse(
      raw
    );

  validateEverything(
    parsed
  );

  console.log("");

  console.log(
    "========================================"
  );

  console.log(
    "FINAL FILE VERIFICATION PASSED"
  );

  console.log(
    "========================================"
  );

  console.log(
    `File: ${OUTPUT_FILE}`
  );

  console.log(
    `Size: ${Buffer.byteLength(
      raw,
      "utf8"
    )} bytes`
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
    "Structure: VALID"
  );

  console.log(
    "Quality gate: PASSED"
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
    "PRODUCTION CONTENT GENERATOR"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Publication date: ${TARGET_DATE}`
  );

  console.log(
    "Timezone: Asia/Kolkata"
  );

  console.log(
    `Model: ${GROQ_MODEL}`
  );

  console.log(
    `Reasoning: ${REASONING_EFFORT}`
  );

  console.log(
    `Recent JSON files: ${recentContent.length}`
  );

  console.log(
    "Cards: 5"
  );

  console.log(
    "========================================"
  );

  const content =
    await generateDailyContent();

  writeAtomically(
    content
  );

  verifyFinalFile();

  console.log("");

  console.log(
    "========================================"
  );

  console.log(
    "FINAL GENERATED JSON"
  );

  console.log(
    "========================================"
  );

  console.log(
    JSON.stringify(
      content,
      null,
      2
    )
  );

  console.log("");

  console.log(
    "SUCCESS: Daily JSON generated and approved."
  );
}

/* =========================================================
   START
   ========================================================= */

main().catch(
  (error) => {
    console.error("");

    console.error(
      "========================================"
    );

    console.error(
      "VIDHWAAN DAILY SOCIAL"
    );

    console.error(
      "GENERATION FAILED"
    );

    console.error(
      "========================================"
    );

    console.error(
      error.stack ||
      error.message
    );

    console.error("");

    console.error(
      "IMPORTANT:"
    );

    console.error(
      "No questionable or incomplete JSON was published."
    );

    /*
     * Clean up any possible temporary file.
     */
    try {
      const temporaryFile =
        `${OUTPUT_FILE}.${process.pid}.tmp`;

      if (
        fs.existsSync(
          temporaryFile
        )
      ) {
        fs.unlinkSync(
          temporaryFile
        );
      }
    } catch {
      // Ignore cleanup failure.
    }

    process.exit(1);
  }
);
