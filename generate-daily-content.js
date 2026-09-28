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
 * Provider:
 *   Groq
 *
 * Output:
 *   data/YYYY-MM-DD.json
 *
 * Environment:
 *   GROQ_API_KEY
 *   GROQ_MODEL   optional
 *   TARGET_DATE  optional
 *
 * Production design:
 *
 *   1. Generate exactly five cards.
 *   2. Strict JSON Schema.
 *   3. Telugu user-facing content.
 *   4. Anti-repetition using recent JSON files.
 *   5. Deterministic validation.
 *   6. Automatic retry on invalid content.
 *   7. Automatic waiting when Groq token limits are reached.
 *   8. Rate-limit waiting does NOT consume a generation attempt.
 *   9. Never overwrite an existing daily JSON.
 *  10. Atomic file publication.
 *
 * Cards:
 *
 *   quote
 *   health
 *   science
 *   knowledge
 *   question
 *
 * ============================================================
 */


// ============================================================
// MODULES
// ============================================================

const fs = require('fs');
const path = require('path');


// ============================================================
// CONFIGURATION
// ============================================================

const API_URL =
  'https://api.groq.com/openai/v1/chat/completions';

const MODEL =
  process.env.GROQ_MODEL ||
  'openai/gpt-oss-120b';

const API_KEY =
  process.env.GROQ_API_KEY;

const DATA_DIR =
  path.join(
    process.cwd(),
    'data'
  );

const MAX_RECENT_FILES = 14;

/*
 * Genuine content-generation attempts.
 *
 * Rate-limit waits do NOT consume this count.
 */
const MAX_ATTEMPTS = 5;

/*
 * Initial completion budget.
 *
 * This is a maximum ceiling, not a request to consume
 * the entire amount.
 */
const INITIAL_MAX_COMPLETION_TOKENS = 12000;

/*
 * If Groq reports that the completion was truncated,
 * subsequent attempts can use a larger budget.
 */
const LARGE_MAX_COMPLETION_TOKENS = 20000;

const REQUEST_TIMEOUT_MS = 180000;

/*
 * Do not wait forever for one rate-limit window.
 * The loop can continue across multiple windows, but this
 * prevents a broken API response from hanging indefinitely.
 */
const MAX_RATE_WAIT_MS = 15 * 60 * 1000;

/*
 * Small delay before retrying a normal validation failure.
 */
const VALIDATION_RETRY_DELAY_MS = 2500;

const TARGET_DATE =
  process.env.TARGET_DATE ||
  getIndiaDate();


// ============================================================
// STARTUP VALIDATION
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
  // NEVER OVERWRITE EXISTING DAILY FILE
  // ----------------------------------------------------------

  if (fs.existsSync(outputFile)) {

    console.log('');
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
  // RECENT CONTENT
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
  // ATOMIC PUBLICATION
  // ----------------------------------------------------------

  await writeAtomicJson(
    outputFile,
    finalContent
  );


  // ----------------------------------------------------------
  // VERIFY WRITTEN FILE
  // ----------------------------------------------------------

  verifyWrittenFile(
    outputFile
  );


  // ----------------------------------------------------------
  // SUCCESS
  // ----------------------------------------------------------

  console.log('');
  console.log('========================================');
  console.log('VIDHWAAN DAILY SOCIAL');
  console.log('GENERATION SUCCESSFUL');
  console.log('========================================');
  console.log('');
  console.log(
    `Date: ${TARGET_DATE}`
  );
  console.log(
    `File: ${outputFile}`
  );
  console.log(
    `Cards: 5`
  );
  console.log('');
  console.log(
    'The daily JSON is ready for publication.'
  );
}


// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt() {

  return `
You are the official daily content generator for Vidhwaan.

Vidhwaan is a village-based global technology company.

Generate exactly five publication-ready daily social cards for Telugu-speaking users.

The final response MUST follow the supplied JSON Schema exactly.

IMPORTANT:

There are EXACTLY FIVE cards.

Do NOT create:
- culture
- సంస్కృతి
- a separate Bhagavad Gita card
- any additional card
- any additional top-level JSON field

The five cards are exactly:

1. నేటి సూక్తి
2. నేటి ఆరోగ్యం
3. నేటి విజ్ఞానం
4. నేటి జ్ఞానం
5. నేటి ప్రశ్న

LANGUAGE:

All user-facing content must be natural, clear Telugu.

The JSON field "language" must be exactly:

te

The JSON field "publisher" must be exactly:

Vidhwaan

English is permitted only when genuinely necessary for:
- unavoidable proper names
- scientific notation
- mathematical notation
- standard units
- abbreviations
- Vidhwaan

Do not write English sentences for the user.

Never mention:
- AI
- Groq
- model
- prompt
- schema
- JSON generation
- internal instructions
- system instructions

GENERAL CONTENT RULES:

- Publication-ready.
- Concise.
- Useful.
- Accurate.
- Clear.
- Natural Telugu.
- Suitable for a vertical social card.
- No markdown.
- No bullet points.
- No hashtags.
- No URLs.
- No emojis.
- No fake quotations.
- No invented facts.
- No unsupported claims.
- No sensational claims.
- No political persuasion.
- No current political claims.
- No medical diagnosis.
- No medical treatment instructions.

============================================================
1. నేటి సూక్తి
============================================================

Create one meaningful and memorable thought.

Prefer an original Vidhwaan thought.

If it is an original Vidhwaan thought:

attribution MUST be:

Vidhwaan

Never invent a quotation by:
- a scientist
- philosopher
- writer
- leader
- historical person
- deity
- sage
- scripture

Never present a paraphrase as an exact quotation.

============================================================
2. నేటి ఆరోగ్యం
============================================================

Provide general health education.

Suitable topics include:
- sleep
- hydration
- physical activity
- nutrition
- posture
- hygiene
- sunlight
- stress management
- healthy routines
- basic human biology
- preventive habits

Do NOT:
- diagnose diseases
- prescribe medicines
- tell people to stop medicines
- promise cures
- recommend dangerous treatments
- give emergency medical instructions
- make unsupported universal numerical rules

Avoid claims such as:

"Everyone must drink exactly 8 glasses."

Use context-sensitive language instead.

============================================================
3. నేటి విజ్ఞానం
============================================================

Provide established, evidence-aligned science.

Possible areas:
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

Do not present speculation as established fact.

Avoid exaggerated superlatives unless they are scientifically precise.

============================================================
4. నేటి జ్ఞానం
============================================================

Provide useful general knowledge.

Possible areas:
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
- important concepts

Historical claims require particular caution.

Never invent:
- names
- dates
- events
- motives
- decisions
- quotations

If uncertain about a historical fact, choose another topic.

============================================================
5. నేటి ప్రశ్న
============================================================

Create one enjoyable thinking question.

It MUST have one definite answer.

The question must contain enough information to solve it.

Prefer:
- logic
- simple mathematics
- probability
- observation
- reasoning
- everyday situations

Avoid:
- opinions
- political questions
- ambiguous questions
- obscure trivia
- questions requiring unverifiable outside knowledge

The answer MUST be correct.

The answer may be a pure numerical or mathematical answer.

Examples:

42
3/28
3.14
100%
25°C
2 గంటలు

Do not write:

"The answer is 42."

Prefer:

42

or:

సమాధానం 42.

============================================================
ANTI-REPETITION
============================================================

Recent content is supplied separately.

Do not copy it.

Avoid repeating:
- exact topics
- exact titles
- exact wording
- quotations
- facts
- examples
- question structures
- question answers
- distinctive phrases

Choose meaningfully different content.

============================================================
FINAL SELF-CHECK
============================================================

Before returning JSON, silently check:

1. Exactly five cards exist.
2. No culture field exists.
3. No extra fields exist.
4. All five headings are correct.
5. Telugu is natural.
6. The quote attribution is valid.
7. Health content is safe.
8. Science content is factual.
9. Knowledge content is factual.
10. Question has one definite answer.
11. Question answer is correct.
12. No markdown.
13. No URLs.
14. No hashtags.
15. No emojis.
16. No internal technical language.
17. No repeated recent content.
18. Output is complete.

Return ONLY the JSON object.
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
IMPORTANT:
The previous generation attempt failed validation.

Do NOT repeat the previous mistake.

Previous validation issue:
${previousError}

Generate a completely fresh valid set of five cards.
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

Generate exactly these five cards:

నేటి సూక్తి
నేటి ఆరోగ్యం
నేటి విజ్ఞానం
నేటి జ్ఞానం
నేటి ప్రశ్న

${retryInstruction}

RECENT CONTENT TO AVOID REPEATING:

${recentContent || 'No previous daily content is available.'}

Keep each card concise and suitable for a vertical social image.

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
// GENERATION + VALIDATION + RETRY
// ============================================================

async function generateValidatedContent(
  recentContent
) {

  let lastError = null;

  let completionTokens =
    INITIAL_MAX_COMPLETION_TOKENS;

  let attempt = 1;


  while (
    attempt <= MAX_ATTEMPTS
  ) {

    console.log('');
    console.log('========================================');
    console.log(
      `GENERATION ATTEMPT ${attempt}/${MAX_ATTEMPTS}`
    );
    console.log(
      `Date: ${TARGET_DATE}`
    );
    console.log(
      `Model: ${MODEL}`
    );
    console.log(
      `Reasoning: high`
    );
    console.log(
      `Completion budget: ${completionTokens}`
    );
    console.log('========================================');


    const systemPrompt =
      buildSystemPrompt();

    const userPrompt =
      buildUserPrompt(
        recentContent,
        lastError
      );


    try {

      const response =
        await requestGroqWithRateLimitHandling(
          systemPrompt,
          userPrompt,
          completionTokens
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
       * Metadata is deterministic.
       */
      parsed.date =
        TARGET_DATE;

      parsed.language =
        'te';

      parsed.publisher =
        'Vidhwaan';


      console.log('');
      console.log(
        'Validating generated content...'
      );


      validateContent(
        parsed
      );


      console.log('');
      console.log(
        'Generated content passed validation.'
      );


      return parsed;


    } catch (error) {

      lastError =
        error?.message ||
        String(error);


      console.error('');
      console.error(
        `Attempt ${attempt} rejected: ${lastError}`
      );


      /*
       * If Groq tells us that the completion itself
       * was truncated, increase the output budget.
       */
      if (
        isCompletionLimitError(
          error
        )
      ) {

        if (
          completionTokens <
          LARGE_MAX_COMPLETION_TOKENS
        ) {

          completionTokens =
            LARGE_MAX_COMPLETION_TOKENS;

          console.log('');
          console.log(
            'The previous response reached the completion limit.'
          );
          console.log(
            `Increasing completion budget to ${completionTokens}.`
          );

        }
      }


      if (
        attempt >= MAX_ATTEMPTS
      ) {

        break;
      }


      console.log('');
      console.log(
        `Waiting ${VALIDATION_RETRY_DELAY_MS / 1000} seconds before a fresh generation...`
      );

      await sleep(
        VALIDATION_RETRY_DELAY_MS
      );

      attempt++;
    }
  }


  throw new Error(
    `All ${MAX_ATTEMPTS} content-generation attempts failed. ` +
    `No daily JSON was created. ` +
    `Last error: ${lastError || 'Unknown error.'}`
  );
}


// ============================================================
// GROQ REQUEST WITH RATE-LIMIT WAITING
// ============================================================

async function requestGroqWithRateLimitHandling(
  systemPrompt,
  userPrompt,
  completionTokens
) {

  let totalWaited =
    0;


  while (true) {

    try {

      return await requestGroq(
        systemPrompt,
        userPrompt,
        completionTokens
      );


    } catch (error) {

      /*
       * 429 is NOT a content-generation failure.
       *
       * Wait for Groq's token window and then send
       * the same generation request again.
       *
       * This does NOT consume one of the five
       * content-generation attempts.
       */
      if (
        Number(error?.status) === 429
      ) {

        const waitMs =
          getRateLimitWaitMs(
            error
          );


        if (
          totalWaited + waitMs >
          MAX_RATE_WAIT_MS
        ) {

          throw new Error(
            `Groq rate limit wait exceeded ${MAX_RATE_WAIT_MS / 60000} minutes. ` +
            `Last rate-limit message: ${error.message}`
          );
        }


        console.log('');
        console.log(
          '========================================'
        );
        console.log(
          'GROQ TOKEN LIMIT REACHED'
        );
        console.log(
          '========================================'
        );

        console.log(
          `Waiting ${formatDuration(waitMs)} for the token window to reset...`
        );

        console.log(
          'This wait does NOT consume a generation attempt.'
        );

        console.log(
          '========================================'
        );


        await sleep(
          waitMs
        );


        totalWaited +=
          waitMs;


        console.log('');
        console.log(
          'Groq wait completed.'
        );

        console.log(
          'Requesting generation again...'
        );


        continue;
      }


      throw error;
    }
  }
}


// ============================================================
// SINGLE GROQ HTTP REQUEST
// ============================================================

async function requestGroq(
  systemPrompt,
  userPrompt,
  completionTokens
) {

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
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

          body:
            JSON.stringify({

              model:
                MODEL,

              messages: [

                {
                  role: 'system',

                  content:
                    systemPrompt
                },

                {
                  role: 'user',

                  content:
                    userPrompt
                }

              ],


              /*
               * Strict structured output.
               */
              response_format: {

                type:
                  'json_schema',

                json_schema: {

                  name:
                    'vidhwaan_daily_social',

                  strict:
                    true,

                  schema:
                    getSchema()
                }
              },


              /*
               * GPT-OSS reasoning.
               */
              reasoning_effort:
                'high',

              reasoning_format:
                'hidden',


              /*
               * Low temperature for factual
               * and schema-focused generation.
               */
              temperature:
                0.15,


              /*
               * Current Groq API parameter.
               */
              max_completion_tokens:
                completionTokens
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
          `Groq returned a non-JSON HTTP response. ` +
          `HTTP ${response.status}: ` +
          responseText.slice(0, 500)
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


      /*
       * Preserve rate-limit headers.
       */
      error.retryAfter =
        response.headers.get(
          'retry-after'
        );

      error.resetTokens =
        response.headers.get(
          'x-ratelimit-reset-tokens'
        );

      error.remainingTokens =
        response.headers.get(
          'x-ratelimit-remaining-tokens'
        );

      error.limitTokens =
        response.headers.get(
          'x-ratelimit-limit-tokens'
        );


      throw error;
    }


    /*
     * Log useful token information without
     * exposing the API key.
     */
    logRateHeaders(
      response
    );


    return data;


  } catch (error) {

    if (
      error?.name ===
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
// GROQ CONTENT EXTRACTION
// ============================================================

function extractGroqContent(
  response
) {

  const message =
    response
      ?.choices
      ?.at(0)
      ?.message;


  const content =
    message?.content;


  if (
    typeof content ===
    'string'
  ) {

    return content.trim();
  }


  if (
    message?.refusal
  ) {

    throw new Error(
      `Groq refused the generation: ${message.refusal}`
    );
  }


  return '';
}


// ============================================================
// RATE LIMIT HEADER LOGGING
// ============================================================

function logRateHeaders(
  response
) {

  const remaining =
    response.headers.get(
      'x-ratelimit-remaining-tokens'
    );

  const limit =
    response.headers.get(
      'x-ratelimit-limit-tokens'
    );

  const reset =
    response.headers.get(
      'x-ratelimit-reset-tokens'
    );


  if (
    remaining ||
    limit ||
    reset
  ) {

    console.log('');

    console.log(
      'Groq token window information:'
    );

    if (remaining) {

      console.log(
        `Remaining tokens: ${remaining}`
      );
    }

    if (limit) {

      console.log(
        `Token limit: ${limit}`
      );
    }

    if (reset) {

      console.log(
        `Token reset: ${reset}`
      );
    }
  }
}


// ============================================================
// RATE LIMIT WAIT CALCULATION
// ============================================================

function getRateLimitWaitMs(
  error
) {

  /*
   * First preference:
   * retry-after header.
   */
  const retryAfter =
    error?.retryAfter;


  if (
    retryAfter
  ) {

    const parsed =
      parseRetryAfter(
        retryAfter
      );

    if (
      Number.isFinite(
        parsed
      )
    ) {

      /*
       * Add a small safety margin.
       */
      return Math.max(
        3000,
        parsed + 2000
      );
    }
  }


  /*
   * Second preference:
   * x-ratelimit-reset-tokens.
   *
   * Groq may return values such as:
   *
   * 1m30.5s
   * 30s
   * 1500ms
   */
  const reset =
    error?.resetTokens;


  if (
    reset
  ) {

    const parsed =
      parseDurationString(
        reset
      );

    if (
      Number.isFinite(
        parsed
      )
    ) {

      return Math.max(
        3000,
        parsed + 2000
      );
    }
  }


  /*
   * Conservative fallback.
   */
  return 65000;
}


// ============================================================
// RETRY-AFTER PARSER
// ============================================================

function parseRetryAfter(
  value
) {

  const numeric =
    Number(
      String(value).trim()
    );


  if (
    Number.isFinite(
      numeric
    )
  ) {

    /*
     * HTTP Retry-After is normally seconds.
     */
    return Math.ceil(
      numeric * 1000
    );
  }


  return NaN;
}


// ============================================================
// GROQ RESET-DURATION PARSER
// ============================================================

function parseDurationString(
  value
) {

  const text =
    String(value)
      .trim()
      .toLowerCase();


  if (!text) {
    return NaN;
  }


  /*
   * Pure numeric values are interpreted
   * conservatively as seconds.
   */
  if (
    /^\d+(?:\.\d+)?$/.test(
      text
    )
  ) {

    return Math.ceil(
      Number(text) * 1000
    );
  }


  let totalMs = 0;

  let matched = false;


  const regex =
    /(\d+(?:\.\d+)?)\s*(ms|s|m|h)/g;


  let match;


  while (
    (match = regex.exec(text)) !== null
  ) {

    matched = true;


    const amount =
      Number(
        match[1]
      );

    const unit =
      match[2];


    if (
      unit === 'ms'
    ) {

      totalMs +=
        amount;

    } else if (
      unit === 's'
    ) {

      totalMs +=
        amount * 1000;

    } else if (
      unit === 'm'
    ) {

      totalMs +=
        amount * 60 * 1000;

    } else if (
      unit === 'h'
    ) {

      totalMs +=
        amount * 60 * 60 * 1000;
    }
  }


  if (!matched) {
    return NaN;
  }


  return Math.ceil(
    totalMs
  );
}


// ============================================================
// COMPLETION-LIMIT DETECTION
// ============================================================

function isCompletionLimitError(
  error
) {

  const message =
    String(
      error?.message ||
      ''
    ).toLowerCase();


  return (
    message.includes(
      'max completion tokens'
    ) ||
    message.includes(
      'completion tokens reached'
    ) ||
    message.includes(
      'output was truncated'
    ) ||
    message.includes(
      'missing required content'
    ) ||
    message.includes(
      'missing properties'
    )
  );
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


    quote: {

      heading:
        'నేటి సూక్తి',

      title:
        cleanText(
          data.quote.title
        ),

      content:
        cleanText(
          data.quote.content
        ),

      attribution:
        cleanText(
          data.quote.attribution
        )
    },


    health: {

      heading:
        'నేటి ఆరోగ్యం',

      title:
        cleanText(
          data.health.title
        ),

      content:
        cleanText(
          data.health.content
        )
    },


    science: {

      heading:
        'నేటి విజ్ఞానం',

      title:
        cleanText(
          data.science.title
        ),

      content:
        cleanText(
          data.science.content
        )
    },


    knowledge: {

      heading:
        'నేటి జ్ఞానం',

      title:
        cleanText(
          data.knowledge.title
        ),

      content:
        cleanText(
          data.knowledge.content
        )
    },


    question: {

      heading:
        'నేటి ప్రశ్న',

      question:
        cleanText(
          data.question.question
        ),

      answer:
        cleanText(
          data.question.answer
        )
    }
  };
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


  /*
   * EXACT top-level structure.
   */
  const expectedTopLevelKeys = [

    'date',
    'language',
    'publisher',

    'quote',
    'health',
    'science',
    'knowledge',
    'question'
  ];


  const actualKeys =
    Object.keys(
      data
    ).sort();


  const expectedKeys =
    [...expectedTopLevelKeys]
      .sort();


  if (
    JSON.stringify(actualKeys) !==
    JSON.stringify(expectedKeys)
  ) {

    throw new Error(
      `Unexpected top-level fields. ` +
      `Expected: ${expectedKeys.join(', ')}. ` +
      `Actual: ${actualKeys.join(', ')}.`
    );
  }


  /*
   * Explicitly reject culture.
   */
  if (
    Object.prototype.hasOwnProperty.call(
      data,
      'culture'
    )
  ) {

    throw new Error(
      'The culture field is forbidden.'
    );
  }


  /*
   * Metadata.
   */
  if (
    data.date !==
    TARGET_DATE
  ) {

    throw new Error(
      `Invalid date. Expected ${TARGET_DATE}.`
    );
  }


  if (
    data.language !==
    'te'
  ) {

    throw new Error(
      'language must be exactly "te".'
    );
  }


  if (
    data.publisher !==
    'Vidhwaan'
  ) {

    throw new Error(
      'publisher must be exactly "Vidhwaan".'
    );
  }


  /*
   * Section validation.
   */
  validateSection(
    data.quote,
    'quote',
    'నేటి సూక్తి',
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
    'నేటి ఆరోగ్యం',
    [
      'heading',
      'title',
      'content'
    ]
  );


  validateSection(
    data.science,
    'science',
    'నేటి విజ్ఞానం',
    [
      'heading',
      'title',
      'content'
    ]
  );


  validateSection(
    data.knowledge,
    'knowledge',
    'నేటి జ్ఞానం',
    [
      'heading',
      'title',
      'content'
    ]
  );


  validateSection(
    data.question,
    'question',
    'నేటి ప్రశ్న',
    [
      'heading',
      'question',
      'answer'
    ]
  );


  /*
   * Quote.
   */
  if (
    cleanText(
      data.quote.attribution
    ) !==
    'Vidhwaan'
  ) {

    throw new Error(
      'Quote attribution must be exactly "Vidhwaan".'
    );
  }


  /*
   * General text safety.
   */
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

  ].join(' ');


  validateGeneralText(
    allText
  );


  /*
   * Health-specific safety.
   */
  validateHealth(
    data.health
  );


  /*
   * Science-specific safety.
   */
  validateScience(
    data.science
  );


  /*
   * Knowledge-specific safety.
   */
  validateKnowledge(
    data.knowledge
  );


  /*
   * Question-specific safety.
   */
  validateQuestion(
    data.question
  );


  /*
   * Content length.
   */
  validateContentLengths(
    data
  );


  return true;
}


// ============================================================
// SECTION VALIDATION
// ============================================================

function validateSection(
  section,
  name,
  heading,
  fields
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


  const actual =
    Object.keys(
      section
    ).sort();


  const expected =
    [...fields].sort();


  if (
    JSON.stringify(actual) !==
    JSON.stringify(expected)
  ) {

    throw new Error(
      `${name} has unexpected fields. ` +
      `Expected: ${expected.join(', ')}. ` +
      `Actual: ${actual.join(', ')}.`
    );
  }


  if (
    section.heading !==
    heading
  ) {

    throw new Error(
      `${name}.heading must be "${heading}".`
    );
  }


  for (
    const field of fields
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
      section[field].trim() === ''
    ) {

      throw new Error(
        `${name}.${field} cannot be empty.`
      );
    }
  }
}


// ============================================================
// GENERAL TEXT VALIDATION
// ============================================================

function validateGeneralText(
  text
) {

  const value =
    String(
      text || ''
    );


  /*
   * URLs.
   */
  if (
    /https?:\/\//i.test(
      value
    )
  ) {

    throw new Error(
      'URLs are not allowed in published content.'
    );
  }


  /*
   * Hashtags.
   */
  if (
    /(^|\s)#\S+/.test(
      value
    )
  ) {

    throw new Error(
      'Hashtags are not allowed in published content.'
    );
  }


  /*
   * Markdown/code formatting.
   */
  if (
    /```/.test(
      value
    ) ||
    /\*\*[^*]+\*\*/.test(
      value
    )
  ) {

    throw new Error(
      'Markdown/code formatting is not allowed.'
    );
  }


  /*
   * Internal technical terms.
   */
  const forbiddenTerms = [

    'Groq',
    'OpenAI',
    'GPT',
    'prompt',
    'schema',
    'API',
    'GitHub',
    'JSON',
    'language model',
    'AI model',
    'system message',
    'system prompt',
    'response_format'
  ];


  for (
    const term of forbiddenTerms
  ) {

    if (
      value
        .toLowerCase()
        .includes(
          term.toLowerCase()
        )
    ) {

      throw new Error(
        `Internal/technical term detected: ${term}`
      );
    }
  }


  /*
   * Empty or repeated whitespace.
   */
  if (
    /\n{4,}/.test(
      value
    )
  ) {

    throw new Error(
      'Excessive blank lines detected.'
    );
  }
}


