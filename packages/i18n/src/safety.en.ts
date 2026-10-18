import type { EnCatalogue } from './catalogue-types';

/**
 * Reporting, blocking, a removal notice, the safety team's quiet notes and asking for another
 * look (`11 Settings and Safety`, and the removal note of `04 Farm and Chat`).
 */
export const safetyEn = {
  'safety.cancel': 'Cancel',
  'safety.failed': 'That didn’t go through. Try again in a moment.',
  'safety.friend': 'a friend',

  /* Report */
  'safety.report.title': 'Report',
  'safety.report.aboutMessage': 'What’s wrong with this message?',
  'safety.report.aboutPerson': 'What’s going on with {name}?',
  'safety.report.unkind': 'Unkind or bullying',
  'safety.report.unwanted_contact': 'Unwanted contact',
  'safety.report.spam': 'Spam or a scam',
  'safety.report.something_else': 'Something else',
  'safety.report.notePlaceholder': 'Tell us a little more, if you like',
  'safety.report.alsoBlock': 'Also block {name}',
  'safety.report.alsoBlockSub': 'You can do this later too',
  'safety.report.footMessage':
    'Our safety team sees this message and the few around it. {name} won’t know who reported.',
  'safety.report.footPerson': 'Our safety team takes a look. {name} won’t know who reported.',
  'safety.report.send': 'Send report',
  'safety.report.sent': 'Thank you for telling us. The safety team will look within a day.',
  'safety.report.gone': 'That message has already been taken down.',

  /* Block, and the blocked list */
  'safety.block.title': 'Block {name}?',
  'safety.block.hidden': 'Their messages are hidden from you on every farm you share',
  'safety.block.visits': 'They can’t visit you or leave things on your step',
  'safety.block.stay': 'You both stay on the farm. Keepers can remove them if needed',
  'safety.block.untold': 'They aren’t told. To them your cottage just looks quiet',
  'safety.block.action': 'Block {name}',
  'safety.block.done': '{name} is blocked. You can undo it in Settings › Blocked.',
  'safety.blocked.title': 'Blocked',
  'safety.blocked.none': 'Nobody is blocked. If you block someone, they show up here.',
  'safety.blocked.note': 'They aren’t told about blocking, or about unblocking.',
  'safety.blocked.since': 'Blocked {day}',
  'safety.blocked.unblock': 'Unblock',
  'safety.blocked.undone': '{name} is unblocked.',

  /* A quiet porch */
  'safety.porch.eyebrow': 'nobody on the porch right now',
  'safety.porch.title': '{name}’s porch is quiet',
  'safety.porch.body': '{name} isn’t taking visits right now. You still share your farms.',
  'safety.porch.back': 'Back to the farm',

  /* Removed from a farm */
  'safety.removed.title': 'You’re no longer on {farm}',
  'safety.removed.byKeeper':
    'A keeper of that farm made this change. Farms change shape sometimes. Your other farms and visits are just where you left them.',
  'safety.removed.bySafety':
    'The safety team made this change. Your other farms and visits are just where you left them.',
  'safety.removed.card':
    'Visits with people from that farm carry on as normal, and your critter keeps everything they own.',
  'safety.removed.go': 'Go to my farms',
  'safety.removed.rules': 'Read the house rules',

  /* The reporter hears back */
  'safety.notes.title': 'Notes from the safety team',
  'safety.notes.none': 'No notes. When the safety team writes to you, it shows here.',
  'safety.answered.eyebrow': 'from the Kithfield safety team',
  'safety.answered.title': 'We looked at what you reported',
  'safety.answered.message': '{name}’s message from {day}',
  'safety.answered.thing': 'What {name} shared on {day}',
  'safety.answered.person': 'What you told us about {name}',
  'safety.answered.removed': 'removed',
  'safety.answered.kept': 'still there',
  'safety.answered.removedBody':
    'Thank you for telling us. It broke our house rules, so we took it down. To protect everyone’s privacy, we don’t share what else happens to an account.',
  'safety.answered.keptBody':
    'Thank you for telling us. We looked closely, and it didn’t break our house rules, so it stays. To protect everyone’s privacy, we don’t share what else happens to an account.',
  'safety.answered.unsafe':
    'Still feel unsafe? Blocking is one tap, and you can write to {email} any time.',
  'safety.answered.thanks': 'Thanks',
  'safety.answered.block': 'Block {name} too',

  /* The reported person */
  'safety.removedNote.eyebrow': 'a note from the safety team',
  'safety.removedNote.message': 'We took down one of your messages',
  'safety.removedNote.thing': 'We took down something you shared',
  'safety.removedNote.where': '{farm} · {day}',
  'safety.removedNote.visit': 'A visit · {day}',
  'safety.removedNote.hidden': 'Hidden here so it doesn’t hurt twice.',
  'safety.removedNote.show': 'Show it',
  'safety.removedNote.rule': 'Which rule',
  'safety.removedNote.account': 'Your account',
  'safety.removedNote.unchanged': 'Still yours, and nothing else has changed.',
  'safety.removedNote.warned': 'Still yours. Please take this as a gentle warning.',
  'safety.removedNote.paused': 'You can read your farms, but not post, until {day}.',
  'safety.removedNote.removed': 'You’re no longer on {farm}. Your other farms are unchanged.',
  'safety.removedNote.appealText':
    'If you think we got it wrong, tell us why. Someone who wasn’t part of the first decision will read it within 7 days.',
  'safety.removedNote.appeal': 'Ask for another look',
  'safety.removedNote.okay': 'Okay',
  'safety.rule.number': 'House rule {n}.',
  'safety.rule.3': 'House rule 3: be kind. No bullying or harassment.',
  'safety.rule.4': 'House rule 4: no hate.',
  'safety.rule.6': 'House rule 6: no spam or scams.',
  'safety.rule.child_safety': 'Keeping children safe.',
  'safety.rule.self_harm': 'Looking after people who may be at risk.',
  'safety.rule.credible_threat': 'No threats to anyone’s safety.',
  'safety.rule.legal': 'The law where you live.',
  'safety.appeal.title': 'Ask for another look',
  'safety.appeal.lead':
    'Tell us why you think we got it wrong. A different person will read it within 7 days.',
  'safety.appeal.placeholder': 'What should we know?',
  'safety.appeal.send': 'Send',
  'safety.appeal.sent': 'Sent. Someone new will read it within 7 days.',
  'safety.appeal.already': 'You’ve already asked for another look at this one.',
  'safety.appealed.title': 'We looked again',
  'safety.appealed.undone': 'You were right, and we’ve put it back.',
  'safety.appealed.kept': 'We looked again, and the decision stays.',
} as const satisfies EnCatalogue;
