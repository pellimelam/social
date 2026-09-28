'use strict';

/*
 * ============================================================
 * VIDHWAAN DAILY SOCIAL
 * Production Daily Telugu Content Generator
 * ============================================================
 *
 * Five daily cards:
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
  // GENERATE + VALIDATE
  // ----------------------------------------------------------

  const content =
    await generateValidatedContent(
      recentContent
    );


  // ----------------------------------------------------------
  // NORMALIZE FINAL CONTENT
  // ----------------------------------------------------------

  const finalContent =
    normalizeFinalContent(
      content
    );


  // ----------------------------------------------------------
  // FINAL PRODUCTION VALIDATION
  // ----------------------------------------------------------

  console.log('');
  console.log(
    'Running final production validation...'
  );

  validateContent(
    finalContent
  );


  // ----------------------------------------------------------
  // WRITE JSON
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
    '1. నేటి సూక్తి'
  );

  console.log(
    '2. నేటి ఆరోగ్యం'
  );

  console.log(
    '3. నేటి విజ్ఞానం'
  );

  console.log(
    '4. నేటి జ్ఞానం'
  );

  console.log(
    '5. నేటి ప్రశ్న'
  );

  console.log('');

  console.log(
    'Five-card structure: PASSED'
  );

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
       */
      parsed.language = 'te';

      parsed.publisher = 'Vidhwaan';


      console.log(
        'Validating generated content...'
      );


      /*
       * Validation happens INSIDE the retry loop.
       *
       * If the generated answer is invalid,
       * Groq gets another chance.
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

Generate exactly FIVE high-quality daily social-media-ready
content sections for Telugu-speaking users.

There are ONLY FIVE sections.

The five sections are:

1. నేటి సూక్తి
2. నేటి ఆరోగ్యం
3. నేటి విజ్ఞానం
4. నేటి జ్ఞానం
5. నేటి ప్రశ్న

IMPORTANT:

There is NO culture section.

Do not create:
culture
నేటి సంస్కృతి
Bhagavad Gita as a separate card
any sixth section

The JSON MUST contain exactly the five sections defined
by the supplied JSON Schema.

LANGUAGE:

All user-facing content must be natural Telugu.

The JSON metadata field "language" must be exactly:

te

Never output:
Telugu
telugu
te-IN
te_IN

or any other language code.

Do not write English sentences in user-facing content.

English may appear only when absolutely necessary for:
- proper names
- scientific names
- unavoidable technical terms
- mathematical notation
- units
- Vidhwaan

GENERAL QUALITY:

- Content must be clear.
- Content must be useful.
- Content must be accurate.
- Content must be concise.
- Content must be suitable for a daily social card.
- Content should be easy for ordinary Telugu readers to understand.
- Avoid unnecessary difficult vocabulary.
- Avoid repetition.
- Do not use markdown.
- Do not use bullet points.
- Do not use hashtags.
- Do not use URLs.
- Do not use emojis.
- Do not mention AI.
- Do not mention Groq.
- Do not mention the prompt.
- Do not mention JSON.
- Do not mention internal instructions.

------------------------------------------------------------
1. నేటి సూక్తి
------------------------------------------------------------

Create one meaningful daily thought.

It should be:
- memorable
- useful
- positive
- practical
- understandable
- suitable for sharing

The thought may be:

- an original Vidhwaan thought
OR
- a reliably attributed quotation.

Never invent an attribution.

If the thought is original, use:

attribution:
Vidhwaan

Do not manufacture quotations and attribute them to:
- Sri Krishna
- Buddha
- Vivekananda
- Gandhi
- scientists
- writers
- philosophers
- scriptures
- historical figures
or anyone else.

A genuine Bhagavad Gita teaching may occasionally inspire
the thought, but do NOT create a separate Gita/culture card.

If a scripture is referenced, do not invent a quotation
or verse.

------------------------------------------------------------
2. నేటి ఆరోగ్యం
------------------------------------------------------------

Provide one useful general health fact or habit.

The content must be educational.

It may discuss:
- sleep
- hydration
- physical activity
- nutrition
- posture
- sunlight
- stress management
- hygiene
- preventive health
- healthy daily habits
- basic human biology

Do not:
- diagnose disease
- prescribe medicine
- tell people to stop medication
- promise cures
- recommend dangerous treatment
- make unsupported medical claims
- present one person's experience as medical evidence

Use careful, evidence-aligned language.

------------------------------------------------------------
3. నేటి విజ్ఞానం
------------------------------------------------------------

Provide one interesting and accurate science fact.

Possible subjects include:
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

The explanation should answer:

"What is it?"
and, where useful,
"Why does it happen?"

Do not present speculation as established fact.

------------------------------------------------------------
4. నేటి జ్ఞానం
------------------------------------------------------------

Provide one useful piece of general knowledge.

It can come from:
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

Prefer information that people can actually remember
or use.

Avoid extremely obscure trivia.

------------------------------------------------------------
5. నేటి ప్రశ్న
------------------------------------------------------------

Create one enjoyable thinking question.

The question MUST have a definite answer.

The question must contain enough information to solve it.

Do not require obscure outside knowledge.

Prefer:
- logical thinking
- simple mathematics
- observation
- reasoning
- everyday situations
- clever but fair puzzles

Avoid:
- ambiguous questions
- opinion questions
- political questions
- questions with multiple possible answers
- obscure trivia

The answer must be correct.

QUESTION ANSWER:

The answer should normally be written in Telugu.

A pure numerical or mathematical answer is also valid.

Examples:

42

8

3.14

100%

25°C

2 గంటలు

Do not write:

The answer is 42.

Instead write:

42

or:

సమాధానం 42.

------------------------------------------------------------
ANTI-REPETITION
------------------------------------------------------------

Recent generated content will be provided.

Do not repeat:
- the same topic
- the same fact
- the same quote
- the same example
- the same question
- the same puzzle structure
- the same health advice
- the same science fact
- the same knowledge topic

Do not copy recent content.

Every day should feel meaningfully fresh.

------------------------------------------------------------
IMPORTANT
------------------------------------------------------------

Return exactly FIVE sections.

Do not create a sixth section.

Do not create a culture section.

Do not create a Bhagavad Gita section.

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

The previous generated content failed validation because:

${previousError}

Generate a completely corrected response.

Do not repeat the same error.
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

EXACTLY FIVE CARDS:

1. నేటి సూక్తి
2. నేటి ఆరోగ్యం
3. నేటి విజ్ఞానం
4. నేటి జ్ఞానం
5. నేటి ప్రశ్న

There must be NO culture card.

There must be NO sixth card.

The content will be displayed directly to Telugu users
and converted into beautiful vertical social/reel images.

Keep the content concise, clear, useful and visually suitable.

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

            model:
              MODEL,


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

  return String(
    answer || ''
  ).trim();
}


// ============================================================
// COMPLETE CONTENT VALIDATION
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


  // ----------------------------------------------------------
  // EXACT TOP-LEVEL STRUCTURE
  // ----------------------------------------------------------

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
      `Invalid five-card structure. ` +
      `Expected exactly: ${expectedTopLevelKeys.join(', ')}. ` +
      `Received: ${actualKeys.join(', ')}.`
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
  // EXACT HEADINGS
  // ----------------------------------------------------------

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
  // TELUGU VALIDATION
  // ----------------------------------------------------------

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
   * question.answer may be:
   *
   * Telugu
   * OR
   * a pure numerical/mathematical answer.
   */
  validateQuestionAnswer(
    data.question.answer
  );


  // ----------------------------------------------------------
  // FORBIDDEN TEXT
  // ----------------------------------------------------------

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

  ].join('\n');


  validateForbiddenText(
    allText
  );


  // ----------------------------------------------------------
  // LENGTH LIMITS
  // ----------------------------------------------------------

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
    String(
      answer || ''
    ).trim();


  if (!value) {

    throw new Error(
      'question.answer cannot be empty.'
    );
  }


  /*
   * Telugu answer.
   */
  if (
    containsTelugu(value)
  ) {

    return;
  }


  /*
   * Pure numerical / mathematical answer.
   *
   * Examples:
   *
   * 42
   * 3.14
   * 100%
   * 25°C
   * 5 + 5 = 10
   * 2:1
   */
  const numericAnswerPattern =
    /^[\d\s.,:%+\-×÷=()\/*^²³⁴⁵⁶⁷⁸⁹⁰°℃℉≤≥<>]+$/u;


  if (
    numericAnswerPattern.test(value)
  ) {

    return;
  }


  /*
   * Latin text is rejected.
   */
  if (
    /[A-Za-z]/.test(value)
  ) {

    throw new Error(
      'question.answer contains non-Telugu Latin text. Write the answer in Telugu or use only a pure numerical/mathematical answer.'
    );
  }


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
// LENGTH VALIDATION
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


      /*
       * Only the five current sections are read.
       *
       * Old six-card files may exist, but culture is
       * deliberately ignored.
       */
      recent.push({

        date:
          data.date ||
          file.replace(
            '.json',
            ''
          ),


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


  /*
   * Rate limit.
   */
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


  /*
   * Temporary API/network error.
   */
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
   * Validation error.
   */
  return (
    3000 * attempt
  );
}


// ============================================================
// INDIA DATE
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


// ============================================================
// DATE VALIDATION
// ============================================================

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

  console.log(
    '========================================'
  );

  console.log(
    'VIDHWAAN DAILY SOCIAL'
  );

  console.log(
    'Daily Content Generator'
  );

  console.log(
    '========================================'
  );

  console.log(
    `Date: ${TARGET_DATE}`
  );

  console.log(
    `Model: ${MODEL}`
  );

  console.log(
    'Timezone: Asia/Kolkata'
  );

  console.log(
    'Cards: 5'
  );

  console.log(
    '========================================'
  );
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

  console.error(
    '========================================'
  );

  console.error(
    'GENERATION FAILED'
  );

  console.error(
    '========================================'
  );

  console.error('');

  console.error(
    message
  );

  console.error('');

  process.exit(1);
}


// ============================================================
// GLOBAL ERROR HANDLING
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
