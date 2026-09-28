'use strict';

/*
 * ============================================================
 * VIDHWAAN DAILY SOCIAL
 * Production Daily Telugu Content Generator
 * ============================================================
 *
 * Model:
 *   openai/gpt-oss-120b
 *
 * API:
 *   Groq Chat Completions
 *
 * Output:
 *   data/YYYY-MM-DD.json
 *
 * Environment:
 *   GROQ_API_KEY
 *   GROQ_MODEL   (optional)
 *   TARGET_DATE  (optional)
 *
 * Design:
 *   - Telugu-only user-facing content
 *   - Strict JSON Schema
 *   - Anti-repetition using previous daily JSON files
 *   - Validation before publishing
 *   - Automatic retry when generated content fails validation
 *   - No API key written to files
 *   - Never overwrites an existing daily JSON
 *
 * ============================================================
 */


// ============================================================
// CONFIGURATION
// ============================================================

const fs = require('fs');
const path = require('path');

const API_URL =
  'https://api.groq.com/openai/v1/chat/completions';

const MODEL =
  process.env.GROQ_MODEL ||
  'openai/gpt-oss-120b';

const API_KEY =
  process.env.GROQ_API_KEY;

const DATA_DIR =
  path.join(process.cwd(), 'data');

const MAX_RECENT_FILES = 14;

const MAX_ATTEMPTS = 3;

const REQUEST_TIMEOUT_MS = 120000;

const TARGET_DATE =
  process.env.TARGET_DATE ||
  getIndiaDate();


// ============================================================
// STARTUP
// ============================================================

if (!API_KEY) {
  fail(
    'GROQ_API_KEY is missing. Add GROQ_API_KEY to GitHub repository secrets.'
  );
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(TARGET_DATE)) {
  fail(
    `Invalid TARGET_DATE: ${TARGET_DATE}. Expected YYYY-MM-DD.`
  );
}

if (!isValidDate(TARGET_DATE)) {
  fail(
    `Invalid calendar date: ${TARGET_DATE}.`
  );
}


// ============================================================
// MAIN
// ============================================================

async function main() {

  printHeader();

  ensureDataDirectory();

  const outputFile =
    path.join(
      DATA_DIR,
      `${TARGET_DATE}.json`
    );


  // ----------------------------------------------------------
  // NEVER REPLACE AN EXISTING DAILY FILE
  // ----------------------------------------------------------

  if (fs.existsSync(outputFile)) {

    console.log(
      'Daily JSON already exists.'
    );

    console.log(
      `File: ${outputFile}`
    );

    console.log('');
    console.log(
      'Nothing to generate.'
    );

    return;
  }


  // ----------------------------------------------------------
  // READ RECENT CONTENT
  // ----------------------------------------------------------

  const recentContent =
    readRecentContent();


  // ----------------------------------------------------------
  // GENERATE
  // ----------------------------------------------------------

  const content =
    await generateValidatedContent(
      recentContent
    );


  // ----------------------------------------------------------
  // FINAL NORMALIZATION
  // ----------------------------------------------------------

  const finalContent =
    normalizeFinalContent(
      content
    );


  // ----------------------------------------------------------
  // FINAL VALIDATION
  // ----------------------------------------------------------

  console.log('');
  console.log(
    'Running final production validation...'
  );

  validateContent(
    finalContent
  );


  // ----------------------------------------------------------
  // WRITE FILE
  // ----------------------------------------------------------

  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      finalContent,
      null,
      2
    ) + '\n',
    'utf8'
  );


  // ----------------------------------------------------------
  // SUCCESS
  // ----------------------------------------------------------

  console.log('');
  console.log('========================================');
  console.log('GENERATION SUCCESSFUL');
  console.log('========================================');

  console.log(
    `Date: ${TARGET_DATE}`
  );

  console.log(
    `File: ${outputFile}`
  );

  console.log('');

  console.log(
    '1. नేటి సంస్కృతి'
  );

  console.log(
    '2. నేటి సూక్తి'
  );

  console.log(
    '3. నేటి ఆరోగ్యం'
  );

  console.log(
    '4. నేటి విజ్ఞానం'
  );

  console.log(
    '5. నేటి జ్ఞానం'
  );

  console.log(
    '6. నేటి ప్రశ్న'
  );

  console.log('');

  console.log(
    'Schema validation: PASSED'
  );

  console.log(
    'Telugu validation: PASSED'
  );

  console.log(
    'Content validation: PASSED'
  );

  console.log(
    'Production validation: PASSED'
  );

  console.log('========================================');
}


