<script lang="ts">
  import { onMount } from 'svelte';
  import { zipSync, strToU8 } from 'fflate';

  let { lang: initialLang = 'en' }: { lang?: string } = $props();

  interface Item {
    name: string; url: string; ecosystem: string; category: string;
    protocols: string[]; license: string; verification: string; uses: number; desc: string; repo: string | null;
  }

  // ---------- i18n ----------
  type Lang = 'en' | 'es' | 'ar';
  const STR: Record<Lang, Record<string, string>> = {
    en: {
      s1: '1 · Describe', s2: '2 · Your blueprint', s3: '3 · Build it',
      sl1: 'Describe', sl2: 'Blueprint', sl3: 'Build',
      studioLead: 'Tell the Studio what your community needs, in plain words. It assembles a small, license-checked stack and hands your AI agent everything it needs to start — never anything from Meta, OpenAI, or xAI.',
      eyebrow: 'Guided build · no code required',
      foundation: 'Verified, values-locked foundation',
      diagramLabel: 'Your stack, wired together',
      name: 'Project name (a short nickname is fine)',
      problem: 'What problem does it solve, and for whom? Say it like you would out loud — one short paragraph.',
      why: 'Why does this matter? The real change you want — not just “ship an app.”',
      success: 'How will you know it’s working? What’s different for your community when it does.',
      protocols: 'Which network does it live on?',
      tenq: 'Start with the why. Answer these the way you’d explain the project to a friend — the clearer you are, the better your AI agent builds.',
      protoHelp: 'A “network” (protocol) is the shared, open rulebook your tool plugs into — owned by no single company. Nostr and AT Protocol (Bluesky) are open social networks; pick “general” if it isn’t a social tool.',
      choose: 'Show me the blueprint →', back: '← Back', gen: 'Build it →', backStack: '← Back to the blueprint',
      bpHead: 'Here’s how I’d build', bpPieces: 'The pieces you’ll need', bpWhyFor: 'Why this, for you:', bpConnects: 'How it fits in:',
      bpSwap: 'Swap', bpUse: 'Use this instead', bpRemove: 'Remove', bpKeep: 'Add back', bpFits: 'How it all comes together',
      bpAdvanced: 'Power user? Browse and add tools yourself', bpEmpty: 'Tell me what you want to build first — go back and describe it in a sentence or two.',
      bpLead: 'You don’t need to know any of these by name. I picked a small, proven set for what you described and wired them together. Keep it as-is, or swap any piece — every option is safe and license-checked.',
      examples: 'Not sure where to start? Try one:',
      add: 'Need something specific? Search the full catalog', selected: 'building blocks chosen', loading: 'Loading the catalog…',
      handoff: 'How do you want to get started?', zip: 'Download a starter folder', github: 'Save it to GitHub',
      goose: 'Run it with Goose', kickoff: 'Try a step with AI',
      dlzip: '⬇ Download your starter folder (.zip)', copyPrompt: 'Copy the instructions for your AI agent',
      runLocal: 'New to Goose? Start here →', ghGuide: 'How to connect GitHub →',
      apikey: 'Your AI key (sent straight to the model, never stored by us)',
      provider: 'Who makes the model', run: 'Run it', running: 'Working…',
      ghError: 'Connecting to GitHub didn’t finish. Try again, or download the folder below.',
      modelTitle: 'Choose your AI model',
      modelIntro: 'This runs one planning step with your own AI key, so you can feel it work before you commit. Your key and your project go straight to the model — never stored by us, and never routed through Meta, OpenAI, or xAI. The options below are chosen for that: models trained accountably, open models you can run yourself, or a neutral router locked to allowed models.',
      modelLabel: 'Model',
      handoffIntro: 'Your starter is ready — everything your AI agent needs to begin, with the rules and safe tools already baked in. Pick how you’d like to take it:',
      zipDesc: 'A ready-to-open folder with everything inside: the project’s rules, the plan, the build instructions, and the list of safe tools. Hand it to Goose or Claude Code and start building.',
      gooseDl: '⬇ Download the Goose recipe', gooseCopy: 'Copy the run command',
      gooseDesc: 'A recipe is a one-file set of instructions Goose follows to build your project. Download it, then run the command below.',
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
      designHint: 'New to design? The Design Field Guide teaches you to direct the look — in plain words, no jargon →',
      designHintShort: 'the five moves', cardCopy: 'Copy', cardCopyAsk: 'Copy the ask',
      skillsDraft: 'Skills I can scaffold from what you told me', skillsReady: 'Or drop in a ready-made skill',
      skillAdd: 'Add to my project', skillAdded: 'Added ✓',
      skillReview: 'A draft in your words — review and refine it; you’re the expert.',
      skillsIncluded: 'skill(s) will be included in your starter',
    },
    es: {
      s1: '1 · Describe', s2: '2 · Tu plano', s3: '3 · Constrúyelo',
      sl1: 'Describe', sl2: 'Tu plano', sl3: 'Construye',
      studioLead: 'Dile al Studio lo que tu comunidad necesita, en palabras simples. Arma un conjunto pequeño y con licencia verificada, y le da a tu agente de IA todo para empezar — nunca nada de Meta, OpenAI o xAI.',
      eyebrow: 'Construcción guiada · sin código',
      foundation: 'Base verificada y con valores bloqueados',
      diagramLabel: 'Tu stack, conectado',
      name: 'Nombre del proyecto (un apodo corto vale)',
      problem: '¿Qué problema resuelve y para quién? Dilo como lo dirías en voz alta — un párrafo corto.',
      why: '¿Por qué importa? El cambio real que buscas — no solo “lanzar una app.”',
      success: '¿Cómo sabrás que funciona? Qué cambia para tu comunidad cuando lo logra.',
      protocols: '¿En qué red vive?',
      tenq: 'Empieza por el porqué. Responde como si le explicaras el proyecto a un amigo — cuanto más claro seas, mejor construye tu agente de IA.',
      protoHelp: 'Una “red” (protocolo) es el reglamento abierto y compartido al que se conecta tu herramienta — sin dueño único. Nostr y AT Protocol (Bluesky) son redes sociales abiertas; elige “general” si no es una herramienta social.',
      choose: 'Muéstrame el plano →', back: '← Atrás', gen: 'Construirlo →', backStack: '← Volver al plano',
      bpHead: 'Así lo construiría', bpPieces: 'Las piezas que necesitarás', bpWhyFor: 'Por qué esta, para ti:', bpConnects: 'Cómo encaja:',
      bpSwap: 'Cambiar', bpUse: 'Usar esta', bpRemove: 'Quitar', bpKeep: 'Volver a añadir', bpFits: 'Cómo se une todo',
      bpAdvanced: '¿Experto? Explora y añade herramientas tú mismo', bpEmpty: 'Primero dime qué quieres construir — vuelve y descríbelo en una o dos frases.',
      bpLead: 'No necesitas conocer ninguna de estas por su nombre. Elegí un conjunto pequeño y probado para lo que describiste y las conecté entre sí. Déjalo así, o cambia cualquier pieza — cada opción es segura y con licencia verificada.',
      examples: '¿No sabes por dónde empezar? Prueba una:',
      add: '¿Necesitas algo específico? Busca en todo el catálogo', selected: 'bloques elegidos', loading: 'Cargando el catálogo…',
      handoff: '¿Cómo quieres empezar?', zip: 'Descargar una carpeta inicial', github: 'Guardarlo en GitHub',
      goose: 'Ejecutarlo con Goose', kickoff: 'Probar un paso con IA',
      dlzip: '⬇ Descargar tu carpeta inicial (.zip)', copyPrompt: 'Copiar las instrucciones para tu agente de IA',
      runLocal: '¿Nuevo en Goose? Empieza aquí →', ghGuide: 'Cómo conectar GitHub →',
      apikey: 'Tu clave de IA (se envía directo al modelo, nunca la guardamos)',
      provider: 'Quién hace el modelo', run: 'Ejecutar', running: 'Trabajando…',
      ghError: 'La conexión con GitHub no terminó. Inténtalo de nuevo o descarga la carpeta abajo.',
      modelTitle: 'Elige tu modelo de IA',
      modelIntro: 'Esto ejecuta un paso de planificación con tu propia clave de IA, para que lo sientas funcionar antes de comprometerte. Tu clave y tu proyecto van directo al modelo — nunca los guardamos, y nunca pasan por Meta, OpenAI o xAI. Las opciones de abajo se eligen por eso: modelos entrenados de forma responsable, modelos abiertos que puedes ejecutar tú mismo, o un enrutador neutral limitado a modelos permitidos.',
      modelLabel: 'Modelo',
      handoffIntro: 'Tu kit está listo — todo lo que tu agente de IA necesita para empezar, con las reglas y las herramientas seguras ya incluidas. Elige cómo quieres llevarlo:',
      zipDesc: 'Una carpeta lista para abrir con todo dentro: las reglas del proyecto, el plan, las instrucciones de construcción y la lista de herramientas seguras. Entrégala a Goose o Claude Code y empieza a construir.',
      gooseDl: '⬇ Descargar la receta de Goose', gooseCopy: 'Copiar el comando',
      gooseDesc: 'Una receta es un archivo con instrucciones que Goose sigue para construir tu proyecto. Descárgala y ejecuta el comando de abajo.',
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
      designHint: '¿Nuevo en diseño? La Guía de Diseño te enseña a dirigir el aspecto — en palabras claras, sin jerga →',
      designHintShort: 'los cinco movimientos', cardCopy: 'Copiar', cardCopyAsk: 'Copiar la frase',
      skillsDraft: 'Habilidades que puedo crear a partir de lo que me contaste', skillsReady: 'O agrega una habilidad lista para usar',
      skillAdd: 'Añadir a mi proyecto', skillAdded: 'Añadida ✓',
      skillReview: 'Un borrador en tus palabras — revísalo y ajústalo; tú eres quien sabe.',
      skillsIncluded: 'habilidad(es) se incluirán en tu kit inicial',
    },
    ar: {
      s1: '١ · صِف', s2: '٢ · مخططك', s3: '٣ · ابنِه',
      sl1: 'صِف', sl2: 'مخططك', sl3: 'ابنِه',
      studioLead: 'أخبر الاستوديو بما يحتاجه مجتمعك، بكلمات بسيطة. يجمّع مجموعة صغيرة مُتحقَّقة من الترخيص، ويمنح وكيل الذكاء الاصطناعي كل ما يلزم للبدء — ولا شيء أبداً من Meta أو OpenAI أو xAI.',
      eyebrow: 'بناء موجَّه · بلا برمجة',
      foundation: 'أساس مُوثَّق ومُقفل على القيم',
      diagramLabel: 'حزمتك، موصولة معاً',
      name: 'اسم المشروع (يكفي اسم مختصر)',
      problem: 'ما المشكلة التي يحلها، ولمن؟ قُلها كما تقولها بصوتك — فقرة قصيرة.',
      why: 'لماذا يهمّ هذا؟ التغيير الحقيقي الذي تريده — وليس مجرد «إطلاق تطبيق».',
      success: 'كيف ستعرف أنه ينجح؟ ما الذي يتغيّر لمجتمعك عندما ينجح.',
      protocols: 'على أي شبكة يعمل؟',
      tenq: 'ابدأ بالـ«لماذا». أجب كأنك تشرح المشروع لصديق — كلما كنت أوضح، بنى وكيل الذكاء الاصطناعي بشكل أفضل.',
      protoHelp: 'الـ«شبكة» (البروتوكول) هي القواعد المفتوحة المشتركة التي تتصل بها أداتك — لا يملكها طرف واحد. Nostr وAT Protocol (Bluesky) شبكات اجتماعية مفتوحة؛ اختر «general» إن لم تكن أداة اجتماعية.',
      choose: 'أرني المخطط ←', back: '→ رجوع', gen: 'ابنِه ←', backStack: '→ العودة للمخطط',
      bpHead: 'هكذا سأبنيه', bpPieces: 'القطع التي ستحتاجها', bpWhyFor: 'لماذا هذه، لك:', bpConnects: 'كيف تتكامل:',
      bpSwap: 'تبديل', bpUse: 'استخدم هذه', bpRemove: 'إزالة', bpKeep: 'إعادة الإضافة', bpFits: 'كيف يتكامل كل شيء',
      bpAdvanced: 'خبير؟ تصفّح وأضف الأدوات بنفسك', bpEmpty: 'أخبرني أولاً بما تريد بناءه — ارجع وصِفه في جملة أو جملتين.',
      bpLead: 'لا حاجة لأن تعرف أيّاً منها بالاسم. اخترتُ مجموعة صغيرة ومُجرَّبة لما وصفته وربطتها معاً. اتركها كما هي، أو بدّل أي قطعة — كل خيار آمن ومُتحقَّق من ترخيصه.',
      examples: 'لا تعرف من أين تبدأ؟ جرّب واحدة:',
      add: 'تحتاج شيئاً محدداً؟ ابحث في الكتالوج كاملاً', selected: 'لبنات مختارة', loading: 'جارٍ تحميل الكتالوج…',
      handoff: 'كيف تريد أن تبدأ؟', zip: 'تنزيل مجلد بداية', github: 'احفظه في GitHub',
      goose: 'شغّله مع Goose', kickoff: 'جرّب خطوة بالذكاء الاصطناعي',
      dlzip: '⬇ نزّل مجلد البداية (.zip)', copyPrompt: 'انسخ تعليمات وكيل الذكاء الاصطناعي',
      runLocal: 'جديد على Goose؟ ابدأ هنا ←', ghGuide: 'كيفية ربط GitHub ←',
      apikey: 'مفتاح الذكاء الاصطناعي الخاص بك (يُرسل مباشرة إلى النموذج، ولا نخزّنه أبداً)',
      provider: 'من يصنع النموذج', run: 'شغّل', running: 'جارٍ العمل…',
      ghError: 'لم يكتمل الاتصال بـ GitHub. حاول مرة أخرى، أو نزّل المجلد أدناه.',
      modelTitle: 'اختر نموذج الذكاء الاصطناعي',
      modelIntro: 'هذا يشغّل خطوة تخطيط واحدة باستخدام مفتاحك الخاص، لتشعر به يعمل قبل أن تلتزم. مفتاحك ومشروعك يذهبان مباشرة إلى النموذج — لا نخزّنهما أبداً، ولا يمران عبر Meta أو OpenAI أو xAI. الخيارات أدناه مُختارة لذلك: نماذج مُدرَّبة بمسؤولية، نماذج مفتوحة يمكنك تشغيلها بنفسك، أو موجّه محايد مقصور على النماذج المسموح بها.',
      modelLabel: 'النموذج',
      handoffIntro: 'حزمتك جاهزة — كل ما يحتاجه وكيل الذكاء الاصطناعي للبدء، مع القواعد والأدوات الآمنة مُضمّنة سلفاً. اختر كيف تريد أخذها:',
      zipDesc: 'مجلد جاهز للفتح يحوي كل شيء: قواعد المشروع، والخطة، وتعليمات البناء، وقائمة الأدوات الآمنة. سلّمه لـ Goose أو Claude Code وابدأ البناء.',
      gooseDl: '⬇ تنزيل وصفة Goose', gooseCopy: 'انسخ أمر التشغيل',
      gooseDesc: 'الوصفة ملف واحد فيه تعليمات يتبعها Goose لبناء مشروعك. نزّلها ثم شغّل الأمر أدناه.',
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
      designHint: 'جديد على التصميم؟ دليل التصميم يعلّمك توجيه المظهر — بكلمات واضحة بلا مصطلحات ←',
      designHintShort: 'الحركات الخمس', cardCopy: 'نسخ', cardCopyAsk: 'انسخ الجملة',
      skillsDraft: 'مهارات يمكنني إنشاؤها مما أخبرتني به', skillsReady: 'أو أضِف مهارة جاهزة',
      skillAdd: 'أضِف إلى مشروعي', skillAdded: 'أُضيفت ✓',
      skillReview: 'مسودة بكلماتك — راجعها وحسّنها؛ أنت صاحب الخبرة.',
      skillsIncluded: 'مهارة ستُضمَّن في حزمتك المبدئية',
    },
  };
  let lang = $state<Lang>((['en', 'es', 'ar'].includes(initialLang) ? initialLang : 'en') as Lang);
  const t = $derived(STR[lang]);
  const rtl = $derived(lang === 'ar');

  // ---------- Design Field Card (pocket quick-reference, localized) ----------
  // The five craft moves with copy-ready "ask your agent" prompts, the two
  // pocket prompts, and the pre-ship checklist. Companion to the full guide.
  interface CardMove { title: string; spot: string; ask: string }
  interface FieldCard {
    title: string; intro: string; moves: CardMove[];
    accessLabel: string; accessPrompt: string; optionsLabel: string; optionsPrompt: string;
    shipLabel: string; ship: string[]; full: string;
  }
  const CARD: Record<Lang, FieldCard> = {
    en: {
      title: 'Design Field Card', intro: 'Start with your people. Then make these five moves on every screen.',
      moves: [
        { title: 'Make the important thing obvious', spot: 'Squint — does the right thing stand out?', ask: 'Strengthen the hierarchy: make the main action stand out, quiet the rest.' },
        { title: 'Less, but better', spot: 'Remove first, then add room. Cramped reads amateur; space reads pro.', ask: "This feels cluttered — add whitespace and cut what isn't essential." },
        { title: 'Decide once, repeat everywhere', spot: 'One set of colours, spacing, and buttons — reused on every screen.', ask: 'Make buttons, spacing, and styles consistent across every screen.' },
        { title: 'Clear what to do, and what happened', spot: 'Tappable things look tappable. Every action gets a response.', ask: 'Make actions obviously tappable and add feedback for every one.' },
        { title: 'Smooth the path', spot: 'Map the journey. Cut steps. Always show the next step.', ask: 'Map this flow, cut steps, and make the next step obvious.' },
      ],
      accessLabel: 'Paste every build — accessibility',
      accessPrompt: 'Make this meet WCAG 2.2 AA: readable contrast, large tap targets, full keyboard navigation with visible focus, screen-reader support, and respect for reduced-motion and dark-mode settings.',
      optionsLabel: 'For any decision — options',
      optionsPrompt: 'Show me 2–3 different versions so I can compare, pick, and show the community.',
      shipLabel: 'Before you ship',
      ship: ['Squint — does the right thing stand out?', 'Breathe — does it feel roomy, not cramped?', 'Match — are colours, spacing, and buttons consistent?', 'Stranger — could a first-timer do the main task in silence?', 'Welcome — can someone with low vision, a screen reader, or an old phone use it?', 'Belong — would your community feel this was made by us, for us?'],
      full: 'Read the full Design Field Guide →',
    },
    es: {
      title: 'Tarjeta de diseño', intro: 'Empieza por tu gente. Luego haz estos cinco movimientos en cada pantalla.',
      moves: [
        { title: 'Haz obvio lo importante', spot: 'Entrecierra los ojos — ¿resalta lo correcto?', ask: 'Refuerza la jerarquía: que la acción principal destaque y lo demás quede más callado.' },
        { title: 'Menos, pero mejor', spot: 'Primero quita, luego da espacio. Lo apretado parece amateur; el espacio, profesional.', ask: 'Esto se siente saturado — añade espacio en blanco y quita lo que no es esencial.' },
        { title: 'Decide una vez, repite en todas partes', spot: 'Un solo set de colores, espaciado y botones — reutilizado en cada pantalla.', ask: 'Haz que botones, espaciado y estilos sean consistentes en todas las pantallas.' },
        { title: 'Claro qué hacer y qué pasó', spot: 'Lo tocable parece tocable. Cada acción recibe respuesta.', ask: 'Haz que las acciones se vean claramente tocables y añade respuesta a cada una.' },
        { title: 'Suaviza el camino', spot: 'Mapea el recorrido. Recorta pasos. Muestra siempre el siguiente.', ask: 'Mapea este flujo, recorta pasos y deja claro el siguiente paso.' },
      ],
      accessLabel: 'Pega en cada build — accesibilidad',
      accessPrompt: 'Haz que esto cumpla WCAG 2.2 AA: contraste legible, áreas de toque grandes, navegación completa por teclado con foco visible, soporte de lector de pantalla, y respeto a las preferencias de movimiento reducido y modo oscuro.',
      optionsLabel: 'Para cualquier decisión — opciones',
      optionsPrompt: 'Muéstrame 2–3 versiones distintas para comparar, elegir y enseñar a la comunidad.',
      shipLabel: 'Antes de publicar',
      ship: ['Entrecierra — ¿resalta lo correcto?', 'Respira — ¿se siente amplio, no apretado?', 'Coincide — ¿colores, espaciado y botones son consistentes?', 'Desconocido — ¿podría alguien nuevo hacer la tarea en silencio?', 'Bienvenida — ¿puede usarlo alguien con baja visión, lector de pantalla o un teléfono viejo?', 'Pertenencia — ¿sentiría tu comunidad que se hizo por nosotros, para nosotros?'],
      full: 'Lee la Guía de Diseño completa →',
    },
    ar: {
      title: 'بطاقة التصميم', intro: 'ابدأ بناسك. ثم نفّذ هذه الحركات الخمس في كل شاشة.',
      moves: [
        { title: 'اجعل المهم واضحاً', spot: 'حدّق بعينين نصف مغمضتين — هل يبرز الشيء الصحيح؟', ask: 'قوِّ التسلسل البصري: اجعل الإجراء الرئيسي يبرز، واخفض البقية.' },
        { title: 'أقل، لكن أفضل', spot: 'احذف أولاً ثم أضِف مساحة. الازدحام يبدو هاوياً؛ المساحة تبدو احترافية.', ask: 'هذا يبدو مزدحماً — أضِف مساحة بيضاء واحذف ما ليس ضرورياً.' },
        { title: 'قرّر مرة، وكرّر في كل مكان', spot: 'مجموعة واحدة من الألوان والمسافات والأزرار — تُعاد في كل شاشة.', ask: 'اجعل الأزرار والمسافات والأنماط متسقة في كل الشاشات.' },
        { title: 'وضّح ماذا تفعل وماذا حدث', spot: 'القابل للنقر يبدو قابلاً للنقر. كل إجراء يحصل على استجابة.', ask: 'اجعل الإجراءات واضحة القابلية للنقر وأضِف استجابة لكل منها.' },
        { title: 'مهّد الطريق', spot: 'ارسم الرحلة. اختصر الخطوات. أظهِر دائماً الخطوة التالية.', ask: 'ارسم هذا المسار، واختصر الخطوات، ووضّح الخطوة التالية.' },
      ],
      accessLabel: 'الصقها في كل build — إمكانية الوصول',
      accessPrompt: 'اجعل هذا يحقق WCAG 2.2 AA: تباين مقروء، أهداف لمس كبيرة، تنقّل كامل بلوحة المفاتيح مع تركيز مرئي، دعم قارئ الشاشة، واحترام إعدادات تقليل الحركة والوضع الداكن.',
      optionsLabel: 'لأي قرار — خيارات',
      optionsPrompt: 'أرني ٢–٣ نسخ مختلفة لأقارن وأختار وأعرضها على المجتمع.',
      shipLabel: 'قبل الإطلاق',
      ship: ['حدّق — هل يبرز الشيء الصحيح؟', 'تنفّس — هل يبدو فسيحاً لا مزدحماً؟', 'تطابق — هل الألوان والمسافات والأزرار متسقة؟', 'غريب — هل يستطيع مستخدم جديد إنجاز المهمة بصمت؟', 'ترحيب — هل يستطيع استخدامه شخص ضعيف البصر أو بقارئ شاشة أو بهاتف قديم؟', 'انتماء — هل سيشعر مجتمعك أنه صُنع بأيدينا، لنا؟'],
      full: 'اقرأ دليل التصميم الكامل ←',
    },
  };
  const card = $derived(CARD[lang]);

  // ---------- state ----------
  let items = $state<Item[]>([]);
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
    try { const res = await fetch('/catalog.json'); items = (await res.json()).filter((i: Item & { kind?: string }) => (i as any).kind !== 'dataset'); } catch { /* offline */ }
    loading = false;
    const gh = new URLSearchParams(location.search).get('gh');
    if (gh === 'connected') { handoff = 'github'; ghConnected = true; step = 3; }
    else if (gh === 'error') { handoff = 'github'; step = 3; ghResult = `error:${t.ghError}`; }
    else if (gh === 'unconfigured') { handoff = 'github'; step = 3; ghConfigured = false; }
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
        .sort((a, b) => protoMatch(b) - protoMatch(a) || (b.verification === 'verified' ? 1 : 0) - (a.verification === 'verified' ? 1 : 0) || b.uses - a.uses || a.name.localeCompare(b.name));
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
      let item = pool[0]!;
      const sw = swaps[def.id];
      if (sw) { const s = pool.find((x) => x.name === sw) ?? items.find((x) => x.name === sw); if (s) item = s; }
      // A swap target could collide with a tool an earlier piece already took
      // (the items.find fallback bypasses `taken`); fall back to this pool's
      // default so the same tool never appears in two pieces.
      if (taken.has(item.name)) item = pool[0]!;
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
    npx tsx ./enforcement/cli.ts all --tree .
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