// ============================================================
// HEALTH VALIDATION
// ============================================================

function validateHealth(
  health
) {

  const text = [

    health.title,
    health.content

  ].join(' ');


  /*
   * Known unsafe / overbroad claims.
   */
  const forbiddenPatterns = [

    /8\s*గ్లాస్/i,

    /8\s*గ్లాసుల/i,

    /2\s*లీటర్/i,

    /కచ్చితంగా.*నీరు/i,

    /తప్పనిసరిగా.*నీరు/i,

    /మందు.*ఆప/i,

    /మందులు.*ఆప/i,

    /మందు.*వాడకండి/i,

    /మందులు.*వాడకండి/i,

    /రోగం.*నయం/i,

    /వ్యాధి.*నయం/i,

    /శాశ్వతంగా.*నయం/i,

    /100\s*%\s*నయం/i,

    /అద్భుత.*చికిత్స/i,

    /మిరాకిల్.*చికిత్స/i,

    /చికిత్స.*హామీ/i
  ];


  for (
    const pattern of forbiddenPatterns
  ) {

    if (
      pattern.test(
        text
      )
    ) {

      throw new Error(
        `Potentially unsafe health claim detected: ${pattern}`
      );
    }
  }
}


// ============================================================
// SCIENCE VALIDATION
// ============================================================

