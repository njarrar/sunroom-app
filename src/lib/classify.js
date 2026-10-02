// Shared bookmark classifier — used by scripts/categorize.js (Node) and the
// in-app JSON import (browser). Keep this file free of fs/path/DOM.
import { franc } from 'franc-min';
import keywordExtractor from 'keyword-extractor';

// Mirror of download_media.js naming: remote URL -> local filename
export function localNameFor(url) {
  try {
    const u = new URL(url);
    const key = u.pathname.split('/').pop();
    const format = u.searchParams.get('format') || 'jpg';
    return `${key}.${format}`;
  } catch {
    return null;
  }
}

// Accounts whose bookmarked tweets are almost always one topic.
// A handle rule wins over keyword scoring.
export const handleRules = {
  // Tech, AI & startups
  '@paulg': 'Tech & AI', '@garrytan': 'Tech & AI', '@amasad': 'Tech & AI',
  '@elonmusk': 'Tech & AI', '@sama': 'Tech & AI', '@SwiftOnSecurity': 'Tech & AI',
  '@deedydas': 'Tech & AI', '@NTDEV_': 'Tech & AI', '@TheBobPony': 'Tech & AI',
  '@TheoMediaAI': 'Tech & AI', '@KirkDBorne': 'Tech & AI', '@googlechrome': 'Tech & AI',
  '@levelsio': 'Tech & AI', '@rgbdev': 'Tech & AI', '@me2resh': 'Tech & AI',
  '@Wario64': 'Entertainment & Gaming', '@alfarhan': 'Entertainment & Gaming',
  '@dieworkwear': 'Fashion & Style',
  '@Rainmaker1973': 'Science & Space', '@alsuwaidi_ae': 'Science & Space',
  '@Mikeachim': 'Science & Space',
  '@historyrock_': 'Culture & History', '@wballaa': 'Culture & History',
  '@nippon_ar': 'Culture & History', '@diversenile': 'Culture & History',
  '@ElGabarty_': 'Culture & History',
  '@Zeinobia': 'News & Politics', '@DrHabibAlMulla': 'News & Politics',
  '@RnaudBertrand': 'News & Politics', '@abdallat_hussam': 'News & Politics',
  '@HealthyAlfred': 'Health & Fitness',
  '@HishamFahmy': 'Books & Learning', '@AseerAlkotb': 'Books & Learning',
  '@AladhamDesigns': 'Books & Learning',
};

