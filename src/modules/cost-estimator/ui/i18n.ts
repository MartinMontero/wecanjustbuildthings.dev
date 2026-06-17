/**
 * Externalized estimator strings. Mirrors the house i18n convention used by
 * BuildStudio.svelte (an inline `Record<Lang, …>` keyed by id) rather than the
 * separate per-locale files the prompt sketched — so the module conforms instead
 * of forking the pattern. es/ar are a careful first pass; flag for native review.
 */
export type Lang = 'en' | 'es' | 'ar';

export interface EstimatorStrings {
  title: string;
  lead: string;
  sourceHeading: string;
  pathA: string;
  pathADesc: string;
  pathC: string;
  pathCDesc: string;
  derivedHeading: string;
  derivedNote: string;
  missingHeading: string;
  missingNote: string;
  fMau: string;
  fBandwidth: string;
  fStorage: string;
  fCompute: string;
  fDbNeeded: string;
  fDbSize: string;
  computeEdge: string;
  computeServerless: string;
  computeAlwaysOn: string;
  yes: string;
  no: string;
  computeBtn: string;
  recomputeBtn: string;
  computing: string;
  resultsHeading: string;
  perMonth: string;
  breakdown: string;
  qty: string;
  provenanceSnapshot: string;
  provenanceLive: string;
  lastVerified: string;
  todoConfirm: string;
  partialTotal: string;
  source: string;
  savedNote: string;
  noSession: string;
  noSessionCta: string;
  corsNote: string;
  tierSeed: string;
  tierGrowth: string;
  tierScale: string;
}