function validateScience(
  science
) {

  const text = [

    science.title,
    science.content

  ].join(' ');


  /*
   * Prevent obvious uncertainty from being
   * presented as established science.
   */
  const problematicPatterns = [

    /బహుశా.*శాస్త్రీయంగా/i,

    /అంటారు.*నిజం/i,

    /అని.*నిరూపించబడలేదు/i,

    /శాస్త్రవేత్తలు.*తెలియదు.*కానీ/i
  ];


  for (
    const pattern of problematicPatterns
  ) {

    if (
      pattern.test(
        text
      )
    ) {

      throw new Error(
        'Science content contains an uncertain/speculative formulation.'
      );
    }
  }
}


// ============================================================
// KNOWLEDGE VALIDATION
// ============================================================

function validateKnowledge(
  knowledge
) {

  const text = [

    knowledge.title,
    knowledge.content

  ].join(' ');


  /*
   * Specific known historical misinformation
   * that appeared in earlier generated content.
   */
  if (
    /1911/.test(
      text
    ) &&
    /మౌంట్‌బాటన్|మౌంట్బాటన్|Mountbatten/i.test(
      text
    )
  ) {

    throw new Error(
      'Invalid Mountbatten/1911 Indian capital claim detected.'
    );
  }


  /*
   * Do not allow obvious fabricated attribution
   * patterns.
   */
  if (
    /అన్నారు.*అని.*చెప్పారు.*అయితే/i.test(
      text
    )
  ) {

    throw new Error(
      'Potentially fabricated historical attribution detected.'
    );
  }
}


