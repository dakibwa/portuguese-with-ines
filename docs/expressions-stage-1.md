# Expressions: source and integration scope

Reference: the private `dakibwa/ines-idioms-app` repository at
`599b6f5b8fca848f91bd439c4268344b6a29bb16`, imported from Inês's 13 October 2026
ZIP. `HANDOVER.md` was read first, then the current application source. No
dependencies, app, tests or build from that repository were installed or run.

## Feature and screen map

| Original feature or screen | Website location or later decision |
| --- | --- |
| Single-screen roulette landing page, wordmark and organic watermark | The website supplies its own existing portal, type, palette, header and splats. The teacher Expressions tab manages the collection; students draw below Your lessons. |
| Latest dictionary entry: “expressão idiomática”, “nome feminino”, “Conjunto de palavras com um significado próprio, diferente do seu sentido literal.” | Preserved verbatim in the tab introduction. |
| Instruction to press “Rodar”; “Que expressão vai sair?” ready screen | The student card offers “Paint it” (then “Paint another”) beside a cream sheet with unseen phrases faintly in wax. The teacher catalogue opens directly for reviewing and editing. |
| Random selection, previous/next reel lines, 18 slowing frames, blue-only transitions, no final jump, repeat spin | “Pinta e descobre”: a gouache brush paints the server-selected published expression through the wax, line by line, in a different paint each time; about one press in three first starts and crosses out an unseen phrase (design/README.md). Each student has independent saved history and no repeats; once exhausted, they wait for new expressions. The teacher editor does not paint. |
| Reduced-motion instant result, disabled double spins, cleanup on leaving | Implemented for the student picker. Picks are saved before the painting, the button stays disabled until the reveal, reduced motion shows the finished painting and reading at once, and leaving mid-stroke cancels it cleanly. |
| “Ver mais informação” / “Ocultar informação” result detail state | Meanings, literal English and examples are immediately readable on cream cards. Notes/origin have a disclosure. The same reading component appears in the student picker and private teacher preview. |
| Portuguese meaning, literal English translation, idiomatic English equivalent | All preserved separately; English equivalent seeds Meaning or equivalent in English. Inês can refine it before publication. |
| Context/usage caveats and external reference link | Preserved as editable notes/origin and reference link, visible under “Notas e origem”. |
| Built-in catalogue combined with previously saved Portuguese expressions | All 52 recoverable built-ins become D1 drafts. No live saved expressions were included in the bundle. Teacher create/edit/delete now manages the collection. |
| Legacy expression-creation endpoint returns 410 | Not carried over. The teacher-only endpoint is the sole creation path in this stage. Students do not add roulette entries. |
| “Como se diz na tua língua?” / “Adiciona uma expressão idiomática equivalente.” | Exact copy recorded here, including its full stop. Student contributions are deferred to an explicit Stage 2/3 decision; they must stay attached to a parent expression. |
| Student equivalent list grouped under the selected expression, language labels and automatic text direction | Deferred. No live suggestions were included; no student submissions are invented or imported. The picker does not add a contribution form. |
| “Adicionar equivalente” dialog: parent expression, language, equivalent text, Cancel/Save | Deferred with student contributions. The teacher collection has an expression editor and a private student preview. |
| Student-equivalent sign-in, same-origin checks, validation, duplicate refusal | Sites sign-in is dropped. All teacher collection endpoints use the website's existing teacher/shared-token authorization, origin checks and input validation. Student contribution authorization is future work. |
| Per-expression unsent suggestion drafts, pending state, save error/retry and success notice | Teacher edit drafts stay present after a failed save; dirty close asks before discarding. Loading, error, empty and success states stay separate. Student draft preservation waits with contributions. |
| Catalogue/equivalent load errors and retry, abort stale reads, merge successful concurrent suggestion saves | The tab has reload/error/empty states, ignores replies after account changes or unmount, and rejects stale editing versions. Concurrent merging of student contributions remains deferred. |
| Keyboard modal, Escape, return to opener, result live announcements | Editor/preview reuse the portal's focus trap, backdrop gesture checks, scroll lock, close/return focus and status/error announcements. |
| No visible count of the original expressions | Preserved. No “52 expressions” count appears in the tool. |
| Source fonts, brand SVGs, favicon/Open Graph images, Sites Worker and Vite setup | Website-owned assets and configuration are reused. No separate app, package, deployment or sign-in is installed. |
| Expression and packaging photographs; business-card PDF | Read-only reference. Strip text is too small for individual learning cards; packaging and print branding are not suitable expression illustrations. No unused files are added to `public/visuals/`. |
| Examples, themes, optional individual images, draft/publication review, search and reorder | New teacher authoring controls requested for Stage 1. The original bundle had no example sentences, themes or per-expression image mapping. |

