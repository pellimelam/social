'use strict';

/*
 * Vidhwaan Daily Social
 * Daily Telugu Content Generator
 *
 * Generates exactly 6 Telugu sections:
 * 1. Daily Culture
 * 2. Daily Quote
 * 3. Daily Health
 * 4. Daily Science
 * 5. Daily Knowledge
 * 6. Daily Question
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
 * Important:
 *   - GROQ_API_KEY is read only from the environment.
 *   - No API key is written into generated files.
 *   - Telugu content only.
 *   - Strict JSON Schema Structured Outputs.
 *   - Previous generated files are used to reduce repetition.
 */

const fs = require('fs');
const path = require('path');


// ============================================================
// CONFIGURATION
// ============================================================

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
  console.log('');
  console.log('========================================');
  console.log('VIDHWAAN DAILY SOCIAL');
  console.log('Daily Content Generator');
  console.log('========================================');
  console.log(`Date: ${TARGET_DATE}`);
  console.log(`Model: ${MODEL}`);
  console.log('Timezone: Asia/Kolkata');
  console.log('========================================');
  console.log('');

  ensureDataDirectory();

  const outputFile =
    path.join(DATA_DIR, `${TARGET_DATE}.json`);

  /*
   * Never regenerate a date that already has a valid JSON file.
   * This prevents accidental replacement of published content.
   */
  if (fs.existsSync(outputFile)) {
    console.log('Daily JSON already exists.');
    console.log(`File: ${outputFile}`);
    console.log('');
    console.log('Nothing to generate.');
    return;
  }

  const recentContent =
    readRecentContent();

  console.log('Generating six Telugu sections...');
  console.log('');

  const generated =
    await generateContent(recentContent);

  console.log('');
  console.log('Validating generated content...');
  console.log('');

  /*
   * Normalize harmless metadata variations before validation.
   *
   * The schema already requires "te", but this defensive assignment
   * protects the pipeline if the API ever returns an equivalent
   * language label despite the schema.
   *
   * We still validate the actual content for Telugu below.
   */
  generated.language = 'te';
  generated.publisher = 'Vidhwaan';

  validateContent(generated);

  /*
   * Ensure the final JSON contains only the exact production fields.
   * This also protects against unexpected properties.
   */
  const finalContent = {
    date: TARGET_DATE,
    language: 'te',
    publisher: 'Vidhwaan',

    culture: {
      heading: 'నేటి సంస్కృతి',
      title: generated.culture.title.trim(),
      content: generated.culture.content.trim(),
      source: generated.culture.source.trim()
    },

    quote: {
      heading: 'నేటి సూక్తి',
      title: generated.quote.title.trim(),
      content: generated.quote.content.trim(),
      attribution: generated.quote.attribution.trim()
    },

    health: {
      heading: 'నేటి ఆరోగ్యం',
      title: generated.health.title.trim(),
      content: generated.health.content.trim()
    },

    science: {
      heading: 'నేటి విజ్ఞానం',
      title: generated.science.title.trim(),
      content: generated.science.content.trim()
    },

    knowledge: {
      heading: 'నేటి జ్ఞానం',
      title: generated.knowledge.title.trim(),
      content: generated.knowledge.content.trim()
    },

    question: {
      heading: 'నేటి ప్రశ్న',
      question: generated.question.question.trim(),
      answer: generated.question.answer.trim()
    }
  };

  validateContent(finalContent);

  fs.writeFileSync(
    outputFile,
    JSON.stringify(finalContent, null, 2) + '\n',
    'utf8'
  );

  console.log('========================================');
  console.log('GENERATION SUCCESSFUL');
  console.log('========================================');
  console.log(`Date: ${TARGET_DATE}`);
  console.log(`File: ${outputFile}`);
  console.log('');
  console.log('Generated sections:');
  console.log('1. నేటి సంస్కృతి');
  console.log('2. నేటి సూక్తి');
  console.log('3. నేటి ఆరోగ్యం');
  console.log('4. నేటి విజ్ఞానం');
  console.log('5. నేటి జ్ఞానం');
  console.log('6. నేటి ప్రశ్న');
  console.log('');
  console.log('JSON validation: PASSED');
  console.log('Telugu validation: PASSED');
  console.log('Schema validation: PASSED');
  console.log('========================================');
}


// ============================================================
// GROQ GENERATION
// ============================================================

