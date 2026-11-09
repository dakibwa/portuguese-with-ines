/** Starter material, never described as a checked or accredited syllabus. */
const CEFR =
  "https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions";
const PRINCIPLES = [
  {
    title: "Nation: balancing input, output, language study and fluency",
    url: "https://www.wgtn.ac.nz/__data/assets/pdf_file/0008/1882088/2018-keeping_it_practical_and_keeping_it_simple.pdf",
  },
  {
    title: "CEFR: goals expressed as meaningful language use",
    url: "https://www.coe.int/en/web/common-european-framework-reference-languages/key-concepts",
  },
  {
    title: "Roediger & Karpicke: retrieval practice (2006)",
    url: "https://doi.org/10.1111/j.1467-9280.2006.01693.x",
  },
  {
    title: "Cepeda et al.: distributed practice review (2006)",
    url: "https://doi.org/10.1037/0033-2909.132.3.354",
  },
];
const languages = [
  [
    "pt-PT",
    "European Portuguese",
    "https://www.instituto-camoes.pt/activity/centro-virtual/referencial-camoes-ple-2",
    ["Olá", "Chamo-me", "Gostava de", "porque", "embora", "na minha opinião"],
    [
      "ser and estar",
      "past events with the perfect and imperfect",
      "personal infinitive and indirect requests",
      "subjunctive in real situations",
      "register and argument",
      "nuance and idiom",
    ],
  ],
  [
    "pt-BR",
    "Brazilian Portuguese",
    CEFR,
    [
      "Olá",
      "Meu nome é",
      "Eu gostaria de",
      "porque",
      "embora",
      "na minha opinião",
    ],
    [
      "introductions and forms of address",
      "past tenses",
      "spoken pronouns and requests",
      "subjunctive",
      "register",
      "nuance and idiom",
    ],
  ],
  [
    "es",
    "Spanish",
    "https://cvc.cervantes.es/ensenanza/biblioteca_ELE/plan_curricular/indice.htm",
    ["Hola", "Me llamo", "Me gustaría", "porque", "aunque", "en mi opinión"],
    [
      "ser and estar",
      "preterite and imperfect",
      "polite requests and object pronouns",
      "subjunctive",
      "register and argument",
      "nuance and idiom",
    ],
  ],
  [
    "fr",
    "French",
    "https://www.france-education-international.fr/diplome/delf-tout-public",
    [
      "Bonjour",
      "Je m’appelle",
      "Je voudrais",
      "parce que",
      "bien que",
      "à mon avis",
    ],
    [
      "gender and introductions",
      "passé composé and imparfait",
      "requests and pronouns",
      "subjunctive",
      "register and argument",
      "nuance and idiom",
    ],
  ],
  [
    "de",
    "German",
    "https://www.goethe.de/en/spr/kup/prf.html",
    [
      "Hallo",
      "Ich heiße",
      "Ich möchte",
      "weil",
      "obwohl",
      "meiner Meinung nach",
    ],
    [
      "gender and verb position",
      "past events and cases",
      "subordinate word order",
      "hypothetical statements",
      "register and argument",
      "nuance and idiom",
    ],
  ],
  [
    "it",
    "Italian",
    CEFR,
    ["Ciao", "Mi chiamo", "Vorrei", "perché", "sebbene", "secondo me"],
    [
      "introductions and agreement",
      "passato prossimo and imperfetto",
      "requests and clitics",
      "congiuntivo",
      "register and argument",
      "nuance and idiom",
    ],
  ],
  [
    "en",
    "English",
    CEFR,
    [
      "Hello",
      "My name is",
      "I would like",
      "because",
      "although",
      "in my view",
    ],
    [
      "introductions and questions",
      "past events",
      "requests and tense contrasts",
      "hypothetical statements",
      "register and argument",
      "nuance and idiom",
    ],
  ],
  [
    "el",
    "Greek",
    CEFR,
    [
      "Γεια σας",
      "Με λένε",
      "Θα ήθελα",
      "επειδή",
      "αν και",
      "κατά τη γνώμη μου",
    ],
    [
      "script and introductions",
      "past events",
      "aspect and requests",
      "complex sentences",
      "register and argument",
      "nuance and idiom",
    ],
  ],
  [
    "ar",
    "Arabic",
    CEFR,
    ["مرحباً", "اسمي", "أريد", "لأن", "رغم أن", "في رأيي"],
    [
      "chosen variety, sounds and script",
      "past events",
      "requests in the chosen variety",
      "complex sentences",
      "register and argument",
      "nuance and idiom",
    ],
  ],
  [
    "hi",
    "Hindi",
    CEFR,
    ["नमस्ते", "मेरा नाम", "मुझे चाहिए", "क्योंकि", "हालाँकि", "मेरे विचार से"],
    [
      "sounds, script and introductions",
      "gender and past events",
      "requests and postpositions",
      "complex sentences",
      "register and argument",
      "nuance and idiom",
    ],
  ],
  [
    "ja",
    "Japanese",
    "https://www.jlpt.jp/e/about/levelsummary.html",
    ["こんにちは", "名前は", "お願いします", "ので", "けれども", "と思います"],
    [
      "sounds, script and introductions",
      "everyday requests",
      "explaining experiences",
      "extended discussion",
      "register and nuance",
      "register and nuance",
    ],
  ],
  [
    "zh",
    "Mandarin",
    "https://www.chinesetest.cn/",
    ["你好", "我叫", "我想", "因为", "虽然", "我认为"],
    [
      "tones, pinyin and introductions",
      "everyday requests",
      "explaining experiences",
      "extended discussion",
      "register and argument",
      "register and nuance",
    ],
  ],
];
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const languagePacks = languages.map(
  ([code, name, source, words, focus]) => ({
    code,
    name,
    words,
    focus,
    levels:
      code === "ja"
        ? ["N5", "N4", "N3", "N2", "N1"]
        : code === "zh"
          ? [
              "beginner",
              "elementary",
              "intermediate",
              "upper-intermediate",
              "advanced",
              "proficient",
            ]
          : CEFR_LEVELS,
    sources: [
      { title: `${name}: reference framework`, url: source },
      ...PRINCIPLES,
    ],
    reviewed: false,
  }),
);
export function packFor(language) {
  return (
    languagePacks.find(
      (pack) => pack.code.toLowerCase() === language.code?.toLowerCase(),
    ) ||
    languagePacks.find((pack) =>
      language.code?.toLowerCase().startsWith(pack.code.toLowerCase()),
    ) || {
      code: language.code,
      name: language.variety || language.name,
      words: [],
      focus: [],
      levels: CEFR_LEVELS,
      sources: PRINCIPLES,
      reviewed: false,
    }
  );
}
export const lessonGoals = [
  "Introduce yourself and ask someone a simple question.",
  "Arrange a practical everyday activity and check the details.",
  "Describe an experience and explain what mattered to you.",
  "Discuss a choice, give reasons and respond to another view.",
  "Present a nuanced argument and adapt it to the listener.",
  "Express a precise distinction and mediate competing interpretations.",
];