// ============================================================
// GENERATE + VALIDATE + RETRY
// ============================================================

async function generateValidatedContent(
  recentContent
) {

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {

    console.log('');
    console.log(
      `Groq generation attempt ${attempt}/${MAX_ATTEMPTS}...`
    );


    const systemPrompt =
      buildSystemPrompt();


    const userPrompt =
      buildUserPrompt(
        recentContent,
        lastError
      );


    try {

      const response =
        await requestGroq(
          systemPrompt,
          userPrompt
        );


      const rawContent =
        extractGroqContent(
          response
        );


      if (!rawContent) {
        throw new Error(
          'Groq returned an empty response.'
        );
      }


      let parsed;

      try {

        parsed =
          JSON.parse(
            rawContent
          );

      } catch (error) {

        throw new Error(
          `Groq returned invalid JSON: ${error.message}`
        );
      }


      /*
       * Defensive metadata normalization.
       *
       * The schema itself requires:
       *
       * language = "te"
       * publisher = "Vidhwaan"
       */
      parsed.language = 'te';

      parsed.publisher = 'Vidhwaan';


      console.log(
        'Validating generated content...'
      );


      /*
       * IMPORTANT:
       *
       * Validation happens INSIDE the retry loop.
       *
       * Therefore a bad answer such as English text in
       * question.answer will cause another Groq request
       * instead of immediately failing the entire workflow.
       */
      validateContent(
        parsed
      );


      console.log(
        'Generated content passed validation.'
      );


      return parsed;


    } catch (error) {

      lastError = error;

      console.error('');
      console.error(
        `Attempt ${attempt} failed: ${error.message}`
      );


      if (
        attempt <
        MAX_ATTEMPTS
      ) {

        const waitMs =
          getRetryDelay(
            error,
            attempt
          );


        console.log(
          `Retrying after ${Math.ceil(waitMs / 1000)} seconds...`
        );


        await sleep(
          waitMs
        );
      }
    }
  }


  throw new Error(
    `Generation failed after ${MAX_ATTEMPTS} attempts. ` +
    `${lastError ? lastError.message : 'Unknown error.'}`
  );
}


// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt() {

  return `
You are the official daily content generator for Vidhwaan.

Vidhwaan is a village-based global technology company.

Generate six high-quality daily social-media-ready content sections for Telugu-speaking users.

The final JSON MUST follow the supplied JSON Schema exactly.

LANGUAGE:

All user-facing content must be natural Telugu.

The JSON metadata field "language" must be exactly:

te

Never output:
Telugu
telugu
te-IN
te_IN

or another language code.

Do not write English sentences in user-facing content.

English may appear only when absolutely necessary for an unavoidable proper name, scientific name, abbreviation, mathematical notation, or Vidhwaan brand name.

Do not mention:
AI
Groq
the prompt
the schema
JSON generation
internal instructions

CONTENT:

Generate exactly these six sections:

1. నేటి సంస్కృతి
2. నేటి సూక్తి
3. నేటి ఆరోగ్యం
4. నేటి విజ్ఞానం
5. నేటి జ్ఞానం
6. నేటి ప్రశ్న

GENERAL RULES:

- Content must be concise.
- Content must be useful.
- Content must be accurate.
- Content must be suitable for a daily social card.
- Avoid repetition.
- Do not use markdown.
- Do not use bullet points.
- Do not use hashtags.
- Do not use URLs.
- Do not use emojis.
- Do not use fake quotations.
- Do not fabricate facts.
- Do not make unsupported claims.

CULTURE:

The culture section can cover Hindu and Indian cultural knowledge including:

Bhagavad Gita
Ramayana
Mahabharata
Vedas
Upanishads
Puranas
Indian traditions
festivals
temples
dharma
philosophy
deities
Indian cultural practices

Be respectful and educational.

Never fabricate a scripture quotation.

Never attribute invented words to a deity, sage, scripture, or historical person.

If exact quotation wording is uncertain, explain the genuine teaching in your own Telugu words instead.

QUOTE:

The quote can be:

1. An original Vidhwaan thought
OR
2. A reliably attributed quotation.

Never invent attribution.

If it is an original Vidhwaan thought, attribution must be:

Vidhwaan

HEALTH:

Provide general health education only.

Do not:
- diagnose disease
- prescribe medicine
- tell users to stop medication
- recommend dangerous treatment
- promise cures
- make unsupported medical claims

SCIENCE:

Use established scientific knowledge.

Possible subjects:
astronomy
space
physics
chemistry
biology
Earth
nature
technology
human-body science
everyday science

Do not present speculation as established fact.

KNOWLEDGE:

Can cover useful knowledge from:
history
geography
mathematics
nature
animals
space
technology
countries
language
inventions
society
economics
everyday knowledge

QUESTION:

Create an enjoyable thinking question.

It MUST have a definite answer.

The question must contain enough information to solve it.

Do not require obscure outside knowledge.

The answer must be correct.

IMPORTANT QUESTION ANSWER RULE:

The answer should normally be written in Telugu.

However, a pure mathematical or numerical answer is valid.

Examples of valid answers:

42
8
3.14
100%
25°C
2 గంటలు

Do NOT write an English sentence such as:

The answer is 42.

Instead write:

42

or:

సమాధానం 42.

ANTI-REPETITION:

Avoid repeating recent topics, questions, facts, quotations, examples, or subject patterns.

Recent content is supplied by the application.

Do not copy it.

VARIETY:

Each day should feel meaningfully different from previous days.

QUALITY:

Prefer useful, memorable, clear information over obscure trivia.

The output must be publication-ready.
`;
}


// ============================================================
// USER PROMPT
// ============================================================

function buildUserPrompt(
  recentContent,
  previousError
) {

  let retryInstruction = '';

  if (previousError) {

    retryInstruction = `
IMPORTANT CORRECTION FROM PREVIOUS ATTEMPT:

The previous generated content failed validation for this reason:

${previousError}

Generate a completely corrected response.

Pay particular attention to question.answer.
If the answer is numerical, a numeric answer is acceptable.
If it is explanatory, write the explanation in Telugu.
Do not write an English sentence as the answer.
`;
  }


  return `
Generate today's Vidhwaan Daily Social content.

DATE:

${TARGET_DATE}

LANGUAGE:

te

PUBLISHER:

Vidhwaan

Generate exactly six sections.

The content will be displayed directly to Telugu users and converted into vertical social/reel images.

Keep content concise and visually suitable.

${retryInstruction}

RECENT CONTENT TO AVOID REPEATING:

${recentContent || 'No previous daily content is available.'}

Return only the JSON required by the supplied schema.
`;
}


// ============================================================
// JSON SCHEMA
// ============================================================

