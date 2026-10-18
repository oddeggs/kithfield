import type { EnCatalogue } from './catalogue-types';

/**
 * The field guide: a season's page of the six family plants, a plant's page, the seasons, every
 * plant at every stage, a rare bloom, harvest day's basket, and a visit's porch pot with its
 * little scrapbook. Pages are counted (plants simply there); care never is: credits name people
 * and kinds of care only.
 */
export const fieldGuideEn = {
  'fieldGuide.title': 'Field guide',
  // Hand-lettered: Gaegu sets a curly apostrophe with a gap after it, so this one is straight.
  'fieldGuide.whose': "{farm}'s",
  'fieldGuide.back': 'Back',
  'fieldGuide.close': 'Close',
  'fieldGuide.loading': 'Opening the field guide…',
  'fieldGuide.visit.title': 'Visits keep a scrapbook instead',
  'fieldGuide.visit.body': 'A porch pot’s blooms press into the visit’s own little scrapbook.',

  /* Seasons */
  'fieldGuide.seasons.label': 'Seasons',
  'fieldGuide.season.spring': 'Spring',
  'fieldGuide.season.summer': 'Summer',
  'fieldGuide.season.autumn': 'Autumn',
  'fieldGuide.season.winter': 'Winter',
  'fieldGuide.seasonWord.spring': 'spring',
  'fieldGuide.seasonWord.summer': 'summer',
  'fieldGuide.seasonWord.autumn': 'autumn',
  'fieldGuide.seasonWord.winter': 'winter',
  'fieldGuide.range': '{season} · {from}–{to}',
  'fieldGuide.rangeNow': '{season} · {from}–{to} · now',
  'fieldGuide.months': '{from}–{to}',

  /* A season's page */
  'fieldGuide.found': '{count} of {total} found',
  'fieldGuide.stillToCome': 'still to come',
  'fieldGuide.status.found': 'found',
  'fieldGuide.status.growing': 'growing · {stage}',
  'fieldGuide.status.resting': 'resting',
  'fieldGuide.status.notYet': 'not yet',
  'fieldGuide.row': '{plant}, {family}, {status}',
  'fieldGuide.allYear': 'All year',
  'fieldGuide.rose': 'Rose',
  'fieldGuide.rose.sub': 'birthdays',
  'fieldGuide.signature.sub': 'our signature',
  'fieldGuide.rarePages': 'Rare pages',
  'fieldGuide.rarePages.found': '{count} found',
  'fieldGuide.rarePages.none': 'none yet',
  'fieldGuide.more.seasons': 'The four seasons',
  'fieldGuide.more.seasonsSub': 'How the farm changes through the year',
  'fieldGuide.more.plants': 'Every plant, every stage',
  'fieldGuide.more.plantsSub': 'All the drawings, seed to sleepy',

  /* Stages */
  'fieldGuide.stage.0': 'seed',
  'fieldGuide.stage.1': 'sprout',
  'fieldGuide.stage.2': 'bud',
  'fieldGuide.stage.3': 'bloom',
  'fieldGuide.stage.4': 'harvest',
  'fieldGuide.stageName.0': 'Seed',
  'fieldGuide.stageName.1': 'Sprout',
  'fieldGuide.stageName.2': 'Bud',
  'fieldGuide.stageName.3': 'Bloom',
  'fieldGuide.stageName.4': 'Harvest',
  'fieldGuide.stageName.sleepy': 'Sleepy',

  /* Families */
  'fieldGuide.family.dew': 'Dew',
  'fieldGuide.family.words': 'Words',
  'fieldGuide.family.pictures': 'Pictures',
  'fieldGuide.family.voices': 'Voices',
  'fieldGuide.family.gestures': 'Gestures',
  'fieldGuide.family.gatherings': 'Gatherings',
  'fieldGuide.family.dew.short': 'dewdrops',
  'fieldGuide.family.words.short': 'messages',
  'fieldGuide.family.pictures.short': 'photos',
  'fieldGuide.family.voices.short': 'voice notes',
  'fieldGuide.family.gestures.short': 'fireflies',
  'fieldGuide.family.gatherings.short': 'plans',
  'fieldGuide.family.dew.kinds': 'dewdrops',
  'fieldGuide.family.words.kinds': 'messages, links, quiet notes and slow posts',
  'fieldGuide.family.pictures.kinds': 'photos, videos and stickers',
  'fieldGuide.family.voices.kinds': 'voice notes and time by the fire',
  'fieldGuide.family.gestures.kinds': 'fireflies, waves, knocks, hugs and gifts',
  'fieldGuide.family.gatherings.kinds': 'plans, votes, yeses, hangouts and scrapbook pages',
  'fieldGuide.familyLine': '{family} · {kinds}',

  /* Plants the farm's own catalogue doesn't name */
  'fieldGuide.plant.rose': 'rose',
  'fieldGuide.plant.forgetmenot': 'forget-me-not',
  'fieldGuide.plant.nasturtium': 'nasturtium',
  'fieldGuide.plant.cosmos': 'cosmos',
  'fieldGuide.plant.paperwhite': 'paperwhite',
  'fieldGuide.signature.name': '{farm} {fruit}',
  'fieldGuide.signature.crop': '{farm} {fruits}',
  'fieldGuide.fruit.plum': 'plum',
  'fieldGuide.fruit.persimmon': 'persimmon',
  'fieldGuide.fruit.lemon': 'lemon',
  'fieldGuide.fruit.fig': 'fig',
  'fieldGuide.fruits.plum': 'plums',
  'fieldGuide.fruits.persimmon': 'persimmons',
  'fieldGuide.fruits.lemon': 'lemons',
  'fieldGuide.fruits.fig': 'figs',
  'fieldGuide.crop.apple': 'Apples',
  'fieldGuide.crop.pumpkin': 'Pumpkins',
  'fieldGuide.crop.strawberry': 'Strawberries',
  'fieldGuide.crop.tulip': 'Tulips',
  'fieldGuide.crop.daffodil': 'Daffodils',
  'fieldGuide.crop.sunflower': 'Sunflowers',
  'fieldGuide.crop.poppy': 'Poppies',
  'fieldGuide.crop.bluebell': 'Bluebells',
  'fieldGuide.crop.snowdrop': 'Snowdrops',

  /* A plant's page */
  'fieldGuide.page.share': 'Share this page',
  'fieldGuide.page.shareText': '{plant}, in the field guide of {farm}.',
  'fieldGuide.page.subtitle': '{season} · {family}: {kinds}',
  'fieldGuide.page.subtitleRose': 'All year · on birthdays',
  'fieldGuide.page.subtitleSignature': 'All year · all the farm’s care together',
  'fieldGuide.page.subtitlePot': '{season} · the porch pot',
  'fieldGuide.page.foundIn': 'found in {month}',
  'fieldGuide.page.credits.one': '{lead} grew this row.',
  'fieldGuide.page.credits.more': '{lead} grew this row. {others} helped too.',
  'fieldGuide.page.credits.other': '{name}’s',
  'fieldGuide.page.credits.past': 'Everyone on the farm grew this one together.',
  'fieldGuide.page.credits.open': 'Anyone’s {kinds} grow it, any day.',
  'fieldGuide.page.credits.openAll': 'Every kind of care from anyone grows it.',
  'fieldGuide.page.credits.later': 'It grows from {kinds}, when {season} comes round.',
  'fieldGuide.page.sleepy.dew':
    'If nobody leaves a dewdrop for {days} days, the {plant} droops and naps. One from anyone wakes it straight back up.',
  'fieldGuide.page.sleepy.words':
    'If nobody writes for {days} days, the {plant} droops and naps. A word from anyone wakes it straight back up.',
  'fieldGuide.page.sleepy.pictures':
    'If nobody shares a photo or a sticker for {days} days, the {plant} droops and naps. One from anyone wakes it straight back up.',
  'fieldGuide.page.sleepy.voices':
    'If nobody leaves a voice note or sits by the fire for {days} days, the {plant} droops and naps. One from anyone wakes it straight back up.',
  'fieldGuide.page.sleepy.gestures':
    'If nobody sends a firefly, a wave, a knock, a hug or a gift for {days} days, the {plant} droops and naps. One from anyone wakes it straight back up.',
  'fieldGuide.page.sleepy.gatherings':
    'If nobody plants, votes or says yes to a plan for {days} days, the {plant} droops and naps. One from anyone wakes it straight back up.',
  'fieldGuide.page.sleepy.signature':
    'If the farm goes quiet for {days} days, the {plant} droops and naps. Any care from anyone wakes it straight back up.',
  'fieldGuide.page.sleepy.pot':
    'If you both go quiet for {days} days, the {plant} naps. Anything either of you sends wakes it straight back up.',
  'fieldGuide.page.rose':
    'It blooms over a friend’s cottage on their birthday, and anyone can water it that day.',
  'fieldGuide.page.rare.rain_kissed':
    'Rare: {rare} appears after shared rain or a real rainy day where your farm is.',
  'fieldGuide.page.rare.frost_lace':
    'Rare: {rare} appears on a real frosty morning where your farm is.',
  'fieldGuide.page.rare.sun_gold': 'Rare: {rare} appears in a real heatwave where your farm is.',
  'fieldGuide.page.rare.found': 'Rare: {rare} bloomed here in {month}.',

  /* Rare variants */
  'fieldGuide.variant.rain_kissed': 'rain-kissed {plant}',
  'fieldGuide.variant.frost_lace': 'frost-lace {plant}',
  'fieldGuide.variant.sun_gold': 'sun-gold {plant}',
  'fieldGuide.variantName.rain_kissed': 'Rain-kissed',
  'fieldGuide.variantName.frost_lace': 'Frost-lace',
  'fieldGuide.variantName.sun_gold': 'Sun-gold',
  'fieldGuide.variantWord.rain_kissed': 'rain-kissed',
  'fieldGuide.variantWord.frost_lace': 'frost-lace',
  'fieldGuide.variantWord.sun_gold': 'sun-gold',
  'fieldGuide.variantHint.rain_kissed': 'shared rain, or real rain',
  'fieldGuide.variantHint.frost_lace': 'a real frosty morning',
  'fieldGuide.variantHint.sun_gold': 'a real heatwave',

  /* The seasons */
  'fieldGuide.seasonsPage.title': 'The four seasons',
  'fieldGuide.seasonsPage.spring': 'Clover, tulips, daffodils and cherry blossom.',
  'fieldGuide.seasonsPage.summer': 'Sunflowers, lavender, strawberries, long evenings.',
  'fieldGuide.seasonsPage.autumn': 'Pumpkins, apples, heather. Harvest on the last Sunday.',
  'fieldGuide.seasonsPage.winter':
    'Snow on roofs, snowdrops, camellias, moonflowers in the long nights.',
  'fieldGuide.seasonsPage.note':
    'Seasons follow the real calendar where the farm’s keeper lives, flipped for the southern hemisphere: a Melbourne farm has pumpkins in April and snowdrops in August. A farm spread across both halves of the world follows its keeper.',

  /* Every plant */
  'fieldGuide.plants.title': 'Every plant, every stage',
  'fieldGuide.plants.range': '{north} north · {south} south',
  'fieldGuide.plants.allYear': 'All year, and the porch pot',
  'fieldGuide.plants.allYearSub': 'outside the families',
  'fieldGuide.plants.rare': 'Rare variants',
  'fieldGuide.plants.rareSub': 'a property of any bloom, never a separate plant',
  'fieldGuide.plants.signature': 'signature crop',
  'fieldGuide.plants.pot': 'porch pot · {season}',
  'fieldGuide.plants.tile': '{plant}, {stage}',

  /* A rare bloom */
  'fieldGuide.rare.eyebrow': 'something rare',
  'fieldGuide.rare.title': 'A {rare}',
  'fieldGuide.rare.together':
    'It opened after {names} were all on the farm in the rain. It’s pressed into your field guide now.',
  'fieldGuide.rare.sharedRain':
    'It opened after friends were on the farm together in the rain. It’s pressed into your field guide now.',
  'fieldGuide.rare.body.rain_kissed':
    'It opened on a real rainy day where your farm is. It’s pressed into your field guide now.',
  'fieldGuide.rare.body.frost_lace':
    'It opened on a real frosty morning where your farm is. It’s pressed into your field guide now.',
  'fieldGuide.rare.body.sun_gold':
    'It opened in a real heatwave where your farm is. It’s pressed into your field guide now.',
  'fieldGuide.rare.cta': 'See it in the field guide',
  'fieldGuide.you': 'you',

  /* Harvest day */
  'fieldGuide.harvest.eyebrow': 'harvest day · end of {season}',
  'fieldGuide.harvest.title': 'Look what we grew',
  'fieldGuide.harvest.signature': 'the farm’s own',
  'fieldGuide.harvest.rare': '{family} · {variant}',
  'fieldGuide.harvest.note':
    'Everyone’s care is in the basket, including {whose}. Nothing is ranked.',
  'fieldGuide.harvest.noteAll': 'Everyone’s care is in the basket. Nothing is ranked.',
  'fieldGuide.harvest.share': 'Share the basket with the farm',
  'fieldGuide.harvest.message': 'Look what we grew this {season}: {crops}.',
  'fieldGuide.harvest.shared': 'The basket is in the chat.',
  'fieldGuide.harvest.notSent': 'The basket didn’t send. Try again in a moment.',
  'fieldGuide.harvest.empty':
    'Nothing bloomed this season, and that’s all right. Everything rests and comes back next season.',

  /* The porch pot */
  'fieldGuide.pot.where': 'on the porch',
  'fieldGuide.pot.eyebrow': 'our porch pot',
  'fieldGuide.pot.state': '{season} · {stage}',
  'fieldGuide.pot.stage.0': 'a seed',
  'fieldGuide.pot.stage.1': 'sprouting',
  'fieldGuide.pot.stage.2': 'in bud',
  'fieldGuide.pot.stage.3': 'in bloom',
  'fieldGuide.pot.stage.4': 'pressed',
  'fieldGuide.pot.napping': 'napping',
  'fieldGuide.pot.yours': 'your {care}',
  'fieldGuide.pot.both': '{theirs} and {mine} both watered it.',
  'fieldGuide.pot.one': '{whose} watered it.',
  'fieldGuide.pot.none': 'It’s waiting for its first drop of care.',
  'fieldGuide.pot.note':
    'Anything either of you sends here helps it grow. If you both go quiet it naps, and it’s still here when you come back.',
  'fieldGuide.pot.frozen':
    'The porch is quiet now. The pot stays just as it was, and so does your scrapbook.',
  'fieldGuide.pot.scrapbook': 'Our little scrapbook',
  'fieldGuide.pot.pressed': {
    one: 'One bloom pressed so far',
    other: '{number} blooms pressed so far',
  },
  'fieldGuide.pot.pressedNone': 'Nothing pressed yet',
  'fieldGuide.pot.notVisit': 'Only a visit has a porch pot.',

  /* The little scrapbook */
  'fieldGuide.scrapbook.title': 'Our porch',
  'fieldGuide.scrapbook.body': 'Just the two of you. These never go in a farm’s field guide.',
  'fieldGuide.scrapbook.pressedLine': '{plant}, grown by the two of you.',
  'fieldGuide.scrapbook.pressedOn': 'pressed {date}',
  'fieldGuide.scrapbook.growing': '{plant}, still growing. {stage}.',
  'fieldGuide.scrapbook.stage.0': 'A seed for now',
  'fieldGuide.scrapbook.stage.1': 'Sprouting',
  'fieldGuide.scrapbook.stage.2': 'In bud',
  'fieldGuide.scrapbook.stage.3': 'In bloom',
  'fieldGuide.scrapbook.stage.4': 'Ready to press',
  'fieldGuide.scrapbook.waiting': '{plant}, waiting for {month}.',
  'fieldGuide.date': '{day} {month}',

  /* Months */
  'fieldGuide.month.1': 'Jan',
  'fieldGuide.month.2': 'Feb',
  'fieldGuide.month.3': 'Mar',
  'fieldGuide.month.4': 'Apr',
  'fieldGuide.month.5': 'May',
  'fieldGuide.month.6': 'Jun',
  'fieldGuide.month.7': 'Jul',
  'fieldGuide.month.8': 'Aug',
  'fieldGuide.month.9': 'Sep',
  'fieldGuide.month.10': 'Oct',
  'fieldGuide.month.11': 'Nov',
  'fieldGuide.month.12': 'Dec',
  'fieldGuide.monthLong.1': 'January',
  'fieldGuide.monthLong.2': 'February',
  'fieldGuide.monthLong.3': 'March',
  'fieldGuide.monthLong.4': 'April',
  'fieldGuide.monthLong.5': 'May',
  'fieldGuide.monthLong.6': 'June',
  'fieldGuide.monthLong.7': 'July',
  'fieldGuide.monthLong.8': 'August',
  'fieldGuide.monthLong.9': 'September',
  'fieldGuide.monthLong.10': 'October',
  'fieldGuide.monthLong.11': 'November',
  'fieldGuide.monthLong.12': 'December',
} as const satisfies EnCatalogue;
