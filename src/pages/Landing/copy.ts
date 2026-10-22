// Copy deck for the landing page, both languages side by side.
// Rules (tasteskill copy.md): headlines ≤ 2 lines (~32 chars), one supporting
// sentence, one primary action named for what it does, no invented proof.
import type { Text } from '@/lib/i18n/lang'

export const nav = {
  stats: { en: 'What you log', is: 'Hvað er skráð' },
  trust: { en: 'Trust', is: 'Traust' },
  inside: { en: 'Look inside', is: 'Inn í appið' },
  questions: { en: 'Questions', is: 'Spurningar' },
  signIn: { en: 'Sign in', is: 'Innskráning' },
  action: { en: 'Request access', is: 'Sækja um aðgang' },
  langLabel: { en: 'Language', is: 'Tungumál' },
} satisfies Record<string, Text>

export const hero = {
  halfA: { en: 'Your numbers,', is: 'Þínar tölur,' },
  halfB: { en: 'your rules', is: 'þínar reglur' },
  support: {
    en: 'Handball statistics for anyone who keeps them. Log attack, defence and goalkeeping courtside, as much or as little as you want, then filter, chart and export it any way you like.',
    is: 'Handboltatölfræði fyrir alla sem halda utan um tölur. Skráðu sókn, vörn og markvörslu við völlinn, eins mikið eða lítið og þú vilt, og síaðu, teiknaðu og sæktu gögnin eins og þér hentar.',
  },
  frames: [
    { en: 'Attack: goals, assists and turnovers, player by player', is: 'Sókn: mörk, stoðsendingar og tapaðir boltar á hvern leikmann' },
    { en: 'Defence: blocks, steals, duels and suspensions', is: 'Vörn: blokk, stolnir boltar, einvígi og brottvísanir' },
    { en: 'Goalkeeping: every save, by range and by zone', is: 'Markvarsla: hver varsla, eftir færi og svæði' },
    { en: 'Your view: any stat, any match, any minute', is: 'Þín sýn: hvaða tala, leikur og mínúta sem er' },
  ],
  count: { en: 'of', is: 'af' }, // "2 of 4"
} satisfies Record<string, Text | Text[]>

export const pillars = {
  heading: { en: 'Stat the whole game', is: 'Skráðu allan leikinn' },
  sentence: {
    en: 'Not just the shots. Log every side of the game in as much detail as you want, or only the parts your team is working on.',
    is: 'Ekki bara skotin. Skráðu allar hliðar leiksins eins ítarlega og þú vilt, eða bara það sem liðið er að vinna í.',
  },
  logLabel: { en: 'What you can log', is: 'Það sem þú getur skráð' },
  items: [
    {
      name: { en: 'Attack', is: 'Sókn' },
      line: { en: 'Every shot with its range, phase, numbers on court and zone. Who assisted, who drew the penalty, who lost the ball.', is: 'Hvert skot með færi, tegund sóknar, leiktölu og svæði. Hver átti stoðsendingu, hver fiskaði víti, hver tapaði boltanum.' },
      chips: [
        { en: 'Shots', is: 'Skot' }, { en: 'Range', is: 'Færi' }, { en: 'Fast break', is: 'Hraðaupphlaup' },
        { en: 'Numbers on court', is: 'Leiktala' }, { en: 'Zone', is: 'Svæði' }, { en: 'Assists', is: 'Stoðsendingar' },
        { en: 'Drew 7 m', is: 'Fiskað víti' }, { en: 'Turnovers', is: 'Tapaðir boltar' }, { en: 'Possessions', is: 'Sóknir' },
      ],
    },
    {
      name: { en: 'Defence', is: 'Vörn' },
      line: { en: 'Blocks, steals, duels won and lost, rebounds, fouls and every card, for each player on the court.', is: 'Blokk, stolnir boltar, unnin og töpuð einvígi, fráköst, brot og öll spjöld, fyrir hvern leikmann á vellinum.' },
      chips: [
        { en: 'Blocks', is: 'Blokk' }, { en: 'Steals', is: 'Stolnir boltar' }, { en: 'Duels', is: 'Einvígi' },
        { en: 'Rebounds', is: 'Fráköst' }, { en: 'Free throws', is: 'Fríköst' }, { en: '7 m conceded', is: 'Víti á' },
        { en: '2 minutes', is: '2 mínútur' }, { en: 'Cards', is: 'Spjöld' }, { en: 'Substitutions', is: 'Skiptingar' },
      ],
    },
    {
      name: { en: 'Goalkeeping', is: 'Markvarsla' },
      line: { en: 'Each shot your keeper faces: where it came from, where it went, saved or not. Each keeper kept apart.', is: 'Hvert skot sem markmaðurinn fær á sig: hvaðan það kom, hvert það fór, varið eða ekki. Hver markmaður sér.' },
      chips: [
        { en: 'Saves', is: 'Varin skot' }, { en: 'Goals against', is: 'Mörk á sig' }, { en: 'Range', is: 'Færi' },
        { en: 'Zone', is: 'Svæði' }, { en: 'Phase', is: 'Tegund sóknar' }, { en: 'Empty phase', is: 'Tómur fasi' },
        { en: 'Positive response', is: 'Jákvæð viðbrögð' },
      ],
    },
  ],
} satisfies Record<string, Text | object>