async function generateContent(recentContent) {
  const systemPrompt = `
You are the official daily content writer for Vidhwaan, a village-based global technology company.

Your task is to create six high-quality daily social-media-ready Telugu content sections.

IMPORTANT LANGUAGE RULES:

1. ALL user-facing content MUST be written in natural Telugu.
2. The JSON field "language" MUST be exactly:
   "te"
3. Never output:
   "Telugu"
   "telugu"
   "te-IN"
   "te_IN"
   or any other language code.
4. Do not write English explanations.
5. English may appear only when absolutely necessary for a scientific or technical proper name.

CONTENT SECTIONS:

1. నేటి సంస్కృతి
2. నేటి సూక్తి
3. నేటి ఆరోగ్యం
4. నేటి విజ్ఞానం
5. నేటి జ్ఞానం
6. నేటి ప్రశ్న

GENERAL QUALITY RULES:

- Content must be concise and shareable.
- Content must be useful to Telugu-speaking people.
- Avoid repetitive topics.
- Do not use markdown.
- Do not use bullet points.
- Do not use emojis.
- Do not use hashtags.
- Do not use URLs.
- Do not mention AI.
- Do not mention Groq.
- Do not mention this prompt.
- Do not mention JSON.
- Do not address the reader with unnecessary promotional language.
- Do not fabricate facts.
- Do not invent quotations.
- Do not invent scripture quotations.
- Do not falsely attribute statements to gods, sages, authors, scientists, or historical people.

CULTURE RULES:

The culture section may cover:
- Bhagavad Gita
- Ramayana
- Mahabharata
- Vedas
- Upanishads
- Puranas
- Hindu traditions
- Indian festivals
- temples and traditions
- dharma
- philosophy
- Indian cultural practices
- teachings associated with Hindu traditions

Be respectful and educational.

If quoting scripture, use only wording that you are confident is genuine.
Never create a fake quotation and attribute it to a scripture.

If exact wording is uncertain, explain the teaching in your own Telugu words and provide an appropriate source description.

QUOTE RULES:

The quote may be:
- an original Vidhwaan thought, or
- a reliably attributed quotation.

Never invent an attribution.

If the thought is original, use:

attribution: "Vidhwaan"

HEALTH RULES:

Health content must be general educational information.

Do not:
- diagnose diseases
- prescribe medicines
- tell people to stop medicines
- claim unsupported cures
- give dangerous medical instructions
- make guaranteed health claims

SCIENCE RULES:

Science content must be factual and evidence-aligned.

Prefer:
- astronomy
- physics
- biology
- chemistry
- Earth science
- space
- technology
- nature
- human body science
- everyday science

Do not present speculation as established fact.

KNOWLEDGE RULES:

Knowledge can cover any useful subject, including:
- history
- geography
- language
- mathematics
- nature
- inventions
- countries
- animals
- space
- technology
- economics
- society
- everyday useful knowledge

QUESTION RULES:

Create one enjoyable thinking question.

It MUST have a definite answer.

The question should contain enough information for a person to solve it without needing outside information.

Avoid obscure trivia.

The answer must clearly and directly answer the question.

VARIETY RULE:

Do not repeat the same topic, example, quotation, fact, question pattern, or subject from recent content.

Recent generated content is provided below.

Use it only to avoid repetition.
Do not copy it.

The final output MUST strictly follow the supplied JSON Schema.
`;

  const userPrompt = `
Create the Vidhwaan Daily Social content for:

DATE:
${TARGET_DATE}

CANONICAL LANGUAGE:
te

PUBLISHER:
Vidhwaan

Create exactly six sections.

The final content must be suitable for publication on the Vidhwaan Daily Social PWA.

Keep each section concise enough to fit a beautiful vertical social/reel image.

Recent content to avoid repeating:

${recentContent || 'No previous content is available. This is the first generation.'}

Remember:

The JSON field language MUST be exactly "te".
All user-facing content MUST be Telugu.
`;

  const schema = {
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

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Groq request ${attempt}/${MAX_ATTEMPTS}...`);

    try {
      const response =
        await requestGroq(
          systemPrompt,
          userPrompt,
          schema
        );

      const content =
        extractGroqContent(response);

      if (!content) {
        throw new Error(
          'Groq returned an empty response.'
        );
      }

      let parsed;

      try {
        parsed = JSON.parse(content);
      } catch (error) {
        throw new Error(
          `Groq returned invalid JSON: ${error.message}`
        );
      }

      /*
       * Defensive normalization.
       *
       * Strict schema should already produce "te".
       * This is deliberately limited to metadata.
       * Actual Telugu content is still validated separately.
       */
      parsed.language = 'te';
      parsed.publisher = 'Vidhwaan';

      return parsed;

    } catch (error) {
      lastError = error;

      console.error('');
      console.error(
        `Groq request ${attempt} failed: ${error.message}`
      );
      console.error('');

      if (attempt < MAX_ATTEMPTS) {
        const waitMs =
          getRetryDelay(error, attempt);

        console.log(
          `Waiting ${Math.round(waitMs / 1000)} seconds before retry...`
        );

        await sleep(waitMs);
      }
    }
  }

  throw new Error(
    `Groq generation failed after ${MAX_ATTEMPTS} attempts. ` +
    `${lastError ? lastError.message : 'Unknown error.'}`
  );
}


// ============================================================
// GROQ HTTP REQUEST
// ============================================================

async function requestGroq(
  systemPrompt,
  userPrompt,
  schema
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
      await fetch(API_URL, {
        method: 'POST',

        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
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

          /*
           * GPT-OSS 120B supports strict structured outputs.
           * This makes the response conform to our schema.
           */
          response_format: {
            type: 'json_schema',

            json_schema: {
              name: 'vidhwaan_daily_social',

              strict: true,

              schema
            }
          },

          /*
           * Moderate creativity while keeping content controlled.
           */
          temperature: 0.7,

          /*
           * Give enough output space for all six sections.
           */
          max_completion_tokens: 5000
        }),

        signal: controller.signal
      });

    const text =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(text);
    } catch {
      throw new Error(
        `Groq returned non-JSON HTTP response. ` +
        `HTTP ${response.status}: ${text.slice(0, 500)}`
      );
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
    if (error.name === 'AbortError') {
      const timeoutError =
        new Error(
          `Groq request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`
        );

      timeoutError.retryable = true;

      throw timeoutError;
    }

    throw error;

  } finally {
    clearTimeout(timeout);
  }
}


// ============================================================
// GROQ RESPONSE EXTRACTION
// ============================================================

function extractGroqContent(response) {
  /*
   * Standard Chat Completions response:
   *
   * choices[0].message.content
   */

  const content =
    response?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  /*
   * Some API responses can expose refusal information.
   */
  const refusal =
    response?.choices?.[0]?.message?.refusal;

  if (refusal) {
    throw new Error(
      `Groq refused the generation: ${refusal}`
    );
  }

  return '';
}


// ============================================================
// RETRY LOGIC
// ============================================================

function getRetryDelay(error, attempt) {
  const status =
    error?.status;

  /*
   * Rate limiting:
   * Prefer Retry-After if available.
   *
   * Since this implementation does not currently expose
   * response headers through the thrown error, use exponential
   * backoff with jitter.
   */
  if (status === 429) {
    return (
      15000 +
      Math.floor(Math.random() * 5000)
    ) * attempt;
  }

  /*
   * Temporary server/network errors.
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
    ) + Math.floor(Math.random() * 2000);
  }

  /*
   * Other errors are normally not worth a long retry,
   * but we still give the generator one controlled retry.
   */
  return (
    3000 * attempt
  );
}


// ============================================================
// RECENT CONTENT
// ============================================================

function readRecentContent() {
  if (!fs.existsSync(DATA_DIR)) {
    return '';
  }

  let files;

  try {
    files =
      fs.readdirSync(DATA_DIR)
        .filter(
          file =>
            /^\d{4}-\d{2}-\d{2}\.json$/.test(file)
        )
        .sort()
        .reverse()
        .slice(0, MAX_RECENT_FILES);

  } catch (error) {
    console.warn(
      `Could not read recent content: ${error.message}`
    );

    return '';
  }

  if (files.length === 0) {
    return '';
  }

  const recent = [];

  for (const file of files) {
    const filePath =
      path.join(DATA_DIR, file);

    try {
      const raw =
        fs.readFileSync(
          filePath,
          'utf8'
        );

      const data =
        JSON.parse(raw);

      recent.push({
        date: data.date || file.replace('.json', ''),

        culture:
          data.culture
            ? {
                title: data.culture.title,
                content: data.culture.content
              }
            : null,

        quote:
          data.quote
            ? {
                title: data.quote.title,
                content: data.quote.content
              }
            : null,

        health:
          data.health
            ? {
                title: data.health.title,
                content: data.health.content
              }
            : null,

        science:
          data.science
            ? {
                title: data.science.title,
                content: data.science.content
              }
            : null,

        knowledge:
          data.knowledge
            ? {
                title: data.knowledge.title,
                content: data.knowledge.content
              }
            : null,

        question:
          data.question
            ? {
                question: data.question.question,
                answer: data.question.answer
              }
            : null
      });

    } catch (error) {
      console.warn(
        `Skipping invalid recent file ${file}: ${error.message}`
      );
    }
  }

  if (recent.length === 0) {
    return '';
  }

  /*
   * Keep the prompt reasonably sized.
   * We don't need entire old JSON files.
   */
  return JSON.stringify(
    recent,
    null,
    2
  );
}


// ============================================================
// VALIDATION
// ============================================================

function validateContent(data) {
  if (!data || typeof data !== 'object') {
    throw new Error(
      'Generated content is not an object.'
    );
  }

  /*
   * Exact top-level fields.
   */
  const expectedKeys = [
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
    Object.keys(data).sort();

  const expectedSorted =
    [...expectedKeys].sort();

  if (
    JSON.stringify(actualKeys) !==
    JSON.stringify(expectedSorted)
  ) {
    throw new Error(
      `Unexpected top-level fields. ` +
      `Expected: ${expectedKeys.join(', ')}. ` +
      `Received: ${actualKeys.join(', ')}.`
    );
  }

  /*
   * Date.
   */
  if (data.date !== TARGET_DATE) {
    throw new Error(
      `date must be "${TARGET_DATE}". Received "${data.date}".`
    );
  }

  /*
   * Language.
   */
  if (data.language !== 'te') {
    throw new Error(
      'language must be "te".'
    );
  }

  /*
   * Publisher.
   */
  if (data.publisher !== 'Vidhwaan') {
    throw new Error(
      'publisher must be "Vidhwaan".'
    );
  }

  /*
   * Validate each section.
   */
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

  /*
   * Exact headings.
   */
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

  /*
   * Telugu content validation.
   */
  const teluguFields = [
    ['culture.title', data.culture.title],
    ['culture.content', data.culture.content],

    ['quote.title', data.quote.title],
    ['quote.content', data.quote.content],

    ['health.title', data.health.title],
    ['health.content', data.health.content],

    ['science.title', data.science.title],
    ['science.content', data.science.content],

    ['knowledge.title', data.knowledge.title],
    ['knowledge.content', data.knowledge.content],

    ['question.question', data.question.question],
    ['question.answer', data.question.answer]
  ];

  for (const [field, value] of teluguFields) {
    if (!containsTelugu(value)) {
      throw new Error(
        `${field} does not contain Telugu text.`
      );
    }
  }

  /*
   * Validate all textual fields against unwanted output.
   */
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

  validateForbiddenText(allText);

  /*
   * Length checks.
   *
   * These limits keep the generated content suitable for
   * mobile cards and 1080x1920 share images.
   */
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
  sectionName,
  requiredFields
) {
  if (
    !section ||
    typeof section !== 'object' ||
    Array.isArray(section)
  ) {
    throw new Error(
      `${sectionName} must be an object.`
    );
  }

  for (const field of requiredFields) {
    if (
      typeof section[field] !== 'string' ||
      section[field].trim().length === 0
    ) {
      throw new Error(
        `${sectionName}.${field} must be a non-empty string.`
      );
    }
  }

  const actualKeys =
    Object.keys(section).sort();

  const expectedKeys =
    [...requiredFields].sort();

  if (
    JSON.stringify(actualKeys) !==
    JSON.stringify(expectedKeys)
  ) {
    throw new Error(
      `${sectionName} contains unexpected fields.`
    );
  }
}


// ============================================================
// FORBIDDEN TEXT VALIDATION
// ============================================================

function validateForbiddenText(text) {
  const forbiddenPatterns = [
    {
      pattern: /```/,
      message: 'Markdown code fences are not allowed.'
    },

    {
      pattern: /https?:\/\//i,
      message: 'URLs are not allowed.'
    },

    {
      pattern: /\bwww\./i,
      message: 'Web addresses are not allowed.'
    },

    {
      pattern: /###/,
      message: 'Markdown headings are not allowed.'
    }
  ];

  for (const item of forbiddenPatterns) {
    if (item.pattern.test(text)) {
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
    [...value].length;

  if (length > max) {
    throw new Error(
      `${field} is too long. ` +
      `Maximum ${max} characters; received ${length}.`
    );
  }
}


// ============================================================
// TELUGU DETECTION
// ============================================================

function containsTelugu(value) {
  /*
   * Telugu Unicode block:
   * U+0C00 - U+0C7F
   */
  return /[\u0C00-\u0C7F]/.test(value);
}


// ============================================================
// DATE / TIME
// ============================================================

function getIndiaDate() {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    );

  return formatter.format(
    new Date()
  );
}


function isValidDate(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

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
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}


// ============================================================
// FILESYSTEM
// ============================================================

function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true
      }
    );
  }
}


// ============================================================
// UTILITIES
// ============================================================

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}


function fail(message) {
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
// RUN
// ============================================================

main().catch(
  error => {
    fail(
      error?.message ||
      String(error)
    );
  }
);
