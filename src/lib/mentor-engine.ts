/**
 * mentor-engine.ts — the deterministic Socratic mentor (Movement 1).
 *
 * This is the "Yoda/Morpheus" layer: it reads a builder's plain-language intent,
 * surfaces the few sharpening questions that matter for *their* problem, and
 * reflects back the real problem behind the stated one — as constraints the
 * spec and constitution can act on.
 *
 * Path A boundary (hard rule): this file contains NO model, API, or inference.
 * "Adaptive" means rule-based branching on a curated lexicon and the builder's
 * own selections. It is language-agnostic — it works on signal/question/option
 * /constraint IDs; the Studio maps those to localized strings (en/es/ar). The
 * genuine open-ended interpretation happens downstream, in the builder's own
 * agent. This layer's job is to route pre-encoded human judgment into it.
 */

export type SignalId =
  | 'privacy'
  | 'identity'
  | 'storage'
  | 'payments'
  | 'hosting'
  | 'community'
  | 'realtime'
  | 'moderation';

/**
 * Curated lexicon — the only "understanding" the page does. Auditable, and
 * trilingual (en / es / ar) so the adaptive flow works in every supported
 * language, not just English. English terms are word-bounded; es/ar terms match
 * as substrings (their morphology makes \b unreliable).
 */
const LEXICON: Record<SignalId, RegExp> = {
  privacy: /\b(privat|anonym|expos|surveil|confidential|sensitive|safe(ty)?|protect|hide|track(ed|ing)?|leak|dox)|priva|anónim|anonimato|expon|vigilan|confidencial|sensible|proteg|ocult|rastre|خصوص|خاص|مجهول|إخفاء|كشف|حماي|مراقب|حسّاس|حساس|تعريض|سرّي/i,
  identity: /\b(log ?in|sign[- ]?in|account|member(ship)?|profile|auth|identit|verify who|real name|handle)|sesión|cuenta|miembro|perfil|identidad|nombre real|تسجيل|دخول|حساب|عضو|هوية|ملف شخصي|اسم حقيقي/i,
  storage: /\b(store|saved?|record|archive|document|history|database|list|directory|inventory|evidence|report)|almacen|guard|registr|archiv|document|histor|base de datos|lista|directorio|inventario|evidencia|informe|reporte|تخزين|حفظ|سجل|أرشيف|وثيق|توثيق|تاريخ|قاعدة بيانات|قائمة|دليل|جرد|إبلاغ|بلاغ|تقرير/i,
  payments: /\b(pay|paid|tip|donat|fund|wallet|money|invoice|sats|bitcoin|lightning|zap|support|dues)|pag|propina|donac|fond|cartera|monedero|dinero|factura|apoyo|cuota|دفع|إكرامي|تبرع|تمويل|محفظة|مال|فاتورة|دعم|اشتراك|بيتكوين/i,
  hosting: /\b(server|back ?end|relay|host|deploy|\bapi\b|self-host|infrastructure|uptime)|servidor|backend|aloj|desplegar|infraestructura|خادم|استضاف|نشر|بنية تحتية/i,
  community: /\b(communit|collective|member|organiz|tenant|union|group|neighbo|mutual aid|movement|chapter)|comunidad|colectiv|miembro|organiz|inquilin|sindicato|grupo|vecin|ayuda mutua|movimiento|مجتمع|جماعة|عضو|تنظيم|مستأجر|نقابة|مجموعة|جار|جيران|عون متبادل|حركة/i,
  realtime: /\b(chat|messag|live|real-?time|notif|feed|stream|broadcast|thread)|mensaj|en vivo|tiempo real|notific|transmis|hilo|دردشة|رسائل|مباشر|الوقت الحقيقي|إشعار|بث|خيط/i,
  moderation: /\b(moderat|abuse|spam|harass|block|report|trust|bad actor|safety)|moderac|abuso|acoso|bloque|denunci|confianza|seguridad|إشراف|إساءة|تطفل|تحرش|حظر|إبلاغ|ثقة|أمان|سلامة/i,
};

/** A protocol selection is itself a signal that certain concerns apply. */
const PROTOCOL_SIGNALS: Record<string, SignalId[]> = {
  nostr: ['identity'],
  atproto: ['identity'],
  lightning: ['payments'],
  cashu: ['payments'],
};

export function detectSignals(text: string, protocols: string[] = []): SignalId[] {
  const found = new Set<SignalId>();
  for (const [id, re] of Object.entries(LEXICON) as [SignalId, RegExp][]) {
    if (re.test(text)) found.add(id);
  }
  for (const p of protocols) for (const s of PROTOCOL_SIGNALS[p] ?? []) found.add(s);
  // Stable, priority-ordered output.
  const ORDER: SignalId[] = ['privacy', 'identity', 'payments', 'storage', 'community', 'realtime', 'moderation', 'hosting'];
  return ORDER.filter((s) => found.has(s));
}

