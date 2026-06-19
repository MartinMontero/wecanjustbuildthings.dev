<script lang="ts">
  import { onMount } from 'svelte';
  import { zipSync, strToU8 } from 'fflate';
  import { loadSession, updateSession, hasSession, clearSession, type SessionStackItem, type SessionExtension } from '../lib/build-session.ts';
  import { matchDependency } from '../../enforcement/matcher.ts';
  import type { ExcludedOrg, Ecosystem } from '../../enforcement/types.ts';
  import { detectSignals, pickQuestions, reflect, type ConstraintId } from '../lib/mentor-engine.ts';
  import { chemistry, partnersOf } from '../lib/chemistry.ts';
  import { eligibleForStack, advisoryRank, autoPickable, pinnedDependencies } from '../lib/studio-stack.ts';
  import { slugifySkill, skillToMd, type DraftSkill } from '../lib/skill-doc.ts';
  import { mentorPersonaSkill } from '../lib/mentor-persona.ts';
  import { buildGooseRecipe, recipeToYaml, type ExtensionAllowlist } from '../lib/goose-recipe.ts';
  import { recipeDeeplink, explainRecipe } from '../lib/goose-deeplink.ts';

  let { lang: initialLang = 'en' }: { lang?: string } = $props();

  interface Item {
    name: string; url: string; ecosystem: string; category: string;
    protocols: string[]; license: string; verification: string; uses: number; desc: string; repo: string | null;
    licenseUrl?: string | null; commit?: string | null; verifiedAt?: string | null;
    advisory?: string | null; blockedReason?: string | null; providerAgnostic?: boolean;
    maintenance?: string; version?: string | null;
  }

  // ---------- i18n ----------
  type Lang = 'en' | 'es' | 'ar';
  const STR: Record<Lang, Record<string, string>> = {
    en: {
      s1: '1 · Describe', s2: '2 · Your blueprint', s3: '3 · Build it', startOver: 'Start over',
      name: 'Project name (a short nickname is fine)',
      problem: 'What problem does it solve, and for whom? Say it like you would out loud — one short paragraph.',
      why: 'Why does this matter? The real change you want — not just “ship an app.”',
      success: 'How will you know it’s working? What’s different for your community when it does.',
      protocols: 'Which network does it live on?', focus: 'What kind of thing are you building?',
      tenq: 'Start with the why. Answer these the way you’d explain the project to a friend — the clearer you are, the better your AI agent builds.',
      protoHelp: 'A “network” (protocol) is the shared, open rulebook your tool plugs into — owned by no single company. Nostr and AT Protocol (Bluesky) are open social networks; pick “general” if it isn’t a social tool.',
      choose: 'Show me the blueprint →', back: '← Back', gen: 'Build it →', backStack: '← Back to the blueprint',
      bpHead: 'Here’s how I’d build', bpPieces: 'The pieces you’ll need', bpWhyFor: 'Why this, for you:', bpConnects: 'How it fits in:', bpReceipt: 'License verified at commit', bpAdded: 'Added to your blueprint', bpSeeded: 'From the catalog', bpAddedByYou: 'Added by you',
      bpSwap: 'Swap', bpUse: 'Use this instead', bpRemove: 'Remove', bpKeep: 'Add back', bpFits: 'How it all comes together',
      bpAdvanced: 'Power user? Browse and add tools yourself', bpEmpty: 'Tell me what you want to build first — go back and describe it in a sentence or two.',
      bpLead: 'You don’t need to know any of these by name. I picked a small, proven set for what you described and wired them together. Keep it as-is, or swap any piece — every option is safe and license-checked.',
      examples: 'Not sure where to start? Try one:',
      suggested: '',
      add: 'Need something specific? Search the full catalog', selected: 'building blocks chosen', loading: 'Loading the catalog…',
      handoff: 'How do you want to get started?', zip: 'Download a starter folder', github: 'Save it to GitHub',
      goose: 'Run it with Goose', kickoff: 'Try a step with AI',
      dlzip: '⬇ Download your starter folder (.zip)', copyPrompt: 'Copy the instructions for your AI agent',
      runLocal: 'New to Goose? Start here →', ghGuide: 'How to connect GitHub →',
      apikey: 'Your AI key (sent straight to the model, never stored by us)',
      provider: 'Who makes the model', run: 'Run it', running: 'Working…',
      ghError: 'Connecting to GitHub didn’t finish. Try again, or download the folder below.',
      stackIntro: 'Your “stack” is just the set of ready-made building blocks — tools other people have already built and tested — that your project is made from. Choosing good ones means you and your AI agent don’t start from scratch: you assemble proven parts instead of reinventing them, which saves months and avoids dead ends. Below is a starting set picked for what you described. Not sure? Keep the ones marked ★ and the defaults — you can’t pick “wrong” here, because everything listed is already safe and checked. Add or remove anything; nothing is final.',
      legendPrimary: '★ the recommended starting point for your network',
      legendClean: 'every option is safe to use (no Meta/OpenAI/xAI) and license-checked',
      showMore: 'Show more tools', showFewer: 'Show fewer', showing: 'Showing', of: 'of',
      modelTitle: 'Choose your AI model',
      modelIntro: 'This runs one planning step with your own AI key, so you can feel it work before you commit. Your key and your project go straight to the model — never stored by us, and never routed through Meta, OpenAI, or xAI. The options below are chosen for that: models trained accountably, open models you can run yourself, or a neutral router locked to allowed models.',
      modelLabel: 'Model',
      handoffIntro: 'Your starter is ready — everything your AI agent needs to begin, with the rules and safe tools already baked in. Pick how you’d like to take it:',
      zipDesc: 'A ready-to-open folder with everything inside: the project’s rules, the plan, the build instructions, and the list of safe tools. Hand it to Goose or Claude Code and start building.',
      gooseDl: '⬇ Download the Goose recipe', gooseCopy: 'Copy the run command',
      gooseDesc: 'A recipe is a one-file set of instructions Goose follows to build your project. Download it, then run the command below.',
      gooseExplainIntro: 'Here’s exactly what happens when you open this in Goose:',
      gooseExplainPrompt: 'Goose receives your plan, your rules, and the vetted tool list — nothing else.',
      gooseExplainConsent: 'Goose asks your permission before it runs anything (its “Trust & Execute” step). You stay in control.',
      gooseOpen: 'Open in Goose →', gooseCopyLink: 'Copy the link',
      gooseTooBig: 'This build is large, so the one-click link won’t fit. Download the recipe and run it instead:',
      gooseFallback: 'Prefer a file? Download the recipe instead',
      ghNotReady: 'Saving straight to GitHub isn’t switched on for this site yet — download the folder instead, or read',
      ghConnectBtn: 'Connect GitHub & save my project', ghSuccess: '✓ Your project is on GitHub:', copyPlan: 'Copy the plan',
      refineTitle: 'Want a second opinion? Ask the AI mentor (optional)',
      refineIntro: 'It asks you a few sharp questions first, then suggests a tweak or two — only from the verified catalog, and only if it truly helps. You decide what to keep. Your answers go only to the model you choose, never stored.',
      refineAsk: 'Ask me the sharp questions first →', refineThinking: 'Thinking…',
      refineAnswersHint: 'Answer in a few words, or skip any — then I’ll suggest what fits.',
      refinePropose: 'Now show me what you’d add →',
      refineWhy: 'Why:', refineWatch: 'Watch out:',
      refineApply: 'Add to my blueprint', refineApplied: 'Added ✓',
      refineNone: 'Your plan already covers what you described — I wouldn’t add anything. That’s a good sign.',
      refineErr: 'Couldn’t reach the model. Check your key and try again.', refineNeedKey: 'Enter your AI key above first.',
      skillsHint: 'Have a field guide, manual, or SOP? Turn your own know-how into a skill your agent follows →',
      skillsDraft: 'Skills I can scaffold from what you told me', skillsReady: 'Or drop in a ready-made skill',
      skillAdd: 'Add to my project', skillAdded: 'Added ✓',
      skCaptureHead: 'You know something the agent doesn’t', skCaptureSub: 'A method only you know — how you take a report, vet a member, keep people safe. Capture it once and every build follows it.', skName: 'Skill name', skDesc: 'One line: what it does', skDescPh: 'Take an eviction report without exposing the tenant', skSteps: 'The steps, one per line', skStepsPh: 'Use a chosen handle, not a legal name\nRecord the building, not the unit\nEncrypt everything; two organizers hold keys', skSource: 'Where it came from (optional)', skSourcePh: 'Tenants Union field manual', skCaptureBtn: 'Capture as a skill', skillRemove: 'Remove',
      skillReview: 'A draft in your words — review and refine it; you’re the expert.',
      skillsIncluded: 'skill(s) will be included in your starter',
    },
    es: {
      s1: '1 · Describe', s2: '2 · Tu plano', s3: '3 · Constrúyelo', startOver: 'Empezar de nuevo',
      name: 'Nombre del proyecto (un apodo corto vale)',
      problem: '¿Qué problema resuelve y para quién? Dilo como lo dirías en voz alta — un párrafo corto.',
      why: '¿Por qué importa? El cambio real que buscas — no solo “lanzar una app.”',
      success: '¿Cómo sabrás que funciona? Qué cambia para tu comunidad cuando lo logra.',
      protocols: '¿En qué red vive?', focus: '¿Qué tipo de cosa estás construyendo?',
      tenq: 'Empieza por el porqué. Responde como si le explicaras el proyecto a un amigo — cuanto más claro seas, mejor construye tu agente de IA.',
      protoHelp: 'Una “red” (protocolo) es el reglamento abierto y compartido al que se conecta tu herramienta — sin dueño único. Nostr y AT Protocol (Bluesky) son redes sociales abiertas; elige “general” si no es una herramienta social.',
      choose: 'Muéstrame el plano →', back: '← Atrás', gen: 'Construirlo →', backStack: '← Volver al plano',
      bpHead: 'Así lo construiría', bpPieces: 'Las piezas que necesitarás', bpWhyFor: 'Por qué esta, para ti:', bpConnects: 'Cómo encaja:', bpReceipt: 'Licencia verificada en el commit', bpAdded: 'Añadido a tu plano', bpSeeded: 'Del catálogo', bpAddedByYou: 'Añadido por ti',
      bpSwap: 'Cambiar', bpUse: 'Usar esta', bpRemove: 'Quitar', bpKeep: 'Volver a añadir', bpFits: 'Cómo se une todo',
      bpAdvanced: '¿Experto? Explora y añade herramientas tú mismo', bpEmpty: 'Primero dime qué quieres construir — vuelve y descríbelo en una o dos frases.',
      bpLead: 'No necesitas conocer ninguna de estas por su nombre. Elegí un conjunto pequeño y probado para lo que describiste y las conecté entre sí. Déjalo así, o cambia cualquier pieza — cada opción es segura y con licencia verificada.',
      examples: '¿No sabes por dónde empezar? Prueba una:',
      suggested: '',
      add: '¿Necesitas algo específico? Busca en todo el catálogo', selected: 'bloques elegidos', loading: 'Cargando el catálogo…',
      handoff: '¿Cómo quieres empezar?', zip: 'Descargar una carpeta inicial', github: 'Guardarlo en GitHub',
      goose: 'Ejecutarlo con Goose', kickoff: 'Probar un paso con IA',
      dlzip: '⬇ Descargar tu carpeta inicial (.zip)', copyPrompt: 'Copiar las instrucciones para tu agente de IA',
      runLocal: '¿Nuevo en Goose? Empieza aquí →', ghGuide: 'Cómo conectar GitHub →',
      apikey: 'Tu clave de IA (se envía directo al modelo, nunca la guardamos)',
      provider: 'Quién hace el modelo', run: 'Ejecutar', running: 'Trabajando…',
      ghError: 'La conexión con GitHub no terminó. Inténtalo de nuevo o descarga la carpeta abajo.',
      stackIntro: 'Tu “stack” es simplemente el conjunto de bloques ya hechos — herramientas que otras personas ya construyeron y probaron — con los que se arma tu proyecto. Elegir buenos bloques significa que tú y tu agente de IA no empiezan de cero: ensamblas piezas probadas en vez de reinventarlas, lo que ahorra meses y evita callejones sin salida. Abajo hay un conjunto inicial elegido para lo que describiste. ¿No estás seguro? Deja los marcados con ★ y los predeterminados — aquí no puedes elegir “mal”, porque todo lo listado ya es seguro y está verificado. Agrega o quita lo que quieras; nada es definitivo.',
      legendPrimary: '★ el punto de partida recomendado para tu red',
      legendClean: 'cada opción es segura de usar (sin Meta/OpenAI/xAI) y con licencia verificada',
      showMore: 'Mostrar más herramientas', showFewer: 'Mostrar menos', showing: 'Mostrando', of: 'de',
      modelTitle: 'Elige tu modelo de IA',
      modelIntro: 'Esto ejecuta un paso de planificación con tu propia clave de IA, para que lo sientas funcionar antes de comprometerte. Tu clave y tu proyecto van directo al modelo — nunca los guardamos, y nunca pasan por Meta, OpenAI o xAI. Las opciones de abajo se eligen por eso: modelos entrenados de forma responsable, modelos abiertos que puedes ejecutar tú mismo, o un enrutador neutral limitado a modelos permitidos.',
      modelLabel: 'Modelo',
      handoffIntro: 'Tu kit está listo — todo lo que tu agente de IA necesita para empezar, con las reglas y las herramientas seguras ya incluidas. Elige cómo quieres llevarlo:',
      zipDesc: 'Una carpeta lista para abrir con todo dentro: las reglas del proyecto, el plan, las instrucciones de construcción y la lista de herramientas seguras. Entrégala a Goose o Claude Code y empieza a construir.',
      gooseDl: '⬇ Descargar la receta de Goose', gooseCopy: 'Copiar el comando',
      gooseDesc: 'Una receta es un archivo con instrucciones que Goose sigue para construir tu proyecto. Descárgala y ejecuta el comando de abajo.',
      gooseExplainIntro: 'Esto es exactamente lo que pasa cuando lo abres en Goose:',
      gooseExplainPrompt: 'Goose recibe tu plan, tus reglas y la lista de herramientas verificadas — nada más.',
      gooseExplainConsent: 'Goose pide tu permiso antes de ejecutar nada (su paso “Trust & Execute”). Mantienes el control.',
      gooseOpen: 'Abrir en Goose →', gooseCopyLink: 'Copiar el enlace',
      gooseTooBig: 'Este proyecto es grande y el enlace de un clic no cabe. Descarga la receta y ejecútala:',
      gooseFallback: '¿Prefieres un archivo? Descarga la receta',
      ghNotReady: 'Guardar directo en GitHub aún no está activado en este sitio — descarga la carpeta, o lee',
      ghConnectBtn: 'Conectar GitHub y guardar mi proyecto', ghSuccess: '✓ Tu proyecto está en GitHub:', copyPlan: 'Copiar el plan',
      refineTitle: '¿Quieres una segunda opinión? Pregunta al mentor de IA (opcional)',
      refineIntro: 'Primero te hace unas preguntas precisas, luego sugiere uno o dos ajustes — solo del catálogo verificado y solo si de verdad ayuda. Tú decides qué conservar. Tus respuestas van solo al modelo que elijas, nunca se guardan.',
      refineAsk: 'Hazme las preguntas clave primero →', refineThinking: 'Pensando…',
      refineAnswersHint: 'Responde en pocas palabras, o salta las que quieras — luego sugeriré lo que encaje.',
      refinePropose: 'Ahora muéstrame qué añadirías →',
      refineWhy: 'Por qué:', refineWatch: 'Ojo:',
      refineApply: 'Añadir a mi plano', refineApplied: 'Añadido ✓',
      refineNone: 'Tu plan ya cubre lo que describiste — no añadiría nada. Eso es buena señal.',
      refineErr: 'No se pudo contactar al modelo. Revisa tu clave e inténtalo de nuevo.', refineNeedKey: 'Primero ingresa tu clave de IA arriba.',
      skillsHint: '¿Tienes una guía de campo, un manual o un procedimiento? Convierte tu propio saber en una habilidad que tu agente sigue →',
      skillsDraft: 'Habilidades que puedo crear a partir de lo que me contaste', skillsReady: 'O agrega una habilidad lista para usar',
      skillAdd: 'Añadir a mi proyecto', skillAdded: 'Añadida ✓',
      skCaptureHead: 'Sabes algo que el agente no sabe', skCaptureSub: 'Un método que solo tú conoces — cómo tomas un reporte, verificas a un miembro, proteges a la gente. Captúralo una vez y cada construcción lo seguirá.', skName: 'Nombre de la habilidad', skDesc: 'Una línea: qué hace', skDescPh: 'Tomar un reporte de desalojo sin exponer al inquilino', skSteps: 'Los pasos, uno por línea', skStepsPh: 'Usa un alias elegido, no un nombre legal\nRegistra el edificio, no la unidad\nCifra todo; dos organizadores tienen las claves', skSource: 'De dónde viene (opcional)', skSourcePh: 'Manual de campo del sindicato de inquilinos', skCaptureBtn: 'Capturar como habilidad', skillRemove: 'Quitar',
      skillReview: 'Un borrador en tus palabras — revísalo y ajústalo; tú eres quien sabe.',
      skillsIncluded: 'habilidad(es) se incluirán en tu kit inicial',
    },
    ar: {
      s1: '١ · صِف', s2: '٢ · مخططك', s3: '٣ · ابنِه', startOver: 'ابدأ من جديد',
      name: 'اسم المشروع (يكفي اسم مختصر)',
      problem: 'ما المشكلة التي يحلها، ولمن؟ قُلها كما تقولها بصوتك — فقرة قصيرة.',
      why: 'لماذا يهمّ هذا؟ التغيير الحقيقي الذي تريده — وليس مجرد «إطلاق تطبيق».',
      success: 'كيف ستعرف أنه ينجح؟ ما الذي يتغيّر لمجتمعك عندما ينجح.',
      protocols: 'على أي شبكة يعمل؟', focus: 'ما نوع الشيء الذي تبنيه؟',
      tenq: 'ابدأ بالـ«لماذا». أجب كأنك تشرح المشروع لصديق — كلما كنت أوضح، بنى وكيل الذكاء الاصطناعي بشكل أفضل.',
      protoHelp: 'الـ«شبكة» (البروتوكول) هي القواعد المفتوحة المشتركة التي تتصل بها أداتك — لا يملكها طرف واحد. Nostr وAT Protocol (Bluesky) شبكات اجتماعية مفتوحة؛ اختر «general» إن لم تكن أداة اجتماعية.',
      choose: 'أرني المخطط ←', back: '→ رجوع', gen: 'ابنِه ←', backStack: '→ العودة للمخطط',
      bpHead: 'هكذا سأبنيه', bpPieces: 'القطع التي ستحتاجها', bpWhyFor: 'لماذا هذه، لك:', bpConnects: 'كيف تتكامل:', bpReceipt: 'الترخيص مُتحقَّق عند الـcommit', bpAdded: 'أُضيف إلى مخطّطك', bpSeeded: 'من الكتالوج', bpAddedByYou: 'أضفته أنت',
      bpSwap: 'تبديل', bpUse: 'استخدم هذه', bpRemove: 'إزالة', bpKeep: 'إعادة الإضافة', bpFits: 'كيف يتكامل كل شيء',
      bpAdvanced: 'خبير؟ تصفّح وأضف الأدوات بنفسك', bpEmpty: 'أخبرني أولاً بما تريد بناءه — ارجع وصِفه في جملة أو جملتين.',
      bpLead: 'لا حاجة لأن تعرف أيّاً منها بالاسم. اخترتُ مجموعة صغيرة ومُجرَّبة لما وصفته وربطتها معاً. اتركها كما هي، أو بدّل أي قطعة — كل خيار آمن ومُتحقَّق من ترخيصه.',
      examples: 'لا تعرف من أين تبدأ؟ جرّب واحدة:',
      suggested: '',
      add: 'تحتاج شيئاً محدداً؟ ابحث في الكتالوج كاملاً', selected: 'لبنات مختارة', loading: 'جارٍ تحميل الكتالوج…',
      handoff: 'كيف تريد أن تبدأ؟', zip: 'تنزيل مجلد بداية', github: 'احفظه في GitHub',
      goose: 'شغّله مع Goose', kickoff: 'جرّب خطوة بالذكاء الاصطناعي',
      dlzip: '⬇ نزّل مجلد البداية (.zip)', copyPrompt: 'انسخ تعليمات وكيل الذكاء الاصطناعي',
      runLocal: 'جديد على Goose؟ ابدأ هنا ←', ghGuide: 'كيفية ربط GitHub ←',
      apikey: 'مفتاح الذكاء الاصطناعي الخاص بك (يُرسل مباشرة إلى النموذج، ولا نخزّنه أبداً)',
      provider: 'من يصنع النموذج', run: 'شغّل', running: 'جارٍ العمل…',
      ghError: 'لم يكتمل الاتصال بـ GitHub. حاول مرة أخرى، أو نزّل المجلد أدناه.',
      stackIntro: '«الحزمة» (stack) هي ببساطة مجموعة اللبنات الجاهزة — أدوات بناها واختبرها آخرون — التي يتكوّن منها مشروعك. اختيار لبنات جيدة يعني أنك ووكيل الذكاء الاصطناعي لا تبدآن من الصفر: تجمّع قطعاً مُجرَّبة بدل إعادة اختراعها، ما يوفّر شهوراً ويتجنّب الطرق المسدودة. في الأسفل مجموعة بداية مُختارة لما وصفته. غير متأكد؟ اترك المعلّمة بـ ★ والافتراضية — لا يمكنك الاختيار «الخطأ» هنا، فكل المُدرَج آمن ومُتحقَّق منه. أضِف أو احذف ما تشاء؛ لا شيء نهائي.',
      legendPrimary: '★ نقطة البداية الموصى بها لشبكتك',
      legendClean: 'كل خيار آمن للاستخدام (بلا Meta/OpenAI/xAI) ومُتحقَّق من ترخيصه',
      showMore: 'عرض أدوات أكثر', showFewer: 'عرض أقل', showing: 'عرض', of: 'من',
      modelTitle: 'اختر نموذج الذكاء الاصطناعي',
      modelIntro: 'هذا يشغّل خطوة تخطيط واحدة باستخدام مفتاحك الخاص، لتشعر به يعمل قبل أن تلتزم. مفتاحك ومشروعك يذهبان مباشرة إلى النموذج — لا نخزّنهما أبداً، ولا يمران عبر Meta أو OpenAI أو xAI. الخيارات أدناه مُختارة لذلك: نماذج مُدرَّبة بمسؤولية، نماذج مفتوحة يمكنك تشغيلها بنفسك، أو موجّه محايد مقصور على النماذج المسموح بها.',
      modelLabel: 'النموذج',
      handoffIntro: 'حزمتك جاهزة — كل ما يحتاجه وكيل الذكاء الاصطناعي للبدء، مع القواعد والأدوات الآمنة مُضمّنة سلفاً. اختر كيف تريد أخذها:',
      zipDesc: 'مجلد جاهز للفتح يحوي كل شيء: قواعد المشروع، والخطة، وتعليمات البناء، وقائمة الأدوات الآمنة. سلّمه لـ Goose أو Claude Code وابدأ البناء.',
      gooseDl: '⬇ تنزيل وصفة Goose', gooseCopy: 'انسخ أمر التشغيل',
      gooseDesc: 'الوصفة ملف واحد فيه تعليمات يتبعها Goose لبناء مشروعك. نزّلها ثم شغّل الأمر أدناه.',
      gooseExplainIntro: 'إليك بالضبط ما يحدث عند فتحه في Goose:',
      gooseExplainPrompt: 'يتلقّى Goose خطتك وقواعدك وقائمة الأدوات الموثوقة — لا أكثر.',
      gooseExplainConsent: 'يطلب Goose إذنك قبل تشغيل أي شيء (خطوة «Trust & Execute»). تبقى أنت المتحكم.',
      gooseOpen: 'افتح في Goose ←', gooseCopyLink: 'انسخ الرابط',
      gooseTooBig: 'هذا المشروع كبير، لذا لا يتّسع رابط النقرة الواحدة. نزّل الوصفة وشغّلها بدلاً من ذلك:',
      gooseFallback: 'تفضّل ملفاً؟ نزّل الوصفة',
      ghNotReady: 'الحفظ المباشر إلى GitHub غير مُفعّل في هذا الموقع بعد — نزّل المجلد بدلاً من ذلك، أو اقرأ',
      ghConnectBtn: 'اربط GitHub واحفظ مشروعي', ghSuccess: '✓ مشروعك على GitHub:', copyPlan: 'انسخ الخطة',
      refineTitle: 'تريد رأياً ثانياً؟ اسأل مرشد الذكاء الاصطناعي (اختياري)',
      refineIntro: 'يطرح عليك أولاً بضعة أسئلة دقيقة، ثم يقترح تعديلاً أو اثنين — من الكتالوج المُوثَّق فقط، وفقط إن كان يساعد فعلاً. أنت تقرّر ما تُبقيه. إجاباتك تذهب إلى النموذج الذي تختاره فقط، ولا تُخزَّن أبداً.',
      refineAsk: 'اطرح عليّ الأسئلة المهمة أولاً ←', refineThinking: 'يفكّر…',
      refineAnswersHint: 'أجب بكلمات قليلة، أو تجاوز ما تشاء — ثم سأقترح ما يناسب.',
      refinePropose: 'الآن أرني ما الذي ستضيفه ←',
      refineWhy: 'لماذا:', refineWatch: 'انتبه:',
      refineApply: 'أضِف إلى مخططي', refineApplied: 'أُضيف ✓',
      refineNone: 'مخططك يغطّي ما وصفته بالفعل — لن أضيف شيئاً. هذه علامة جيدة.',
      refineErr: 'تعذّر الوصول إلى النموذج. تحقّق من مفتاحك وحاول مجدداً.', refineNeedKey: 'أدخل مفتاح الذكاء الاصطناعي أعلاه أولاً.',
      skillsHint: 'لديك دليل ميداني أو كُتيّب أو إجراء عمل؟ حوّل معرفتك إلى مهارة يتّبعها وكيلك ←',
      skillsDraft: 'مهارات يمكنني إنشاؤها مما أخبرتني به', skillsReady: 'أو أضِف مهارة جاهزة',
      skillAdd: 'أضِف إلى مشروعي', skillAdded: 'أُضيفت ✓',
      skCaptureHead: 'أنت تعرف شيئاً لا يعرفه الوكيل', skCaptureSub: 'طريقة تعرفها أنت وحدك — كيف تأخذ بلاغاً، تتحقّق من عضو، تحمي الناس. التقطها مرّة وسيتّبعها كل بناء.', skName: 'اسم المهارة', skDesc: 'سطر واحد: ماذا تفعل', skDescPh: 'أخذ بلاغ إخلاء دون كشف هوية المستأجر', skSteps: 'الخطوات، واحدة في كل سطر', skStepsPh: 'استخدم اسماً مستعاراً، لا اسماً قانونياً\nسجّل المبنى، لا الوحدة\nشفّر كل شيء؛ منظّمان يحملان المفاتيح', skSource: 'من أين أتت (اختياري)', skSourcePh: 'دليل ميداني لنقابة المستأجرين', skCaptureBtn: 'التقطها كمهارة', skillRemove: 'إزالة',
      skillReview: 'مسودة بكلماتك — راجعها وحسّنها؛ أنت صاحب الخبرة.',
      skillsIncluded: 'مهارة ستُضمَّن في حزمتك المبدئية',
    },
  };
  let lang = $state<Lang>((['en', 'es', 'ar'].includes(initialLang) ? initialLang : 'en') as Lang);
  const t = $derived(STR[lang]);
  const rtl = $derived(lang === 'ar');

  // ---------- state ----------
  let items = $state<Item[]>([]);
  let policyOrgs = $state<ExcludedOrg[]>([]);
  let loading = $state(true);
  let step = $state(1);
  let projectName = $state('');
  let problem = $state('');
  let goal = $state('');
  let success = $state('');
  let protocols = $state<Set<string>>(new Set(['nostr']));
  let addQuery = $state('');
  let handoff = $state<'zip' | 'github' | 'goose' | 'kickoff'>('zip');
  // Builder's adjustments to the recommended blueprint: a swapped alternative per
  // piece, pieces switched off, and any extra tools added by hand (advanced).
  let swaps = $state<Record<string, string>>({});
  let removed = $state<Set<string>>(new Set());
  let extra = $state<Set<string>>(new Set());
  let seededTool = $state<string | null>(null);
  // Slice B: the vetted Goose-extension allowlist (from /extensions.json) and the
  // extensions staged on the session — both feed the recipe serializer.
  let allowlist = $state<ExtensionAllowlist>({ byId: {} });
  let sessionExtensions = $state<SessionExtension[]>([]);

  const ALL_PROTOCOLS = ['nostr', 'atproto', 'lightning', 'cashu', 'general'];
  const PROTO_PRIORITY: Record<string, string[]> = {
    nostr: ['@nostr-dev-kit/ndk', 'nostr-tools'],
    atproto: ['@atproto/api', '@atcute/client'],
  };
  // Plain-language starting points for a builder who isn't sure how to phrase it.
  const EXAMPLES = [
    'A private way for tenants to report problems without exposing who they are.',
    'A community bulletin board that no company can shut down or sell.',
    'A tip jar so people can support our organizers directly.',
    'A members-only space where our collective can talk and share files.',
  ];

  onMount(async () => {
    // Follow the page's locale so /es/build/ and /ar/build/ open in that language
    // (the site-wide picker switches the surrounding chrome; this keeps the tool in sync).
    const dl = document.documentElement.lang?.slice(0, 2);
    if (dl && ['en', 'es', 'ar'].includes(dl)) lang = dl as Lang;

    // Resume the persisted build session (the connective tissue): restore the
    // builder's intent + blueprint edits across reloads, and pick up a tool
    // seeded by the Catalog's "Build with this" — so nothing is ever re-asked.
    // Done BEFORE the catalog fetch so a late-resolving await can never clobber
    // restored input, and before the builder can type. The persistence $effect
    // stays inert until `loading` flips false, so this hydration is not echoed.
    if (hasSession()) {
      const s = loadSession();
      if (s.intent.projectName) projectName = s.intent.projectName;
      if (s.intent.problem) problem = s.intent.problem;
      if (s.intent.goal) goal = s.intent.goal;
      if (s.intent.success) success = s.intent.success;
      if (s.intent.protocols.length) protocols = new Set(s.intent.protocols);
      if (Object.keys(s.adjustments.swaps).length) swaps = { ...s.adjustments.swaps };
      if (s.adjustments.removed.length) removed = new Set(s.adjustments.removed);
      if (s.adjustments.extra.length || s.seededTool) {
        const ex = new Set(s.adjustments.extra);
        if (s.seededTool) { ex.add(s.seededTool); seededTool = s.seededTool; }
        extra = ex;
      }
      if (s.intent.answers && Object.keys(s.intent.answers).length) mentorAnswers = { ...(s.intent.answers as Record<string, string>) };
      if (s.skills?.length) {
        authoredSkills = s.skills.map((sk) => ({ name: sk.name, description: sk.description, method: sk.steps ?? [], source: sk.source }));
        for (const sk of authoredSkills) addSkill(sk);
      }
      if (s.handoff) handoff = s.handoff as typeof handoff;
      sessionExtensions = s.extensions ?? [];
    }

    // Only fully verified tool entries are eligible for a generated stack (#4):
    // the catalog shows under_review / blocked / dataset entries, but the Studio
    // must never fold those into a stack it calls verified + policy-clean.
    try { const res = await fetch('/catalog.json'); items = (await res.json()).filter((i: Item & { kind?: string }) => eligibleForStack(i)); } catch { /* offline */ }
    // Load the same excluded-org policy the dependency checker uses, so the
    // Studio can re-verify its own assembled stack in-browser (Movement 4).
    try { const pr = await fetch('/policy.json'); policyOrgs = (await pr.json()).orgs ?? []; } catch { /* offline: stack stays unverified in-browser, flow still works */ }
    try { const er = await fetch('/extensions.json'); allowlist = await er.json(); } catch { /* offline: empty allowlist, recipe still valid */ }
    loading = false;

    const params = new URLSearchParams(location.search);
    const gh = params.get('gh');
    if (gh === 'connected') { handoff = 'github'; ghConnected = true; step = 3; }
    else if (gh === 'error') { handoff = 'github'; step = 3; ghResult = `error:${t.ghError}`; }
    else if (gh === 'unconfigured') { handoff = 'github'; step = 3; ghConfigured = false; }

    // Catalog hand-off: "Build with this" lands here as ?seed=<tool>. Seed the
    // tool into the stack, open at the blueprint, and clean the URL.
    const seed = params.get('seed');
    if (seed) {
      const n = new Set(extra); n.add(seed); extra = n;
      seededTool = seed;
      if (step < 2) step = 2;
      history.replaceState(null, '', location.pathname);
    }
  });

  // Persist intent + blueprint edits to the build session on every change, so
  // the builder's progress survives reloads and travels to the other movements.
  // (Path A: deterministic and entirely on-device — no network, no model.)
  $effect(() => {
    if (loading) return;
    const intent = {
      projectName, problem, goal, success, protocols: [...protocols],
    };
    const adjustments = { swaps: { ...swaps }, removed: [...removed], extra: [...extra] };
    const method = handoff;
    const stack = sessionStack.map((it) => ({ ...it, receipt: it.receipt ? { ...it.receipt } : undefined }));
    const answers = { ...mentorAnswers };
    // The reflected-back problem: the builder's words + the constraints the
    // Mentor Engine derived from them (deterministic). Feeds the spec.
    const converged = reflection.constraints.length
      ? { statement: problem.trim(), constraints: reflection.constraints.map((c) => m.c[c]), signals: reflection.signals }
      : null;
    const skills = authoredSkills.map((sk) => ({ name: slugifySkill(sk.name), description: sk.description, source: sk.source, steps: sk.method, body: skillToMd(sk) }));
    const movement = (step >= 3 ? 4 : step) as 1 | 2 | 3 | 4;
    updateSession((s) => ({
      ...s,
      intent: { ...s.intent, ...intent, answers },
      converged,
      adjustments,
      handoff: method,
      stack,
      skills,
      seededTool,
      movement,
    }));
  });

  const slug = $derived((projectName || 'my-app').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'my-app');
  const protoList = $derived([...protocols].filter((p) => p !== 'general'));
  const primaryNames = $derived(new Set([...protocols].map((p) => PROTO_PRIORITY[p]?.[0]).filter(Boolean)));

  // ---------- the recommendation engine (the "blueprint") ----------
  // Reads the plain-English description and assembles a small, wired-together set
  // of real catalog tools — the few pieces a project like this actually needs,
  // each with a role, a reason, and how it connects. The builder never has to
  // know the tools by name or browse thousands of entries.
  interface CapDef { id: string; always?: boolean; protoOnly?: boolean; detect?: RegExp; names?: (p: Set<string>) => string[]; category?: string; }
  const CAP_DEFS: CapDef[] = [
    { id: 'connect', protoOnly: true,
      names: (p) => [...(p.has('nostr') ? ['@nostr-dev-kit/ndk', 'nostr-tools'] : []), ...(p.has('atproto') ? ['@atproto/api', '@atcute/client'] : [])] },
    { id: 'app', always: true, names: () => ['@sveltejs/kit', 'astro', 'vue', 'solid-js', 'svelte', 'react', 'next'], category: 'Frameworks & Libraries' },
    { id: 'identity', detect: /\b(log ?in|login|sign[- ]?in|account|identit|profile|member|auth|\bkey)/i, category: 'Auth Identity & Keys' },
    { id: 'privacy', detect: /\b(privat|anonym|secure|encrypt|confidential|protect|sensitive|expos|surveil)/i, category: 'Security & Privacy' },
    { id: 'storage', detect: /\b(store|saved?|database|record|archive|document|history|track|list|directory|inventory)\b/i, category: 'Databases & Storage' },
    { id: 'payments', detect: /\b(pay|paid|tip|donat|fund|wallet|money|invoice|sats|bitcoin|lightning|zap|support)\b/i, category: 'Bitcoin Lightning Nostr' },
    { id: 'hosting', detect: /\b(server|back ?end|backend|relay|host|deploy|\bapi\b|self-host|infrastructure)\b/i, category: 'Hosting Infra & Deploy' },
  ];
  // Plain-language role / why / how-it-connects for each piece, localized so the
  // blueprint rationale reads fully in the builder's language.
  interface CapText { role: string; why: string; connects: string }
  const CAP_TEXT: Record<Lang, Record<string, CapText>> = {
    en: {
      connect: { role: 'Connects to the network', why: 'How your app talks to the open network — so your community isn’t locked inside one company’s walls.', connects: 'Everything else plugs into this; it carries the posts, messages, and updates in and out.' },
      app: { role: 'The app people see and use', why: 'The screens and buttons your community actually touches. We default to Svelte — fast, simple, and not owned by a Big Tech platform.', connects: 'Shows what comes back from the network and sends people’s actions to it.' },
      identity: { role: 'Logins & identity', why: 'Lets people prove who they are and keeps their accounts truly theirs.', connects: 'Signs each action so the network knows it really came from them.' },
      privacy: { role: 'Privacy & encryption', why: 'Keeps sensitive information unreadable to anyone it isn’t meant for.', connects: 'Scrambles data before it’s stored or sent, and unscrambles it only for the right people.' },
      storage: { role: 'Remembers your data', why: 'Keeps things between visits — posts, records, settings — so nothing is lost.', connects: 'The app reads from and writes to this.' },
      payments: { role: 'Payments & tips', why: 'Lets people send and receive money or tips directly, with no middleman taking a cut.', connects: 'Adds a pay/tip button and settles it on the Lightning network.' },
      hosting: { role: 'Runs the server side', why: 'If your tool needs its own server — like running a relay or an API — this is what runs it. Many community apps don’t need one: the network does the heavy lifting.', connects: 'Serves the app and handles anything that can’t happen in the browser alone.' },
    },
    es: {
      connect: { role: 'Se conecta a la red', why: 'Cómo tu app habla con la red abierta — para que tu comunidad no quede encerrada en los muros de una sola empresa.', connects: 'Todo lo demás se conecta a esto; lleva y trae las publicaciones, los mensajes y las actualizaciones.' },
      app: { role: 'La app que la gente ve y usa', why: 'Las pantallas y botones que tu comunidad realmente toca. Usamos Svelte por defecto — rápido, simple y sin dueño Big Tech.', connects: 'Muestra lo que vuelve de la red y le envía las acciones de la gente.' },
      identity: { role: 'Acceso e identidad', why: 'Permite que las personas demuestren quiénes son y mantengan sus cuentas realmente suyas.', connects: 'Firma cada acción para que la red sepa que de verdad vino de ellas.' },
      privacy: { role: 'Privacidad y cifrado', why: 'Mantiene la información sensible ilegible para cualquiera a quien no esté destinada.', connects: 'Cifra los datos antes de guardarlos o enviarlos, y los descifra solo para las personas correctas.' },
      storage: { role: 'Recuerda tus datos', why: 'Conserva las cosas entre visitas — publicaciones, registros, ajustes — para que nada se pierda.', connects: 'La app lee y escribe aquí.' },
      payments: { role: 'Pagos y propinas', why: 'Permite que la gente envíe y reciba dinero o propinas directamente, sin que un intermediario se lleve una parte.', connects: 'Añade un botón de pago/propina y lo liquida en la red Lightning.' },
      hosting: { role: 'Ejecuta el lado del servidor', why: 'Si tu herramienta necesita su propio servidor — como ejecutar un relay o una API — esto es lo que lo ejecuta. Muchas apps comunitarias no lo necesitan: la red hace el trabajo pesado.', connects: 'Sirve la app y maneja todo lo que no puede ocurrir solo en el navegador.' },
    },
    ar: {
      connect: { role: 'يتّصل بالشبكة', why: 'كيف يتحدّث تطبيقك مع الشبكة المفتوحة — حتى لا يبقى مجتمعك حبيس جدران شركة واحدة.', connects: 'كل شيء آخر يتّصل بهذا؛ فهو ينقل المنشورات والرسائل والتحديثات ذهاباً وإياباً.' },
      app: { role: 'التطبيق الذي يراه الناس ويستخدمونه', why: 'الشاشات والأزرار التي يلمسها مجتمعك فعلاً. نعتمد Svelte افتراضياً — سريع وبسيط ولا تملكه شركة تقنية كبرى.', connects: 'يعرض ما يعود من الشبكة ويُرسل إليها تصرّفات الناس.' },
      identity: { role: 'الدخول والهوية', why: 'يتيح للناس إثبات هويتهم ويبقي حساباتهم مِلكاً لهم حقاً.', connects: 'يوقّع كل إجراء حتى تعرف الشبكة أنه صدر منهم فعلاً.' },
      privacy: { role: 'الخصوصية والتشفير', why: 'يُبقي المعلومات الحسّاسة غير مقروءة لأي شخص ليست موجَّهة إليه.', connects: 'يشفّر البيانات قبل تخزينها أو إرسالها، ويفكّ تشفيرها فقط للأشخاص المناسبين.' },
      storage: { role: 'يحفظ بياناتك', why: 'يحتفظ بالأشياء بين الزيارات — المنشورات والسجلات والإعدادات — حتى لا يضيع شيء.', connects: 'يقرأ منه التطبيق ويكتب إليه.' },
      payments: { role: 'المدفوعات والإكراميات', why: 'يتيح للناس إرسال واستقبال المال أو الإكراميات مباشرة، دون وسيط يقتطع حصّة.', connects: 'يضيف زرّ دفع/إكرامية ويُسوّيه على شبكة Lightning.' },
      hosting: { role: 'يُشغّل جانب الخادم', why: 'إذا احتاجت أداتك خادمها الخاص — مثل تشغيل relay أو واجهة API — فهذا ما يُشغّله. كثير من تطبيقات المجتمع لا تحتاجه: الشبكة تقوم بالعمل الثقيل.', connects: 'يخدم التطبيق ويتولّى كل ما لا يمكن أن يحدث في المتصفح وحده.' },
    },
  };

  function protoMatch(it: Item): number { let n = 0; for (const p of protocols) if (it.protocols.includes(p)) n += 1; return n; }
  function pickPool(names: string[] | undefined, category: string | undefined, taken: Set<string>): Item[] {
    const pool: Item[] = [];
    if (names) for (const nm of names) { const it = items.find((x) => x.name.toLowerCase() === nm.toLowerCase()); if (it && !taken.has(it.name) && !pool.includes(it)) pool.push(it); }
    if (category) {
      const cat = items
        .filter((x) => x.category === category && !taken.has(x.name) && !pool.includes(x))
        // All items are already verified (#4); prefer non-advisory tools so a
        // Meta-origin entry is never the default pick when a clean one exists.
        .sort((a, b) => protoMatch(b) - protoMatch(a) || advisoryRank(a) - advisoryRank(b) || b.uses - a.uses || a.name.localeCompare(b.name));
      pool.push(...cat);
    }
    return pool;
  }

  interface Piece { capId: string; role: string; why: string; connects: string; item: Item; alts: Item[]; }
  const blueprint = $derived.by<Piece[]>(() => {
    if (!items.length) return [];
    const tx = `${problem} ${goal} ${success}`.toLowerCase();
    const taken = new Set<string>();
    const pieces: Piece[] = [];
    for (const def of CAP_DEFS) {
      if (pieces.length >= 6) break;
      if (def.protoOnly && !protoList.length) continue;
      const want = def.always || (def.protoOnly && protoList.length > 0) || (def.detect ? def.detect.test(tx) : false);
      if (!want) continue;
      const pool = pickPool(def.names?.(protocols), def.category, taken);
      if (!pool.length) continue;
      // Default to the first non-advisory option so a Meta/OpenAI/xAI-origin tool
      // (e.g. react) is never auto-selected; advisory tools remain as alternatives.
      let item = pool.find(autoPickable) ?? pool[0]!;
      const sw = swaps[def.id];
      if (sw) { const s = pool.find((x) => x.name === sw) ?? items.find((x) => x.name === sw); if (s) item = s; }
      // A swap target could collide with a tool an earlier piece already took (the
      // items.find fallback bypasses `taken`); fall back to this pool's default.
      if (taken.has(item.name)) item = pool.find(autoPickable) ?? pool[0]!;
      const alts = pool.filter((x) => x.name !== item.name).slice(0, 3);
      taken.add(item.name);
      const txt = (CAP_TEXT[lang] ?? CAP_TEXT.en)[def.id] ?? CAP_TEXT.en[def.id]!;
      pieces.push({ capId: def.id, role: txt.role, why: txt.why, connects: txt.connects, item, alts });
    }
    return pieces;
  });

  // The final tool set (drives every generated artifact): the blueprint pieces
  // still switched on, plus anything added by hand.
  const chosen = $derived.by(() => {
    const s = new Set<string>();
    for (const p of blueprint) if (!removed.has(p.capId)) s.add(p.item.name);
    for (const n of extra) s.add(n);
    return s;
  });
  const chosenItems = $derived(items.filter((it) => chosen.has(it.name)));
  // Tools the builder added by hand or seeded from the Catalog — shown in the
  // blueprint as their own pieces (not just checkboxes), with full evidence.
  const extraItems = $derived(items.filter((it) => extra.has(it.name) && !blueprint.some((p) => !removed.has(p.capId) && p.item.name === it.name)));

  // ---- Movement 2/4: receipts travel + in-browser policy re-verification ----
  // Map a catalog Item into a session stack entry carrying its license-at-commit
  // receipt + advisory, so the evidence travels with the tool into the blueprint
  // and the handoff artifacts — never asking the builder to take a README's word.
  function stackItemFrom(capId: string, reason: string, it: Item): SessionStackItem {
    return {
      capId, name: it.name, reason, catalogUrl: it.url,
      receipt: {
        license: it.license,
        commitSha: it.commit ?? null,
        sourceUrl: it.licenseUrl ?? null,
        verification: it.verification,
        advisory: it.advisory ?? null,
      },
    };
  }
  const sessionStack = $derived.by<SessionStackItem[]>(() => {
    const out: SessionStackItem[] = [];
    for (const p of blueprint) if (!removed.has(p.capId)) out.push(stackItemFrom(p.capId, p.why, p.item));
    for (const name of extra) {
      const it = items.find((x) => x.name === name);
      if (it && !out.some((s) => s.name === it.name)) out.push(stackItemFrom('extra', it.desc, it));
    }
    return out;
  });
  // Re-run the shared exclusion policy on the assembled stack, in the browser —
  // the same matchDependency() the dependency checker and the CLI engine use.
  // The catalog is already enforced at build, so this should always be clean; it
  // is the live guarantee that the handoff the builder downloads is policy-clean.
  const policyMatches = $derived.by(() => {
    if (!policyOrgs.length) return [] as Array<{ name: string; org: string }>;
    const hits: Array<{ name: string; org: string }> = [];
    for (const it of chosenItems) {
      for (const m of matchDependency({ name: it.name, ecosystem: it.ecosystem as Ecosystem, source_file: 'studio' }, policyOrgs)) {
        hits.push({ name: it.name, org: m.org_key });
      }
    }
    return hits;
  });
  const policyClean = $derived(policyOrgs.length > 0 && policyMatches.length === 0);

  // ---------- Movement 1: the live Mentor Engine (deterministic) ----------
  // Localized prompts/options/constraint phrases for the engine's IDs. The logic
  // lives in src/lib/mentor-engine.ts (model-free); this is only presentation.
  interface MentorStrings {
    heading: string; sub: string; reflectHeading: string; reflectIntro: string; skip: string;
    q: Record<string, { prompt: string; opts: Record<string, string> }>;
    c: Record<ConstraintId, string>;
  }
  const MENTOR_STR: Record<Lang, MentorStrings> = {
    en: {
      heading: 'A few quick questions', sub: 'These sharpen the plan — answer what fits, skip the rest.',
      reflectHeading: 'The real problem I’m hearing', reflectIntro: 'It sounds like you’re building something where:', skip: 'Skip',
      q: {
        'q-privacy-who': { prompt: 'Who must never be able to see who’s involved?', opts: { public: 'The general public', platform: 'Any platform or company', authorities: 'Authorities / the powerful', pseudonymous: 'A handle they choose is fine' } },
        'q-payments-flow': { prompt: 'When money moves, where should it go?', opts: { direct: 'Straight to people, no middleman', org: 'Through our organization first' } },
        'q-storage-survive': { prompt: 'If your servers went down, what must still survive?', opts: { 'must-survive': 'The data has to outlast any one server', 'on-device': 'It can live on each person’s device' } },
        'q-identity-proof': { prompt: 'How should people prove who they are?', opts: { 'own-keys': 'They hold their own keys', pseudonymous: 'A nickname they control' } },
        'q-community-own': { prompt: 'Who should be able to keep this running?', opts: { forkable: 'Anyone in the movement can fork and run it', unsure: 'Not sure yet' } },
      },
      c: {
        'anonymity-first': 'Identities must never be exposed — anonymity comes first.',
        'pseudonymous': 'People act under a handle they control, not their real name.',
        'no-platform-visibility': 'No platform or company can see who’s involved.',
        'self-sovereign-identity': 'People hold their own keys — their accounts are truly theirs.',
        'direct-payment': 'Money reaches people directly, with no middleman taking a cut.',
        'org-custody': 'Funds flow through your organization first.',
        'durable-data': 'The data must outlast any single server.',
        'local-first': 'Data can live on each person’s device.',
        'community-owned': 'Anyone can fork it and keep it running — it belongs to the movement.',
        'safety-tooling': 'It needs safeguards against abuse built in.',
      },
    },
    es: {
      heading: 'Unas preguntas rápidas', sub: 'Afinan el plan — responde lo que encaje y salta el resto.',
      reflectHeading: 'El problema real que escucho', reflectIntro: 'Parece que estás construyendo algo donde:', skip: 'Saltar',
      q: {
        'q-privacy-who': { prompt: '¿Quién nunca debe poder ver quién está involucrado?', opts: { public: 'El público en general', platform: 'Cualquier plataforma o empresa', authorities: 'Las autoridades / los poderosos', pseudonymous: 'Un alias que elijan está bien' } },
        'q-payments-flow': { prompt: 'Cuando se mueve el dinero, ¿adónde debe ir?', opts: { direct: 'Directo a las personas, sin intermediario', org: 'Primero a través de nuestra organización' } },
        'q-storage-survive': { prompt: 'Si tus servidores se cayeran, ¿qué debe sobrevivir?', opts: { 'must-survive': 'Los datos deben sobrevivir a cualquier servidor', 'on-device': 'Pueden vivir en el dispositivo de cada persona' } },
        'q-identity-proof': { prompt: '¿Cómo deben demostrar las personas quiénes son?', opts: { 'own-keys': 'Tienen sus propias claves', pseudonymous: 'Un alias que controlan' } },
        'q-community-own': { prompt: '¿Quién debería poder mantener esto en marcha?', opts: { forkable: 'Cualquiera del movimiento puede bifurcarlo y ejecutarlo', unsure: 'Aún no estoy seguro' } },
      },
      c: {
        'anonymity-first': 'Las identidades nunca deben quedar expuestas — el anonimato es lo primero.',
        'pseudonymous': 'Las personas actúan bajo un alias que controlan, no su nombre real.',
        'no-platform-visibility': 'Ninguna plataforma o empresa puede ver quién está involucrado.',
        'self-sovereign-identity': 'Las personas tienen sus propias claves — sus cuentas son realmente suyas.',
        'direct-payment': 'El dinero llega a las personas directamente, sin que un intermediario se lleve una parte.',
        'org-custody': 'Los fondos pasan primero por tu organización.',
        'durable-data': 'Los datos deben sobrevivir a cualquier servidor.',
        'local-first': 'Los datos pueden vivir en el dispositivo de cada persona.',
        'community-owned': 'Cualquiera puede bifurcarlo y mantenerlo — pertenece al movimiento.',
        'safety-tooling': 'Necesita salvaguardas contra el abuso incorporadas.',
      },
    },
    ar: {
      heading: 'بضعة أسئلة سريعة', sub: 'تُحدِّد الخطة بدقّة — أجب عمّا يناسبك وتجاوز الباقي.',
      reflectHeading: 'المشكلة الحقيقية التي أسمعها', reflectIntro: 'يبدو أنك تبني شيئاً حيث:', skip: 'تخطٍّ',
      q: {
        'q-privacy-who': { prompt: 'مَن الذي يجب ألا يستطيع أبداً معرفة هوية المشاركين؟', opts: { public: 'عامة الناس', platform: 'أي منصّة أو شركة', authorities: 'السلطات / أصحاب النفوذ', pseudonymous: 'يكفي اسم مستعار يختارونه' } },
        'q-payments-flow': { prompt: 'عندما تتحرّك الأموال، إلى أين يجب أن تذهب؟', opts: { direct: 'مباشرة إلى الناس، دون وسيط', org: 'عبر منظّمتنا أولاً' } },
        'q-storage-survive': { prompt: 'لو تعطّلت خوادمك، ما الذي يجب أن يبقى؟', opts: { 'must-survive': 'يجب أن تبقى البيانات رغم أي خادم', 'on-device': 'يمكن أن تعيش على جهاز كل شخص' } },
        'q-identity-proof': { prompt: 'كيف ينبغي للناس إثبات هويتهم؟', opts: { 'own-keys': 'يملكون مفاتيحهم الخاصة', pseudonymous: 'اسم مستعار يتحكّمون به' } },
        'q-community-own': { prompt: 'مَن الذي ينبغي أن يستطيع إبقاء هذا قيد التشغيل؟', opts: { forkable: 'أي شخص في الحركة يمكنه نسخه وتشغيله', unsure: 'لست متأكداً بعد' } },
      },
      c: {
        'anonymity-first': 'يجب ألا تُكشف الهويات أبداً — إخفاء الهوية أولاً.',
        'pseudonymous': 'يتصرّف الناس باسم مستعار يتحكّمون به، لا باسمهم الحقيقي.',
        'no-platform-visibility': 'لا يمكن لأي منصّة أو شركة معرفة المشاركين.',
        'self-sovereign-identity': 'يملك الناس مفاتيحهم الخاصة — حساباتهم مِلكهم حقاً.',
        'direct-payment': 'تصل الأموال إلى الناس مباشرة، دون وسيط يقتطع حصّة.',
        'org-custody': 'تمرّ الأموال عبر منظّمتك أولاً.',
        'durable-data': 'يجب أن تبقى البيانات رغم أي خادم منفرد.',
        'local-first': 'يمكن أن تعيش البيانات على جهاز كل شخص.',
        'community-owned': 'يمكن لأي شخص نسخه وإبقاؤه يعمل — إنه مِلك الحركة.',
        'safety-tooling': 'يحتاج إلى وسائل حماية من إساءة الاستخدام مدمجة.',
      },
    },
  };

  let mentorAnswers = $state<Record<string, string>>({});
  const signals = $derived(detectSignals(`${problem} ${goal} ${success}`, [...protocols]));
  const mentorQuestions = $derived(problem.trim().length > 8 ? pickQuestions(signals, mentorAnswers) : []);
  const reflection = $derived(problem.trim().length > 8 ? reflect(signals, mentorAnswers) : { signals: [], constraints: [] as ConstraintId[] });
  const m = $derived(MENTOR_STR[lang] ?? MENTOR_STR.en);
  function answerMentor(qid: string, oid: string) { mentorAnswers = { ...mentorAnswers, [qid]: oid }; }

  // Clear the whole build session and start fresh — so the persisted draft is
  // never a trap the builder can't escape.
  function startOver() {
    clearSession();
    projectName = ''; problem = ''; goal = ''; success = '';
    protocols = new Set(['nostr']); swaps = {}; removed = new Set(); extra = new Set();
    seededTool = null; mentorAnswers = {}; authoredSkills = []; customSkills = {};
    handoff = 'zip'; step = 1;
  }

  // ---------- Movement 2: advisories + deterministic chemistry ----------
  const ADV: Record<Lang, { worksWith: string; conflict: string; metaOrigin: string; dormant: string; abandoned: string; providerPicker: string }> = {
    en: { worksWith: 'Works with', conflict: 'Two tools here do the same job — you usually need only one:', metaOrigin: 'Built by Meta — admitted only because it’s permissively licensed and routes no data to them.', dormant: 'Looks dormant — check it’s still maintained before depending on it.', abandoned: 'Looks abandoned — prefer an active alternative if you can.', providerPicker: 'Has a model-provider picker — lock it to permitted providers (never OpenAI / xAI).' },
    es: { worksWith: 'Funciona con', conflict: 'Dos herramientas aquí hacen lo mismo — normalmente solo necesitas una:', metaOrigin: 'Hecha por Meta — admitida solo porque tiene licencia permisiva y no le envía datos.', dormant: 'Parece inactiva — comprueba que siga mantenida antes de depender de ella.', abandoned: 'Parece abandonada — prefiere una alternativa activa si puedes.', providerPicker: 'Tiene un selector de proveedor de modelo — bloquéalo a proveedores permitidos (nunca OpenAI / xAI).' },
    ar: { worksWith: 'يعمل مع', conflict: 'أداتان هنا تؤدّيان الوظيفة نفسها — عادةً تحتاج واحدة فقط:', metaOrigin: 'من صنع Meta — قُبِلت فقط لأنها بترخيص متساهل ولا تُرسل أي بيانات إليها.', dormant: 'تبدو خاملة — تأكّد من أنها ما زالت مُصانة قبل الاعتماد عليها.', abandoned: 'تبدو مهجورة — يُفضَّل بديل نشط إن أمكن.', providerPicker: 'تحتوي على مُحدِّد مزوّد نماذج — اقفله على المزوّدين المسموح بهم (أبداً OpenAI / xAI).' },
  };
  const adv = $derived(ADV[lang] ?? ADV.en);
  function advisoriesFor(it: Item): string[] {
    const out: string[] = [];
    if (it.advisory === 'meta') out.push(adv.metaOrigin);
    if (it.maintenance === 'dormant') out.push(adv.dormant);
    if (it.maintenance === 'abandoned') out.push(adv.abandoned);
    if (it.providerAgnostic) out.push(adv.providerPicker);
    return out;
  }
  const stackTools = $derived.by(() => {
    const out: { name: string; capId: string; category?: string; ecosystem?: string; protocols?: string[] }[] = [];
    for (const p of blueprint) if (!removed.has(p.capId)) out.push({ name: p.item.name, capId: p.capId, category: p.item.category, ecosystem: p.item.ecosystem, protocols: p.item.protocols });
    for (const name of extra) { const it = items.find((x) => x.name === name); if (it) out.push({ name: it.name, capId: 'extra', category: it.category, ecosystem: it.ecosystem, protocols: it.protocols }); }
    return out;
  });
  const chem = $derived(chemistry(stackTools));

  // Advanced escape hatch: search the full catalog by hand.
  const addResults = $derived.by(() => {
    const q = addQuery.trim().toLowerCase();
    return q ? items.filter((it) => `${it.name} ${it.desc}`.toLowerCase().includes(q)).slice(0, 8) : ([] as Item[]);
  });

  function toggleProto(p: string) { const n = new Set(protocols); n.has(p) ? n.delete(p) : n.add(p); protocols = n; swaps = {}; removed = new Set(); }
  function togglePiece(capId: string) { const n = new Set(removed); n.has(capId) ? n.delete(capId) : n.add(capId); removed = n; }
  function swapPiece(capId: string, name: string) { swaps = { ...swaps, [capId]: name }; const n = new Set(removed); n.delete(capId); removed = n; }
  function toggleTool(name: string) { const n = new Set(extra); n.has(name) ? n.delete(name) : n.add(name); extra = n; }

  // ---------- generated artifacts ----------
  const constitution = $derived(`# Project constitution — ${projectName || slug}

Binding on every spec, plan, and task. Agents read this first and do not override
it without explicit human consent.

## Article 0 — Intent (the goal behind the work)
This project exists to: ${goal || problem || '<state the real goal>'}.
Success means: ${success || '<define success at the level of purpose, not task completion>'}.
Optimize for this intent, never a convenient proxy. When a task conflicts with this
goal, the goal wins — surface the conflict instead of silently trading it away.

## Article I — Provider exclusion (non-negotiable)
No dependency, directly or transitively, may be owned by Meta, OpenAI, or xAI, and
no code may call their endpoints. Enforce before every commit:
    npm run enforce
Any AI assistance must use a permitted, bring-your-own-key provider (Anthropic,
DeepSeek, Kimi, OpenRouter, or local Ollama).

## Article II — Licensing
Every dependency carries an OSI-approved license, verified at a commit.

## Article III — Protocol correctness
${protoList.length ? protoList.map((p) => `- ${p}: follow its spec/NIPs; surface auth failures; use audited crypto.${p === 'nostr' ? ' Use @nostr-dev-kit/ndk (NDK) as the primary SDK.' : ''}${p === 'atproto' ? ' Use @atproto/api as the primary SDK; prefer OAuth (DPoP) over App Passwords.' : ''}`).join('\n') : "- Follow each protocol's spec; surface auth failures; use audited crypto."}

## Article IV — Operational discipline (the long-tail rules)
- Rate limiting on every public endpoint, from day one.
- Authentication paths are tested.
- No silent failures on the trust path (signing, auth, key handling).
- Minimize user data; store keys client-side; never route user content through a third-party model.

## Article V — Verifiability
Ship a stable, auditable artifact: pinned, license-verified dependencies, a real
license, and a green enforcement run.

## Article VI — The builder's methods (skills)
Read every \`skills/*.SKILL.md\` before acting. These encode the builder's own
methods, field guides, and operating procedures — follow them as written; do not
quietly substitute your own approach. If a skill conflicts with a task, surface
the conflict and ask. (Generate skills from your own manuals with the
knowledge-to-skills-pipeline.)
`);

  const spec = $derived(`# Spec: ${projectName || slug}

## Problem
${problem || '<the community problem in one paragraph>'}

## Goal behind it (intent)
${goal || '<the real objective — not a convenient proxy>'}

## Success looks like
${success || '<the non-negotiable success criteria>'}
${reflection.constraints.length ? `
## Non-negotiable constraints (surfaced by the Socratic intake)
${reflection.constraints.map((c) => `- ${m.c[c]}`).join('\n')}
` : ''}
## Protocols
${protoList.length ? protoList.join(', ') : 'general'}

## Stack (policy-clean — no Meta/OpenAI/xAI; ★ = human-verified, the rest passed automated screening and are pending verification)
${chosenItems.map((it) => `- ${it.verification === 'verified' ? '★ ' : ''}${it.name} (${it.ecosystem}, ${it.license}${it.commit ? `, license @ ${it.commit.slice(0, 7)}` : ''})${it.advisory ? ` [${it.advisory}-origin advisory; permissively licensed]` : ''} — ${it.desc}`).join('\n') || '- <select tools>'}
`);

  const jsDeps = $derived(chosenItems.filter((it) => it.ecosystem === 'js'));
  const otherDeps = $derived(chosenItems.filter((it) => it.ecosystem !== 'js'));

  // #3 — pin each JS dep to the concrete, license-verified version recorded on its
  // catalog entry (frontmatter `version`) instead of unbounded `latest`. This is a
  // pure client-side read of already-loaded catalog data — no per-dependency
  // network call, so the user's stack composition never leaves the browser.
  const packageJson = $derived(JSON.stringify({
    name: slug, version: '0.1.0', private: true, type: 'module',
    engines: { node: '>=22.12.0' },
    scripts: { enforce: 'node scripts/enforce.mjs' },
    dependencies: pinnedDependencies(jsDeps),
  }, null, 2) + '\n');

  // A self-contained policy check that ships INSIDE the starter, so the command
  // the docs tell people to run actually exists (#3). No extra deps: it fetches
  // the live excluded-org policy and fails on any direct Meta/OpenAI/xAI dep.
  const enforceScript = `#!/usr/bin/env node
// Policy check for this starter — fetches the live excluded-organizations policy
// from wecanjustbuildthings.dev and fails if any DIRECT dependency is owned by
// Meta, OpenAI, or xAI. (The full multi-layer engine, incl. transitive scanning,
// lives at the site; this is the Layer-1 direct check — enough to keep a starter
// honest. Run before every commit: npm run enforce)
import { readFileSync } from 'node:fs';

const POLICY_URL = 'https://wecanjustbuildthings.dev/policy.json';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });

const res = await fetch(POLICY_URL).catch(() => null);
if (!res || !res.ok) {
  console.error('Could not fetch the policy from ' + POLICY_URL + ' — check your connection and retry.');
  process.exit(1);
}
const { orgs } = await res.json();

const findings = [];
for (const dep of deps) {
  const name = dep.toLowerCase();
  for (const org of orgs) {
    const scopes = (org.npm_scopes ?? []).map((s) => s.toLowerCase());
    const packages = (org.npm_packages ?? []).map((s) => s.toLowerCase());
    if (packages.includes(name) || scopes.some((s) => name === s || name.startsWith(s + '/'))) {
      findings.push(dep + ' -> ' + (org.key ?? org.display_name));
    }
  }
}

if (findings.length) {
  console.error('\\u2717 Excluded-org dependencies found (Meta/OpenAI/xAI):');
  for (const f of findings) console.error('  - ' + f);
  process.exit(1);
}
console.log('\\u2713 ' + deps.length + ' direct dependencies clean - no Meta/OpenAI/xAI.');
`;

  const agentPrompt = $derived(`You are building "${projectName || slug}".

PROBLEM: ${problem || '<the community problem>'}
GOAL BEHIND IT (optimize for this, not a proxy): ${goal || problem || '<the real objective>'}
SUCCESS LOOKS LIKE: ${success || '<the non-negotiable success criteria>'}
PROTOCOLS: ${protoList.length ? protoList.join(', ') : 'general'}

RULES (binding — see constitution.md):
- Read .specify/memory/constitution.md FIRST and never violate it.
- Read skills/*.SKILL.md and follow the builder's own methods exactly; if a skill conflicts with a task, surface it and ask.
- Use ONLY these policy-clean dependencies (no Meta/OpenAI/xAI, screened by enforcement). ★ = human-verified; the rest passed automated policy screening and are pending verification — prefer ★ where a choice exists:
${chosenItems.map((it) => `    - ${it.verification === 'verified' ? '★ ' : ''}${it.name} (${it.ecosystem})${it.advisory ? ` [${it.advisory}-origin advisory]` : ''}`).join('\n') || '    - <none selected>'}
${protocols.has('nostr') ? '- For Nostr, use @nostr-dev-kit/ndk (NDK) as the primary SDK for relays, subscriptions, and signers.\n' : ''}${protocols.has('atproto') ? '- For AT Protocol, use @atproto/api as the primary SDK; prefer OAuth (DPoP) over App Passwords.\n' : ''}- No dependency or provider owned by Meta, OpenAI, or xAI — directly or transitively.
- Run \`npm run enforce\` before every commit. Add rate
  limiting, test auth paths, and never swallow trust-path errors.

Start by writing specs/001-${slug}/plan.md from the spec, then tasks.md, then implement task by task, keeping each change green.`);

  // Movement 4 — the Goose recipe, assembled by the pure serializer (Slice B): the
  // agent prompt + a Catalog-allowlisted extension set + a forced response.json_schema,
  // model-agnostic (the user's Goose config picks the model). One recipe object drives
  // both the YAML download and the goose:// deeplink + explain panel (Slice C).
  const gooseRecipeObj = $derived(buildGooseRecipe(
    { title: projectName || slug, slug, prompt: agentPrompt, extensions: sessionExtensions, persona: mentorPersonaSkill(lang) },
    allowlist,
  ));
  const gooseRecipe = $derived(recipeToYaml(gooseRecipeObj));
  const gooseLink = $derived(recipeDeeplink(gooseRecipeObj));
  const gooseExplain = $derived(explainRecipe(gooseRecipeObj));

  const readme = $derived(`# ${projectName || slug}

${problem || 'A freedom-tech project.'}

Scaffolded by wecanjustbuildthings.dev — every dependency is screened against the
Meta/OpenAI/xAI exclusion policy.

## Stack
${chosenItems.map((it) => `- [${it.name}](${it.repo || it.url}) — ${it.desc}`).join('\n') || '- (none)'}

## Build it with an agent
1. Configure your agent (Goose or Claude Code) with a permitted, BYOK provider.
2. Paste AGENT_PROMPT.txt (or open .specify/).
3. Keep every change green: \`npm run enforce\`

## Your methods (skills)
Put your own know-how in \`skills/*.SKILL.md\` and the agent will follow it.
Generate skills from your manuals with the knowledge-to-skills-pipeline — see
https://wecanjustbuildthings.dev/guides/knowledge-to-skills/

## Non-JS dependencies
${otherDeps.map((it) => `- ${it.name} (${it.ecosystem})`).join('\n') || '- (none)'}
`);

  // The skills/ folder turns the builder's own know-how into instructions the
  // agent follows. Populated from their manuals via the knowledge-to-skills-pipeline.
  const skillsReadme = `# skills/

Drop your agent skills here as \`*.SKILL.md\` files. Each one teaches your agent
one of YOUR methods — a field guide, an SOP, a checklist — so it works your way,
every time, instead of guessing.

Your constitution and AGENT_PROMPT already tell the agent to read this folder
first and follow these methods.

Generate skills from your own manuals and guides with the knowledge-to-skills-pipeline:
https://github.com/MartinMontero/knowledge-to-skills-pipeline

See https://wecanjustbuildthings.dev/guides/knowledge-to-skills/ for the full how-to.
Format: YAML frontmatter (name, description, attribution) + your method in plain
language. See example.SKILL.md.
`;
  const skillExample = `---
name: example-method
description: Replace this with one of your own methods — a checklist, an SOP, a field-guide procedure.
attribution:
  source: "Where this knowledge comes from (a manual, a person, a toolkit)"
  license: CC-BY-SA-4.0
---

# Example: your method, written once

Write your method in plain steps. The agent follows it exactly.

1. State the first step the way you'd tell a new member.
2. Note anything that must NEVER happen (privacy, safety, trust).
3. End with how you know it was done right.

Delete this file once you've added your real skills (generate them from your
manuals with the knowledge-to-skills-pipeline).
`;

  function starterFiles(): Record<string, string> {
    const files: Record<string, string> = {
      'README.md': readme,
      'package.json': packageJson,
      'scripts/enforce.mjs': enforceScript,
      'AGENT_PROMPT.txt': agentPrompt,
      '.specify/memory/constitution.md': constitution,
      [`specs/001-${slug}/spec.md`]: spec,
      [`${slug}.goose-recipe.yaml`]: gooseRecipe,
      '.claude/CLAUDE.md': `# Project context\n\nRead @.specify/memory/constitution.md first; read skills/*.SKILL.md and follow them; run \`npm run enforce\` before committing.\n`,
      'skills/README.md': skillsReadme,
      // The mentor persona (Slice D): the Socratic-mentor frame for file-based agents
      // (Claude Code reads skills/*.SKILL.md); the deeplink recipe carries it inline.
      'skills/mentor.SKILL.md': skillToMd(mentorPersonaSkill(lang)),
      // The example is just a placeholder; once the builder has real skills, ship those instead.
      ...(skillCount ? {} : { 'skills/example.SKILL.md': skillExample }),
      ...customSkills,
    };
    return files;
  }

  let copied = $state('');
  async function copy(label: string, text: string) {
    try { await navigator.clipboard.writeText(text); copied = label; setTimeout(() => (copied = ''), 1500); } catch { copied = ''; }
  }
  function blobDownload(name: string, text: string, type = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function downloadZip() {
    const files: Record<string, Uint8Array> = {};
    for (const [p, c] of Object.entries(starterFiles())) files[p] = strToU8(c);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' }));
    a.download = `${slug}-starter.zip`; a.click(); URL.revokeObjectURL(a.href);
  }

  // ---------- GitHub one-click ----------
  let ghConfigured = $state<boolean | null>(null);
  let ghConnected = $state(false);
  let ghBusy = $state(false);
  let ghResult = $state('');
  $effect(() => {
    if (handoff === 'github' && ghConfigured === null) {
      fetch('/api/github/status').then((r) => r.json()).then((d) => (ghConfigured = !!d.configured)).catch(() => (ghConfigured = false));
    }
  });
  function ghConnect() {
    sessionStorage.setItem('wcb_files', JSON.stringify(starterFiles()));
    sessionStorage.setItem('wcb_slug', slug);
    location.href = `/api/github/start?redirect=${encodeURIComponent('/build/')}`;
  }
  async function ghCreate() {
    ghBusy = true; ghResult = '';
    const files = JSON.parse(sessionStorage.getItem('wcb_files') || JSON.stringify(starterFiles()));
    const repo = sessionStorage.getItem('wcb_slug') || slug;
    try {
      const res = await fetch('/api/github/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repo, files }) });
      const d = await res.json();
      ghResult = d.url ? `created:${d.url}` : `error:${d.error || 'failed'}`;
    } catch (e) { ghResult = `error:${e}`; } finally { ghBusy = false; }
  }

  // ---------- AI model picker (BYOK kickoff) ----------
  // Each option is framed in the project's ethos: accountable training, open
  // weights you can self-host, or a neutral router constrained to permitted
  // models. No Meta / OpenAI / xAI model is offered or reachable.
  interface ModelOpt { id: string; label: string; note: string }
  const MODELS: Record<string, ModelOpt[]> = {
    anthropic: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable', note: 'Top capability for hard planning and refactors. Trained with Constitutional AI — a published, inspectable value set — which fits a tool built to be accountable by default. Your key, your data, no middle layer.' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced (recommended)', note: 'The everyday default: fast and strong for building, at lower cost than Opus. Same values alignment.' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fastest', note: 'Cheapest and quickest — ideal for tight edit/run loops and small teams watching their budget.' },
    ],
    deepseek: [
      { id: 'deepseek-chat', label: 'DeepSeek V3 — open weights', note: 'Open-weight: you can download and self-host it, so you are never locked to one vendor. The strongest sovereignty story here — own your whole stack.' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1 — open-weight reasoner', note: 'Open-weight reasoning model for harder planning steps. Self-hostable, same independence from any platform.' },
    ],
    openrouter: [
      { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6 (via OpenRouter)', note: 'A neutral router so you avoid single-vendor lock-in. We constrain it to permitted models — Meta, OpenAI, and xAI are refused even if requested.' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3 (via OpenRouter)', note: 'Open-weight model through the router — pay-as-you-go without a separate account per provider.' },
      { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B (via OpenRouter)', note: 'Open-weight alternative; routing stays within permitted, non-excluded providers.' },
    ],
  };

  // ---------- BYOK kickoff ----------
  let kProvider = $state('anthropic');
  let kModel = $state<string>(MODELS.anthropic[0]!.id);
  const kModels = $derived(MODELS[kProvider] ?? []);
  // Keep the selected model valid when the provider changes.
  $effect(() => { if (!kModels.some((m) => m.id === kModel)) kModel = kModels[0]?.id ?? ''; });
  const kModelNote = $derived(kModels.find((m) => m.id === kModel)?.note ?? '');
  let kKey = $state('');
  let kBusy = $state(false);
  let kOutput = $state('');
  let kError = $state('');
  async function kickoffRun() {
    kBusy = true; kOutput = ''; kError = '';
    const prompt = `${constitution}\n\n---\n\n${spec}\n\n---\n\nProduce specs/001-${slug}/plan.md: a concrete, step-by-step implementation plan honoring the constitution above (especially Article 0 intent and Article I exclusions). Then list the first 5 implementation tasks. Output Markdown only.`;
    try {
      const res = await fetch('/api/agent/kickoff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: kProvider, model: kModel, apiKey: kKey, prompt }) });
      const d = await res.json();
      if (d.output) kOutput = d.output; else kError = d.error + (d.detail ? `: ${JSON.stringify(d.detail).slice(0, 200)}` : '');
    } catch (e) { kError = String(e); } finally { kBusy = false; }
  }

  // ---------- AI refinement (Morpheus → JARVIS): Socratic questions, then
  // grounded, gated proposals. The model only ever sees real, pre-screened
  // catalog tools and may only reference them by exact name; every suggestion is
  // verified against the catalog before the builder sees it, and nothing is ever
  // applied without an explicit click. The model advises; the builder decides. ----------
  interface Proposal { action: 'add' | 'remove' | 'swap'; name: string; from?: string; why: string; tradeoff?: string }
  type AiPhase = 'idle' | 'questions' | 'proposals';
  const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish', ar: 'Arabic' };
  let aiPhase = $state<AiPhase>('idle');
  let aiBusy = $state(false);
  let aiError = $state('');
  let aiQuestions = $state<string[]>([]);
  let aiAnswers = $state<string[]>([]);
  let aiProposals = $state<Proposal[]>([]);
  let aiApplied = $state<Set<number>>(new Set());

  // Pipeline output, wired into the loop: skills drafted from the builder's own
  // described methods, plus a couple of ready-made starter skills. Adding one
  // writes a SKILL.md (the knowledge-to-skills-pipeline format) into the starter.
  let aiSkills = $state<DraftSkill[]>([]);
  let customSkills = $state<Record<string, string>>({});
  const STARTER_SKILLS: DraftSkill[] = [
    { name: 'tenant-intake', description: 'Take a housing or eviction report without exposing the tenant.', source: 'Tenant-organizing field practice',
      method: [
        'Use a chosen handle, never a legal name, until trust is established.',
        'Record the building and the issue — not the unit number — at first contact.',
        'Encrypt every record; only two named organizers hold the key.',
        'Ask, in the tenant’s own words, what they want to happen next.',
        'Never share identifying details outside the two key-holders without consent.',
      ] },
    { name: 'safe-data-handling', description: 'Hold sensitive community data so it can’t be turned against people.', source: 'Movement data-minimization practice',
      method: [
        'Collect the minimum — if you don’t need it, don’t store it.',
        'Encrypt at rest and in transit; keep keys client-side, never on a shared server.',
        'Name exactly who can access what, and review that list regularly.',
        'Support deletion on request and on a schedule.',
        'Assume anything you keep could be subpoenaed — design as if it will be.',
      ] },
  ];
  function addSkill(s: DraftSkill) {
    customSkills = { ...customSkills, [`skills/${slugifySkill(s.name)}.SKILL.md`]: skillToMd(s) };
  }
  const skillCount = $derived(Object.keys(customSkills).length);

  // ---------- Movement 3: the inline Skills Creator (capture your knowledge) ----------
  // The builder knows something about their community/safety/problem the agent
  // doesn't. Capture it here as a reusable skill — emitted as a SKILL.md into the
  // starter repo and carried in the build session. Deterministic template, no model.
  let authoredSkills = $state<DraftSkill[]>([]);
  let skName = $state(''); let skDesc = $state(''); let skSteps = $state(''); let skSource = $state('');
  function captureSkill() {
    const method = skSteps.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!skName.trim() || !method.length) return;
    const s: DraftSkill = { name: skName.trim(), description: skDesc.trim() || skName.trim(), method, source: skSource.trim() || undefined };
    authoredSkills = [...authoredSkills.filter((x) => slugifySkill(x.name) !== slugifySkill(s.name)), s];
    addSkill(s);
    skName = ''; skDesc = ''; skSteps = ''; skSource = '';
  }
  function removeAuthored(name: string) {
    authoredSkills = authoredSkills.filter((x) => x.name !== name);
    const key = `skills/${slugifySkill(name)}.SKILL.md`;
    const { [key]: _removed, ...rest } = customSkills;
    customSkills = rest;
  }

  // The constrained menu the model may choose from: the current pieces and their
  // alternatives, plus the strongest tools in each relevant capability category.
  // Everything here is already in the verified, policy-screened catalog.
  const AI_CATS = ['Frameworks & Libraries', 'Auth Identity & Keys', 'Security & Privacy', 'Databases & Storage', 'Bitcoin Lightning Nostr', 'Hosting Infra & Deploy', 'Dev Environment & Tooling'];
  const aiCandidates = $derived.by<Item[]>(() => {
    if (!items.length) return [];
    const out = new Map<string, Item>();
    const add = (it: Item) => { if (!out.has(it.name)) out.set(it.name, it); };
    for (const p of blueprint) { add(p.item); p.alts.forEach(add); }
    for (const c of AI_CATS) {
      // Don't offer Meta/OpenAI/xAI-origin tools as new suggestions (they're in
      // the catalog only with an advisory); the mentor shouldn't push them.
      items.filter((x) => x.category === c && !x.advisory)
        .sort((a, b) => protoMatch(b) - protoMatch(a) || b.uses - a.uses)
        .slice(0, 8).forEach(add);
    }
    return [...out.values()].slice(0, 50);
  });

  function intentBlock(): string {
    return `PROJECT: ${projectName || slug}\nPROBLEM: ${problem || '(not given)'}\nGOAL: ${goal || '(not given)'}\nSUCCESS: ${success || '(not given)'}\nNETWORKS: ${protoList.join(', ') || 'general'}`;
  }
  function planBlock(): string {
    return blueprint.filter((p) => !removed.has(p.capId)).map((p) => `- ${p.role}: ${p.item.name} (${p.item.license})`).join('\n') || '- (nothing yet)';
  }
  const MENTOR = 'You are a wise, calm mentor for community organizers and non-developers building freedom tech — think Morpheus, not Clippy. You help people see their own intent more clearly. You never lecture, never hype, never pad. You value accuracy, security, and the project ethos (no tools owned by Meta, OpenAI, or xAI) over sounding agreeable.';

  function socraticPrompt(): string {
    return `${MENTOR}\n\n${intentBlock()}\n\nCURRENT PLAN:\n${planBlock()}\n\nAsk 3 to 5 short, plain-language questions that surface things this builder probably has not said yet but that would change what they should build — for example: who must NEVER see this data, whether people are on cheap phones or offline, what happens if it suddenly gets popular, what must still work in a year, accessibility, or safety. Tailor every question to THIS project; no generic questions. One sentence each, no jargon, no preamble.\n\nRespond in ${LANG_NAME[lang]}. Output ONLY a JSON object: {"questions": ["...", "..."]}`;
  }
  function proposalPrompt(): string {
    const qa = aiQuestions.map((q, i) => `Q: ${q}\nA: ${aiAnswers[i]?.trim() || '(skipped)'}`).join('\n');
    const cands = aiCandidates.map((c) => `- ${c.name} | ${c.category} | ${c.license} | ${c.verification} | ${(c.desc || '').slice(0, 90)}`).join('\n');
    return `${MENTOR} The builder answered your questions. Suggest concrete refinements to their plan — but only what genuinely helps.\n\n${intentBlock()}\n\nCURRENT PLAN:\n${planBlock()}\n\nTHEIR ANSWERS:\n${qa}\n\nYou may ONLY recommend tools from this CANDIDATES list, by their exact name. Never invent a tool, and never propose anything owned by Meta, OpenAI, or xAI.\nCANDIDATES:\n${cands}\n\nALSO: if the builder described a repeatable method, process, or checklist OF THEIR OWN (an intake process, a moderation flow, a safety protocol, a verification routine), draft it as a "skill" — a short name, a one-line description, and 3 to 7 plain steps in THEIR words. Only capture methods they actually described or clearly implied; never invent domain procedures you don't have. If none, return an empty array. Example skill: {"name":"tenant-intake","description":"Take a housing report without exposing the tenant.","method":["Use a chosen handle, not a legal name.","Record the building, not the unit, at first.","Encrypt everything; two organizers hold keys."]}\n\nRules:\n- Prefer fewer tools. It is good to suggest nothing if the plan is already right (return empty arrays).\n- For each tool suggestion: a plain-language reason a non-developer understands, and an honest trade-off.\n- You advise; the builder decides. Be honest over agreeable.\n\nRespond in ${LANG_NAME[lang]}. Output ONLY a JSON object:\n{"proposals": [{"action": "add" | "swap" | "remove", "name": "<exact candidate name>", "from": "<name being replaced, swap only>", "why": "...", "tradeoff": "..."}], "skills": [{"name": "kebab-case-name", "description": "...", "method": ["step", "step"]}]}`;
  }

  async function callModel(prompt: string): Promise<string> {
    const res = await fetch('/api/agent/kickoff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: kProvider, model: kModel, apiKey: kKey, prompt }) });
    const d = await res.json();
    if (typeof d.output === 'string') return d.output;
    throw new Error(d.error || 'failed');
  }
  function parseObj(text: string): any {
    const m = text.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : text);
  }

  async function aiAsk() {
    if (!kKey) { aiError = t.refineNeedKey; return; }
    aiBusy = true; aiError = ''; aiProposals = []; aiSkills = []; aiApplied = new Set();
    try {
      const j = parseObj(await callModel(socraticPrompt()));
      aiQuestions = (Array.isArray(j.questions) ? j.questions : []).map(String).slice(0, 5);
      aiAnswers = aiQuestions.map(() => '');
      aiPhase = 'questions';
    } catch { aiError = t.refineErr; } finally { aiBusy = false; }
  }
  async function aiPropose() {
    aiBusy = true; aiError = ''; aiApplied = new Set();
    try {
      const j = parseObj(await callModel(proposalPrompt()));
      const raw: any[] = Array.isArray(j.proposals) ? j.proposals : [];
      // Verification gate: keep only proposals whose tool is a real catalog entry
      // (catalog membership === already policy-screened). Canonicalize the name.
      aiProposals = raw
        .map((p) => {
          const it = items.find((x) => x.name.toLowerCase() === String(p?.name || '').toLowerCase());
          if (!it) return null;
          if (p.action === 'swap' && !blueprint.some((b) => !removed.has(b.capId) && b.item.name === p.from)) return null;
          return { action: ['add', 'remove', 'swap'].includes(p.action) ? p.action : 'add', name: it.name, from: p.from, why: String(p.why || ''), tradeoff: p.tradeoff ? String(p.tradeoff) : undefined } as Proposal;
        })
        .filter((p): p is Proposal => p !== null)
        .slice(0, 6);
      // Pipeline output: skills the model drafted from the builder's own words.
      const rawSkills: any[] = Array.isArray(j.skills) ? j.skills : [];
      aiSkills = rawSkills
        .filter((s) => s && s.name && Array.isArray(s.method) && s.method.length)
        .map((s) => ({ name: String(s.name), description: String(s.description || ''), method: s.method.map(String).slice(0, 8) }))
        .slice(0, 3);
      aiPhase = 'proposals';
    } catch { aiError = t.refineErr; } finally { aiBusy = false; }
  }
  function applyProposal(p: Proposal, i: number) {
    // Apply idempotently (fix carried over from main's review pass): 'add'/'remove'
    // on a blueprint piece set its removed-state directly — toggling could re-add a
    // piece the builder already removed, or strike out one they kept. Only
    // non-piece tools touch the extra set.
    const pieceFor = (name: string) => blueprint.find((b) => b.item.name === name);
    if (p.action === 'add') {
      const bp = pieceFor(p.name);
      if (bp) { const r = new Set(removed); r.delete(bp.capId); removed = r; }
      else { const n = new Set(extra); n.add(p.name); extra = n; }
    } else if (p.action === 'remove') {
      const bp = pieceFor(p.name);
      if (bp) { const r = new Set(removed); r.add(bp.capId); removed = r; }
      else { const n = new Set(extra); n.delete(p.name); extra = n; }
    } else if (p.action === 'swap') {
      const bp = pieceFor(p.from ?? '');
      if (bp) swapPiece(bp.capId, p.name); else { const n = new Set(extra); n.add(p.name); extra = n; }
    }
    const a = new Set(aiApplied); a.add(i); aiApplied = a;
  }
</script>

<div class="studio" dir={rtl ? 'rtl' : 'ltr'}>
  <div class="langbar">
    {#if problem.trim() || extra.size || authoredSkills.length}
      <button class="lang start-over" onclick={startOver}>↺ {t.startOver}</button>
    {/if}
    {#each ['en', 'es', 'ar'] as l}
      <button class="lang" class:on={lang === l} onclick={() => (lang = l as Lang)} aria-pressed={lang === l}>{l === 'en' ? 'English' : l === 'es' ? 'Español' : 'العربية'}</button>
    {/each}
  </div>

  <ol class="steps" aria-label="Progress">
    <li class:on={step === 1}><button onclick={() => (step = 1)}>{t.s1}</button></li>
    <li class:on={step === 2}><button onclick={() => (step = 2)} disabled={loading}>{t.s2}</button></li>
    <li class:on={step === 3}><button onclick={() => (step = 3)} disabled={loading}>{t.s3}</button></li>
  </ol>

  {#if step === 1}
    <section class="panel">
      <p class="hint">{t.tenq} <a href="/method/ten-questions/">↗</a></p>
      <label class="field"><span>{t.problem}</span><textarea bind:value={problem} rows="3" placeholder="e.g. Tenants need to document evictions without exposing who they are."></textarea></label>
      <div class="examples">
        <span class="hint">{t.examples}</span>
        <div class="chips">{#each EXAMPLES as ex}<button class="chip ex" onclick={() => (problem = ex)}>{ex}</button>{/each}</div>
      </div>
      <div class="field"><span>{t.protocols}</span>
        <div class="chips">{#each ALL_PROTOCOLS as p}<button class="chip" class:on={protocols.has(p)} onclick={() => toggleProto(p)} aria-pressed={protocols.has(p)}>{p}</button>{/each}</div>
        <p class="hint">{t.protoHelp}</p>
      </div>

      {#if mentorQuestions.length || reflection.constraints.length}
        <div class="mentor">
          {#if mentorQuestions.length}
            <p class="mentor-head"><strong>{m.heading}</strong></p>
            <p class="hint">{m.sub}</p>
            {#each mentorQuestions as q (q.id)}
              <fieldset class="mentor-q">
                <legend>{m.q[q.id].prompt}</legend>
                <div class="chips">
                  {#each q.options as o (o.id)}
                    <button type="button" class="chip" class:on={mentorAnswers[q.id] === o.id} aria-pressed={mentorAnswers[q.id] === o.id} onclick={() => answerMentor(q.id, o.id)}>{m.q[q.id].opts[o.id]}</button>
                  {/each}
                  <button type="button" class="chip mentor-skip" onclick={() => answerMentor(q.id, '__skip')}>{m.skip}</button>
                </div>
              </fieldset>
            {/each}
          {/if}
          {#if reflection.constraints.length}
            <div class="reflect" role="status" aria-live="polite">
              <p class="reflect-head"><strong>{m.reflectHeading}</strong></p>
              <p>{m.reflectIntro}</p>
              <ul class="reflect-list">{#each reflection.constraints as c (c)}<li>{m.c[c]}</li>{/each}</ul>
            </div>
          {/if}
        </div>
      {/if}

      <details class="deeper">
        <summary>Want a sharper blueprint? Add the why &amp; what success looks like (optional)</summary>
        <label class="field"><span>{t.name}</span><input bind:value={projectName} placeholder="e.g. neighborhood-shield" /></label>
        <label class="field"><span>{t.why}</span><textarea bind:value={goal} rows="2"></textarea></label>
        <label class="field"><span>{t.success}</span><textarea bind:value={success} rows="2"></textarea></label>
      </details>
      <div class="nav"><span></span><button class="primary big" onclick={() => (step = 2)} disabled={loading}>{loading ? t.loading : t.choose}</button></div>
    </section>
  {:else if step === 2}
    <section class="panel">
      <div class="bp-head">
        <h3>{t.bpHead} {projectName || 'your project'}</h3>
        <p class="hint">{t.bpLead}</p>
      </div>
      {#if !problem.trim()}
        <p class="hint">{t.bpEmpty}</p>
      {/if}
      <h4 class="bp-sub">{t.bpPieces}</h4>
      <ol class="pieces">
        {#each blueprint as p (p.capId)}
          <li class="piece" class:off={removed.has(p.capId)}>
            <div class="piece-head">
              <span class="role">{p.role}</span>
              <button class="toggle" onclick={() => togglePiece(p.capId)} aria-pressed={!removed.has(p.capId)}>{removed.has(p.capId) ? t.bpKeep : t.bpRemove}</button>
            </div>
            <div class="piece-tool">
              <a class="tool-name" href={p.item.url}>{p.item.name}</a>
              <span class="vbadge vbadge--{p.item.verification}">{p.item.verification.replace('_', ' ')}</span>
              <span class="tool-meta">{p.item.ecosystem} · {p.item.license}</span>
            </div>
            {#if p.item.commit}
              <p class="receipt"><span class="receipt-check" aria-hidden="true">✓</span> {#if p.item.licenseUrl}<a href={p.item.licenseUrl} target="_blank" rel="noopener noreferrer">{t.bpReceipt} <code>{p.item.commit.slice(0, 7)}</code></a>{:else}{t.bpReceipt} <code>{p.item.commit.slice(0, 7)}</code>{/if}</p>
            {/if}
            <p class="piece-why"><strong>{t.bpWhyFor}</strong> {p.why}</p>
            <p class="piece-connects"><strong>{t.bpConnects}</strong> {p.connects}</p>
            {#if partnersOf(p.item.name, chem).length}
              <p class="works-with"><strong>{adv.worksWith}</strong> {partnersOf(p.item.name, chem).join(', ')}</p>
            {/if}
            {#each advisoriesFor(p.item) as a (a)}
              <p class="advisory"><span aria-hidden="true">⚠</span> {a}</p>
            {/each}
            {#if p.alts.length}
              <details class="swap">
                <summary>{t.bpSwap} ▾</summary>
                <ul>
                  {#each p.alts as alt (alt.name)}
                    <li><button class="link" onclick={() => swapPiece(p.capId, alt.name)}>{t.bpUse}: <strong>{alt.name}</strong></button> <span class="tool-meta">{alt.ecosystem} · {alt.license}</span></li>
                  {/each}
                </ul>
              </details>
            {/if}
          </li>
        {/each}
      </ol>
      {#if extraItems.length}
        <h4 class="bp-sub">{t.bpAdded}</h4>
        <ol class="pieces">
          {#each extraItems as it (it.name)}
            <li class="piece">
              <div class="piece-head"><span class="add-label">{seededTool === it.name ? t.bpSeeded : t.bpAddedByYou}</span><button class="toggle" onclick={() => toggleTool(it.name)}>{t.bpRemove}</button></div>
              <div class="piece-tool">
                <a class="tool-name" href={it.url}>{it.name}</a>
                <span class="vbadge vbadge--{it.verification}">{it.verification.replace('_', ' ')}</span>
                <span class="tool-meta">{it.ecosystem} · {it.license}</span>
              </div>
              {#if it.commit}<p class="receipt"><span class="receipt-check" aria-hidden="true">✓</span> {#if it.licenseUrl}<a href={it.licenseUrl} target="_blank" rel="noopener noreferrer">{t.bpReceipt} <code>{it.commit.slice(0, 7)}</code></a>{:else}{t.bpReceipt} <code>{it.commit.slice(0, 7)}</code>{/if}</p>{/if}
              {#if partnersOf(it.name, chem).length}<p class="works-with"><strong>{adv.worksWith}</strong> {partnersOf(it.name, chem).join(', ')}</p>{/if}
              {#each advisoriesFor(it) as a (a)}<p class="advisory"><span aria-hidden="true">⚠</span> {a}</p>{/each}
            </li>
          {/each}
        </ol>
      {/if}

      <div class="fits">
        <strong>{t.bpFits}</strong>
        <p>{#each blueprint.filter((p) => !removed.has(p.capId)) as p, i}{i > 0 ? ' → ' : ''}<a href={p.item.url}>{p.item.name}</a> ({p.role.toLowerCase()}){/each}.</p>
      </div>
      {#if chem.conflicts.length}
        <div class="conflict" role="alert">
          <strong><span aria-hidden="true">⚠</span> {adv.conflict}</strong>
          <ul>{#each chem.conflicts as c (c.a + c.b)}<li>{c.a} · {c.b}</li>{/each}</ul>
        </div>
      {/if}

      <details class="refine">
        <summary>{t.refineTitle}</summary>
        <p class="hint">{t.refineIntro}</p>
        <div class="modelgrid">
          <label class="field"><span>{t.provider}</span><select bind:value={kProvider}><option value="anthropic">Anthropic</option><option value="deepseek">DeepSeek</option><option value="openrouter">OpenRouter</option></select></label>
          <label class="field"><span>{t.modelLabel}</span><select bind:value={kModel}>{#each kModels as m (m.id)}<option value={m.id}>{m.label}</option>{/each}</select></label>
        </div>
        <label class="field"><span>{t.apikey}</span><input type="password" bind:value={kKey} placeholder="sk-…" /></label>

        {#if aiPhase === 'idle'}
          <button class="primary" onclick={aiAsk} disabled={aiBusy || !kKey}>{aiBusy ? t.refineThinking : t.refineAsk}</button>
        {/if}
        {#if aiError}<p class="err">{aiError}</p>{/if}

        {#if aiQuestions.length}
          <ol class="qs">
            {#each aiQuestions as q, i}
              <li><p class="q">{q}</p><textarea bind:value={aiAnswers[i]} rows="2"></textarea></li>
            {/each}
          </ol>
          {#if aiPhase === 'questions'}
            <p class="hint">{t.refineAnswersHint}</p>
            <button class="primary" onclick={aiPropose} disabled={aiBusy}>{aiBusy ? t.refineThinking : t.refinePropose}</button>
          {/if}
        {/if}

        {#if aiPhase === 'proposals'}
          {#if aiProposals.length === 0 && aiSkills.length === 0}
            <p class="hint">{t.refineNone}</p>
          {/if}
          {#if aiProposals.length}
            <ul class="proposals">
              {#each aiProposals as p, i (i)}
                {@const it = items.find((x) => x.name === p.name)}
                <li class="proposal">
                  <div class="prop-head">
                    <span class="prop-name">{p.action === 'add' ? '+ ' : p.action === 'remove' ? '– ' : '⇄ '}{p.name}{p.from ? ` (↳ ${p.from})` : ''}{#if it} <span class="vbadge vbadge--{it.verification}">{it.verification.replace('_', ' ')}</span> <span class="tool-meta">{it.license}</span>{/if}</span>
                    {#if aiApplied.has(i)}<span class="applied">{t.refineApplied}</span>{:else}<button class="apply" onclick={() => applyProposal(p, i)}>{t.refineApply}</button>{/if}
                  </div>
                  <p class="prop-why"><strong>{t.refineWhy}</strong> {p.why}</p>
                  {#if p.tradeoff}<p class="prop-watch"><strong>{t.refineWatch}</strong> {p.tradeoff}</p>{/if}
                </li>
              {/each}
            </ul>
          {/if}
          {#if aiSkills.length}
            <p class="bp-sub">{t.skillsDraft}</p>
            <ul class="skilllist">
              {#each aiSkills as s (s.name)}
                {@const key = `skills/${slugifySkill(s.name)}.SKILL.md`}
                <li class="skillcard">
                  <div class="skill-head"><span class="skill-name">{s.name}.SKILL.md</span>
                    {#if customSkills[key]}<span class="applied">{t.skillAdded}</span>{:else}<button class="apply" onclick={() => addSkill(s)}>{t.skillAdd}</button>{/if}
                  </div>
                  <p class="skill-desc">{s.description}</p>
                  <ol class="skill-steps">{#each s.method as m}<li>{m}</li>{/each}</ol>
                </li>
              {/each}
            </ul>
            <p class="hint">{t.skillReview}</p>
          {/if}
        {/if}
      </details>

      <div class="skill-capture">
        <p class="skill-capture-head"><strong>{t.skCaptureHead}</strong></p>
        <p class="hint">{t.skCaptureSub}</p>
        <label class="field"><span>{t.skName}</span><input bind:value={skName} placeholder="tenant-intake" /></label>
        <label class="field"><span>{t.skDesc}</span><input bind:value={skDesc} placeholder={t.skDescPh} /></label>
        <label class="field"><span>{t.skSteps}</span><textarea bind:value={skSteps} rows="4" placeholder={t.skStepsPh}></textarea></label>
        <label class="field"><span>{t.skSource}</span><input bind:value={skSource} placeholder={t.skSourcePh} /></label>
        <div><button class="primary" onclick={captureSkill} disabled={!skName.trim() || !skSteps.trim()}>{t.skCaptureBtn}</button></div>
        {#if authoredSkills.length}
          <ul class="skilllist">
            {#each authoredSkills as s (s.name)}
              <li class="skillcard">
                <div class="skill-head"><span class="skill-name">{slugifySkill(s.name)}.SKILL.md</span> <button class="link" onclick={() => removeAuthored(s.name)}>{t.skillRemove}</button></div>
                <p class="skill-desc">{s.description}</p>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <details class="skillsbox">
        <summary>{t.skillsReady}{skillCount ? ` · ${skillCount} ${t.skillsIncluded}` : ''}</summary>
        <ul class="skilllist">
          {#each STARTER_SKILLS as s (s.name)}
            {@const key = `skills/${slugifySkill(s.name)}.SKILL.md`}
            <li class="skillcard">
              <div class="skill-head"><span class="skill-name">{s.name}.SKILL.md</span>
                {#if customSkills[key]}<span class="applied">{t.skillAdded}</span>{:else}<button class="apply" onclick={() => addSkill(s)}>{t.skillAdd}</button>{/if}
              </div>
              <p class="skill-desc">{s.description}</p>
            </li>
          {/each}
        </ul>
        <p class="hint"><a href="/guides/knowledge-to-skills/">{t.skillsHint}</a></p>
      </details>

      <details class="advanced">
        <summary>{t.bpAdvanced}</summary>
        <label class="field"><span>{t.add}</span><input bind:value={addQuery} placeholder="search the full catalog…" /></label>
        {#if addResults.length}<ul class="picklist">{#each addResults as it (it.name)}<li class="pick" class:on={chosen.has(it.name)}><label><input type="checkbox" checked={chosen.has(it.name)} onchange={() => toggleTool(it.name)} /><span class="pick-name">{it.name}{primaryNames.has(it.name) ? ' ★' : ''}</span><span class="pick-meta">{it.ecosystem} · {it.license} <span class="vbadge vbadge--{it.verification}">{it.verification.replace('_', ' ')}</span></span></label></li>{/each}</ul>{/if}
        <p class="hint"><strong>{chosen.size}</strong> {t.selected}.</p>
      </details>
      <div class="nav"><button onclick={() => (step = 1)}>{t.back}</button><button class="primary big" onclick={() => (step = 3)} disabled={chosen.size === 0}>{t.gen}</button></div>
    </section>
  {:else}
    <section class="panel">
      <h3>{t.handoff}</h3>
      <p class="hint">{t.handoffIntro}</p>
      <p class="hint"><a href="/guides/knowledge-to-skills/">{t.skillsHint}</a></p>
      <div class="tabs">
        <button class:on={handoff === 'zip'} onclick={() => (handoff = 'zip')}>{t.zip}</button>
        <button class:on={handoff === 'github'} onclick={() => (handoff = 'github')}>{t.github}</button>
        <button class:on={handoff === 'goose'} onclick={() => (handoff = 'goose')}>{t.goose}</button>
        <button class:on={handoff === 'kickoff'} onclick={() => (handoff = 'kickoff')}>{t.kickoff}</button>
      </div>

      {#if handoff === 'zip'}
        <div class="hpanel"><button class="primary big" onclick={downloadZip}>{t.dlzip}</button>
          <p class="hint">{t.zipDesc}</p></div>
      {:else if handoff === 'github'}
        <div class="hpanel">
          {#if ghConfigured === null}<p class="hint">Checking…</p>
          {:else if !ghConfigured}
            <p class="hint">{t.ghNotReady} <a href="/guides/connect-github/">{t.ghGuide}</a></p>
            <button onclick={downloadZip}>{t.dlzip}</button>
          {:else if ghResult.startsWith('created:')}
            <p>{t.ghSuccess} <a href={ghResult.slice(8)}>{ghResult.slice(8)}</a></p>
          {:else if ghConnected}
            <button class="primary big" onclick={ghCreate} disabled={ghBusy}>{ghBusy ? '…' : `Save “${slug}” to GitHub`}</button>
            {#if ghResult.startsWith('error:')}<p class="err">{ghResult.slice(6)}</p>{/if}
          {:else}
            <button class="primary big" onclick={ghConnect}>{t.ghConnectBtn}</button>
            <p class="hint"><a href="/guides/connect-github/">{t.ghGuide}</a></p>
          {/if}
        </div>
      {:else if handoff === 'goose'}
        <div class="hpanel">
          <!-- Explain-before-launch: the builder sees exactly what will happen before
               they open Goose, and that Goose asks consent before running anything. -->
          <p class="hint">{t.gooseExplainIntro}</p>
          <ul class="goose-explain">
            <li>{t.gooseExplainPrompt}</li>
            {#each gooseExplain.extensions as x (x.name)}
              <li><strong>{x.name}</strong> — {x.why}</li>
            {/each}
            <li>{t.gooseExplainConsent}</li>
          </ul>
          {#if gooseLink.withinBudget}
            <a class="primary big" href={gooseLink.url}>{t.gooseOpen}</a>
            <button onclick={() => copy('link', gooseLink.url)}>{copied === 'link' ? '✓' : t.gooseCopyLink}</button>
            <details class="goose-fallback">
              <summary>{t.gooseFallback}</summary>
              <button onclick={() => blobDownload(`${slug}.goose-recipe.yaml`, gooseRecipe, 'text/yaml')}>{t.gooseDl}</button>
              <button onclick={() => copy('cmd', `goose run --recipe ${slug}.goose-recipe.yaml`)}>{copied === 'cmd' ? '✓' : t.gooseCopy}</button>
              <pre><code>goose run --recipe {slug}.goose-recipe.yaml</code></pre>
            </details>
          {:else}
            <p class="hint">{t.gooseTooBig}</p>
            <button class="primary big" onclick={() => blobDownload(`${slug}.goose-recipe.yaml`, gooseRecipe, 'text/yaml')}>{t.gooseDl}</button>
            <button onclick={() => copy('cmd', `goose run --recipe ${slug}.goose-recipe.yaml`)}>{copied === 'cmd' ? '✓' : t.gooseCopy}</button>
            <pre><code>goose run --recipe {slug}.goose-recipe.yaml</code></pre>
          {/if}
          <p class="hint">{t.gooseDesc} <a href="/guides/get-started-with-goose/">{t.runLocal}</a></p>
        </div>
      {:else}
        <div class="hpanel">
          <h4 class="mtitle">{t.modelTitle}</h4>
          <p class="hint">{t.modelIntro}</p>
          <div class="modelgrid">
            <label class="field"><span>{t.provider}</span><select bind:value={kProvider}><option value="anthropic">Anthropic</option><option value="deepseek">DeepSeek</option><option value="openrouter">OpenRouter</option></select></label>
            <label class="field"><span>{t.modelLabel}</span><select bind:value={kModel}>{#each kModels as m (m.id)}<option value={m.id}>{m.label}</option>{/each}</select></label>
          </div>
          {#if kModelNote}<p class="modelnote">{kModelNote}</p>{/if}
          <label class="field"><span>{t.apikey}</span><input type="password" bind:value={kKey} placeholder="sk-…" /></label>
          <button class="primary" onclick={kickoffRun} disabled={kBusy || !kKey}>{kBusy ? t.running : t.run}</button>
          {#if kError}<p class="err">{kError}</p>{/if}
          {#if kOutput}<pre class="out"><code>{kOutput}</code></pre><button onclick={() => copy('ko', kOutput)}>{copied === 'ko' ? '✓ copied' : t.copyPlan}</button>{/if}
        </div>
      {/if}

      <button class="link copyp" onclick={() => copy('prompt', agentPrompt)}>{copied === 'prompt' ? '✓ copied' : t.copyPrompt}</button>

      <p class="hint">Want to look inside first? These are the files in your starter — the plain-English rules and plan your agent will follow:</p>
      {#snippet artifact(title: string, key: string, text: string)}
        <details><summary>{title} <button class="link" onclick={(e) => { e.preventDefault(); copy(key, text); }}>{copied === key ? '✓' : 'copy'}</button></summary><pre><code>{text}</code></pre></details>
      {/snippet}
      {@render artifact('The project’s rules (constitution.md)', 'c', constitution)}
      {@render artifact('The plan (spec.md)', 's', spec)}
      {@render artifact('The tools list (package.json)', 'pkg', packageJson)}

      <div class="nav"><button onclick={() => (step = 2)}>{t.backStack}</button></div>
    </section>
  {/if}
</div>

<style>
  /* The Studio reads as a defined workbench surface, not a floating form. */
  .studio {
    margin: var(--space-md) 0 var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--radius-lg);
    padding: clamp(var(--space-sm), 3vw, var(--space-lg));
    border-top: 3px solid var(--structure);
  }
  .langbar { display: flex; gap: 0.4rem; justify-content: flex-end; align-items: center; margin-bottom: var(--space-sm); }
  .start-over { margin-inline-end: auto; color: var(--ink-soft); }
  .start-over:hover { color: var(--danger-text); border-color: var(--danger-edge); }
  .add-label { font-weight: var(--weight-bold); color: var(--structure); }
  .lang { font-size: 0.8rem; padding: 0.25rem 0.6rem; border-radius: var(--radius-pill); border: 1px solid var(--control-edge); background: var(--surface-2); color: var(--ink-soft); cursor: pointer; }
  .lang.on { background: var(--structure); color: var(--on-structure); border-color: var(--structure); font-weight: var(--weight-bold); }
  /* Step indicator: a numbered progress rail. */
  .steps { display: flex; gap: var(--space-2xs); list-style: none; padding: 0; margin: 0 0 var(--space-md); }
  .steps li { flex: 1; }
  .steps button { width: 100%; padding: 0.55rem 0.5rem; border: 1px solid var(--control-edge); background: var(--surface-2); color: var(--ink-soft); border-radius: var(--radius); cursor: pointer; font-weight: var(--weight-bold); border-top: 3px solid var(--edge-strong); transition: color var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out); }
  .steps button:hover { color: var(--ink); border-top-color: var(--structure); }
  .steps li.on button { background: var(--structure); color: var(--on-structure); border-color: var(--structure); border-top-color: var(--signal); }
  .panel { display: flex; flex-direction: column; gap: var(--space-sm); }
  .field { display: flex; flex-direction: column; gap: 0.35rem; }
  .field > span { font-weight: var(--weight-bold); font-size: 0.9rem; color: var(--ink); }
  input, textarea, select { padding: 0.6rem 0.75rem; border: 1px solid var(--control-edge); border-radius: var(--radius); background: var(--surface-2); color: var(--ink); font: inherit; transition: border-color var(--dur-1) var(--ease-out); }
  :is(input, textarea, select):focus { border-color: var(--structure); }
  .chips, .tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .chip { padding: 0.35rem 0.8rem; border-radius: var(--radius-pill); border: 1px solid var(--control-edge); background: var(--surface-2); color: var(--ink); cursor: pointer; }
  .chip.on { background: var(--structure); color: var(--on-structure); border-color: var(--structure); }
  .tabs button { padding: 0.45rem 0.8rem; border-radius: 0.5rem 0.5rem 0 0; border: 1px solid var(--sl-color-gray-6); background: transparent; color: var(--sl-color-text); cursor: pointer; font-weight: 600; }
  .tabs button.on { background: var(--sl-color-gray-6); border-color: var(--sl-color-gray-5); }
  .hpanel { border: 1px solid var(--sl-color-gray-5); border-radius: 0 0.5rem 0.5rem 0.5rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .picklist { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
  .pick { border: 1px solid var(--sl-color-gray-6); border-radius: 0.5rem; padding: 0.5rem 0.7rem; }
  .pick.on { border-color: var(--sl-color-accent); }
  .pick label { display: grid; grid-template-columns: auto 1fr auto; gap: 0.2rem 0.6rem; align-items: baseline; cursor: pointer; }
  .pick-name { font-weight: 700; }
  .pick-meta { color: var(--sl-color-gray-2); font-size: 0.82rem; }
  .pick-desc { grid-column: 2 / -1; color: var(--sl-color-text); font-size: 0.85rem; }
  .vbadge { font-size: 0.68rem; font-weight: 700; padding: 0.05rem 0.4rem; border-radius: 999px; border: 1px solid var(--sl-color-gray-5); border-left-width: 3px; }
  .vbadge--verified { border-left-color: var(--ok-edge); }
  .vbadge--under_review { border-left-color: var(--warn-edge); }
  .vbadge--blocked { border-left-color: var(--danger-edge); }
  .examples { display: flex; flex-direction: column; gap: 0.4rem; }
  .chip.ex { text-align: start; font-size: 0.82rem; max-width: 100%; white-space: normal; line-height: 1.3; }
  .mentor { border: 1px solid var(--edge); border-radius: var(--radius); padding: var(--space-sm); display: flex; flex-direction: column; gap: var(--space-sm); background: color-mix(in srgb, var(--structure) 4%, transparent); }
  .mentor-head { margin: 0; }
  .mentor-q { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .mentor-q legend { font-weight: var(--weight-bold); font-size: 0.92rem; padding: 0; color: var(--ink); }
  .mentor-skip { opacity: 0.7; }
  .reflect { border-inline-start: 3px solid var(--signal); background: var(--surface-2); border-radius: var(--radius); padding: var(--space-sm) var(--space-md); }
  .reflect-head { margin: 0 0 0.25rem; color: var(--ink); }
  .reflect-list { margin: 0.4rem 0 0; padding-inline-start: 1.1rem; display: grid; gap: 0.25rem; }
  .deeper, .advanced { border: 1px solid var(--sl-color-gray-6); border-radius: 0.5rem; padding: 0.5rem 0.75rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .refine { border: 1px solid var(--sl-color-accent); border-radius: 0.6rem; padding: 0.6rem 0.85rem; display: flex; flex-direction: column; gap: 0.6rem; background: color-mix(in srgb, var(--sl-color-accent) 5%, transparent); }
  .refine > summary { cursor: pointer; color: var(--sl-color-text-accent); font-weight: 700; }
  .qs { list-style: none; counter-reset: q; padding: 0; margin: 0; display: grid; gap: 0.7rem; }
  .qs li { counter-increment: q; }
  .qs .q { margin: 0 0 0.3rem; font-weight: 600; }
  .qs .q::before { content: counter(q) '. '; color: var(--sl-color-text-accent); }
  .proposals { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; }
  .proposal { border: 1px solid var(--sl-color-gray-5); border-inline-start: 4px solid var(--sl-color-accent); border-radius: 0.5rem; padding: 0.6rem 0.8rem; }
  .prop-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }
  .prop-name { font-weight: 700; }
  .apply { background: var(--sl-color-accent); color: var(--on-structure); border: 0; border-radius: 999px; padding: 0.15rem 0.7rem; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
  .applied { font-size: 0.78rem; font-weight: 700; color: var(--ok-text); }
  .prop-why, .prop-watch { margin: 0.3rem 0 0; font-size: 0.88rem; color: var(--sl-color-text); }
  .skill-capture { border: 1px solid var(--edge); border-inline-start: 3px solid var(--signal); border-radius: var(--radius); padding: var(--space-sm); display: flex; flex-direction: column; gap: var(--space-2xs); background: color-mix(in srgb, var(--signal) 5%, transparent); }
  .skill-capture-head { margin: 0; font-size: 1.02rem; font-family: var(--font-display); }
  .skillsbox { border: 1px solid var(--sl-color-gray-6); border-radius: 0.5rem; padding: 0.5rem 0.75rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .skillsbox > summary { cursor: pointer; color: var(--sl-color-text-accent); font-weight: 600; }
  .skilllist { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
  .skillcard { border: 1px solid var(--sl-color-gray-5); border-inline-start: 4px solid var(--sl-color-accent); border-radius: 0.5rem; padding: 0.55rem 0.8rem; }
  .skill-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }
  .skill-name { font-weight: 700; font-family: var(--sl-font-mono); font-size: 0.92rem; }
  .skill-desc { margin: 0.25rem 0 0; font-size: 0.88rem; color: var(--sl-color-text); }
  .skill-steps { margin: 0.4rem 0 0; padding-inline-start: 1.2rem; font-size: 0.85rem; color: var(--sl-color-gray-2); display: grid; gap: 0.15rem; }
  .deeper summary, .advanced summary, .swap summary { cursor: pointer; color: var(--sl-color-text-accent); font-size: 0.9rem; font-weight: 600; }
  .bp-head h3 { margin: 0 0 0.3rem; }
  .bp-sub { margin: 0.4rem 0 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--sl-color-gray-2); }
  .pieces { list-style: none; counter-reset: piece; padding: 0; margin: 0; display: grid; gap: 0.7rem; }
  .piece { border: 1px solid var(--sl-color-gray-5); border-inline-start: 4px solid var(--sl-color-accent); border-radius: 0.6rem; padding: 0.7rem 0.9rem; }
  .piece.off { opacity: 0.55; border-inline-start-color: var(--sl-color-gray-5); }
  .piece-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
  .role { counter-increment: piece; font-weight: 700; }
  .role::before { content: counter(piece) '. '; color: var(--sl-color-text-accent); }
  .toggle { background: none; border: 1px solid var(--sl-color-gray-5); border-radius: 999px; padding: 0.1rem 0.65rem; font-size: 0.74rem; color: var(--sl-color-text); cursor: pointer; }
  .piece-tool { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; margin: 0.35rem 0; }
  .tool-name { font-weight: 700; font-size: 1.02rem; }
  .tool-meta { color: var(--sl-color-gray-2); font-size: 0.8rem; }
  .piece-why, .piece-connects { margin: 0.25rem 0; font-size: 0.9rem; color: var(--sl-color-text); }
  .works-with { margin: 0.25rem 0; font-size: 0.85rem; color: var(--ink-soft); }
  .advisory { margin: 0.3rem 0 0; font-size: 0.82rem; color: var(--ink); background: color-mix(in srgb, var(--signal) 14%, transparent); border-inline-start: 3px solid var(--signal); border-radius: var(--radius-sm); padding: 0.3rem 0.55rem; }
  .conflict { margin-top: 0.75rem; border: 1px solid var(--signal); border-inline-start-width: 4px; border-radius: var(--radius); padding: 0.55rem 0.8rem; background: color-mix(in srgb, var(--signal) 8%, transparent); font-size: 0.88rem; }
  .conflict ul { margin: 0.3rem 0 0; padding-inline-start: 1.1rem; }
  .receipt { margin: 0.3rem 0 0; font-size: 0.8rem; color: var(--ink-soft); display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .receipt a { color: var(--structure); text-decoration: none; }
  .receipt a:hover { text-decoration: underline; }
  .receipt code { font-size: 0.92em; background: color-mix(in srgb, var(--ok-edge) 16%, transparent); padding: 0.05rem 0.35rem; border-radius: var(--radius-sm); color: var(--ink); }
  .receipt-check { color: var(--ok-edge); font-weight: 800; }
  .swap { margin-top: 0.45rem; }
  .swap ul { list-style: none; padding: 0.4rem 0 0; margin: 0; display: grid; gap: 0.3rem; }
  .fits { border-inline-start: 3px solid var(--sl-color-accent); background: var(--sl-color-gray-6); border-radius: 0.5rem; padding: 0.6rem 0.85rem; }
  .fits p { margin: 0.3rem 0 0; font-size: 0.92rem; }
  .mtitle { margin: 0; font-size: 1.05rem; }
  .modelgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  @media (max-width: 34rem) { .modelgrid { grid-template-columns: 1fr; } }
  .modelnote { margin: 0; padding: 0.6rem 0.75rem; border-radius: 0.5rem; background: var(--sl-color-gray-6); border-inline-start: 3px solid var(--sl-color-accent); color: var(--sl-color-text); font-size: 0.88rem; }
  .nav { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem; }
  .nav button { padding: 0.55rem 1rem; border-radius: 0.5rem; border: 1px solid var(--sl-color-gray-5); background: var(--sl-color-gray-6); color: var(--sl-color-text); cursor: pointer; font-weight: 600; }
  .primary { background: var(--sl-color-accent); color: var(--on-structure); border: 1px solid var(--sl-color-accent); padding: 0.55rem 1.1rem; border-radius: 0.5rem; cursor: pointer; font-weight: 700; }
  .big { font-size: 1.05rem; padding: 0.7rem 1.3rem; }
  .hint { color: var(--sl-color-gray-2); font-size: 0.9rem; }
  /* "Open in Goose" is an <a> styled as the primary button. */
  a.primary { display: inline-block; text-decoration: none; text-align: center; }
  .goose-explain { margin: 0.2rem 0 0.4rem; padding-inline-start: 1.1rem; color: var(--sl-color-gray-2); font-size: 0.9rem; }
  .goose-explain li { margin: 0.25rem 0; }
  .goose-explain strong { color: var(--sl-color-text-accent); }
  .goose-fallback { font-size: 0.9rem; }
  .goose-fallback summary { cursor: pointer; color: var(--sl-color-gray-2); }
  .goose-fallback > :not(summary) { margin-top: 0.5rem; }
  .err { color: var(--danger-text); font-size: 0.9rem; }
  .link { background: none; border: 0; color: var(--sl-color-text-accent); cursor: pointer; text-decoration: underline; font: inherit; }
  .copyp { align-self: flex-start; }
  details { border: 1px solid var(--sl-color-gray-6); border-radius: 0.5rem; padding: 0.5rem 0.75rem; }
  summary { font-weight: 700; cursor: pointer; display: flex; justify-content: space-between; gap: 1rem; }
  pre { max-height: 22rem; overflow: auto; background: var(--sl-color-black); padding: 0.75rem; border-radius: 0.4rem; }
  .out { max-height: 28rem; }
</style>
