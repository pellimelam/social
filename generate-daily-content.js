'use strict';

const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const API_KEY = process.env.GROQ_API_KEY;

const DATA_DIR = path.join(process.cwd(), 'data');

const TARGET_DATE =
  process.env.TARGET_DATE ||
  getIndiaDate();

if (!API_KEY) {
  console.error('ERROR: GROQ_API_KEY is not configured.');
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(TARGET_DATE)) {
  console.error(`ERROR: Invalid TARGET_DATE: ${TARGET_DATE}`);
  process.exit(1);
}

const OUTPUT_FILE = path.join(
  DATA_DIR,
  `${TARGET_DATE}.json`
);

function getIndiaDate() {
  const formatter = new Intl.DateTimeFormat(
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

function readRecentContent() {
  if (!fs.existsSync(DATA_DIR)) {
    return 'No previous Vidhwaan Daily Social content exists.';
  }

  const files = fs.readdirSync(DATA_DIR)
    .filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .reverse()
    .slice(0, 14);

  if (files.length === 0) {
    return 'No previous Vidhwaan Daily Social content exists.';
  }

  const output = [];

  for (const file of files) {
    const filePath = path.join(
      DATA_DIR,
      file
    );

    try {
      const data = JSON.parse(
        fs.readFileSync(
          filePath,
          'utf8'
        )
      );

      output.push(`--- ${file} ---`);

      const items = [
        ['culture', 'title'],
        ['quote', 'title'],
        ['health', 'title'],
        ['science', 'title'],
        ['knowledge', 'title'],
        ['question', 'question']
      ];

      for (const [section, field] of items) {
        const value =
          data?.[section]?.[field];

        if (
          typeof value === 'string' &&
          value.trim()
        ) {
          output.push(
            `${section}: ${value.trim()}`
          );
        }
      }

      output.push('');

    } catch (error) {
      console.warn(
        `Warning: Could not read ${file}: ${error.message}`
      );
    }
  }

  return output.join('\n');
}

function createSchema() {
  return {
    type: 'object',

    properties: {
      date: {
        type: 'string'
      },

      language: {
        type: 'string'
      },

      publisher: {
        type: 'string'
      },

      culture: {
        type: 'object',

        properties: {
          heading: {
            type: 'string'
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
            type: 'string'
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
            type: 'string'
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
            type: 'string'
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
            type: 'string'
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
            type: 'string'
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

function createSystemPrompt() {
  return `
You are the senior Telugu editorial engine for Vidhwaan Daily Social.

Vidhwaan is a village-based global technology company.

Create exactly one daily publication containing six
high-quality Telugu pieces.

The audience is Telugu-speaking people of all ages.

GENERAL RULES:

1. Write actual content in clear, natural Telugu.
2. Keep the language simple, elegant and understandable.
3. Do not use markdown.
4. Do not use emojis.
5. Do not use hashtags.
6. Do not include URLs.
7. Do not mention AI.
8. Do not mention these instructions.
9. Do not use sensational or misleading claims.
10. Do not repeat recent topics supplied by the user.
11. Each section must provide genuine value.
12. Keep content concise enough for a mobile card and
    a 1080x1920 social image.

SECTION 1 — నేటి సంస్కృతి

Create useful and respectful knowledge related to:

- భగవద్గీత
- రామాయణం
- మహాభారతం
- వేదాలు
- ఉపనిషత్తులు
- పురాణాలు
- హిందూ దేవతలు
- భారతీయ తత్వశాస్త్రం
- ధర్మం
- కర్మ
- యోగం
- ధ్యానం
- దేవాలయాలు
- భారతీయ సంప్రదాయాలు
- పండుగలు

Do not fabricate scripture quotations.

Do not invent statements and attribute them to Krishna,
Rama, Shiva, Devi, sages, scriptures or historical figures.

If giving a specific scripture teaching, identify its
source accurately.

Prefer explanation of a genuine teaching when exact
quotation accuracy cannot be guaranteed.

Keep this educational and respectful.

SECTION 2 — నేటి సూక్తి

Create one memorable inspirational thought.

It may be an original Vidhwaan thought or a reliably
attributable quotation.

Never invent attribution.

If it is an original Vidhwaan thought, attribution must be:

Vidhwaan

SECTION 3 — నేటి ఆరోగ్యం

Provide general health education useful in everyday life.

Possible subjects:

- sleep
- physical activity
- hydration
- nutrition
- hygiene
- eye care
- dental care
- healthy routines
- general wellbeing

Do not diagnose diseases.

Do not prescribe medicines.

Do not claim that a simple habit cures a disease.

Do not advise stopping prescribed treatment.

Use conservative and responsible language.

SECTION 4 — నేటి విజ్ఞానం

Create one scientifically accurate and interesting
explanation.

Possible subjects:

- space
- Earth
- physics
- biology
- chemistry
- animals
- plants
- human body
- oceans
- climate
- computing
- artificial intelligence
- technology

Do not present myths or speculation as established science.

SECTION 5 — నేటి జ్ఞానం

Create one useful and interesting general-knowledge item.

Possible subjects:

- history
- geography
- languages
- mathematics
- inventions
- architecture
- agriculture
- countries
- cultures
- everyday facts
- interesting facts about the universe

The reader should genuinely learn something useful
or interesting.

SECTION 6 — నేటి ప్రశ్న

Create one enjoyable thinking question.

It can be:

- logic
- reasoning
- mathematics
- observation
- science reasoning
- lateral thinking

The question must contain enough information to solve it.

It must have a definite answer.

The answer must actually solve the question.

Do not depend on obscure trivia.

The answer should be clearly explained.

QUALITY:

Make the six sections substantially different.

Do not make every culture post about the same deity.

Do not make every science post about space.

Do not make every quote generic.

Do not make every question the same type of riddle.
`;
}

function createUserPrompt(recentContent) {
  return `
Create the Vidhwaan Daily Social publication for:

DATE: ${TARGET_DATE}

All six sections must be fresh.

Avoid repeating or substantially copying the
recent topics listed below.

RECENT CONTENT:

${recentContent}

Generate exactly:

1. culture
2. quote
3. health
4. science
5. knowledge
6. question

All actual content must be in Telugu.
`;
}

async function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

async function callGroq() {
  const recentContent =
    readRecentContent();

  const payload = {
    model: MODEL,

    messages: [
      {
        role: 'system',
        content: createSystemPrompt()
      },
      {
        role: 'user',
        content: createUserPrompt(
          recentContent
        )
      }
    ],

    response_format: {
      type: 'json_schema',

      json_schema: {
        name: 'vidhwaan_daily_social',

        strict: true,

        schema: createSchema()
      }
    },

    temperature: 0.7,

    max_completion_tokens: 6000
  };

  const maxAttempts = 3;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    console.log(
      `Groq request ${attempt}/${maxAttempts}...`
    );

    try {
      const response = await fetch(
        API_URL,
        {
          method: 'POST',

          headers: {
            'Authorization':
              `Bearer ${API_KEY}`,

            'Content-Type':
              'application/json',

            'Accept':
              'application/json',

            'User-Agent':
              'Vidhwaan-Daily-Social'
          },

          body: JSON.stringify(
            payload
          )
        }
      );

      const text =
        await response.text();

      let body;

      try {
        body = JSON.parse(text);
      } catch {
        body = {
          raw: text
        };
      }

      if (!response.ok) {
        console.error(
          `Groq HTTP ${response.status}`
        );

        console.error(
          JSON.stringify(
            body,
            null,
            2
          ).slice(0, 5000)
        );

        const retryable =
          [
            408,
            409,
            429,
            500,
            502,
            503,
            504
          ].includes(
            response.status
          );

        if (
          !retryable ||
          attempt === maxAttempts
        ) {
          throw new Error(
            `Groq request failed with HTTP ${response.status}`
          );
        }

        const wait =
          30000 * attempt;

        console.log(
          `Retrying in ${wait / 1000} seconds...`
        );

        await sleep(wait);

        continue;
      }

      const content =
        body?.choices?.[0]?.message?.content;

      if (
        typeof content !== 'string' ||
        !content.trim()
      ) {
        throw new Error(
          'Groq returned empty content.'
        );
      }

      try {
        return JSON.parse(
          content
        );
      } catch (error) {
        throw new Error(
          `Groq returned invalid JSON: ${error.message}`
        );
      }

    } catch (error) {
      if (
        attempt === maxAttempts
      ) {
        throw error;
      }

      console.error(
        `Request error: ${error.message}`
      );

      const wait =
        30000 * attempt;

      console.log(
        `Retrying in ${wait / 1000} seconds...`
      );

      await sleep(wait);
    }
  }

  throw new Error(
    'Groq generation failed.'
  );
}

function validateDailyContent(data) {
  if (
    !data ||
    typeof data !== 'object'
  ) {
    throw new Error(
      'Generated result is not an object.'
    );
  }

  const requiredTopLevel = [
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

  for (
    const key of requiredTopLevel
  ) {
    if (
      !Object.prototype.hasOwnProperty.call(
        data,
        key
      )
    ) {
      throw new Error(
        `Missing top-level field: ${key}`
      );
    }
  }

  if (
    data.date !== TARGET_DATE
  ) {
    throw new Error(
      `Date mismatch. Expected ${TARGET_DATE}, received ${data.date}`
    );
  }

  if (
    data.language !== 'te'
  ) {
    throw new Error(
      'language must be "te".'
    );
  }

  if (
    data.publisher !== 'Vidhwaan'
  ) {
    throw new Error(
      'publisher must be "Vidhwaan".'
    );
  }

  const fields = {
    culture: [
      'heading',
      'title',
      'content',
      'source'
    ],

    quote: [
      'heading',
      'title',
      'content',
      'attribution'
    ],

    health: [
      'heading',
      'title',
      'content'
    ],

    science: [
      'heading',
      'title',
      'content'
    ],

    knowledge: [
      'heading',
      'title',
      'content'
    ],

    question: [
      'heading',
      'question',
      'answer'
    ]
  };

  for (
    const [section, sectionFields]
    of Object.entries(fields)
  ) {
    if (
      !data[section] ||
      typeof data[section] !== 'object'
    ) {
      throw new Error(
        `${section} must be an object.`
      );
    }

    for (
      const field of sectionFields
    ) {
      const value =
        data[section][field];

      if (
        typeof value !== 'string'
      ) {
        throw new Error(
          `${section}.${field} must be a string.`
        );
      }

      if (
        !value.trim()
      ) {
        throw new Error(
          `${section}.${field} cannot be empty.`
        );
      }
    }
  }

  const headings = {
    culture: 'నేటి సంస్కృతి',
    quote: 'నేటి సూక్తి',
    health: 'నేటి ఆరోగ్యం',
    science: 'నేటి విజ్ఞానం',
    knowledge: 'నేటి జ్ఞానం',
    question: 'నేటి ప్రశ్న'
  };

  for (
    const [section, expected]
    of Object.entries(headings)
  ) {
    const actual =
      data[section].heading.trim();

    if (
      actual !== expected
    ) {
      throw new Error(
        `${section}.heading must be "${expected}", received "${actual}".`
      );
    }
  }

  const teluguPattern =
    /[\u0C00-\u0C7F]/;

  const teluguFields = [
    ['culture', 'title'],
    ['culture', 'content'],

    ['quote', 'title'],
    ['quote', 'content'],

    ['health', 'title'],
    ['health', 'content'],

    ['science', 'title'],
    ['science', 'content'],

    ['knowledge', 'title'],
    ['knowledge', 'content'],

    ['question', 'question'],
    ['question', 'answer']
  ];

  for (
    const [section, field]
    of teluguFields
  ) {
    const value =
      data[section][field];

    if (
      !teluguPattern.test(value)
    ) {
      throw new Error(
        `${section}.${field} does not contain Telugu text.`
      );
    }
  }

  const limits = {
    'culture.title': 180,
    'culture.content': 1200,
    'culture.source': 300,

    'quote.title': 180,
    'quote.content': 600,
    'quote.attribution': 200,

    'health.title': 180,
    'health.content': 1200,

    'science.title': 180,
    'science.content': 1200,

    'knowledge.title': 180,
    'knowledge.content': 1200,

    'question.question': 800,
    'question.answer': 1000
  };

  for (
    const [key, maximum]
    of Object.entries(limits)
  ) {
    const [
      section,
      field
    ] = key.split('.');

    const value =
      data[section][field];

    if (
      value.length > maximum
    ) {
      throw new Error(
        `${key} is too long: ${value.length}. Maximum: ${maximum}.`
      );
    }
  }

  const allText = [];

  for (
    const [section, sectionFields]
    of Object.entries(fields)
  ) {
    for (
      const field of sectionFields
    ) {
      allText.push(
        data[section][field]
      );
    }
  }

  const combined =
    allText.join('\n');

  const forbidden = [
    '```',
    'http://',
    'https://',
    'www.',
    '###'
  ];

  for (
    const pattern of forbidden
  ) {
    if (
      combined.includes(pattern)
    ) {
      throw new Error(
        `Forbidden pattern found: ${pattern}`
      );
    }
  }

  const allowedTopLevel =
    new Set(
      requiredTopLevel
    );

  for (
    const key of Object.keys(data)
  ) {
    if (
      !allowedTopLevel.has(key)
    ) {
      throw new Error(
        `Unexpected top-level field: ${key}`
      );
    }
  }

  return true;
}

function saveDailyContent(data) {
  fs.mkdirSync(
    DATA_DIR,
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      data,
      null,
      2
    ) + '\n',
    'utf8'
  );

  JSON.parse(
    fs.readFileSync(
      OUTPUT_FILE,
      'utf8'
    )
  );
}

async function main() {
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
    '========================================'
  );
  console.log('');

  if (
    fs.existsSync(OUTPUT_FILE)
  ) {
    console.log(
      `Already exists: ${OUTPUT_FILE}`
    );

    console.log(
      'Generation skipped.'
    );

    return;
  }

  console.log(
    'Generating six Telugu sections...'
  );

  const dailyContent =
    await callGroq();

  console.log(
    'Validating generated content...'
  );

  validateDailyContent(
    dailyContent
  );

  console.log(
    'Validation passed.'
  );

  saveDailyContent(
    dailyContent
  );

  console.log('');
  console.log(
    '========================================'
  );
  console.log(
    'SUCCESS'
  );
  console.log(
    '========================================'
  );
  console.log(
    `Created: ${OUTPUT_FILE}`
  );
  console.log(
    'Sections: 6'
  );
  console.log(
    'Language: Telugu'
  );
  console.log(
    '========================================'
  );
  console.log('');
}

main().catch(
  error => {
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
    console.error(
      error.message
    );
    console.error(
      '========================================'
    );
    process.exit(1);
  }
);