function getSchema() {

  return {

    type: 'object',

    properties: {

      date: {
        type: 'string'
      },

      language: {
        type: 'string',
        enum: ['te']
      },

      publisher: {
        type: 'string',
        enum: ['Vidhwaan']
      },


      culture: {

        type: 'object',

        properties: {

          heading: {
            type: 'string',
            enum: ['నేటి సంస్కృతి']
          },

          title: {
            type: 'string'
          },

          content: {
            type: 'string'
          },

          source: {
            type: 'string'
          }
        },

        required: [
          'heading',
          'title',
          'content',
          'source'
        ],

        additionalProperties: false
      },


      quote: {

        type: 'object',

        properties: {

          heading: {
            type: 'string',
            enum: ['నేటి సూక్తి']
          },

          title: {
            type: 'string'
          },

          content: {
            type: 'string'
          },

          attribution: {
            type: 'string'
          }
        },

        required: [
          'heading',
          'title',
          'content',
          'attribution'
        ],

        additionalProperties: false
      },


      health: {

        type: 'object',

        properties: {

          heading: {
            type: 'string',
            enum: ['నేటి ఆరోగ్యం']
          },

          title: {
            type: 'string'
          },

          content: {
            type: 'string'
          }
        },

        required: [
          'heading',
          'title',
          'content'
        ],

        additionalProperties: false
      },


      science: {

        type: 'object',

        properties: {

          heading: {
            type: 'string',
            enum: ['నేటి విజ్ఞానం']
          },

          title: {
            type: 'string'
          },

          content: {
            type: 'string'
          }
        },

        required: [
          'heading',
          'title',
          'content'
        ],

        additionalProperties: false
      },


      knowledge: {

        type: 'object',

        properties: {

          heading: {
            type: 'string',
            enum: ['నేటి జ్ఞానం']
          },

          title: {
            type: 'string'
          },

          content: {
            type: 'string'
          }
        },

        required: [
          'heading',
          'title',
          'content'
        ],

        additionalProperties: false
      },


      question: {

        type: 'object',

        properties: {

          heading: {
            type: 'string',
            enum: ['నేటి ప్రశ్న']
          },

          question: {
            type: 'string'
          },

          answer: {
            type: 'string'
          }
        },

        required: [
          'heading',
          'question',
          'answer'
        ],

        additionalProperties: false
      }
    },

    required: [
      'date',
      'language',
      'publisher',
      'culture',
      'quote',
      'health',
      'science',
      'knowledge',
      'question'
    ],

    additionalProperties: false
  };
}


// ============================================================
// GROQ REQUEST
// ============================================================

async function requestGroq(
  systemPrompt,
  userPrompt
) {

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
        API_URL,
        {
          method: 'POST',

          headers: {
            'Authorization':
              `Bearer ${API_KEY}`,

            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({

            model: MODEL,

            messages: [

              {
                role: 'system',
                content: systemPrompt
              },

              {
                role: 'user',
                content: userPrompt
              }

            ],

            response_format: {

              type: 'json_schema',

              json_schema: {

                name:
                  'vidhwaan_daily_social',

                strict:
                  true,

                schema:
                  getSchema()
              }
            },

            temperature:
              0.7,

            max_completion_tokens:
              5000

          }),

          signal:
            controller.signal
        }
      );


    const responseText =
      await response.text();


    let data;


    try {

      data =
        JSON.parse(
          responseText
        );

    } catch {

      const error =
        new Error(
          `Groq returned a non-JSON HTTP response. HTTP ${response.status}: ${responseText.slice(0, 500)}`
        );

      error.status =
        response.status;

      throw error;
    }


    if (!response.ok) {

      const message =
        data?.error?.message ||
        data?.message ||
        `HTTP ${response.status}`;


      const error =
        new Error(
          `Groq API error ${response.status}: ${message}`
        );


      error.status =
        response.status;


      throw error;
    }


    return data;


  } catch (error) {

    if (
      error.name ===
      'AbortError'
    ) {

      const timeoutError =
        new Error(
          `Groq request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`
        );

      timeoutError.retryable =
        true;

      throw timeoutError;
    }


    throw error;


  } finally {

    clearTimeout(
      timeout
    );
  }
}


// ============================================================
// EXTRACT GROQ CONTENT
// ============================================================

function extractGroqContent(
  response
) {

  const content =
    response
      ?.choices
      ?.at(0)
      ?.message
      ?.content;


  if (
    typeof content ===
    'string'
  ) {

    return content.trim();
  }


  const refusal =
    response
      ?.choices
      ?.at(0)
      ?.message
      ?.refusal;


  if (refusal) {

    throw new Error(
      `Groq refused the generation: ${refusal}`
    );
  }


  return '';
}


