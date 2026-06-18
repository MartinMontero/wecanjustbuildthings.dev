/**
 * Externalized Model Compass strings. Mirrors the house i18n convention (an inline
 * `Record<Lang, …>` keyed by id, same as cost-estimator/ui/i18n.ts and
 * BuildStudio.svelte) rather than per-locale files — so the module conforms instead
 * of forking the pattern. es/ar are a careful first pass; flag for native review.
 */
export type Lang = 'en' | 'es' | 'ar';

export interface ModelCompassStrings {
  title: string;
  lead: string;
  sovereigntyNote: string;
  // column headers
  colModel: string;
  colDeveloper: string;
  colJurisdiction: string;
  colTier: string;
  colLicense: string;
  colContext: string;
  colCost: string;
  colBenchmark: string;
  colSelfHost: string;
  colCaution: string;
  // tiers
  tierFrontier: string;
  tierExecution: string;
  tierBoth: string;
  tierRuntime: string;
  tierHarness: string;
  // caution levels
  cautionNone: string;
  cautionAdvisory: string;
  cautionWarning: string;
  // filters
  filterHeading: string;
  filterSelfHostOnly: string;
  filterNoUsJurisdiction: string;
  filterAllTiers: string;
  // cell helpers
  todoConfirm: string;
  source: string;
  selfHostedCompute: string;
  proprietary: string;
  vendorReported: string;
  yes: string;
  no: string;
  reason: string;
  mitigation: string;
}

export const STRINGS: Record<Lang, ModelCompassStrings> = {
  en: {
    title: 'Model Compass',
    lead: 'A sovereignty-first comparison of independent LLM tools and models — what runs where, who runs it, under whose law, and how self-hostable it is. Not a model picker: it calls nothing and proxies no keys.',
    sovereigntyNote: 'Listed most values-aligned first: self-hostable open weights and EU/Canada or confidential-computing options on top; US- and China-hosted APIs below, each with a caution label.',
    colModel: 'Model / tool',
    colDeveloper: 'Developer',
    colJurisdiction: 'Jurisdiction',
    colTier: 'Tier',
    colLicense: 'License',
    colContext: 'Context',
    colCost: 'Cost /MTok',
    colBenchmark: 'Coding benchmark',
    colSelfHost: 'Self-host',
    colCaution: 'Caution',
    tierFrontier: 'Frontier — research & architecture',
    tierExecution: 'Execution — code-building',
    tierBoth: 'Frontier & execution',
    tierRuntime: 'Local runtime',
    tierHarness: 'Orchestration harness',
    cautionNone: 'No caution',
    cautionAdvisory: 'Advisory',
    cautionWarning: 'Warning',
    filterHeading: 'Filter',
    filterSelfHostOnly: 'Self-hostable only',
    filterNoUsJurisdiction: 'No US jurisdiction',
    filterAllTiers: 'All tiers',
    todoConfirm: 'TODO: confirm',
    source: 'source',
    selfHostedCompute: 'self-hosted compute',
    proprietary: 'proprietary',
    vendorReported: 'vendor-reported',
    yes: 'Yes',
    no: 'No',
    reason: 'Reason',
    mitigation: 'Mitigation',
  },
  es: {
    title: 'Brújula de modelos',
    lead: 'Una comparación con la soberanía primero de herramientas y modelos LLM independientes: qué se ejecuta dónde, quién lo ejecuta, bajo qué ley y cómo de autoalojable es. No es un selector de modelos: no llama a nada ni gestiona claves.',
    sovereigntyNote: 'Ordenado primero por afinidad de valores: pesos abiertos autoalojables y opciones de la UE/Canadá o de computación confidencial arriba; las API alojadas en EE. UU. y China abajo, cada una con una etiqueta de precaución.',
    colModel: 'Modelo / herramienta',
    colDeveloper: 'Desarrollador',
    colJurisdiction: 'Jurisdicción',
    colTier: 'Nivel',
    colLicense: 'Licencia',
    colContext: 'Contexto',
    colCost: 'Coste /MTok',
    colBenchmark: 'Prueba de código',
    colSelfHost: 'Autoalojable',
    colCaution: 'Precaución',
    tierFrontier: 'Frontera — investigación y arquitectura',
    tierExecution: 'Ejecución — construcción de código',
    tierBoth: 'Frontera y ejecución',
    tierRuntime: 'Entorno local',
    tierHarness: 'Capa de orquestación',
    cautionNone: 'Sin precaución',
    cautionAdvisory: 'Aviso',
    cautionWarning: 'Advertencia',
    filterHeading: 'Filtrar',
    filterSelfHostOnly: 'Solo autoalojables',
    filterNoUsJurisdiction: 'Sin jurisdicción de EE. UU.',
    filterAllTiers: 'Todos los niveles',
    todoConfirm: 'PENDIENTE: confirmar',
    source: 'fuente',
    selfHostedCompute: 'cómputo autoalojado',
    proprietary: 'propietario',
    vendorReported: 'informado por el proveedor',
    yes: 'Sí',
    no: 'No',
    reason: 'Motivo',
    mitigation: 'Mitigación',
  },
  ar: {
    title: 'بوصلة النماذج',
    lead: 'مقارنة تضع السيادة أولًا لأدوات ونماذج اللغة المستقلة — ما الذي يعمل وأين، ومن يُشغّله، وتحت أي قانون، ومدى قابليته للاستضافة الذاتية. ليست أداة اختيار نماذج: لا تستدعي شيئًا ولا تُمرّر مفاتيح.',
    sovereigntyNote: 'مرتّبة بحسب التوافق مع القيم أولًا: الأوزان المفتوحة القابلة للاستضافة الذاتية وخيارات الاتحاد الأوروبي/كندا أو الحوسبة السرّية في الأعلى؛ وواجهات البرمجة المُستضافة في الولايات المتحدة والصين أدناه، ولكلٍّ منها وسم تنبيه.',
    colModel: 'النموذج / الأداة',
    colDeveloper: 'المطوّر',
    colJurisdiction: 'الولاية القضائية',
    colTier: 'المستوى',
    colLicense: 'الترخيص',
    colContext: 'السياق',
    colCost: 'التكلفة /مليون رمز',
    colBenchmark: 'اختبار البرمجة',
    colSelfHost: 'استضافة ذاتية',
    colCaution: 'تنبيه',
    tierFrontier: 'الطليعة — البحث والتصميم',
    tierExecution: 'التنفيذ — كتابة الشيفرة',
    tierBoth: 'الطليعة والتنفيذ',
    tierRuntime: 'بيئة تشغيل محلية',
    tierHarness: 'طبقة تنسيق',
    cautionNone: 'بلا تنبيه',
    cautionAdvisory: 'إرشاد',
    cautionWarning: 'تحذير',
    filterHeading: 'تصفية',
    filterSelfHostOnly: 'القابلة للاستضافة الذاتية فقط',
    filterNoUsJurisdiction: 'دون ولاية قضائية أمريكية',
    filterAllTiers: 'كل المستويات',
    todoConfirm: 'للتأكيد لاحقًا',
    source: 'المصدر',
    selfHostedCompute: 'حوسبة ذاتية الاستضافة',
    proprietary: 'مملوك',
    vendorReported: 'مُبلَّغ من المزوّد',
    yes: 'نعم',
    no: 'لا',
    reason: 'السبب',
    mitigation: 'التخفيف',
  },
};

export function normalizeLang(raw: string | undefined | null): Lang {
  const v = (raw ?? '').toLowerCase().slice(0, 2);
  return v === 'es' || v === 'ar' ? v : 'en';
}