## Article VII — Design & welcome (the people it's for)
Build it so everyone's invited. Meet WCAG 2.2 AA: readable contrast (4.5:1 body,
3:1 large/non-text), tap targets large enough for real thumbs, full keyboard
navigation with a visible focus ring, screen-reader support, and respect for
reduced-motion and dark-mode settings. Define colour/spacing/type as tokens and
reuse them (one consistent kit). One clear primary action per screen; obvious
interactive cues and immediate feedback. Reflect the builder's specific community
— their colours and voice — over a generic "tech-blue" default. Design with the
community, not just for them.
`);

  const spec = $derived(`# Spec: ${projectName || slug}

## Problem
${problem || '<the community problem in one paragraph>'}

## Goal behind it (intent)
${goal || '<the real objective — not a convenient proxy>'}

## Success looks like
${success || '<the non-negotiable success criteria>'}

## Protocols
${protoList.length ? protoList.join(', ') : 'general'}

## Stack (policy-clean, from wecanjustbuildthings.dev)
${chosenItems.map((it) => `- ${it.name} (${it.ecosystem}, ${it.license}) — ${it.desc}`).join('\n') || '- <select tools>'}
`);

  const jsDeps = $derived(chosenItems.filter((it) => it.ecosystem === 'js'));
  const otherDeps = $derived(chosenItems.filter((it) => it.ecosystem !== 'js'));
  const packageJson = $derived(JSON.stringify({ name: slug, version: '0.1.0', private: true, type: 'module', engines: { node: '>=22.12.0' }, dependencies: Object.fromEntries(jsDeps.map((it) => [it.name, 'latest'])) }, null, 2) + '\n');

  const agentPrompt = $derived(`You are building "${projectName || slug}".