// ============================================================
// QUESTION VALIDATION
// ============================================================

function validateQuestion(
  question
) {

  const questionText =
    question.question.trim();

  const answer =
    question.answer.trim();


  if (
    questionText.length <
    15
  ) {

    throw new Error(
      'Question is too short.'
    );
  }


  if (
    answer.length ===
    0
  ) {

    throw new Error(
      'Question answer is empty.'
    );
  }


  /*
   * Reject English sentence answers.
   *
   * Pure numbers, units, mathematical expressions,
   * Telugu answers and short named answers are allowed.
   */
  if (
    /^[A-Za-z][A-Za-z\s,'".!?-]{8,}$/.test(
      answer
    )
  ) {

    throw new Error(
      'Question answer appears to be an English sentence.'
    );
  }


  /*
   * Reject common ambiguous answer phrases.
   */
  const ambiguousPatterns = [

    /^తెలియదు$/i,

    /^బహుశా$/i,

    /^అవకాశం ఉంది$/i,

    /^అనేక$/i,

    /^ఏదైనా$/i
  ];


  for (
    const pattern of ambiguousPatterns
  ) {

    if (
      pattern.test(
        answer
      )
    ) {

      throw new Error(
        'Question answer is ambiguous.'
      );
    }
  }
}


// ============================================================
// CONTENT LENGTH VALIDATION
// ============================================================