export const STRINGS: Record<Lang, EstimatorStrings> = {
  en: {
    title: 'Hosting cost estimator',
    lead: 'A ballpark, market-grounded estimate of what it costs to host your project and serve your users — at three levels of scale. Reads your project from the build session; you only fill in what it could not infer.',
    sourceHeading: 'How should prices be fetched?',
    pathA: 'Via the server (Path A)',
    pathADesc: 'A small server function fetches pricing at request time. Best when a provider blocks direct browser access.',
    pathC: 'In your browser (Path C)',
    pathCDesc: 'Your browser resolves pricing directly. No server involved; some provider endpoints may be unreachable (CORS).',
    derivedHeading: 'Inferred from your project',
    derivedNote: 'Derived from what the Build Studio captured. Override anything below.',
    missingHeading: 'A few numbers it could not infer',
    missingNote: 'These are not in your build session yet. Enter them once and they are saved back, so the rest of the platform stays in sync.',
    fMau: 'Expected monthly active users',
    fBandwidth: 'Monthly bandwidth (GB)',
    fStorage: 'Persistent storage (GB)',
    fCompute: 'Compute posture',
    fDbNeeded: 'Needs a database / stateful backend?',
    fDbSize: 'Rough database size (GB)',
    computeEdge: 'Edge / mostly client-side',
    computeServerless: 'Serverless / on-demand',
    computeAlwaysOn: 'Always-on server',
    yes: 'Yes',
    no: 'No',
    computeBtn: 'Estimate the cost →',
    recomputeBtn: 'Recompute',
    computing: 'Estimating…',
    resultsHeading: 'Estimated monthly cost',
    perMonth: '/ month',
    breakdown: 'Breakdown',
    qty: 'qty',
    provenanceSnapshot: 'snapshot',
    provenanceLive: 'live',
    lastVerified: 'last verified',
    todoConfirm: 'TODO: confirm',
    partialTotal: 'partial — some prices unconfirmed',
    source: 'source',
    savedNote: 'Saved to your build session.',
    noSession: 'Start in the Build Studio first — describe your project, and the estimator reads its needs from there.',
    noSessionCta: 'Open the Build Studio →',
    corsNote: 'The server path wasn’t available, so this was computed in your browser instead.',
    tierSeed: 'Seed — just launched',
    tierGrowth: 'Growth — real traction',
    tierScale: 'Scale — established',
  },
  es: {
    title: 'Estimador de costes de alojamiento',
    lead: 'Una estimación aproximada y basada en el mercado de lo que cuesta alojar tu proyecto y atender a tus usuarios — en tres niveles de escala. Lee tu proyecto de la sesión de construcción; solo rellenas lo que no pudo inferir.',
    sourceHeading: '¿Cómo se deben obtener los precios?',
    pathA: 'A través del servidor (Ruta A)',
    pathADesc: 'Una pequeña función de servidor obtiene los precios en el momento. Mejor cuando un proveedor bloquea el acceso directo del navegador.',
    pathC: 'En tu navegador (Ruta C)',
    pathCDesc: 'Tu navegador resuelve los precios directamente. Sin servidor; algunos endpoints de proveedores pueden ser inaccesibles (CORS).',
    derivedHeading: 'Inferido de tu proyecto',
    derivedNote: 'Derivado de lo que captó el Estudio de construcción. Puedes anular cualquier valor.',
    missingHeading: 'Algunos números que no pudo inferir',
    missingNote: 'Aún no están en tu sesión de construcción. Introdúcelos una vez y se guardan, para que el resto de la plataforma siga sincronizada.',
    fMau: 'Usuarios activos mensuales previstos',
    fBandwidth: 'Ancho de banda mensual (GB)',
    fStorage: 'Almacenamiento persistente (GB)',
    fCompute: 'Tipo de cómputo',
    fDbNeeded: '¿Necesita una base de datos / backend con estado?',
    fDbSize: 'Tamaño aproximado de la base de datos (GB)',
    computeEdge: 'Edge / mayormente en el cliente',
    computeServerless: 'Sin servidor / bajo demanda',
    computeAlwaysOn: 'Servidor siempre activo',
    yes: 'Sí',
    no: 'No',
    computeBtn: 'Estimar el coste →',
    recomputeBtn: 'Recalcular',
    computing: 'Estimando…',
    resultsHeading: 'Coste mensual estimado',
    perMonth: '/ mes',
    breakdown: 'Desglose',
    qty: 'cant.',
    provenanceSnapshot: 'instantánea',
    provenanceLive: 'en vivo',
    lastVerified: 'verificado por última vez',
    todoConfirm: 'PENDIENTE: confirmar',
    partialTotal: 'parcial — algunos precios sin confirmar',
    source: 'fuente',
    savedNote: 'Guardado en tu sesión de construcción.',
    noSession: 'Empieza primero en el Estudio de construcción — describe tu proyecto y el estimador lee sus necesidades de ahí.',
    noSessionCta: 'Abrir el Estudio de construcción →',
    corsNote: 'La ruta del servidor no estaba disponible, así que se calculó en tu navegador.',
    tierSeed: 'Semilla — recién lanzado',
    tierGrowth: 'Crecimiento — tracción real',
    tierScale: 'Escala — establecido',
  },
  ar: {
    title: 'مُقدّر تكاليف الاستضافة',
    lead: 'تقدير تقريبي مبني على السوق لتكلفة استضافة مشروعك وخدمة مستخدميك — على ثلاثة مستويات من النطاق. يقرأ مشروعك من جلسة البناء؛ ولا تُدخل إلا ما تعذّر استنتاجه.',
    sourceHeading: 'كيف ينبغي جلب الأسعار؟',
    pathA: 'عبر الخادم (المسار A)',
    pathADesc: 'دالة خادم صغيرة تجلب الأسعار وقت الطلب. الأفضل حين يمنع مزوّد الوصول المباشر من المتصفح.',
    pathC: 'في متصفحك (المسار C)',
    pathCDesc: 'يحلّ متصفحك الأسعار مباشرة. دون خادم؛ وقد تتعذّر بعض نقاط نهاية المزوّدين (CORS).',
    derivedHeading: 'مُستنتَج من مشروعك',
    derivedNote: 'مُشتقّ ممّا التقطه استوديو البناء. يمكنك تجاوز أي قيمة أدناه.',
    missingHeading: 'بعض الأرقام التي تعذّر استنتاجها',
    missingNote: 'ليست بعد في جلسة البناء. أدخلها مرة وتُحفَظ، حتى تبقى بقية المنصّة متزامنة.',
    fMau: 'المستخدمون النشطون شهريًّا المتوقّعون',
    fBandwidth: 'عرض النطاق الشهري (غ.ب)',
    fStorage: 'التخزين الدائم (غ.ب)',
    fCompute: 'نمط الحوسبة',
    fDbNeeded: 'هل يحتاج قاعدة بيانات / خلفية ذات حالة؟',
    fDbSize: 'حجم قاعدة البيانات التقريبي (غ.ب)',
    computeEdge: 'حافة / غالبًا من جهة العميل',
    computeServerless: 'بلا خادم / عند الطلب',
    computeAlwaysOn: 'خادم دائم التشغيل',
    yes: 'نعم',
    no: 'لا',
    computeBtn: 'قدّر التكلفة ←',
    recomputeBtn: 'إعادة الحساب',
    computing: 'جارٍ التقدير…',
    resultsHeading: 'التكلفة الشهرية المُقدّرة',
    perMonth: '/ شهريًّا',
    breakdown: 'التفصيل',
    qty: 'الكمية',
    provenanceSnapshot: 'لقطة',
    provenanceLive: 'مباشر',
    lastVerified: 'آخر تحقّق',
    todoConfirm: 'للتأكيد لاحقًا',
    partialTotal: 'جزئي — بعض الأسعار غير مؤكّدة',
    source: 'المصدر',
    savedNote: 'حُفِظ في جلسة البناء.',
    noSession: 'ابدأ أولًا في استوديو البناء — صِف مشروعك، ويقرأ المُقدّر احتياجاته من هناك.',
    noSessionCta: 'افتح استوديو البناء ←',
    corsNote: 'لم يكن مسار الخادم متاحًا، فجرى الحساب في متصفحك بدلًا من ذلك.',
    tierSeed: 'بذرة — أُطلق للتو',
    tierGrowth: 'نمو — جذب حقيقي',
    tierScale: 'توسّع — راسخ',
  },
};

export function normalizeLang(raw: string | undefined | null): Lang {
  const v = (raw ?? '').toLowerCase().slice(0, 2);
  return v === 'es' || v === 'ar' ? v : 'en';
}