export const trust = {
  heading: { en: 'Numbers you can trust', is: 'Tölur sem þú getur treyst' },
  sentence: {
    en: 'Every number is counted from events you logged, never typed in. Remove a wrong one and every table corrects itself.',
    is: 'Hver tala er talin úr skráningum, aldrei slegin inn. Fjarlægðu ranga skráningu og allar töflur leiðréttast sjálfar.',
  },
  instruction: { en: 'Try it: remove an event, or log a new one.', is: 'Prófaðu: fjarlægðu skráningu eða skráðu nýja.' },
  log: { en: 'Event log', is: 'Skráningar' },
  computed: { en: 'Counted from the log', is: 'Talið úr skráningunum' },
  remove: { en: 'Remove', is: 'Fjarlægja' },
  restore: { en: 'Restore', is: 'Endurheimta' },
  add: { en: 'Log', is: 'Skrá' },
  removedNote: { en: 'removed, still kept in the log', is: 'fjarlægðar, en geymdar áfram' },
  events: { en: 'events', is: 'skráningar' },
  reset: { en: 'Start over', is: 'Byrja aftur' },
  older: { en: 'Show older events', is: 'Sýna eldri skráningar' },
  promises: [
    { title: { en: 'Nothing is deleted', is: 'Engu er eytt' }, body: { en: 'A removed event is marked, not erased, so the full history of every match stays.', is: 'Fjarlægð skráning er merkt, ekki þurrkuð út, svo öll saga leiksins helst.' } },
    { title: { en: 'Works with bad wifi', is: 'Virkar á lélegu neti' }, body: { en: 'Every tap is saved on the device first and sent, in order, when the connection returns.', is: 'Hver snerting vistast fyrst á tækinu og sendist, í réttri röð, þegar netið kemur aftur.' } },
    { title: { en: 'Only you see it', is: 'Aðeins þú sérð það' }, body: { en: 'Your team’s matches, players and numbers are visible to your account and nobody else’s.', is: 'Leikir, leikmenn og tölur liðsins sjást aðeins í þínum aðgangi.' } },
  ],
} satisfies Record<string, Text | object>

export const inside = {
  heading: { en: 'Look inside', is: 'Inn í appið' },
  sentence: {
    en: 'Each stop shows a part of the app, filled with a sample match.',
    is: 'Hvert stopp sýnir hluta af appinu, fylltan með sýnileik.',
  },
  tabs: [
    {
      name: { en: 'Logging', is: 'Skráning' },
      title: { en: 'Four taps courtside', is: 'Fjórar snertingar við völlinn' },
      body: { en: 'Tap the player, then what happened. Big buttons for a tablet, coloured by side: attack, defence, goalkeeping, turnovers.', is: 'Smelltu á leikmanninn og svo hvað gerðist. Stórir hnappar fyrir spjaldtölvu, litaðir eftir hlið: sókn, vörn, markvarsla, tapaðir boltar.' },
    },
    {
      name: { en: 'Live stats', is: 'Lifandi tölur' },
      title: { en: 'The bench sees it as it happens', is: 'Bekkurinn sér það jafnóðum' },
      body: { en: 'Attack, defence, goalkeeping and the flow of the match, updated with every tap, filtered to any stretch of minutes.', is: 'Sókn, vörn, markvarsla og gangur leiksins, uppfært við hverja snertingu og síanlegt eftir mínútum.' },
    },
    {
      name: { en: 'Match report', is: 'Leikskýrsla' },
      title: { en: 'The report writes itself', is: 'Skýrslan skrifar sig sjálf' },
      body: { en: 'Standout players, the match flow and full tables the moment it ends. Print it, save a PDF or copy a summary for the team chat.', is: 'Þeir sem skáru fram úr, gangur leiksins og allar töflur um leið og leik lýkur. Prentaðu, vistaðu PDF eða afritaðu samantekt í spjallið.' },
    },
    {
      name: { en: 'Season', is: 'Tímabilið' },
      title: { en: 'Every match adds up', is: 'Hver leikur bætist við' },
      body: { en: 'Pick a season, a competition, or just the matches you want. Every table and trend follows your choice.', is: 'Veldu tímabil, keppni eða bara þá leiki sem þú vilt. Allar töflur og þróun fylgja valinu.' },
    },
    {
      name: { en: 'Your charts', is: 'Þín gröf' },
      title: { en: 'Build the chart you need', is: 'Búðu til grafið sem þú þarft' },
      body: { en: 'Choose any stats, any players and a chart type, from bars and lines to scatter plots and heat maps.', is: 'Veldu hvaða tölur og leikmenn sem er og tegund grafs, frá súluritum og línum til punktarita og hitakorta.' },
    },
    {
      name: { en: 'Export', is: 'Útflutningur' },
      title: { en: 'Take the numbers anywhere', is: 'Taktu tölurnar hvert sem er' },
      body: { en: 'Any choice of matches, players and minutes to a spreadsheet, for your analyst or your own models.', is: 'Hvaða leikir, leikmenn og mínútur sem er í töflureikni, fyrir greinandann eða þín eigin líkön.' },
    },
  ],
} satisfies Record<string, Text | object>