## Original data model

`current-app/lib/expressions.ts` has 52 static tuples: Portuguese expression,
literal English, idiomatic English equivalent, Portuguese meaning, optional
note and optional source URL. IDs are `original-1` through `original-52`.
There are no example-sentence, theme, publication, image or order fields.

The source D1/Drizzle schema contains:

- `expressions`: `id` (text primary key), `portuguese`, unique `normalized`,
  `literal`, `equivalent`, `created_by` and numeric `created_at`.
- `equivalents`: `id` (text primary key), `expression_id`, `language`, `text`,
  `normalized_language`, `normalized_text`, `created_by`, numeric `created_at`;
  a unique index covers parent expression + normalized language + text.
  The API checks parents against both built-ins and saved expressions.

The new schema keeps expression identity and a separate normalized duplicate
key. It adds the requested content/review fields and drops the separate app's
creator/sign-in coupling. Student equivalents are not created as an unused
table. A new student-pick table stores each account’s independent draw history.
API and field limits are documented in
[the booking-system contract](../docs-booking-system.md#expressions-collection--stage-1).

## Publication uncertainty and later stages

The handover reports a restricted published Sites app and a latest platform
update of 29 September 2026, 12:36 UTC. It says the final dictionary-entry and
punctuation changes exist in local source, but the next publication attempt was
interrupted. Those changes were **not confirmed live**. This work uses the
latest local copy and does not claim access to, or verification of, that app.

- Student discovery (now included at Dan's request): random published picks in
  signed-in students' Your lessons, painted into view and with no repeats per
  student. Different students can receive the same expression. This replaces
  the earlier weekly-card plan; no weekly cadence is imposed.
- Multilingual student suggestions remain deferred. They require a separate
  decision about contribution and moderation behavior.
- Stage 3 (plan only): a public Expressões page and optionally a home-page
  expression after Inês approves the collection. Public menu and home page are
  unchanged.
- Inês needs to review the meanings/equivalents, supply one or two examples per
  expression, and choose any themes or illustrations. Drafts allow these to be
  incomplete; publication requires both meanings and at least one example.
  “Draft” describes this publication state, not a judgment that the original
  expression text is unfinished or incorrect. Inês edits and publishes in her
  existing teacher interface.
- Dan controls release after review. This PR does not merge, migrate, deploy,
  send correspondence or change production records.

## Imported content

The following is the source inventory, not a newly authored teaching text.
Every entry imports unpublished. Examples, themes and images are absent for
every entry. The migration contains the editable seed; this table records its
provenance. Notes and original reference URLs are retained without asserting
that the references have been independently fact-checked.

| Expression | Portuguese meaning | Literal English | English equivalent | Notes / source |
| --- | --- | --- | --- | --- |
| Partir o coco a rir | Rir muito. | To crack the coconut laughing | To split your sides laughing | — |
| À sombra da bananeira | Acomodar-se e deixar de fazer um esforço. | In the shade of the banana tree | To rest on your laurels | Aproximação: o equivalente inglês costuma pressupor um sucesso anterior. |
| Ficar a ver navios | Ficar sem aquilo que se esperava. | To be left watching ships | To be left high and dry | — |
| Partir a loiça toda | Ter um desempenho que impressiona toda a gente. | To break all the crockery | To bring the house down | Neste sentido positivo. Também pode significar causar confusão ou agir de forma explosiva; nesse contexto, «to raise hell» é uma aproximação. |
| Ir com os porcos | Perder-se, estragar-se ou falhar. | To go with the pigs | To go down the drain | Para algo que se perde. Quando se refere a morrer, «to kick the bucket» é um equivalente informal. |
| Ter muita lata | Ser descarado ou atrevido. | To have a lot of tin | To have some nerve | — |
| Engolir sapos | Suportar algo desagradável sem responder. | To swallow toads | To bite your tongue | Aproximação: a expressão inglesa realça conter o que se quer dizer. |
| Nascer com o rabo virado para a Lua | Ter muita sorte. | To be born with your backside facing the moon | To be born under a lucky star | — |
| Cereja no topo do bolo | Um pormenor que torna algo bom ainda melhor. | The cherry on top of the cake | The icing on the cake | — |
| Vai chatear o Camões! | Mandar alguém deixar de incomodar. | Go and bother Camões! | Go fly a kite! | Ambas são respostas informais e podem soar bruscas. |
| Nem que a vaca tussa! | Dizer que algo nunca acontecerá. | Not even if the cow coughs! | When pigs fly! | — |
| Tirar o cavalinho da chuva | Desistir de esperar por algo que não vai acontecer. | To take the little horse out of the rain | Don't hold your breath | — |
| Ter mais olhos que barriga | Querer mais comida do que se consegue comer. | To have more eyes than stomach | Your eyes are bigger than your stomach | — |
| Lágrimas de crocodilo | Uma manifestação de tristeza que não é sincera. | Crocodile tears | Crocodile tears | — |
| Nariz empinado | Ter uma atitude arrogante. | An upturned nose | To have your nose in the air | — |
| Paninhos quentes | Tentar suavizar ou remediar um problema sem o resolver de fundo. | Little warm cloths | To paper over the cracks | Aproximação para o sentido de solução superficial. Ao falar de evitar dizer algo diretamente, também se usa «to beat around the bush». https://dicionario.priberam.org/paninhos%20quentes |
| Quem tem boca vai a Roma | Perguntar ajuda a chegar onde se quer. | Those who have a mouth get to Rome | Nothing ventured, nothing gained | Não há correspondência exata: o provérbio inglês transmite a ideia mais geral de tomar a iniciativa. |
| Ficar em águas de bacalhau | Não ter resultado nem seguimento. | To end up in codfish water | To come to nothing | — |
| Dor de cotovelo | Sentir inveja de alguém. | Elbow pain | To be green with envy | No sentido de inveja. Também pode referir-se a sofrimento amoroso, conforme o contexto. |
| Ainda não caiu a ficha | Ainda não perceber ou assimilar uma situação. | The token hasn't dropped yet | The penny hasn't dropped yet | — |
| Estar de trombas | Mostrar mau humor ou desagrado. | To have a snout on | To have a face like thunder | — |
| Acordar com os pés de fora | Acordar de mau humor. | To wake up with your feet outside | To get out of bed on the wrong side | — |
| Cão que ladra não morde | Quem ameaça muito nem sempre faz aquilo que diz. | A dog that barks doesn't bite | His bark is worse than his bite | — |
| Muitos anos a virar frangos | Ter muita experiência numa atividade. | Many years turning chickens | To know the ropes | — |
| Ter a pulga atrás da orelha | Suspeitar de alguma coisa. | To have a flea behind your ear | To smell a rat | — |
| Encontrar uma agulha no palheiro | Encontrar algo extremamente difícil de localizar. | To find a needle in a haystack | To find a needle in a haystack | — |
| Cabeça na Lua | Estar distraído ou a sonhar acordado. | Your head on the moon | To have your head in the clouds | — |
| Dizer cobras e lagartos | Falar com muita raiva ou dizer coisas duras sobre alguém. | To say snakes and lizards | To give someone a tongue-lashing | A expressão inglesa aplica-se sobretudo a uma repreensão dirigida à pessoa. |
| Burro velho não aprende línguas | Ditado usado para falar da dificuldade em mudar hábitos antigos. | An old donkey doesn't learn languages | You can't teach an old dog new tricks | É um ditado, não um facto: aprende-se em qualquer idade. |
| Memória de elefante | Ter uma excelente memória. | An elephant's memory | To have a memory like an elephant | — |
| Barata tonta | Andar de um lado para o outro, de forma desorientada. | A dizzy cockroach | Like a headless chicken | — |
| Meter o Rossio na Rua da Betesga | Querer pôr demasiadas coisas num espaço demasiado pequeno. | To fit Rossio Square into Betesga Street | To squeeze a quart into a pint pot | Equivalente britânico: uma quart contém duas pints. https://dictionary.cambridge.org/dictionary/english/quart |
| Pensar na morte da bezerra | Estar distraído, alheado do que se passa. | To think about the death of the female calf | To be away with the fairies | O equivalente inglês é informal. |
| Chover a potes | Chover muito. | To rain pots | To rain cats and dogs | — |
| Ferver em pouca água | Irritar-se com facilidade. | To boil in very little water | To have a short fuse |  https://dicionario.priberam.org/ferver%20em%20pouca%20%C3%A1gua |
| Pentear macacos | Em «vai pentear macacos!», mandar alguém ir incomodar outra pessoa. | To comb monkeys | Go fly a kite! | Usada como ordem informal, que pode soar brusca. |
| Dar com a língua nos dentes | Revelar um segredo. | To hit your teeth with your tongue | To spill the beans | — |
| Quem não tem cão, caça com gato | Desenrascar-se com os meios disponíveis. | Those who don't have a dog hunt with a cat | To make the best of a bad job | Aproximação: aproveitar o que se tem, mesmo que não seja o ideal. |
| À grande e à francesa | Viver ou fazer algo com luxo e abundância. | On a grand scale and in the French manner | To live the life of Riley | O equivalente inglês realça uma vida confortável e despreocupada. |
| Línguas de perguntador | Resposta brincalhona para não satisfazer uma pergunta curiosa. | Questioners' tongues | Ask no questions and you'll be told no lies | Equivalente funcional aproximado: não designa comida nem traduz a imagem portuguesa. https://web.letras.up.pt/ftopa/Artigos%20em%20revistas/Na%20ponta%20da%20l%C3%ADngua.pdf |
| A pensar morreu um burro | Dizer a alguém para deixar de hesitar e passar à ação. | A donkey died thinking | He who hesitates is lost | Equivalente aproximado, usado como provérbio. https://cvc.cervantes.es/lengua/refranero/Ficha.aspx?Lng=6&Par=59093 |
| É canja! | É muito fácil. | It's chicken soup! | It's a piece of cake! | — |
| Grão a grão enche a galinha o papo | Pequenas quantidades ou esforços acabam por produzir um grande resultado. | Grain by grain, the hen fills its crop | Many a little makes a mickle | Provérbio inglês tradicional. Na linguagem corrente, «every little helps» transmite a mesma ideia. |
| Com uma perna às costas | Fazer algo com muita facilidade. | With one leg behind your back | With one hand tied behind your back | — |
| Feito ao bife | Estar em apuros, sem uma boa saída. | Done like a steak | Your goose is cooked | — |
| Abanar o capacete | Dançar. | To shake the helmet | To shake a leg | No sentido de dançar. Em inglês, «shake a leg» também pode querer dizer «despacha-te». |
| Rés-vés Campo de Ourique | Por muito pouco; à justa. | Just skimming Campo de Ourique | By the skin of your teeth | O equivalente aplica-se sobretudo a conseguir algo ou escapar por muito pouco. |
| Meter a pata na poça | Dizer ou fazer algo inconveniente por engano. | To put your paw in the puddle | To put your foot in it | — |
| Soltar a franga | Descontrair-se e divertir-se sem inibições. | To let the young hen loose | To let your hair down | — |
| Mais vale um pássaro na mão que dois a voar | É preferível uma vantagem certa a uma possibilidade incerta. | A bird in the hand is worth more than two flying | A bird in the hand is worth two in the bush | — |
| Más línguas | Pessoas que fazem comentários maldosos ou espalham rumores. | Bad tongues | The rumour mill | Aproximação: a expressão inglesa designa a circulação de rumores, não propriamente as pessoas. |
| Filho de peixe sabe nadar | Os filhos tendem a ter características ou aptidões semelhantes às dos pais. | A fish's child knows how to swim | The apple doesn't fall far from the tree | — |