function validateContentLengths(
  data
) {

  const limits = [

    [
      'quote.title',
      data.quote.title,
      100
    ],

    [
      'quote.content',
      data.quote.content,
      500
    ],

    [
      'health.title',
      data.health.title,
      100
    ],

    [
      'health.content',
      data.health.content,
      700
    ],

    [
      'science.title',
      data.science.title,
      100
    ],

    [
      'science.content',
      data.science.content,
      700
    ],

    [
      'knowledge.title',
      data.knowledge.title,
      100
    ],

    [
      'knowledge.content',
      data.knowledge.content,
      700
    ],

    [
      'question.question',
      data.question.question,
      800
    ],

    [
      'question.answer',
      data.question.answer,
      200
    ]
  ];


  for (
    const [
      name,
      value,
      max
    ] of limits
  ) {

    if (
      String(value).length >
      max
    ) {

      throw new Error(
        `${name} is too long. Maximum ${max} characters.`
      );
    }
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


  const files =
    fs.readdirSync(
      DATA_DIR
    )
      .filter(
        file =>
          /^\d{4}-\d{2}-\d{2}\.json$/
            .test(file)
      )
      .filter(
        file =>
          file !==
          `${TARGET_DATE}.json`
      )
      .sort()
      .reverse()
      .slice(
        0,
        MAX_RECENT_FILES
      );


  if (
    files.length ===
    0
  ) {

    console.log(
      'Recent JSON files: 0'
    );

    return '';
  }


  console.log(
    `Recent JSON files: ${files.length}`
  );


  const output = [];


  for (
    const file of files
  ) {

    const fullPath =
      path.join(
        DATA_DIR,
        file
      );


    try {

      const raw =
        fs.readFileSync(
          fullPath,
          'utf8'
        );


      const parsed =
        JSON.parse(
          raw
        );


      output.push(
        JSON.stringify(
          parsed
        )
      );


    } catch (
      error
    ) {

      console.warn(
        `Warning: Could not read recent file ${file}: ${error.message}`
      );
    }
  }


  return output.join(
    '\n'
  );
}


// ============================================================
// ATOMIC JSON WRITE
// ============================================================

async function writeAtomicJson(
  outputFile,
  data
) {

  /*
   * Final safety check before touching disk.
   */
  validateContent(
    data
  );


  /*
   * NEVER replace an existing file.
   */
  if (
    fs.existsSync(
      outputFile
    )
  ) {

    throw new Error(
      `Refusing to overwrite existing file: ${outputFile}`
    );
  }


  const temporaryFile =
    `${outputFile}.tmp-${process.pid}-${Date.now()}`;


  const json =
    JSON.stringify(
      data,
      null,
      2
    ) + '\n';


  try {

    fs.writeFileSync(
      temporaryFile,
      json,
      {
        encoding: 'utf8',
        flag: 'wx'
      }
    );


    /*
     * Verify the temporary file before publication.
     */
    const written =
      fs.readFileSync(
        temporaryFile,
        'utf8'
      );


    const parsed =
      JSON.parse(
        written
      );


    validateContent(
      parsed
    );


    /*
     * Rename is atomic on the same filesystem.
     */
    fs.renameSync(
      temporaryFile,
      outputFile
    );


  } catch (
    error
  ) {

    if (
      fs.existsSync(
        temporaryFile
      )
    ) {

      try {

        fs.unlinkSync(
          temporaryFile
        );

      } catch {}
    }


    throw error;
  }
}


// ============================================================
// VERIFY WRITTEN FILE
// ============================================================

function verifyWrittenFile(
  file
) {

  if (
    !fs.existsSync(
      file
    )
  ) {

    throw new Error(
      `Generated file was not found after publication: ${file}`
    );
  }


  const raw =
    fs.readFileSync(
      file,
      'utf8'
    );


  if (
    raw.trim() ===
    ''
  ) {

    throw new Error(
      `Generated file is empty: ${file}`
    );
  }


  let parsed;

  try {

    parsed =
      JSON.parse(
        raw
      );

  } catch (
    error
  ) {

    throw new Error(
      `Written JSON is invalid: ${error.message}`
    );
  }


  validateContent(
    parsed
  );


  console.log('');
  console.log(
    `Verified JSON: ${file}`
  );

  console.log(
    `File size: ${Buffer.byteLength(raw, 'utf8')} bytes`
  );
}


// ============================================================
// CLEAN TEXT
// ============================================================

function cleanText(
  value
) {

  return String(
    value ?? ''
  )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
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
      .exec(
        value
      );


  if (!match) {
    return false;
  }


  const year =
    Number(
      match[1]
    );

  const month =
    Number(
      match[2]
    );

  const day =
    Number(
      match[3]
    );


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
        recursive:
          true
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
  console.log('PRODUCTION CONTENT GENERATOR');
  console.log('========================================');

  console.log(
    `Publication date: ${TARGET_DATE}`
  );

  console.log(
    'Timezone: Asia/Kolkata'
  );

  console.log(
    `Model: ${MODEL}`
  );

  console.log(
    'Reasoning: high'
  );

  console.log(
    'Cards: 5'
  );

  console.log('========================================');
}


// ============================================================
// SLEEP
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


// ============================================================
// DURATION FORMAT
// ============================================================

function formatDuration(
  milliseconds
) {

  const totalSeconds =
    Math.ceil(
      milliseconds / 1000
    );


  if (
    totalSeconds <
    60
  ) {

    return `${totalSeconds} seconds`;
  }


  const minutes =
    Math.floor(
      totalSeconds / 60
    );

  const seconds =
    totalSeconds % 60;


  if (
    seconds ===
    0
  ) {

    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }


  return (
    `${minutes} minute${minutes === 1 ? '' : 's'} ` +
    `${seconds} seconds`
  );
}


// ============================================================
// FAIL
// ============================================================

function fail(
  message
) {

  console.error('');
  console.error('========================================');
  console.error('VIDHWAAN DAILY SOCIAL');
  console.error('GENERATION FAILED');
  console.error('========================================');
  console.error('');
  console.error(message);
  console.error('');
  console.error(
    'IMPORTANT: No questionable or incomplete JSON was published.'
  );
  console.error('');

  process.exit(
    1
  );
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
