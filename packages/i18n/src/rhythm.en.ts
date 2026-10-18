import type { EnCatalogue } from './catalogue-types';

/**
 * The farm's rhythm: birthday blooms, the Sunday harvest, shared rain, the restoration project,
 * visiting friends' farms and trading at their gate, real weather with its attribution, and the
 * scrapbook. Nothing here counts care: people and kinds of care only.
 */
export const rhythmEn = {
  'rhythm.back': 'Back',
  'rhythm.backToFarm': 'Back to the farm',
  'rhythm.loadFailed':
    'We couldn’t reach the farm just now. Check your connection, then try again.',
  'rhythm.tryAgain': 'Try again',
  'rhythm.someone': 'a friend',
  /** You, last in a list of who is here: "Pip, Fig and you". */
  'rhythm.you': 'you',

  /* A birthday bloom */
  'rhythm.birthday.pill': '{name}’s birthday',
  'rhythm.birthday.pillYou': 'Your birthday',
  'rhythm.birthday.title': 'It’s {name}’s birthday',
  'rhythm.birthday.titleYou': 'It’s your birthday',
  'rhythm.birthday.body':
    'A bloom opened over {name}’s cottage this morning. Everyone who waters it adds a petal to the card.',
  'rhythm.birthday.bodyYou':
    'A bloom opened over your cottage this morning. Everyone who waters it adds a petal to your card.',
  'rhythm.birthday.petals': '{names} added petals',
  'rhythm.birthday.noPetals': 'Nobody has added a petal yet.',
  'rhythm.birthday.sign': 'Sign the card',
  'rhythm.birthday.signed': 'You signed it',
  'rhythm.birthday.water': 'Water the bloom',
  'rhythm.birthday.watered': 'Watered',
  'rhythm.birthday.cardLabel': 'Words for {name}’s card',
  'rhythm.birthday.cardPlaceholder': 'A few words for {name}',
  'rhythm.birthday.cardSend': 'Sign',
  'rhythm.birthday.cardCancel': 'Not now',
  'rhythm.birthday.over': 'The birthday bloom has closed for this year.',

  /* The Sunday harvest */
  'rhythm.recap.eyebrow': 'sunday harvest',
  'rhythm.recap.title': 'A good week on {farm}',
  'rhythm.recap.bodyPlans': 'a plan planted',
  'rhythm.recap.bodyPictures': 'a pile of photos',
  'rhythm.recap.bodyVoices': 'voices by the fire',
  'rhythm.recap.bodyWords': 'notes back and forth',
  'rhythm.recap.bodyCameBack': '{name} came back from a nap',
  'rhythm.recap.bodyQuiet': 'small kindnesses all week',
  'rhythm.recap.sentence': '{list}.',
  'rhythm.recap.pollinator': 'best pollinator',
  'rhythm.recap.reason.checked_on_everyone': 'Checked in on every single critter this week.',
  'rhythm.recap.reason.planned_a_hangout': 'Got everyone together with a plan.',
  'rhythm.recap.reason.came_back': 'Came back from a nap, and the farm lit up.',
  'rhythm.recap.reason.shared_pictures': 'Filled the farm with photos.',
  'rhythm.recap.reason.by_the_fire': 'Kept the fire company.',
  'rhythm.recap.reason.kept_it_warm': 'Kept things warm all week.',
  'rhythm.recap.reason.other': 'Looked after the farm this week.',
  'rhythm.recap.thanks': '{whose} kept things warm too.',
  'rhythm.recap.whose': '{name}’s {care}',
  'rhythm.recap.ai': 'Written with an AI, from the words of friends who said yes.',
  'rhythm.recap.aiChange': 'Change',
  'rhythm.recap.local': 'Put together on your phone from what everyone did.',
  'rhythm.recap.plant': 'Plant next week',
  'rhythm.recap.share': 'Share the harvest',
  'rhythm.recap.shareText': '{title}. {body}',
  'rhythm.recap.empty.title': 'The basket’s still out',
  'rhythm.recap.empty.body': 'The first Sunday harvest comes this Sunday evening.',
  'rhythm.recap.restful': 'A quiet week. The field rested, and that’s fine too.',

  /* Shared rain */
  'rhythm.rain.pill': 'Shared rain',
  'rhythm.rain.title': 'Shared rain!',
  'rhythm.rain.body':
    '{names} are all here this hour. Rare and lovely. Anything you send now soaks right into the farm.',
  'rhythm.rain.bodyAll':
    '{names} were all here this hour. Rare and lovely. Anything you send now soaks right into the farm.',
  'rhythm.rain.voice': 'Voice room',
  'rhythm.rain.photo': 'Share a photo',
  'rhythm.rain.hi': 'Say hi to everyone',
  'rhythm.rain.hiSent': 'Waved to everyone',

  /* The restoration project */
  'rhythm.project.greenhouse.name': 'The old greenhouse',
  'rhythm.project.greenhouse.title': 'Rebuilding the old greenhouse',
  'rhythm.project.greenhouse.body':
    'Every little thing anyone does adds a pane: a reply, a dewdrop, a wave. Nobody has to do anything special.',
  'rhythm.project.other.name': 'The farm’s project',
  'rhythm.project.other.title': 'Mending something old',
  'rhythm.project.today': 'Today',
  'rhythm.project.tonight': 'Overnight reveal',
  'rhythm.project.view': 'What to show',
  'rhythm.project.progress.0': 'the frame is up, waiting for glass',
  'rhythm.project.progress.1': 'the first panes are in',
  'rhythm.project.progress.2': 'about a third glazed',
  'rhythm.project.progress.3': 'about half glazed',
  'rhythm.project.progress.4': 'about two thirds glazed',
  'rhythm.project.progress.5': 'nearly all glazed',
  'rhythm.project.progress.6': 'all glazed',
  'rhythm.project.tonight.step': 'another pane goes in tonight',
  'rhythm.project.tonight.last': 'all glazed. it went up while you slept',
  'rhythm.project.tonight.waiting': 'tonight waits for any little thing',
  'rhythm.project.done': 'finished, and it’s the farm’s for good',
  'rhythm.project.row': 'A pane a night, from anyone’s care',

  /* Visiting friends' farms */
  'rhythm.gates.title': 'Friends’ farms',
  'rhythm.gates.body':
    'Farms where your friends live. You can visit the gate and leave something; their chat stays theirs.',
  'rhythm.gates.friends': { one: '{names} lives here', other: '{names} live here' },
  'rhythm.gates.empty.title': 'No farms to visit yet',
  'rhythm.gates.empty.body': 'When a friend lives on another farm too, you can visit it from here.',
  'rhythm.visit.subtitle': 'You’re visiting',
  'rhythm.visit.ripe': '{fruits} are ripe!',
  'rhythm.visit.body':
    '{name}’s farm grows {fruits} this time of year. Take a few home and a little {tree} will sprout on yours.',
  'rhythm.visit.bodyPlain':
    'You’re at {name}’s gate. You can leave something kind, but their chat stays theirs.',
  'rhythm.visit.firefly': 'Leave a firefly',
  'rhythm.visit.fireflyLeft': 'Firefly left',
  'rhythm.visit.wave': 'Wave at the gate',
  'rhythm.visit.waved': 'You waved',
  'rhythm.visit.take': 'Take some {fruits} home',
  'rhythm.visit.gone': 'This gate isn’t open to you any more.',
  'rhythm.visit.oncePerDay': 'You’ve left something here today already. Come back tomorrow.',
  'rhythm.visit.unavailable': 'That couldn’t reach them.',
  'rhythm.visit.limit': 'Slow down a little, then try again.',

  /* Fruit names: some, and the little tree */
  'rhythm.fruit.plum': 'plums',
  'rhythm.fruit.plum.tree': 'plum tree',
  'rhythm.fruit.persimmon': 'persimmons',
  'rhythm.fruit.persimmon.tree': 'persimmon tree',
  'rhythm.fruit.lemon': 'lemons',
  'rhythm.fruit.lemon.tree': 'lemon tree',
  'rhythm.fruit.fig': 'figs',
  'rhythm.fruit.fig.tree': 'fig tree',
  'rhythm.fruit.other': 'crops',
  'rhythm.fruit.other.tree': 'sprout',

  /* Trading at the gate */
  'rhythm.trade.header': '{name}’s farm',
  'rhythm.trade.subtitle': 'visiting · {fruits} in season',
  'rhythm.trade.eyebrow': '{name}’s at the gate',
  'rhythm.trade.title': 'Swap a little something?',
  'rhythm.trade.yours': 'Your {plant}',
  'rhythm.trade.bundle': 'a bundle',
  'rhythm.trade.theirs': '{name}’s {fruits}',
  'rhythm.trade.basket': 'a basket',
  'rhythm.trade.nothing': 'Nothing to give',
  'rhythm.trade.nothingLine': 'just take some',
  'rhythm.trade.pick': 'Choose what to give',
  'rhythm.trade.note':
    'Traded crops grow on your farm too, so your field guide can fill in pages from friends’ seasons. No prices, no shop.',
  'rhythm.trade.swap': 'Swap with {name}',
  'rhythm.trade.take': 'Take some home',
  'rhythm.trade.justVisiting': 'Just visiting',
  'rhythm.trade.done': 'Swapped. {fruits} are on their way to your farm.',
  'rhythm.trade.taken': '{fruits} are on their way to your farm.',
  'rhythm.trade.limit': 'Your farms swapped not long ago. Try again next season.',
  'rhythm.trade.notReady': 'Nothing’s at harvest to swap just now. Come back on harvest day.',
  'rhythm.trade.unavailable': 'A swap with {name} isn’t possible.',
  'rhythm.trade.failed': 'The swap didn’t go through. Try again in a moment.',
  'rhythm.trade.noFarm': 'You need a farm of your own to take crops home to.',

  /* Real weather */
  'rhythm.weather.rain': 'Rain',
  'rhythm.weather.frost': 'Frost',
  'rhythm.weather.heat': 'Heat',
  'rhythm.weather.chip': '{weather} · {city}',
  'rhythm.weather.chipLabel': '{weather} in {city}. Opens the weather',
  'rhythm.weather.rain.eyebrow': 'puddles are out',
  'rhythm.weather.frost.eyebrow': 'frost on the leaves',
  'rhythm.weather.heat.eyebrow': 'a proper hot one',
  'rhythm.weather.rain.title': 'It’s really raining in {city}',
  'rhythm.weather.frost.title': 'It’s really frosty in {city}',
  'rhythm.weather.heat.title': 'It’s really hot in {city}',
  'rhythm.weather.rain.body':
    'The farm follows the weather in the keeper’s town. Umbrellas open, the plants drink, and something rare might bloom tonight.',
  'rhythm.weather.frost.body':
    'The farm follows the weather in the keeper’s town. Frost lace on every leaf, and something rare might bloom tonight.',
  'rhythm.weather.heat.body':
    'The farm follows the weather in the keeper’s town. Everyone’s in the shade, and a sun-gold bloom might open tonight.',
  'rhythm.weather.none.eyebrow': 'a calm day',
  'rhythm.weather.none.title': 'It’s calm in {city} today',
  'rhythm.weather.none.body':
    'The farm follows the weather in the keeper’s town. When it rains, frosts or bakes there, you’ll see it here.',
  'rhythm.weather.noTown.eyebrow': 'no town yet',
  'rhythm.weather.noTown.title': 'The farm keeps its own weather',
  'rhythm.weather.noTown.body':
    'The keeper can set a town in farm settings, and the farm will follow the weather there.',
  'rhythm.weather.data': 'Weather data',
  'rhythm.weather.sources': 'Other data sources',
  'rhythm.weather.mark': '{service} weather data',
  'rhythm.weather.plain': 'Weather from {source}',

  /* The scrapbook */
  'rhythm.scrapbook.title': 'Scrapbook',
  'rhythm.scrapbook.body': 'Every time you gathered, pressed and kept.',
  'rhythm.scrapbook.print': 'Print our year',
  'rhythm.scrapbook.row': 'Every hangout, pressed and kept',
  'rhythm.scrapbook.page': '{title}, {date}',
  'rhythm.scrapbook.pageHint': 'Opens the page',
  'rhythm.scrapbook.hide': 'Hide this page',
  'rhythm.scrapbook.hideTitle': 'Hide this page?',
  'rhythm.scrapbook.hideBody':
    'It leaves the scrapbook for everyone on the farm. Anyone can hide a page.',
  'rhythm.scrapbook.hideCancel': 'Keep it',
  'rhythm.scrapbook.hidden': 'Page hidden',
  'rhythm.scrapbook.empty.title': 'Nothing pressed yet',
  'rhythm.scrapbook.empty.body':
    'After a hangout, press a page to keep it: its photos, its notes and a flower.',
  'rhythm.scrapbook.press': 'Press a page',
  'rhythm.scrapbook.pressFrom': 'From {title}, {date}',
  'rhythm.scrapbook.pressed': 'Pressed into the scrapbook',
  'rhythm.scrapbook.more': 'Older pages',
  'rhythm.scrapbook.gap': 'This was taken back',
  'rhythm.scrapbook.items': 'Kept on this page',
  'rhythm.scrapbook.voice': 'A voice note',
  'rhythm.scrapbook.photo': 'A photo',

  /* The farm sheet's rows */
  'rhythm.row.recap': 'This week’s harvest',
  'rhythm.row.recapLine': 'The Sunday letter, and who to thank',
  'rhythm.row.guideLine': 'Every plant the farm has brought to bloom',
  'rhythm.row.gates': 'Visit a friend’s farm',
  'rhythm.row.gatesLine': 'Wave at their gate, swap at harvest',
} as const satisfies EnCatalogue;