// Each category: { en: [...], ar: [...], emoji?: [...] }
// Scoring: every keyword hit adds points; highest-scoring category wins.
export const categories = {
  'Tech & AI': {
    en: ['ai', 'llm', 'gpt', 'chatgpt', 'openai', 'anthropic', 'claude', 'gemini',
      'tech', 'software', 'coding', 'code', 'programming', 'programmer', 'developer',
      'startup', 'saas', 'app', 'apps', 'react', 'javascript', 'typescript', 'python',
      'github', 'linux', 'windows', 'docker', 'api', 'database', 'engineer', 'engineering',
      'frontend', 'backend', 'server', 'cloud', 'open source', 'terminal', 'cli',
      'iphone', 'android', 'apple', 'google', 'microsoft', 'browser', 'chrome',
      'prompt', 'agent', 'model', 'neural', 'algorithm', 'automation', 'no-code',
      'cursor', 'copilot', 'vibe coding', 'hardware', 'cpu', 'gpu', 'robot', 'robotics'],
    ar: ['برمجة', 'مبرمج', 'تطبيق', 'تقنية', 'تكنولوجيا', 'ذكاء اصطناعي', 'الذكاء الاصطناعي',
      'مطور', 'كمبيوتر', 'حاسوب', 'آيفون', 'ايفون', 'أندرويد', 'اندرويد', 'موقع الكتروني',
      'سوفتوير', 'شات جي بي تي', 'روبوت', 'خوارزمية', 'داتا', 'سيرفر', 'لابتوب'],
  },
  'Design & Art': {
    en: ['design', 'designer', 'ui', 'ux', 'typography', 'font', 'logo', 'branding',
      'figma', 'photoshop', 'illustrator', 'illustration', 'sketch', 'drawing',
      'painting', 'artist', 'artwork', 'gallery', 'aesthetic', 'palette', 'render',
      'architecture', 'architect', 'interior'],
    ar: ['تصميم', 'مصمم', 'رسم', 'رسام', 'فن ', 'فنون', 'لوحة', 'لوحات', 'خط عربي',
      'عمارة', 'معماري', 'ديكور', 'جرافيك'],
  },
  'Health & Fitness': {
    en: ['health', 'fitness', 'gym', 'workout', 'exercise', 'diet', 'nutrition',
      'protein', 'calories', 'injury', 'healing', 'muscle', 'fat loss', 'weight loss',
      'sleep', 'longevity', 'supplement', 'testosterone', 'cardio', 'doctor',
      'medical', 'medicine', 'therapy', 'mental health', 'anxiety', 'skincare'],
    ar: ['صحة', 'صحي', 'رجيم', 'دايت', 'تمرين', 'تمارين', 'جيم', 'رياضة يومية', 'لياقة',
      'نوم', 'طبيب', 'دكتور', 'دواء', 'علاج', 'فيتامين', 'بروتين', 'سعرات', 'نفسية',
      'اكتئاب', 'قلق'],
  },
  'News & Politics': {
    en: ['news', 'breaking', 'politics', 'political', 'election', 'government',
      'president', 'minister', 'parliament', 'senate', 'congress', 'war', 'military',
      'army', 'ceasefire', 'sanctions', 'israel', 'israeli', 'palestine', 'palestinian',
      'gaza', 'lebanon', 'syria', 'iran', 'ukraine', 'russia', 'egypt', 'jordan',
      'saudi', 'uae', 'protest', 'journalist', 'journalism', 'refugee', 'occupation',
      'law', 'court', 'trump', 'biden', 'policy', 'diplomatic', 'embassy'],
    ar: ['فلسطين', 'غزة', 'إسرائيل', 'اسرائيل', 'الاحتلال', 'حكومة', 'وزير', 'الوزراء',
      'رئيس', 'الرئاسة', 'برلمان', 'مجلس النواب', 'قانون', 'انتخابات', 'الجيش', 'جيش',
      'سياسة', 'سياسي', 'مظاهرات', 'احتجاج', 'حرب', 'هدنة', 'قصف', 'صاروخ', 'حدود',
      'لاجئين', 'سفارة', 'دبلوماسي', 'المخابرات', 'أمن الدولة', 'النظام', 'المعارضة',
      'قرار', 'بيان رسمي', 'وزارة', 'محكمة', 'قضية', 'اعتقال', 'سجن', 'شهيد', 'استشهد'],
  },
  'Entertainment & Gaming': {
    en: ['movie', 'film', 'cinema', 'series', 'season', 'episode', 'netflix', 'hbo',
      'trailer', 'actor', 'actress', 'director', 'hollywood', 'music', 'song', 'album',
      'concert', 'singer', 'band', 'spotify', 'game', 'gaming', 'gamer', 'playstation',
      'xbox', 'nintendo', 'steam', 'anime', 'manga', 'celebrity', 'tv show'],
    ar: ['فيلم', 'أفلام', 'افلام', 'مسلسل', 'مسلسلات', 'سينما', 'أغنية', 'اغنية', 'أغاني',
      'اغاني', 'مهرجان', 'فنان', 'فنانة', 'ممثل', 'ممثلة', 'مطرب', 'مطربة', 'موسيقى',
      'حفلة', 'حفل', 'طرب', 'لعبة', 'ألعاب', 'العاب', 'بلايستيشن', 'أنمي', 'انمي',
      'دراما', 'تمثيل', 'مشهد من'],
  },
  'Business & Finance': {
    en: ['business', 'finance', 'financial', 'money', 'crypto', 'bitcoin', 'ethereum',
      'stock', 'stocks', 'invest', 'investing', 'investor', 'investment', 'trading',
      'trader', 'founder', 'ceo', 'revenue', 'profit', 'valuation', 'funding', 'vc',
      'venture', 'acquisition', 'ipo', 'economy', 'economic', 'inflation', 'bank',
      'banking', 'salary', 'wealth', 'entrepreneur', 'marketing', 'sales', 'ecommerce',
      'real estate', 'fintech', 'bnpl'],
    ar: ['بيزنس', 'شركة ناشئة', 'استثمار', 'مستثمر', 'تداول', 'أسهم', 'اسهم', 'بورصة',
      'اقتصاد', 'الاقتصاد', 'فلوس', 'أموال', 'ثروة', 'مشروع تجاري', 'تسويق', 'مبيعات',
      'عقارات', 'بنك', 'البنوك', 'تمويل', 'رواتب', 'راتب', 'وظيفة', 'وظائف', 'ريادة',
      'بتكوين', 'بيتكوين', 'كريبتو', 'عملات رقمية', 'التضخم', 'الدولار', 'الجنيه', 'الريال'],
  },
  'Humor & Memes': {
    en: ['lmao', 'lmfao', 'lol', 'meme', 'memes', 'shitpost', 'funniest', 'hilarious',
      'i can\'t breathe', 'crying laughing', 'bro really', 'caption this'],
    ar: ['ههه', 'هاهاها', 'نكتة', 'نكت', 'مضحك', 'ضحك', 'تريقة', 'قهر', 'ميمز', 'كوميدي',
      'اسكتش', 'موت من الضحك', 'مسخرة', 'هزار', 'بجد هموت', 'ولع', 'افيه', 'إفيه'],
    emoji: ['😂', '🤣', '💀'],
  },
  'Culture & History': {
    en: ['history', 'historical', 'ancient', 'archaeology', 'archaeological', 'heritage',
      'civilization', 'ottoman', 'pharaoh', 'pharaonic', 'medieval', 'century', 'empire',
      'museum', 'dynasty', 'tradition', 'culture', 'cultural', 'anthropology', 'linguistics',
      'etymology', 'philosophy', 'philosopher'],
    ar: ['تاريخ', 'تاريخية', 'تراث', 'حضارة', 'آثار', 'اثار قديمة', 'عثماني', 'العثمانية',
      'فرعوني', 'الفراعنة', 'الأندلس', 'الاندلس', 'مملوكي', 'العصور', 'قرن', 'متحف',
      'مخطوطة', 'مخطوطات', 'لغويات', 'اللغة العربية', 'فصحى', 'عامية', 'لهجة', 'فلسفة',
      'الشعر الجاهلي', 'أسطورة', 'أساطير', 'الخلافة', 'الدولة العباسية', 'الأموية'],
  },
  'Science & Space': {
    en: ['science', 'scientist', 'physics', 'quantum', 'chemistry', 'biology', 'evolution',
      'nasa', 'spacex', 'space', 'astronomy', 'telescope', 'galaxy', 'planet', 'mars',
      'moon landing', 'orbit', 'rocket', 'satellite', 'geology', 'geological', 'climate',
      'species', 'dna', 'brain', 'neuroscience', 'mathematics', 'math', 'theorem'],
    ar: ['علوم', 'علمي', 'فيزياء', 'كيمياء', 'أحياء', 'فضاء', 'الفضاء', 'ناسا', 'كوكب',
      'كواكب', 'مجرة', 'نجوم', 'نجم', 'قمر صناعي', 'صاروخ فضائي', 'تلسكوب', 'رياضيات',
      'معادلة', 'نظرية', 'تجربة علمية', 'المناخ', 'الجاذبية', 'كوكبة', 'الجوزاء'],
  },
  'Sports': {
    en: ['football', 'soccer', 'basketball', 'nba', 'nfl', 'tennis', 'goal', 'league',
      'champions league', 'premier league', 'world cup', 'match', 'player', 'coach',
      'striker', 'messi', 'ronaldo', 'olympics', 'fifa', 'transfer window'],
    ar: ['كورة', 'كرة القدم', 'مباراة', 'الدوري', 'دوري أبطال', 'ريال مدريد', 'برشلونة',
      'الأهلي', 'الاهلي', 'الزمالك', 'الهلال', 'النصر', 'هدف', 'أهداف', 'لاعب', 'اللاعبين',
      'منتخب', 'المنتخب', 'كأس العالم', 'كاس العالم', 'ميسي', 'رونالدو', 'صلاح', 'المدرب',
      'حارس المرمى', 'ملعب', 'الشوط'],
  },
  'Fashion & Style': {
    en: ['fashion', 'style', 'outfit', 'menswear', 'suit', 'tailoring', 'tailor', 'fabric',
      'wardrobe', 'sneakers', 'shoes', 'clothing', 'clothes', 'dress', 'jacket', 'denim',
      'streetwear', 'vintage', 'brand', 'perfume', 'fragrance', 'watch', 'watches'],
    ar: ['موضة', 'أزياء', 'ازياء', 'ستايل', 'ملابس', 'قميص', 'بدلة', 'حذاء', 'أحذية',
      'عطر', 'عطور', 'ساعة يد', 'ساعات', 'ماركة', 'قماش', 'خياطة', 'فستان', 'عباية'],
  },
  'Books & Learning': {
    en: ['book', 'books', 'novel', 'reading', 'read this', 'author', 'writer', 'writing',
      'library', 'pdf', 'course', 'courses', 'tutorial', 'learn', 'learning', 'lecture',
      'university', 'college', 'study', 'studying', 'research paper', 'thesis', 'essay',
      'poetry', 'poem', 'quote', 'wisdom', 'free resource', 'cheat sheet', 'guide'],
    ar: ['كتاب', 'كتب', 'رواية', 'روايات', 'قراءة', 'اقرأ', 'مكتبة', 'ترجمة', 'مترجم',
      'قصة', 'قصص', 'مقال', 'مقالات', 'مدونة', 'تعلم', 'تعليم', 'كورس', 'دورة تدريبية',
      'دورات', 'محاضرة', 'جامعة', 'مذاكرة', 'دراسة', 'بحث علمي', 'شعر', 'قصيدة', 'أبيات',
      'ديوان', 'اقتباس', 'حكمة', 'كاتب', 'مؤلف', 'الكاتب', 'أديب', 'الأدب', 'أدبية'],
  },
  'Religion & Spirituality': {
    en: ['quran', 'islam', 'islamic', 'muslim', 'prophet', 'ramadan', 'eid', 'mosque',
      'prayer', 'dua', 'hadith', 'sunnah', 'allah', 'bible', 'church', 'faith', 'spiritual'],
    ar: ['القرآن', 'قرآن', 'القران', 'سورة', 'آية', 'ايات', 'رمضان', 'العيد', 'عيد الفطر',
      'عيد الأضحى', 'الصلاة', 'صلاة', 'مسجد', 'المسجد', 'دعاء', 'اللهم', 'النبي', 'الرسول',
      'صلى الله عليه', 'حديث شريف', 'السنة النبوية', 'سبحان الله', 'استغفر', 'الجنة',
      'رب اغفر', 'الحج', 'العمرة', 'الكعبة', 'إسلام', 'الإسلام', 'مسلم', 'المسلمين',
      'فتوى', 'الشيخ', 'خطبة', 'يارب', 'يا رب', 'المعصية', 'التوبة'],
  },
  'Tools & Resources': {
    en: ['tool', 'tools', 'website', 'web app', 'webapp', 'this site', 'resource',
      'resources', 'extension', 'downloader', 'download it', 'for free', 'free to use',
      'bookmark this', 'life hack', 'template', 'templates', 'checklist'],
    ar: ['أداة', 'اداة', 'أدوات', 'ادوات', 'خدمة', 'موقع', 'مواقع', 'منصة', 'تطبيقات',
      'تحميل', 'حمّل', 'رابط', 'مجاني', 'مجانية', 'بالمجان', 'مفيد', 'يفيدك', 'استخدمه',
      'يتيح لك', 'يساعدك'],
  },
  'Food & Travel': {
    en: ['food', 'recipe', 'cooking', 'chef', 'restaurant', 'breakfast', 'dinner', 'lunch',
      'coffee', 'dessert', 'travel', 'traveling', 'trip', 'destination', 'tourist',
      'tourism', 'hotel', 'flight', 'airline', 'tourist visa', 'passport', 'beach', 'island',
      'itinerary', 'airbnb'],
    ar: ['طبخ', 'وصفة', 'وصفات', 'أكل', 'اكل', 'أكلة', 'مطعم', 'مطاعم', 'قهوة', 'شاي',
      'شاهي', 'حلويات', 'فطار', 'عشاء', 'غداء', 'سفر', 'السفر', 'رحلة', 'رحلات', 'سياحة',
      'سياحية', 'فندق', 'فنادق', 'طيران', 'تأشيرة', 'فيزا شنغن', 'جواز سفر', 'شاطئ', 'جزيرة'],
  },
};