// ============================================================
// FINAL NORMALIZATION
// ============================================================

function normalizeFinalContent(
  data
) {

  return {

    date:
      TARGET_DATE,

    language:
      'te',

    publisher:
      'Vidhwaan',


    culture: {

      heading:
        'నేటి సంస్కృతి',

      title:
        data.culture.title.trim(),

      content:
        data.culture.content.trim(),

      source:
        data.culture.source.trim()
    },


    quote: {

      heading:
        'నేటి సూక్తి',

      title:
        data.quote.title.trim(),

      content:
        data.quote.content.trim(),

      attribution:
        data.quote.attribution.trim()
    },


    health: {

      heading:
        'నేటి ఆరోగ్యం',

      title:
        data.health.title.trim(),

      content:
        data.health.content.trim()
    },


    science: {

      heading:
        'నేటి విజ్ఞానం',

      title:
        data.science.title.trim(),

      content:
        data.science.content.trim()
    },


    knowledge: {

      heading:
        'నేటి జ్ఞానం',

      title:
        data.knowledge.title.trim(),

      content:
        data.knowledge.content.trim()
    },


    question: {

      heading:
        'నేటి ప్రశ్న',

      question:
        data.question.question.trim(),

      answer:
        normalizeQuestionAnswer(
          data.question.answer
        )
    }
  };
}


// ============================================================
// QUESTION ANSWER NORMALIZATION
// ============================================================

function normalizeQuestionAnswer(
  answer
) {

  const value =
    String(answer || '')
      .trim();


  /*
   * Pure numerical answers are valid.
   *
   * Examples:
   * 42
   * 3.14
   * 100%
   * 25°C
   * 2 గంటలు
   */

  return value;
}


// ============================================================
// VALIDATION
// ============================================================