PROBLEM: ${problem || '<the community problem>'}
GOAL BEHIND IT (optimize for this, not a proxy): ${goal || problem || '<the real objective>'}
SUCCESS LOOKS LIKE: ${success || '<the non-negotiable success criteria>'}
PROTOCOLS: ${protoList.length ? protoList.join(', ') : 'general'}

RULES (binding — see constitution.md):
- Read .specify/memory/constitution.md FIRST and never violate it.
- Read skills/*.SKILL.md and follow the builder's own methods exactly; if a skill conflicts with a task, surface it and ask.
- Design for welcome: meet WCAG 2.2 AA (readable contrast, large tap targets, keyboard nav with visible focus, screen-reader support, reduced-motion + dark-mode). Token-driven, consistent styling; one clear primary action per screen; reflect the community's own colours and voice, not a generic default.
- Use ONLY these vetted, policy-clean dependencies:
${chosenItems.map((it) => `    - ${it.name} (${it.ecosystem})`).join('\n') || '    - <none selected>'}
${protocols.has('nostr') ? '- For Nostr, use @nostr-dev-kit/ndk (NDK) as the primary SDK for relays, subscriptions, and signers.\n' : ''}${protocols.has('atproto') ? '- For AT Protocol, use @atproto/api as the primary SDK; prefer OAuth (DPoP) over App Passwords.\n' : ''}- No dependency or provider owned by Meta, OpenAI, or xAI — directly or transitively.
- Run \`npx tsx ./enforcement/cli.ts all --tree .\` before every commit. Add rate
  limiting, test auth paths, and never swallow trust-path errors.

Start by writing specs/001-${slug}/plan.md from the spec, then tasks.md, then implement task by task, keeping each change green.`);

  const gooseRecipe = $derived(`version: "1.0.0"
title: "${(projectName || slug).replace(/"/g, "'")}"
description: "Build ${slug} — policy-clean (no Meta/OpenAI/xAI), via wecanjustbuildthings.dev"
instructions: |
  Read the constitution below and never violate it. Use only the listed,
  policy-clean dependencies. Run \`npx tsx ./enforcement/cli.ts all --tree .\`
  before every commit. Use a permitted BYOK provider only.
prompt: |
${agentPrompt.split('\n').map((l) => '  ' + l).join('\n')}
`);

  const readme = $derived(`# ${projectName || slug}

${problem || 'A freedom-tech project.'}

Scaffolded by wecanjustbuildthings.dev — every dependency is screened against the
Meta/OpenAI/xAI exclusion policy.

## Stack
${chosenItems.map((it) => `- [${it.name}](${it.repo || it.url}) — ${it.desc}`).join('\n') || '- (none)'}

## Build it with an agent
1. Configure your agent (Goose or Claude Code) with a permitted, BYOK provider.
2. Paste AGENT_PROMPT.txt (or open .specify/).
3. Keep every change green: \`npx tsx ./enforcement/cli.ts all --tree .\`

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
      'AGENT_PROMPT.txt': agentPrompt,
      '.specify/memory/constitution.md': constitution,
      [`specs/001-${slug}/spec.md`]: spec,
      [`${slug}.goose-recipe.yaml`]: gooseRecipe,
      '.claude/CLAUDE.md': `# Project context\n\nRead @.specify/memory/constitution.md first; read skills/*.SKILL.md and follow them; keep DESIGN-CARD.md in mind for every screen; run the enforcement engine before committing.\n`,
      'DESIGN-CARD.md': designCardMd(),
      'skills/README.md': skillsReadme,
      // The example is just a placeholder; once the builder has real skills, ship those instead.
      ...(skillCount ? {} : { 'skills/example.SKILL.md': skillExample }),
      ...customSkills,
    };
    return files;
  }

  // The Design Field Card, as a Markdown file that travels with the project — a
  // pocket reference for the builder and a design checklist the agent can follow.
  function designCardMd(): string {
    const c = CARD.en; // the file ships in English alongside the (English) constitution
    const moves = c.moves.map((m, i) => `${i + 1}. **${m.title}** — ${m.spot}\n   _Ask:_ ${m.ask}`).join('\n');
    const ship = c.ship.map((s) => `- ${s}`).join('\n');
    return `# Design Field Card\n\n${c.intro}\n\n## The five moves\n${moves}\n\n## ${c.accessLabel}\n\n    ${c.accessPrompt}\n\n## ${c.optionsLabel}\n\n    ${c.optionsPrompt}\n\n## ${c.shipLabel}\n${ship}\n\n---\nFull guide: https://wecanjustbuildthings.dev/guides/design-for-your-community/\n`;
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
  interface DraftSkill { name: string; description: string; method: string[]; source?: string }
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
  function slugifySkill(name: string): string {
    return (name || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill';
  }
  function skillToMd(s: DraftSkill): string {
    const title = slugifySkill(s.name).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const steps = s.method.map((m, i) => `${i + 1}. ${m}`).join('\n');
    return `---\nname: ${slugifySkill(s.name)}\ndescription: ${s.description}\nattribution:\n  source: "${s.source || 'Described by the builder in the Build Studio'}"\n  license: CC-BY-SA-4.0\n---\n\n# ${title}\n\n${steps}\n`;
  }
  function addSkill(s: DraftSkill) {
    customSkills = { ...customSkills, [`skills/${slugifySkill(s.name)}.SKILL.md`]: skillToMd(s) };
  }
  const skillCount = $derived(Object.keys(customSkills).length);

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
        .sort((a, b) => protoMatch(b) - protoMatch(a) || (b.verification === 'verified' ? 1 : 0) - (a.verification === 'verified' ? 1 : 0) || b.uses - a.uses)
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
    // Apply idempotently: 'add'/'remove' on a blueprint piece set its removed
    // state directly (never toggle — a toggle could re-add a piece the builder
    // already removed, or strike out one they kept).
    const pieceFor = (name: string) => blueprint.find((b) => b.item.name === name);
    if (p.action === 'add') {
      const bp = pieceFor(p.name);
      if (bp) { const r = new Set(removed); r.delete(bp.capId); removed = r; } // un-remove the piece
      else { const n = new Set(extra); n.add(p.name); extra = n; }
    } else if (p.action === 'remove') {
      const bp = pieceFor(p.name);
      if (bp) { const r = new Set(removed); r.add(bp.capId); removed = r; } // ensure removed
      else { const n = new Set(extra); n.delete(p.name); extra = n; }
    } else if (p.action === 'swap') {
      const bp = pieceFor(p.from ?? '');
      if (bp) swapPiece(bp.capId, p.name); else { const n = new Set(extra); n.add(p.name); extra = n; }
    }
    const a = new Set(aiApplied); a.add(i); aiApplied = a;
  }
</script>

<div class="studio" dir={rtl ? 'rtl' : 'ltr'}>
  {#snippet capIcon(id: string)}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {#if id === 'connect'}
        <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M11 6.7 6 17M13 6.7 18 17" />
      {:else if id === 'app'}
        <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M8 14h8" />
      {:else if id === 'identity'}
        <circle cx="8.5" cy="8.5" r="4" /><path d="M11.5 11.5 19 19M16 16l2-2" />
      {:else if id === 'privacy'}
        <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
      {:else if id === 'storage'}
        <ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
      {:else if id === 'payments'}
        <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
      {:else if id === 'hosting'}
        <rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="13" width="16" height="7" rx="2" /><path d="M8 7.5h.01M8 16.5h.01" />
      {:else}
        <circle cx="12" cy="12" r="8" /><path d="m9 12 2 2 4-4" />
      {/if}
    </svg>
  {/snippet}

  <header class="studio-hero">
    <div class="hero-text">
      <p class="wcb-eyebrow">{t.eyebrow}</p>
      <h1>Build Studio</h1>
      <p class="studio-sub">{t.studioLead}</p>
    </div>
    <div class="langbar">
      {#each ['en', 'es', 'ar'] as l}
        <button class="lang" class:on={lang === l} onclick={() => (lang = l as Lang)} aria-pressed={lang === l}>{l === 'en' ? 'English' : l === 'es' ? 'Español' : 'العربية'}</button>
      {/each}
    </div>
  </header>

  <ol class="stepper" aria-label="Progress">
    {#each [{ n: 1, label: t.sl1 }, { n: 2, label: t.sl2 }, { n: 3, label: t.sl3 }] as s (s.n)}
      <li class="stp" class:on={step === s.n} class:done={step > s.n}>
        <button onclick={() => { if (!(loading && s.n > 1)) step = s.n; }} disabled={loading && s.n > 1} aria-current={step === s.n ? 'step' : undefined}>
          <span class="stp-mark">
            {#if step > s.n}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-11" /></svg>
            {:else}{s.n}{/if}
          </span>
          <span class="stp-label">{s.label}</span>
        </button>
      </li>
    {/each}
  </ol>

  {#if step === 1}
    <section class="panel">
      <p class="hint">{t.tenq} <a href="/method/ten-questions/">↗</a></p>
      <p class="hint"><a href="/guides/design-for-your-community/">{t.designHint}</a></p>
      <label class="field"><span>{t.problem}</span><textarea bind:value={problem} rows="3" placeholder="e.g. Tenants need to document evictions without exposing who they are."></textarea></label>
      <div class="examples">
        <span class="hint">{t.examples}</span>
        <div class="chips">{#each EXAMPLES as ex}<button class="chip ex" onclick={() => (problem = ex)}>{ex}</button>{/each}</div>
      </div>
      <div class="field"><span>{t.protocols}</span>
        <div class="chips">{#each ALL_PROTOCOLS as p}<button class="chip" class:on={protocols.has(p)} onclick={() => toggleProto(p)} aria-pressed={protocols.has(p)}>{p}</button>{/each}</div>
        <p class="hint">{t.protoHelp}</p>
      </div>
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
      <p class="wcb-eyebrow diagram-label">{t.diagramLabel}</p>
      <ol class="pieces diagram">
        {#each blueprint as p (p.capId)}
          <li class="piece node" class:off={removed.has(p.capId)}>
            <span class="node-badge" aria-hidden="true">{@render capIcon(p.capId)}</span>
            <div class="node-content">
              <div class="piece-head">
                <span class="role">{p.role}</span>
                <button class="toggle" onclick={() => togglePiece(p.capId)} aria-pressed={!removed.has(p.capId)}>{removed.has(p.capId) ? t.bpKeep : t.bpRemove}</button>
              </div>
              <div class="piece-tool">
                <a class="tool-name" href={p.item.url}>{p.item.name}</a>
                <span class="vbadge vbadge--{p.item.verification}">{p.item.verification.replace('_', ' ')}</span>
                <span class="tool-meta">{p.item.ecosystem} · {p.item.license}</span>
              </div>
              <p class="piece-why"><strong>{t.bpWhyFor}</strong> {p.why}</p>
              <p class="piece-connects"><strong>{t.bpConnects}</strong> {p.connects}</p>
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
            </div>
          </li>
        {/each}
        <li class="foundation" aria-hidden="false">
          <span class="fnd-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
          </span>
          <span class="fnd-text">{t.foundation}</span>
        </li>
      </ol>

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
      <div class="handoff-cards" role="group" aria-label={t.handoff}>
        <button class="hcard" class:on={handoff === 'zip'} aria-pressed={handoff === 'zip'} onclick={() => (handoff = 'zip')}>
          <span class="hc-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 5 5-5M5 21h14" /></svg></span>
          <span class="hc-label">{t.zip}</span>
        </button>
        <button class="hcard" class:on={handoff === 'github'} aria-pressed={handoff === 'github'} onclick={() => (handoff = 'github')}>
          <span class="hc-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18Z" /><path d="M12 12v6M9.5 14.5 12 12l2.5 2.5" /></svg></span>
          <span class="hc-label">{t.github}</span>
        </button>
        <button class="hcard" class:on={handoff === 'goose'} aria-pressed={handoff === 'goose'} onclick={() => (handoff = 'goose')}>
          <span class="hc-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M10 9l5 3-5 3z" /></svg></span>
          <span class="hc-label">{t.goose}</span>
        </button>
        <button class="hcard" class:on={handoff === 'kickoff'} aria-pressed={handoff === 'kickoff'} onclick={() => (handoff = 'kickoff')}>
          <span class="hc-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /><path d="M18.5 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" /></svg></span>
          <span class="hc-label">{t.kickoff}</span>
        </button>
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
          <button class="primary big" onclick={() => blobDownload(`${slug}.goose-recipe.yaml`, gooseRecipe, 'text/yaml')}>{t.gooseDl}</button>
          <button onclick={() => copy('cmd', `goose run --recipe ${slug}.goose-recipe.yaml`)}>{copied === 'cmd' ? '✓' : t.gooseCopy}</button>
          <pre><code>goose run --recipe {slug}.goose-recipe.yaml</code></pre>
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

      <details class="card">
        <summary>{card.title} — {t.designHintShort}</summary>
        <p class="hint">{card.intro}</p>
        <ol class="moves card-moves">
          {#each card.moves as m, i}
            <li class="piece">
              <div class="piece-head"><span class="role">{m.title}</span>
                <button class="apply" onclick={() => copy(`cm${i}`, m.ask)}>{copied === `cm${i}` ? '✓' : t.cardCopyAsk}</button>
              </div>
              <p class="piece-why">{m.spot}</p>
              <p class="piece-connects"><em>{m.ask}</em></p>
            </li>
          {/each}
        </ol>
        <div class="card-prompt">
          <div class="prop-head"><span class="prop-name">{card.accessLabel}</span><button class="apply" onclick={() => copy('ca', card.accessPrompt)}>{copied === 'ca' ? '✓' : t.cardCopy}</button></div>
          <pre><code>{card.accessPrompt}</code></pre>
        </div>
        <div class="card-prompt">
          <div class="prop-head"><span class="prop-name">{card.optionsLabel}</span><button class="apply" onclick={() => copy('co', card.optionsPrompt)}>{copied === 'co' ? '✓' : t.cardCopy}</button></div>
          <pre><code>{card.optionsPrompt}</code></pre>
        </div>
        <p class="bp-sub">{card.shipLabel}</p>
        <ul class="ship">{#each card.ship as s}<li>{s}</li>{/each}</ul>
        <p class="hint"><a href="/guides/design-for-your-community/">{card.full}</a></p>
      </details>

      <div class="nav"><button onclick={() => (step = 2)}>{t.backStack}</button></div>
    </section>
  {/if}
</div>

<style>
  /* Take the Studio out of the docs chrome: splash gives full width + no
     sidebar/TOC; hide the auto page-title so the app owns its own header. */
  :global(.main-pane > main > .content-panel:first-child) { padding: 0; border: 0; }
  :global(.main-pane > main > .content-panel:first-child h1#_top) {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  :global(.main-pane > main > .content-panel + .content-panel) { border-top: 0; }
  :global(.main-pane > main .sl-container) { max-width: 56rem; margin-inline: auto; }

  .studio { color: var(--wcb-ink); margin: 0 0 var(--wcb-space-xl); }
  /* WCAG 2.2: a visible focus ring on every control; small targets clear the 24px floor. */
  .studio :focus-visible { outline: var(--wcb-focus-width) solid var(--wcb-focus-color); outline-offset: var(--wcb-focus-offset); border-radius: var(--wcb-radius-sm); }
  .studio .toggle, .studio .apply, .studio .lang { min-height: var(--wcb-target-min); }

  /* App header — the Studio owns its own front matter, not Starlight's. */
  .studio-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--wcb-space-md); flex-wrap: wrap; padding-bottom: var(--wcb-space-md); border-bottom: 2px solid var(--wcb-ink); margin-bottom: var(--wcb-space-lg); }
  .hero-text { flex: 1 1 22rem; }
  .studio-hero h1 { font-size: clamp(2rem, 4.5vw, 2.8rem); font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; margin: var(--wcb-space-2xs) 0 0; color: var(--wcb-ink); }
  .studio-sub { margin: var(--wcb-space-2xs) 0 0; color: var(--wcb-ink-soft); max-width: 56ch; font-size: var(--wcb-text-base); line-height: 1.5; }
  .langbar { display: flex; gap: var(--wcb-space-3xs); flex: 0 0 auto; }
  .lang { font-size: var(--wcb-text-sm); padding: 0.25rem 0.7rem; border-radius: var(--wcb-radius-sm); border: 1px solid var(--wcb-line); background: transparent; color: var(--wcb-ink-soft); cursor: pointer; }
  .lang.on { background: var(--wcb-green); color: var(--wcb-on-accent); border-color: var(--wcb-green); }

  /* Visual progress stepper — circles + a connector that fills green as you go. */
  .stepper { display: grid; grid-template-columns: repeat(3, 1fr); list-style: none; padding: 0; margin: 0 0 var(--wcb-space-lg); }
  .stp { position: relative; text-align: center; }
  .stp + .stp::before { content: ""; position: absolute; top: 1.1rem; inset-inline-start: -50%; width: 100%; height: 2px; background: var(--wcb-line); z-index: 0; }
  .stp.done + .stp::before { background: var(--wcb-green); }
  .stp button { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: var(--wcb-space-3xs); width: 100%; background: none; border: 0; cursor: pointer; color: var(--wcb-ink-soft); font: inherit; padding: 0; }
  .stp button:disabled { cursor: default; }
  .stp-mark { display: inline-flex; align-items: center; justify-content: center; width: 2.2rem; height: 2.2rem; border-radius: 50%; background: var(--wcb-paper); border: 2px solid var(--wcb-line); color: var(--wcb-ink-soft); font-weight: 800; font-family: var(--sl-font-mono); }
  .stp-mark svg { width: 1.1rem; height: 1.1rem; }
  .stp-label { font-size: var(--wcb-text-sm); font-weight: 700; }
  .stp.on .stp-mark { background: var(--wcb-green); border-color: var(--wcb-green); color: var(--wcb-on-accent); }
  .stp.on .stp-label, .stp.done .stp-label { color: var(--wcb-ink); }
  .stp.done .stp-mark { background: color-mix(in srgb, var(--wcb-green) 16%, var(--wcb-paper)); border-color: var(--wcb-green); color: var(--wcb-green); }

  .panel { display: flex; flex-direction: column; gap: var(--wcb-space-md); background: var(--wcb-card); border: 1px solid var(--wcb-line); border-radius: var(--wcb-radius-md); padding: clamp(var(--wcb-space-md), 3vw, var(--wcb-space-lg)); }
  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field > span { font-weight: 700; font-size: var(--wcb-text-sm); color: var(--wcb-ink); }
  input, textarea, select { padding: 0.65rem 0.8rem; border: 1px solid var(--wcb-line); border-radius: var(--wcb-radius-sm); background: var(--wcb-paper); color: var(--wcb-ink); font: inherit; transition: border-color var(--wcb-motion-fast) var(--wcb-easing-standard); }
  input:focus, textarea:focus, select:focus { border-color: var(--wcb-green); }
  .chips { display: flex; flex-wrap: wrap; gap: var(--wcb-space-2xs); }
  .chip { padding: 0.35rem 0.85rem; border-radius: var(--wcb-radius-sm); border: 1px solid var(--wcb-line); background: var(--wcb-paper); color: var(--wcb-ink); cursor: pointer; font-weight: 600; }
  .chip.on { background: var(--wcb-green); color: var(--wcb-on-accent); border-color: var(--wcb-green); }

  /* Handoff: pick how to take your starter — icon cards, not bare tabs. */
  .handoff-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--wcb-space-2xs); }
  @media (max-width: 34rem) { .handoff-cards { grid-template-columns: repeat(2, 1fr); } }
  .hcard { display: flex; flex-direction: column; align-items: center; gap: var(--wcb-space-2xs); padding: var(--wcb-space-sm) var(--wcb-space-2xs); border: 1px solid var(--wcb-line); border-radius: var(--wcb-radius-sm); background: var(--wcb-paper); color: var(--wcb-ink); cursor: pointer; font-weight: 700; font-size: var(--wcb-text-sm); text-align: center; transition: border-color var(--wcb-motion-fast) var(--wcb-easing-standard); }
  .hcard:hover { border-color: var(--wcb-green); }
  .hcard.on { border-color: var(--wcb-green); background: color-mix(in srgb, var(--wcb-green) 10%, transparent); }
  .hc-ico { display: inline-flex; width: 2.4rem; height: 2.4rem; align-items: center; justify-content: center; border-radius: var(--wcb-radius-sm); background: var(--wcb-card); color: var(--wcb-green); border: 1px solid var(--wcb-line); }
  .hcard.on .hc-ico { background: var(--wcb-green); color: var(--wcb-on-accent); border-color: var(--wcb-green); }
  .hc-ico svg { width: 1.3rem; height: 1.3rem; }
  .hpanel { border: 1px solid var(--wcb-line); border-radius: var(--wcb-radius-sm); padding: var(--wcb-space-md); display: flex; flex-direction: column; gap: 0.7rem; margin-top: var(--wcb-space-2xs); }
  .picklist { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
  .pick { border: 1px solid var(--sl-color-gray-6); border-radius: var(--wcb-radius-sm); padding: 0.5rem 0.7rem; }
  .pick.on { border-color: var(--sl-color-accent); }
  .pick label { display: grid; grid-template-columns: auto 1fr auto; gap: 0.2rem 0.6rem; align-items: baseline; cursor: pointer; }
  .pick-name { font-weight: 700; }
  .pick-meta { color: var(--sl-color-gray-2); font-size: 0.82rem; }
  .pick-desc { grid-column: 2 / -1; color: var(--sl-color-text); font-size: 0.85rem; }
  .vbadge { font-size: 0.68rem; font-weight: 700; padding: 0.05rem 0.4rem; border-radius: var(--wcb-radius-pill); border: 1px solid var(--sl-color-gray-5); border-left-width: 3px; }
  .vbadge--verified { border-left-color: var(--wcb-success-edge); }
  .vbadge--under_review { border-left-color: var(--wcb-warning-edge); }
  .vbadge--blocked { border-left-color: var(--wcb-danger-edge); }
  .examples { display: flex; flex-direction: column; gap: 0.4rem; }
  .chip.ex { text-align: start; font-size: 0.82rem; max-width: 100%; white-space: normal; line-height: 1.3; }
  .deeper, .advanced { border: 1px solid var(--sl-color-gray-6); border-radius: var(--wcb-radius-sm); padding: 0.5rem 0.75rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .refine { border: 1px solid var(--sl-color-accent); border-radius: 0.6rem; padding: 0.6rem 0.85rem; display: flex; flex-direction: column; gap: 0.6rem; background: color-mix(in srgb, var(--sl-color-accent) 5%, transparent); }
  .refine > summary { cursor: pointer; color: var(--sl-color-text-accent); font-weight: 700; }
  .qs { list-style: none; counter-reset: q; padding: 0; margin: 0; display: grid; gap: 0.7rem; }
  .qs li { counter-increment: q; }
  .qs .q { margin: 0 0 0.3rem; font-weight: 600; }
  .qs .q::before { content: counter(q) '. '; color: var(--sl-color-text-accent); }
  .proposals { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; }
  .proposal { border: 1px solid var(--sl-color-gray-5); border-inline-start: 4px solid var(--sl-color-accent); border-radius: var(--wcb-radius-sm); padding: 0.6rem 0.8rem; }
  .prop-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--wcb-space-xs); flex-wrap: wrap; }
  .prop-name { font-weight: 700; }
  .apply { background: var(--sl-color-accent); color: var(--wcb-on-accent); border: 0; border-radius: var(--wcb-radius-pill); padding: 0.15rem 0.7rem; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
  .applied { font-size: 0.78rem; font-weight: 700; color: var(--wcb-success-text); }
  .prop-why, .prop-watch { margin: 0.3rem 0 0; font-size: 0.88rem; color: var(--sl-color-text); }
  .card { border: 1px solid var(--sl-color-accent); border-radius: var(--wcb-radius-sm); padding: 0.6rem 0.85rem; display: flex; flex-direction: column; gap: 0.6rem; background: color-mix(in srgb, var(--sl-color-accent) 5%, transparent); }
  .card > summary { cursor: pointer; color: var(--sl-color-text-accent); font-weight: 700; }
  .card-prompt { border: 1px solid var(--sl-color-gray-5); border-radius: var(--wcb-radius-sm); padding: 0.5rem 0.7rem; }
  .card-prompt pre { margin: var(--wcb-space-3xs) 0 0; }
  .ship { margin: 0; padding-inline-start: 1.1rem; display: grid; gap: var(--wcb-space-3xs); font-size: 0.88rem; color: var(--sl-color-text); }
  .skillsbox { border: 1px solid var(--sl-color-gray-6); border-radius: var(--wcb-radius-sm); padding: 0.5rem 0.75rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .skillsbox > summary { cursor: pointer; color: var(--sl-color-text-accent); font-weight: 600; }
  .skilllist { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--wcb-space-2xs); }
  .skillcard { border: 1px solid var(--sl-color-gray-5); border-inline-start: 4px solid var(--sl-color-accent); border-radius: var(--wcb-radius-sm); padding: 0.55rem 0.8rem; }
  .skill-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--wcb-space-xs); flex-wrap: wrap; }
  .skill-name { font-weight: 700; font-family: var(--sl-font-mono); font-size: 0.92rem; }
  .skill-desc { margin: 0.25rem 0 0; font-size: 0.88rem; color: var(--sl-color-text); }
  .skill-steps { margin: 0.4rem 0 0; padding-inline-start: 1.2rem; font-size: 0.85rem; color: var(--sl-color-gray-2); display: grid; gap: 0.15rem; }
  .deeper summary, .advanced summary, .swap summary { cursor: pointer; color: var(--sl-color-text-accent); font-size: 0.9rem; font-weight: 600; }
  .bp-head h3 { margin: 0 0 0.3rem; }
  .bp-sub { margin: 0.4rem 0 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--wcb-ink-soft); }
  .diagram-label { margin: var(--wcb-space-2xs) 0; display: block; }

  /* The blueprint is an architecture diagram you can edit: capability badges
     down a connector spine, ending on the verified foundation. */
  .pieces.diagram { list-style: none; padding: 0; margin: 0; display: block; }
  .piece.node { position: relative; display: grid; grid-template-columns: 2.6rem 1fr; gap: var(--wcb-space-sm); padding: var(--wcb-space-2xs) 0; }
  .diagram .piece:not(:last-child)::before { content: ""; position: absolute; top: 2.6rem; bottom: -0.6rem; inset-inline-start: 1.3rem; width: 2px; background: var(--wcb-line); transform: translateX(-1px); }
  .node-badge { position: relative; z-index: 1; display: inline-flex; width: 2.6rem; height: 2.6rem; align-items: center; justify-content: center; border-radius: var(--wcb-radius-sm); background: var(--wcb-green); color: var(--wcb-on-accent); }
  .node-badge svg { width: 1.4rem; height: 1.4rem; }
  .node-content { border: 1px solid var(--wcb-line); border-radius: var(--wcb-radius-sm); padding: 0.7rem 0.9rem; background: var(--wcb-paper); }
  .piece.off { opacity: 0.5; }
  .piece.off .node-badge { background: var(--wcb-line); color: var(--wcb-ink-soft); }
  .piece-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--wcb-space-xs); }
  .role { font-weight: 800; font-size: var(--wcb-text-sm); text-transform: uppercase; letter-spacing: 0.04em; color: var(--wcb-ink); }
  .toggle { background: none; border: 1px solid var(--wcb-line); border-radius: var(--wcb-radius-sm); padding: 0.1rem 0.6rem; font-size: 0.74rem; color: var(--wcb-ink-soft); cursor: pointer; }
  .piece-tool { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--wcb-space-2xs); margin: 0.35rem 0; }
  .tool-name { font-weight: 700; font-size: 1.02rem; color: var(--wcb-ink); }
  .tool-meta { color: var(--wcb-ink-soft); font-size: 0.8rem; }
  .piece-why, .piece-connects { margin: 0.25rem 0; font-size: 0.9rem; color: var(--wcb-ink-soft); }
  .piece-why strong, .piece-connects strong { color: var(--wcb-ink); }
  .swap { margin-top: 0.45rem; border: 0; padding: 0; }
  .swap ul { list-style: none; padding: 0.4rem 0 0; margin: 0; display: grid; gap: 0.3rem; }
  .foundation { display: flex; align-items: center; gap: var(--wcb-space-2xs); margin-top: var(--wcb-space-sm); padding: 0.75rem 0.9rem; border: 1px solid var(--wcb-green); border-radius: var(--wcb-radius-sm); background: color-mix(in srgb, var(--wcb-green) 10%, transparent); color: var(--wcb-ink); font-weight: 700; font-size: var(--wcb-text-sm); }
  .fnd-ico { display: inline-flex; color: var(--wcb-green); }
  .fnd-ico svg { width: 1.4rem; height: 1.4rem; }
  .mtitle { margin: 0; font-size: 1.05rem; }
  .modelgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  @media (max-width: 34rem) { .modelgrid { grid-template-columns: 1fr; } }
  .modelnote { margin: 0; padding: 0.6rem 0.75rem; border-radius: var(--wcb-radius-sm); background: var(--sl-color-gray-6); border-inline-start: 3px solid var(--sl-color-accent); color: var(--sl-color-text); font-size: 0.88rem; }
  .nav { display: flex; justify-content: space-between; gap: var(--wcb-space-2xs); margin-top: var(--wcb-space-2xs); }
  .nav button { padding: 0.6rem 1.1rem; border-radius: var(--wcb-radius-sm); border: 1px solid var(--wcb-line); background: var(--wcb-paper); color: var(--wcb-ink); cursor: pointer; font-weight: 700; }
  .nav button:hover { border-color: var(--wcb-green); }
  .primary { background: var(--wcb-green); color: var(--wcb-on-accent); border: 1px solid var(--wcb-green); padding: 0.65rem 1.2rem; border-radius: var(--wcb-radius-sm); cursor: pointer; font-weight: 700; transition: transform var(--wcb-motion-fast) var(--wcb-easing-standard), background var(--wcb-motion-fast) var(--wcb-easing-standard); }
  .primary:hover { transform: translateY(-1px); background: color-mix(in srgb, var(--wcb-green) 88%, black); }
  .primary:active { transform: translateY(0); }
  .primary:disabled { opacity: 0.55; cursor: default; transform: none; }
  .big { font-size: 1.05rem; padding: 0.75rem 1.4rem; }
  .hint { color: var(--wcb-ink-soft); font-size: 0.9rem; }
  .err { color: var(--wcb-danger-text); font-size: 0.9rem; }
  .link { background: none; border: 0; color: var(--wcb-coral-text); cursor: pointer; text-decoration: underline; font: inherit; }
  .copyp { align-self: flex-start; }
  details { border: 1px solid var(--wcb-line); border-radius: var(--wcb-radius-sm); padding: 0.5rem 0.75rem; }
  summary { font-weight: 700; cursor: pointer; display: flex; justify-content: space-between; gap: var(--wcb-space-sm); color: var(--wcb-ink); }
  pre { max-height: 22rem; overflow: auto; background: var(--wcb-card); border: 1px solid var(--wcb-line); color: var(--wcb-ink); padding: var(--wcb-space-xs); border-radius: var(--wcb-radius-sm); }
  pre code { color: var(--wcb-ink); }
  .out { max-height: 28rem; }
  @media (prefers-reduced-motion: reduce) { .primary, .nav button, .hcard, .chip, .lang { transition: none; } }
</style>