// Link-domain hints, checked against bookmark.links and URLs inside text.
export const domainRules = [
  [/github\.com|stackoverflow\.com|npmjs\.com|producthunt\.com|huggingface\.co/i, 'Tech & AI'],
  [/goodreads\.com|hashnode\.dev|medium\.com|substack\.com/i, 'Books & Learning'],
  [/imdb\.com|letterboxd\.com|spotify\.com|store\.steampowered\.com/i, 'Entertainment & Gaming'],
  [/behance\.net|dribbble\.com/i, 'Design & Art'],
  [/booking\.com|tripadvisor\.com/i, 'Food & Travel'],
];

export const FALLBACK = 'Uncategorized';

export function scoreCategory(bookmark) {
  const handle = bookmark.handle || '';
  if (handleRules[handle]) return handleRules[handle];

  const text = bookmark.text || '';
  const lower = text.toLowerCase();
  const name = (bookmark.name || '').toLowerCase();
  const linkText = ((bookmark.links || []).join(' ') + ' ' + text).toLowerCase();

  const scores = {};
  const add = (cat, n = 1) => { scores[cat] = (scores[cat] || 0) + n; };

  for (const [cat, { en = [], ar = [], emoji = [] }] of Object.entries(categories)) {
    for (const kw of en) {
      const regex = new RegExp(`(?:^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`, 'i');
      if (regex.test(lower)) add(cat);
      else if (regex.test(name)) add(cat, 0.5);
    }
    // Arabic has rich prefixes (ال، و، ب، لل...) so substring match works better
    // than word boundaries, which \b can't express for Arabic script anyway.
    for (const kw of ar) if (text.includes(kw)) add(cat);
    for (const e of emoji) if (text.includes(e)) add(cat, 0.75);
  }

  for (const [regex, cat] of domainRules) if (regex.test(linkText)) add(cat, 2);

  // Cashtags ($SPY, $BTC...) are a strong finance signal
  if (/\$[A-Z]{2,5}\b/.test(text)) add('Business & Finance', 2);
  // Laughing emoji/tokens as weak humor signals
  if (/(?:ه{4,}|خخخ+|😹|🤡)/.test(text)) add('Humor & Memes', 0.75);

  let best = FALLBACK;
  let bestScore = 0;
  for (const [cat, s] of Object.entries(scores)) {
    if (s > bestScore) { best = cat; bestScore = s; }
  }
  return bestScore >= 1 ? best : FALLBACK;
}