export const faq = {
  heading: { en: 'Questions', is: 'Spurningar' },
  items: [
    {
      q: { en: 'What do I need?', is: 'Hvað þarf ég?' },
      a: {
        en: 'A tablet or laptop with a browser. Add it to the home screen and it opens like an app. One person can log a whole match.',
        is: 'Spjaldtölvu eða fartölvu með vafra. Settu hana á heimaskjáinn og hún opnast eins og app. Ein manneskja getur skráð heilan leik.',
      },
    },
    {
      q: { en: 'Does it work without internet?', is: 'Virkar það án nets?' },
      a: {
        en: 'Yes. Events are saved on the device and sent as soon as the connection returns, in the order they were logged.',
        is: 'Já. Skráningar vistast á tækinu og sendast um leið og netið kemur aftur, í réttri röð.',
      },
    },
    {
      q: { en: 'Who can see our numbers?', is: 'Hver sér tölurnar okkar?' },
      a: {
        en: 'Only the account that owns the team. Other users cannot see your matches, players or stats.',
        is: 'Aðeins aðgangurinn sem á liðið. Aðrir notendur sjá hvorki leiki, leikmenn né tölur ykkar.',
      },
    },
    {
      q: { en: 'Do I have to log everything?', is: 'Þarf ég að skrá allt?' },
      a: {
        en: 'No. Log the whole game, or only what you care about, say just defence or just your goalkeepers. The tables show what you logged.',
        is: 'Nei. Skráðu allan leikinn eða bara það sem skiptir þig máli, til dæmis bara vörnina eða bara markmennina. Töflurnar sýna það sem þú skráðir.',
      },
    },
    {
      q: { en: 'Can I fix a mistake later?', is: 'Get ég lagað mistök eftir á?' },
      a: {
        en: 'Yes. Remove any event during the match, or reopen a finished match. Removed events are marked rather than deleted, so nothing is lost.',
        is: 'Já. Fjarlægðu hvaða skráningu sem er í leiknum eða opnaðu kláraðan leik aftur. Fjarlægðar skráningar eru merktar en ekki eyddar, svo ekkert tapast.',
      },
    },
    {
      q: { en: 'What does it cost?', is: 'Hvað kostar það?' },
      a: {
        en: 'There is no public price yet. Request access, and we’ll talk once your account is approved.',
        is: 'Ekkert verð er opinbert enn. Sæktu um aðgang og við ræðum saman þegar aðgangurinn hefur verið samþykktur.',
      },
    },
    {
      q: { en: 'Which languages?', is: 'Hvaða tungumál?' },
      a: {
        en: 'English and Icelandic. Switch at any time; your matches stay exactly as they are.',
        is: 'Enska og íslenska. Skiptu hvenær sem er; leikirnir haldast nákvæmlega eins.',
      },
    },
  ],
} satisfies Record<string, Text | object>

export const cta = {
  closing: { en: 'Ready for the next match', is: 'Klár í næsta leik' },
  sentence: {
    en: 'Create your account. Once it’s approved, add your team and log your first match.',
    is: 'Búðu til aðgang. Þegar hann hefur verið samþykktur bætirðu liðinu við og skráir fyrsta leikinn.',
  },
  dialogTitle: { en: 'Request access', is: 'Sækja um aðgang' },
  email: { en: 'Email', is: 'Netfang' },
  emailPlaceholder: { en: 'coach@yourclub.com', is: 'thjalfari@felagid.is' },
  language: { en: 'Language', is: 'Tungumál' },
  button: { en: 'Request access', is: 'Sækja um aðgang' },
  after: { en: 'You’ll set a password on the next screen.', is: 'Þú velur lykilorð á næsta skjá.' },
} satisfies Record<string, Text>

export const footer = {
  statement: { en: 'For anyone who keeps the numbers, and wants to trust them.', is: 'Fyrir alla sem halda utan um tölurnar og vilja geta treyst þeim.' },
  legal: { en: 'All rights reserved.', is: 'Allur réttur áskilinn.' },
  pages: { en: 'On this page', is: 'Á þessari síðu' },
  approved: { en: 'Already approved?', is: 'Nú þegar samþykkt?' },
  invite: { en: 'Request access', is: 'Sækja um aðgang' },
} satisfies Record<string, Text>