/**
 * The adaptive question bank. Each question sharpens one signal; it only appears
 * when that signal is present. The Studio owns the localized prompt + option
 * labels (keyed by these ids); each option carries a constraint it implies.
 */
export interface MentorQuestion {
  id: string;
  signal: SignalId;
  options: { id: string; constraint?: ConstraintId }[];
}

export type ConstraintId =
  | 'anonymity-first'
  | 'pseudonymous'
  | 'no-platform-visibility'
  | 'self-sovereign-identity'
  | 'direct-payment'
  | 'org-custody'
  | 'durable-data'
  | 'local-first'
  | 'community-owned'
  | 'safety-tooling';

export const QUESTIONS: MentorQuestion[] = [
  {
    id: 'q-privacy-who',
    signal: 'privacy',
    options: [
      { id: 'public', constraint: 'anonymity-first' },
      { id: 'platform', constraint: 'no-platform-visibility' },
      { id: 'authorities', constraint: 'anonymity-first' },
      { id: 'pseudonymous', constraint: 'pseudonymous' },
    ],
  },
  {
    id: 'q-payments-flow',
    signal: 'payments',
    options: [
      { id: 'direct', constraint: 'direct-payment' },
      { id: 'org', constraint: 'org-custody' },
    ],
  },
  {
    id: 'q-storage-survive',
    signal: 'storage',
    options: [
      { id: 'must-survive', constraint: 'durable-data' },
      { id: 'on-device', constraint: 'local-first' },
    ],
  },
  {
    id: 'q-identity-proof',
    signal: 'identity',
    options: [
      { id: 'own-keys', constraint: 'self-sovereign-identity' },
      { id: 'pseudonymous', constraint: 'pseudonymous' },
    ],
  },
  {
    id: 'q-community-own',
    signal: 'community',
    options: [
      { id: 'forkable', constraint: 'community-owned' },
      { id: 'unsure' },
    ],
  },
];

/**
 * Progressive disclosure: the next sharpening questions to ask — only those whose
 * signal is present and that the builder hasn't answered yet, capped so it never
 * feels like a quiz.
 */
export function pickQuestions(
  signals: SignalId[],
  answers: Record<string, string> = {},
  max = 3,
): MentorQuestion[] {
  const present = new Set(signals);
  return QUESTIONS.filter((q) => present.has(q.signal) && !(q.id in answers)).slice(0, max);
}

export interface Reflection {
  signals: SignalId[];
  /** Constraint ids, de-duplicated and priority-ordered. The Studio localizes. */
  constraints: ConstraintId[];
}

/**
 * Reflect back the real problem as constraints — derived from detected signals
 * (always) and sharpened by any answers (refines). Pure template logic.
 */
export function reflect(signals: SignalId[], answers: Record<string, string> = {}): Reflection {
  const constraints = new Set<ConstraintId>();

  // Signal-level constraints (apply even if the builder skips every question).
  if (signals.includes('privacy')) constraints.add('anonymity-first');
  if (signals.includes('payments')) constraints.add('direct-payment');
  if (signals.includes('storage')) constraints.add('durable-data');
  if (signals.includes('identity')) constraints.add('self-sovereign-identity');
  if (signals.includes('community')) constraints.add('community-owned');
  if (signals.includes('moderation')) constraints.add('safety-tooling');

  // Answer-level refinements (override/strengthen the defaults).
  for (const q of QUESTIONS) {
    const ans = answers[q.id];
    if (!ans) continue;
    const opt = q.options.find((o) => o.id === ans);
    if (opt?.constraint) {
      // A pseudonymous answer relaxes a hard anonymity default.
      if (opt.constraint === 'pseudonymous') constraints.delete('anonymity-first');
      // Org custody relaxes the direct-payment default.
      if (opt.constraint === 'org-custody') constraints.delete('direct-payment');
      if (opt.constraint === 'local-first') constraints.delete('durable-data');
      constraints.add(opt.constraint);
    }
  }

  const ORDER: ConstraintId[] = [
    'anonymity-first', 'pseudonymous', 'no-platform-visibility', 'self-sovereign-identity',
    'direct-payment', 'org-custody', 'durable-data', 'local-first', 'community-owned', 'safety-tooling',
  ];
  return { signals, constraints: ORDER.filter((c) => constraints.has(c)) };
}