const langMap = {
  eng: 'English',
  arb: 'Arabic',
  spa: 'Spanish',
  fra: 'French',
  deu: 'German',
  und: 'Unknown',
};

export function detectLanguage(text) {
  let langCode = franc(text, { minLength: 5 });
  if (!langMap[langCode]) {
    langCode = /[؀-ۿ]/.test(text) ? 'arb' : (text.length > 0 ? 'eng' : 'und');
  } else if (langCode === 'und' && /[؀-ۿ]/.test(text)) {
    langCode = 'arb';
  }
  return langMap[langCode];
}

export function extractTopics(text, language) {
  if (text.length <= 10) return [];
  if (language === 'Arabic') {
    const words = text.replace(/[^؀-ۿ\s]/g, '').split(/\s+/);
    return [...new Set(words.filter(word => word.length > 4))].slice(0, 4);
  }
  try {
    return keywordExtractor.extract(text, {
      language: 'english',
      remove_digits: true,
      return_changed_case: true,
      remove_duplicates: true,
    }).filter(word => word.length > 3).slice(0, 4);
  } catch {
    return [];
  }
}

// Normalize one uploaded record (raw export or already-categorized format)
// into the categorized shape src/data/bookmarks.json uses. Browser-safe: the
// local media path is derived by name, without checking the file exists —
// the app falls back to the remote URL if it doesn't.
export function processImported(raw) {
  const text = raw.text || '';
  const language = raw.language || detectLanguage(text);
  const media = (raw.media || []).map(m => {
    if (m && typeof m === 'object') return m;
    const name = localNameFor(m);
    return { url: m, local: name ? `/media/${name}` : null };
  });
  return {
    ...raw,
    id: String(raw.id),
    time: raw.time || new Date().toISOString(),
    media,
    links: raw.links || [],
    category: raw.category || scoreCategory(raw),
    language,
    topics: raw.topics || extractTopics(text, language),
  };
}