function validateContent(
  data
) {

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {

    throw new Error(
      'Generated content must be an object.'
    );
  }


  const expectedTopLevelKeys = [

    'date',
    'language',
    'publisher',

    'culture',
    'quote',
    'health',
    'science',
    'knowledge',
    'question'

  ];


  const actualKeys =
    Object.keys(data)
      .sort();


  const expectedKeys =
    [...expectedTopLevelKeys]
      .sort();


  if (
    JSON.stringify(actualKeys) !==
    JSON.stringify(expectedKeys)
  ) {

    throw new Error(
      `Unexpected top-level fields. Received: ${actualKeys.join(', ')}`
    );
  }


  // ----------------------------------------------------------
  // DATE
  // ----------------------------------------------------------

  if (
    data.date !==
    TARGET_DATE
  ) {

    throw new Error(
      `date must be "${TARGET_DATE}". Received "${data.date}".`
    );
  }


  // ----------------------------------------------------------
  // LANGUAGE
  // ----------------------------------------------------------

  if (
    data.language !==
    'te'
  ) {

    throw new Error(
      'language must be "te".'
    );
  }


  // ----------------------------------------------------------
  // PUBLISHER
  // ----------------------------------------------------------

  if (
    data.publisher !==
    'Vidhwaan'
  ) {

    throw new Error(
      'publisher must be "Vidhwaan".'
    );
  }


  // ----------------------------------------------------------
  // SECTION STRUCTURE
  // ----------------------------------------------------------

  validateSection(
    data.culture,
    'culture',
    [
      'heading',
      'title',
      'content',
      'source'
    ]
  );


  validateSection(
    data.quote,
    'quote',
    [
      'heading',
      'title',
      'content',
      'attribution'
    ]
  );


  validateSection(
    data.health,
    'health',
    [
      'heading',
      'title',
      'content'
    ]
  );


  validateSection(
    data.science,
    'science',
    [
      'heading',
      'title',
      'content'
    ]
  );


  validateSection(
    data.knowledge,
    'knowledge',
    [
      'heading',
      'title',
      'content'
    ]
  );


  validateSection(
    data.question,
    'question',
    [
      'heading',
      'question',
      'answer'
    ]
  );


  // ----------------------------------------------------------
  // HEADINGS
  // ----------------------------------------------------------

  if (
    data.culture.heading !==
    'నేటి సంస్కృతి'
  ) {

    throw new Error(
      'Culture heading is incorrect.'
    );
  }


  if (
    data.quote.heading !==
    'నేటి సూక్తి'
  ) {

    throw new Error(
      'Quote heading is incorrect.'
    );
  }


  if (
    data.health.heading !==
    'నేటి ఆరోగ్యం'
  ) {

    throw new Error(
      'Health heading is incorrect.'
    );
  }


  if (
    data.science.heading !==
    'నేటి విజ్ఞానం'
  ) {

    throw new Error(
      'Science heading is incorrect.'
    );
  }


  if (
    data.knowledge.heading !==
    'నేటి జ్ఞానం'
  ) {

    throw new Error(
      'Knowledge heading is incorrect.'
    );
  }


  if (
    data.question.heading !==
    'నేటి ప్రశ్న'
  ) {

    throw new Error(
      'Question heading is incorrect.'
    );
  }


  // ----------------------------------------------------------
  // TELUGU CONTENT
  // ----------------------------------------------------------

  requireTelugu(
    'culture.title',
    data.culture.title
  );

  requireTelugu(
    'culture.content',
    data.culture.content
  );


  requireTelugu(
    'quote.title',
    data.quote.title
  );

  requireTelugu(
    'quote.content',
    data.quote.content
  );


  requireTelugu(
    'health.title',
    data.health.title
  );

  requireTelugu(
    'health.content',
    data.health.content
  );


  requireTelugu(
    'science.title',
    data.science.title
  );

  requireTelugu(
    'science.content',
    data.science.content
  );


  requireTelugu(
    'knowledge.title',
    data.knowledge.title
  );

  requireTelugu(
    'knowledge.content',
    data.knowledge.content
  );


  requireTelugu(
    'question.question',
    data.question.question
  );


  /*
   * IMPORTANT:
   *
   * question.answer is intentionally NOT required to contain
   * Telugu Unicode.
   *
   * A mathematical/numerical answer is valid.
   *
   * Instead, we reject English/Latin sentences.
   */
  validateQuestionAnswer(
    data.question.answer
  );


  // ----------------------------------------------------------
  // FORBIDDEN MARKUP / URLS
  // ----------------------------------------------------------

  const allText = [

    data.culture.title,
    data.culture.content,
    data.culture.source,

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

  ].join('\n');


  validateForbiddenText(
    allText
  );


  // ----------------------------------------------------------
  // LENGTHS
  // ----------------------------------------------------------

  validateLength(
    'culture.title',
    data.culture.title,
    100
  );

  validateLength(
    'culture.content',
    data.culture.content,
    700
  );

  validateLength(
    'culture.source',
    data.culture.source,
    180
  );


  validateLength(
    'quote.title',
    data.quote.title,
    100
  );

  validateLength(
    'quote.content',
    data.quote.content,
    500
  );

  validateLength(
    'quote.attribution',
    data.quote.attribution,
    150
  );


  validateLength(
    'health.title',
    data.health.title,
    100
  );

  validateLength(
    'health.content',
    data.health.content,
    650
  );


  validateLength(
    'science.title',
    data.science.title,
    100
  );

  validateLength(
    'science.content',
    data.science.content,
    700
  );


  validateLength(
    'knowledge.title',
    data.knowledge.title,
    100
  );

  validateLength(
    'knowledge.content',
    data.knowledge.content,
    700
  );


  validateLength(
    'question.question',
    data.question.question,
    300
  );

  validateLength(
    'question.answer',
    data.question.answer,
    500
  );
}


// ============================================================
// SECTION VALIDATION
// ============================================================

function validateSection(
  section,
  name,
  requiredFields
) {

  if (
    !section ||
    typeof section !== 'object' ||
    Array.isArray(section)
  ) {

    throw new Error(
      `${name} must be an object.`
    );
  }


  for (
    const field of requiredFields
  ) {

    if (
      typeof section[field] !==
      'string'
    ) {

      throw new Error(
        `${name}.${field} must be a string.`
      );
    }


    if (
      section[field].trim().length === 0
    ) {

      throw new Error(
        `${name}.${field} cannot be empty.`
      );
    }
  }


  const actualKeys =
    Object.keys(section)
      .sort();


  const expectedKeys =
    [...requiredFields]
      .sort();


  if (
    JSON.stringify(actualKeys) !==
    JSON.stringify(expectedKeys)
  ) {

    throw new Error(
      `${name} contains unexpected fields.`
    );
  }
}


// ============================================================
// TELUGU VALIDATION
// ============================================================

function requireTelugu(
  field,
  value
) {

  if (
    !containsTelugu(value)
  ) {

    throw new Error(
      `${field} does not contain Telugu text.`
    );
  }
}


function containsTelugu(
  value
) {

  return /[\u0C00-\u0C7F]/.test(
    String(value)
  );
}


// ============================================================
// QUESTION ANSWER VALIDATION
// ============================================================

function validateQuestionAnswer(
  answer
) {

  const value =
    String(answer || '')
      .trim();


  if (!value) {

    throw new Error(
      'question.answer cannot be empty.'
    );
  }


  /*
   * If the answer contains Telugu,
   * it is valid.
   */
  if (
    containsTelugu(value)
  ) {

    return;
  }


  /*
   * Pure numeric / mathematical answers
   * are also valid.
   *
   * Examples:
   *
   * 42
   * 3.14
   * 100%
   * 25°C
   * 2:1
   * 10²
   * 5 + 5 = 10
   *
   * Unicode mathematical symbols and numbers
   * are allowed.
   */
  const numericAnswerPattern =
    /^[\d\s.,:%+\-×÷=()\/*^²³⁴⁵⁶⁷⁸⁹⁰°℃℉≤≥<>]+$/u;


  if (
    numericAnswerPattern.test(value)
  ) {

    return;
  }


  /*
   * If it contains Latin alphabet characters,
   * it is an English/Latin answer and should fail.
   *
   * The generation loop will then retry with a correction.
   */
  if (
    /[A-Za-z]/.test(value)
  ) {

    throw new Error(
      'question.answer contains non-Telugu Latin text. Write the answer in Telugu, or use only a pure numerical/mathematical answer.'
    );
  }


  /*
   * Any other non-Telugu answer is rejected
   * rather than silently publishing uncertain content.
   */
  throw new Error(
    'question.answer must contain Telugu text or be a pure numerical/mathematical answer.'
  );
}


// ============================================================
// FORBIDDEN TEXT
// ============================================================

function validateForbiddenText(
  text
) {

  const forbidden = [

    {
      pattern: /```/,
      message:
        'Markdown code fences are not allowed.'
    },

    {
      pattern: /https?:\/\//i,
      message:
        'URLs are not allowed.'
    },

    {
      pattern: /\bwww\./i,
      message:
        'Web addresses are not allowed.'
    },

    {
      pattern: /###/,
      message:
        'Markdown headings are not allowed.'
    }

  ];


  for (
    const item of forbidden
  ) {

    if (
      item.pattern.test(text)
    ) {

      throw new Error(
        item.message
      );
    }
  }
}


// ============================================================
// LENGTH
// ============================================================

function validateLength(
  field,
  value,
  max
) {

  const length =
    [...String(value)].length;


  if (
    length > max
  ) {

    throw new Error(
      `${field} is too long. Maximum ${max} characters; received ${length}.`
    );
  }
}


// ============================================================
// RECENT CONTENT
// ============================================================

function readRecentContent() {

  if (
    !fs.existsSync(
      DATA_DIR
    )
  ) {

    return '';
  }


  let files;


  try {

    files =
      fs.readdirSync(
        DATA_DIR
      )
      .filter(
        file =>
          /^\d{4}-\d{2}-\d{2}\.json$/
            .test(file)
      )
      .sort()
      .reverse()
      .slice(
        0,
        MAX_RECENT_FILES
      );

  } catch (error) {

    console.warn(
      `Could not read recent content: ${error.message}`
    );

    return '';
  }


  if (
    files.length === 0
  ) {

    return '';
  }


  const recent = [];


  for (
    const file of files
  ) {

    try {

      const filePath =
        path.join(
          DATA_DIR,
          file
        );


      const raw =
        fs.readFileSync(
          filePath,
          'utf8'
        );


      const data =
        JSON.parse(
          raw
        );


      recent.push({

        date:
          data.date ||
          file.replace(
            '.json',
            ''
          ),

        culture:
          data.culture
            ? {
                title:
                  data.culture.title,

                content:
                  data.culture.content
              }
            : null,

        quote:
          data.quote
            ? {
                title:
                  data.quote.title,

                content:
                  data.quote.content
              }
            : null,

        health:
          data.health
            ? {
                title:
                  data.health.title,

                content:
                  data.health.content
              }
            : null,

        science:
          data.science
            ? {
                title:
                  data.science.title,

                content:
                  data.science.content
              }
            : null,

        knowledge:
          data.knowledge
            ? {
                title:
                  data.knowledge.title,

                content:
                  data.knowledge.content
              }
            : null,

        question:
          data.question
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
        `Skipping invalid recent file ${file}: ${error.message}`
      );
    }
  }


  if (
    recent.length === 0
  ) {

    return '';
  }


  return JSON.stringify(
    recent,
    null,
    2
  );
}


// ============================================================
// RETRY DELAY
// ============================================================

function getRetryDelay(
  error,
  attempt
) {

  const status =
    error?.status;


  if (
    status === 429
  ) {

    return (
      15000 +
      Math.floor(
        Math.random() * 5000
      )
    ) * attempt;
  }


  if (
    status === 408 ||
    status === 409 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    error?.retryable
  ) {

    return (
      5000 * attempt
    ) +
    Math.floor(
      Math.random() * 2000
    );
  }


  /*
   * Validation errors also get a short retry.
   */
  return (
    3000 * attempt
  );
}


// ============================================================
// DATE
// ============================================================

function getIndiaDate() {

  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Kolkata',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit'
      }
    );


  return formatter.format(
    new Date()
  );
}


function isValidDate(
  value
) {

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/
      .exec(value);


  if (!match) {
    return false;
  }


  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);


  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );


  return (

    date.getUTCFullYear() ===
      year &&

    date.getUTCMonth() ===
      month - 1 &&

    date.getUTCDate() ===
      day

  );
}


// ============================================================
// FILESYSTEM
// ============================================================

function ensureDataDirectory() {

  if (
    !fs.existsSync(
      DATA_DIR
    )
  ) {

    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true
      }
    );
  }
}


// ============================================================
// HEADER
// ============================================================

function printHeader() {

  console.log('');
  console.log('========================================');
  console.log('VIDHWAAN DAILY SOCIAL');
  console.log('Daily Content Generator');
  console.log('========================================');
  console.log(`Date: ${TARGET_DATE}`);
  console.log(`Model: ${MODEL}`);
  console.log('Timezone: Asia/Kolkata');
  console.log('========================================');
}


// ============================================================
// UTILITIES
// ============================================================

function sleep(
  ms
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function fail(
  message
) {

  console.error('');
  console.error('========================================');
  console.error('GENERATION FAILED');
  console.error('========================================');
  console.error('');
  console.error(message);
  console.error('');
  process.exit(1);
}


// ============================================================
// GLOBAL ERRORS
// ============================================================

process.on(
  'unhandledRejection',
  error => {

    fail(
      error?.message ||
      String(error)
    );
  }
);


process.on(
  'uncaughtException',
  error => {

    fail(
      error?.message ||
      String(error)
    );
  }
);


// ============================================================
// START
// ============================================================

main().catch(
  error => {

    fail(
      error?.message ||
      String(error)
    );
  }
);
